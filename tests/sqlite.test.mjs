/**
 * Prüfungen des SQLite-Lesers.
 *
 * Geprüft wird gegen echte Dateien: Python bringt SQLite mit, also werden die
 * Testdateien damit erzeugt und anschließend mit dem eigenen Leser gelesen.
 * Ein Leser, der nur gegen selbstgebaute Bytes geprüft ist, prüft nur die
 * eigenen Annahmen.
 *
 * Besonderes Augenmerk auf die Stellen, an denen das Format unangenehm wird:
 * Nutzlast über Seitengrenzen hinweg (Überlaufseiten), mehrstufige B-Bäume,
 * große Zahlen jenseits von 32 Bit und die Suche über einen Index.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openDatabase, bufferSource, readVarint, decodeRecord,
} from '../js/lib/sqlite.js';

const dir = mkdtempSync(join(tmpdir(), 'sb-sqlite-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

/** Legt eine Datenbank mit Python an und gibt sie als Puffer zurück. */
function build(script, name = 'db.sqlite') {
  const path = join(dir, name);
  execFileSync('python3', ['-c', `
import sqlite3, os
path = ${JSON.stringify(path)}
if os.path.exists(path): os.remove(path)
db = sqlite3.connect(path)
${script}
db.commit()
db.close()
`]);
  return readFileSync(path);
}

const open = (bytes, opts) => openDatabase(bufferSource(bytes), opts);

// --------------------------------------------------------------- Bausteine

test('Varints lesen', () => {
  assert.deepEqual(readVarint(new Uint8Array([0x00]), 0), { value: 0, length: 1 });
  assert.deepEqual(readVarint(new Uint8Array([0x7f]), 0), { value: 127, length: 1 });
  assert.deepEqual(readVarint(new Uint8Array([0x81, 0x00]), 0), { value: 128, length: 2 });
  assert.deepEqual(readVarint(new Uint8Array([0x82, 0x21]), 0), { value: 289, length: 2 });
  // Vier Bytes: über die Grenze, an der Bitoperationen still überliefen.
  assert.deepEqual(
    readVarint(new Uint8Array([0x81, 0x80, 0x80, 0x00]), 0),
    { value: 2 ** 21, length: 4 },
  );
});

test('Datensätze zerlegen', () => {
  // Kopf (2 Bytes Länge + Typen), dann die Werte.
  const record = new Uint8Array([
    0x05, // Kopflänge 5
    0x01, // Spalte 1: 8-Bit-Ganzzahl
    0x00, // Spalte 2: NULL
    0x09, // Spalte 3: die Zahl 1, ohne eigene Bytes
    0x13, // Spalte 4: Text mit 3 Zeichen
    0x2a, // 42
    0x61, 0x62, 0x63, // „abc“
  ]);
  assert.deepEqual(decodeRecord(record), [42, null, 1, 'abc']);
});

// ------------------------------------------------------------ Ganze Dateien

test('Inhaltsverzeichnis einer echten Datenbank', async () => {
  const bytes = build(`
db.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)")
db.execute("CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row)")
db.execute("CREATE TABLE metadata (name text, value text)")
db.execute("INSERT INTO metadata VALUES ('name', 'Ostsee'), ('format', 'png')")
`);
  const db = await open(bytes);
  const schema = await db.schema();
  const namen = schema.map((s) => s.name).sort();
  assert.deepEqual(namen, ['metadata', 'tile_index', 'tiles']);
  const tabelle = schema.find((s) => s.name === 'tiles');
  assert.equal(tabelle.type, 'table');
  assert.ok(tabelle.root > 1, 'Wurzelseite fehlt');
});

test('Kleine Tabelle vollständig lesen', async () => {
  const bytes = build(`
db.execute("CREATE TABLE metadata (name text, value text)")
db.execute("INSERT INTO metadata VALUES ('name','Ostsee'),('minzoom','0'),('maxzoom','14'),('format','png')")
`);
  const db = await open(bytes);
  const root = (await db.schema()).find((s) => s.name === 'metadata').root;
  const rows = [];
  await db.scanTable(root, (r) => { rows.push(r); });
  assert.deepEqual(rows, [
    ['name', 'Ostsee'], ['minzoom', '0'], ['maxzoom', '14'], ['format', 'png'],
  ]);
});

test('Blobs über Überlaufseiten hinweg', async () => {
  // Deutlich größer als eine Seite: Der Blob muss über Überlaufseiten laufen.
  const bytes = build(`
db.execute("CREATE TABLE t (id integer, data blob)")
for i in range(1, 6):
    db.execute("INSERT INTO t VALUES (?, ?)", (i, bytes([i]) * (i * 5000)))
`);
  const db = await open(bytes);
  const root = (await db.schema()).find((s) => s.name === 't').root;
  const sizes = [];
  await db.scanTable(root, (r) => {
    sizes.push(r[1].length);
    // Jedes Byte muss stimmen, nicht nur die Länge.
    assert.ok(r[1].every((b) => b === r[0]), `Blob ${r[0]} ist verfälscht`);
  });
  assert.deepEqual(sizes, [5000, 10000, 15000, 20000, 25000]);
});

test('Mehrstufiger B-Baum: alle Zeilen kommen an', async () => {
  // Genug Zeilen für innere Seiten, jede mit einem Blob.
  const bytes = build(`
db.execute("CREATE TABLE t (id integer primary key, data blob)")
db.executemany("INSERT INTO t VALUES (?, ?)", [(i, bytes([i % 251]) * 900) for i in range(1, 4001)])
`);
  const db = await open(bytes);
  const root = (await db.schema()).find((s) => s.name === 't').root;
  // „integer primary key“ ist in SQLite ein anderer Name für die
  // Zeilennummer. Die Spalte selbst steht dann als NULL im Datensatz – der
  // Wert kommt über die Zeilennummer, die der Leser mitliefert.
  const ids = [];
  await db.scanTable(root, (r, rowid) => {
    assert.equal(r[0], null, 'die Aliasspalte müsste leer sein');
    ids.push(rowid);
  });
  assert.equal(ids.length, 4000, 'nicht alle Zeilen gefunden');
  // Ein B-Baum wird in Schlüsselreihenfolge gelesen – das ist keine Zufallsfolge.
  assert.deepEqual(ids.slice(0, 3), [1, 2, 3]);
  assert.equal(ids[3999], 4000);
});

test('Zeile über die Zeilennummer finden', async () => {
  const bytes = build(`
db.execute("CREATE TABLE t (id integer primary key, wort text)")
db.executemany("INSERT INTO t VALUES (?, ?)", [(i, f"wort-{i}") for i in range(1, 3001)])
`);
  const db = await open(bytes);
  const root = (await db.schema()).find((s) => s.name === 't').root;
  for (const id of [1, 2, 777, 1500, 2999, 3000]) {
    // eslint-disable-next-line no-await-in-loop
    const row = await db.rowById(root, id);
    assert.ok(row, `Zeile ${id} nicht gefunden`);
    assert.equal(row[1], `wort-${id}`);
  }
  assert.equal(await db.rowById(root, 3001), null, 'nicht vorhandene Zeile');
});

test('Suche über einen zusammengesetzten Index', async () => {
  const bytes = build(`
db.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)")
rows = []
for z in range(0, 8):
    n = 2 ** z
    for x in range(0, min(n, 12)):
        for y in range(0, min(n, 12)):
            rows.append((z, x, y, bytes([(z * 31 + x * 7 + y) % 251]) * 300))
db.executemany("INSERT INTO tiles VALUES (?,?,?,?)", rows)
db.execute("CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row)")
`);
  const db = await open(bytes);
  const schema = await db.schema();
  const tiles = schema.find((s) => s.name === 'tiles').root;
  const index = schema.find((s) => s.name === 'tile_index').root;

  for (const [z, x, y] of [[0, 0, 0], [3, 5, 2], [7, 11, 11], [5, 0, 9]]) {
    // eslint-disable-next-line no-await-in-loop
    const rowid = await db.rowidFromIndex(index, [z, x, y]);
    assert.ok(rowid, `Index findet ${z}/${x}/${y} nicht`);
    // eslint-disable-next-line no-await-in-loop
    const row = await db.rowById(tiles, rowid);
    assert.deepEqual([row[0], row[1], row[2]], [z, x, y], 'falsche Zeile geliefert');
    assert.equal(row[3][0], (z * 31 + x * 7 + y) % 251, 'falscher Inhalt');
  }

  // Was es nicht gibt, darf auch nicht gefunden werden.
  assert.equal(await db.rowidFromIndex(index, [7, 11, 12]), null);
  assert.equal(await db.rowidFromIndex(index, [9, 0, 0]), null);
  assert.equal(await db.rowidFromIndex(index, [0, 1, 0]), null);
});

test('Große Zahlen bleiben heil', async () => {
  const bytes = build(`
db.execute("CREATE TABLE t (id integer primary key, wert integer)")
db.executemany("INSERT INTO t VALUES (?,?)", [
  (1, 127), (2, 32767), (3, 8388607), (4, 2147483647),
  (5, 549755813887), (6, 9007199254740991), (7, -2147483648), (8, -1),
])
`);
  const db = await open(bytes);
  const root = (await db.schema()).find((s) => s.name === 't').root;
  const werte = [];
  await db.scanTable(root, (r) => { werte.push(r[1]); });
  assert.deepEqual(werte, [
    127, 32767, 8388607, 2147483647, 549755813887, 9007199254740991, -2147483648, -1,
  ]);
});

test('Andere Seitengrößen', async () => {
  for (const size of [512, 1024, 4096, 16384]) {
    const bytes = build(`
db.execute("PRAGMA page_size = ${size}")
db.execute("VACUUM")
db.execute("CREATE TABLE t (id integer primary key, data blob)")
db.executemany("INSERT INTO t VALUES (?,?)", [(i, bytes([i % 251]) * 3000) for i in range(1, 60)])
`, `page-${size}.sqlite`);
    // eslint-disable-next-line no-await-in-loop
    const db = await open(bytes);
    assert.equal(db.pageSize, size, `Seitengröße ${size} nicht erkannt`);
    const root = (await db.schema()).find((s) => s.name === 't').root;
    let n = 0;
    // eslint-disable-next-line no-await-in-loop
    await db.scanTable(root, (r, rowid) => {
      n += 1;
      assert.equal(r[1].length, 3000);
      assert.ok(r[1].every((b) => b === rowid % 251), `Seitengröße ${size}: Blob verfälscht`);
    });
    assert.equal(n, 59, `Seitengröße ${size}: nicht alle Zeilen`);
  }
});

test('Eine fremde Datei wird abgelehnt', async () => {
  await assert.rejects(
    () => open(new Uint8Array(200)),
    /Keine SQLite-Datei/,
  );
});

test('Der Seitenspeicher begrenzt sich selbst', async () => {
  const bytes = build(`
db.execute("CREATE TABLE t (id integer primary key, data blob)")
db.executemany("INSERT INTO t VALUES (?,?)", [(i, bytes([1]) * 900) for i in range(1, 2001)])
`);
  let gelesen = 0;
  const source = bufferSource(bytes);
  const zaehlend = {
    size: source.size,
    read: (o, l) => { gelesen += 1; return source.read(o, l); },
  };
  const db = await openDatabase(zaehlend, { cachePages: 4 });
  const root = (await db.schema()).find((s) => s.name === 't').root;
  let n = 0;
  await db.scanTable(root, () => { n += 1; });
  assert.equal(n, 2000);
  // Mit vier Seiten im Speicher wird häufiger gelesen, aber es läuft.
  assert.ok(gelesen > 4, `nur ${gelesen} Lesezugriffe – der Speicher greift nicht`);
});

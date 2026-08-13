/**
 * Prüfungen des Kartenpaket-Lesers.
 *
 * Wieder gegen echte Dateien, in beiden Bauformen, die MBTiles kennt. Der
 * wichtigste Punkt ist die Zeilenzählung: MBTiles zählt von unten, die App von
 * oben. Wer das verwechselt, bekommt eine Karte, die senkrecht gespiegelt ist –
 * und merkt es an Land nicht, weil die offene See überall gleich aussieht.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bufferSource } from '../js/lib/sqlite.js';
import { openMbtiles, mediaType } from '../js/lib/mbtiles.js';

const dir = mkdtempSync(join(tmpdir(), 'sb-mbtiles-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

/** Der Inhalt einer Kachel ist aus ihren Koordinaten ableitbar – so lässt sich prüfen. */
const marke = (z, x, row) => (z * 97 + x * 13 + row * 7) % 251;

function build(script, name) {
  const path = join(dir, name);
  execFileSync('python3', ['-c', `
import sqlite3, os
path = ${JSON.stringify(path)}
if os.path.exists(path): os.remove(path)
db = sqlite3.connect(path)
def marke(z, x, row): return (z * 97 + x * 13 + row * 7) % 251
${script}
db.commit()
db.close()
`]);
  return bufferSource(readFileSync(path));
}

/** Bauform eins: alles in einer Tabelle. */
const einfach = () => build(`
db.execute("CREATE TABLE metadata (name text, value text)")
db.executemany("INSERT INTO metadata VALUES (?,?)", [
  ('name','Ostsee'), ('format','png'), ('minzoom','4'), ('maxzoom','9'),
  ('bounds','9.5,53.5,30.0,66.0'), ('type','baselayer'),
])
db.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)")
rows = []
for z in range(4, 10):
    n = 2 ** z
    for x in range(0, min(n, 10)):
        for row in range(0, min(n, 10)):
            rows.append((z, x, row, bytes([marke(z, x, row)]) * 400))
db.executemany("INSERT INTO tiles VALUES (?,?,?,?)", rows)
db.execute("CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row)")
`, 'einfach.mbtiles');

/** Bauform zwei: gleiche Kacheln werden nur einmal abgelegt. */
const gespart = () => build(`
db.execute("CREATE TABLE metadata (name text, value text)")
db.executemany("INSERT INTO metadata VALUES (?,?)", [
  ('name','Nordsee'), ('format','png'), ('minzoom','4'), ('maxzoom','9'),
])
db.execute("CREATE TABLE map (zoom_level integer, tile_column integer, tile_row integer, tile_id text)")
db.execute("CREATE TABLE images (tile_data blob, tile_id text)")
seen = {}
for z in range(4, 10):
    n = 2 ** z
    for x in range(0, min(n, 10)):
        for row in range(0, min(n, 10)):
            m = marke(z, x, row)
            tid = "kachel%03d" % m
            if tid not in seen:
                seen[tid] = True
                db.execute("INSERT INTO images VALUES (?,?)", (bytes([m]) * 400, tid))
            db.execute("INSERT INTO map VALUES (?,?,?,?)", (z, x, row, tid))
db.execute("CREATE UNIQUE INDEX map_index on map (zoom_level, tile_column, tile_row)")
db.execute("CREATE UNIQUE INDEX images_id on images (tile_id)")
db.execute("CREATE VIEW tiles AS SELECT map.zoom_level AS zoom_level, map.tile_column AS tile_column, map.tile_row AS tile_row, images.tile_data AS tile_data FROM map JOIN images ON images.tile_id = map.tile_id")
`, 'gespart.mbtiles');

// ---------------------------------------------------------------------------

test('Angaben zum Paket werden gelesen', async () => {
  const pack = await openMbtiles(einfach());
  assert.equal(pack.name, 'Ostsee');
  assert.equal(pack.format, 'png');
  assert.equal(pack.minzoom, 4);
  assert.equal(pack.maxzoom, 9);
  assert.deepEqual(pack.bounds, {
    west: 9.5, south: 53.5, east: 30.0, north: 66.0,
  });
  assert.equal(pack.deduplicated, false);
});

test('Kacheln kommen heil heraus', async () => {
  const pack = await openMbtiles(einfach());
  for (const [z, x, row] of [[4, 0, 0], [6, 5, 3], [9, 9, 9], [7, 0, 8]]) {
    const y = 2 ** z - 1 - row;                    // von oben gezählt
    // eslint-disable-next-line no-await-in-loop
    const data = await pack.getTile(z, x, y);
    assert.ok(data, `Kachel ${z}/${x}/${y} fehlt`);
    assert.equal(data.length, 400);
    assert.ok(data.every((b) => b === marke(z, x, row)),
      `Kachel ${z}/${x}/${y} hat den falschen Inhalt`);
  }
});

test('Die Zeilenzählung wird umgedreht', async () => {
  const pack = await openMbtiles(einfach());
  const z = 6;
  // Zeile 0 in der Datei ist die unterste, also die mit dem höchsten y.
  const unten = await pack.getTile(z, 2, 2 ** z - 1);
  const zweite = await pack.getTile(z, 2, 2 ** z - 2);
  assert.ok(unten && zweite);
  assert.equal(unten[0], marke(z, 2, 0), 'unterste Zeile falsch zugeordnet');
  assert.equal(zweite[0], marke(z, 2, 1), 'zweitunterste Zeile falsch zugeordnet');
  // Und andersherum: y = 0 wäre die oberste Zeile, die es hier nicht gibt.
  assert.equal(await pack.getTile(z, 2, 0), null);
});

test('Was nicht im Paket ist, gibt null', async () => {
  const pack = await openMbtiles(einfach());
  assert.equal(await pack.getTile(6, 40, 30), null, 'Spalte außerhalb');
  assert.equal(await pack.getTile(12, 0, 0), null, 'Zoomstufe außerhalb');
  assert.equal(await pack.getTile(6, 0, -1), null, 'unmögliche Zeile');
});

test('Auch die sparsame Bauform wird gelesen', async () => {
  const pack = await openMbtiles(gespart());
  assert.equal(pack.deduplicated, true, 'Bauform nicht erkannt');
  assert.equal(pack.name, 'Nordsee');
  for (const [z, x, row] of [[4, 0, 0], [6, 5, 3], [9, 9, 9]]) {
    const y = 2 ** z - 1 - row;
    // eslint-disable-next-line no-await-in-loop
    const data = await pack.getTile(z, x, y);
    assert.ok(data, `Kachel ${z}/${x}/${y} fehlt`);
    assert.ok(data.every((b) => b === marke(z, x, row)),
      `Kachel ${z}/${x}/${y} hat den falschen Inhalt`);
  }
  assert.equal(await pack.getTile(6, 40, 30), null);
});

test('Beide Bauformen liefern dasselbe', async () => {
  const a = await openMbtiles(einfach());
  const b = await openMbtiles(gespart());
  for (const [z, x, row] of [[5, 3, 4], [8, 7, 1], [9, 0, 0]]) {
    const y = 2 ** z - 1 - row;
    // eslint-disable-next-line no-await-in-loop
    const [ta, tb] = await Promise.all([a.getTile(z, x, y), b.getTile(z, x, y)]);
    assert.deepEqual([...ta], [...tb], `Unterschied bei ${z}/${x}/${y}`);
  }
});

test('Eine Datei ohne Kachelindex wird abgelehnt', async () => {
  // Ohne Index müsste für jede Kachel die ganze Datei durchsucht werden –
  // bei vierhundert Megabyte wäre das keine Karte mehr, sondern eine Bremse.
  const ohne = build(`
db.execute("CREATE TABLE metadata (name text, value text)")
db.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)")
db.execute("INSERT INTO tiles VALUES (1,0,0,X'00')")
`, 'ohne-index.mbtiles');
  await assert.rejects(() => openMbtiles(ohne), /Kachelindex/);
});

test('Eine Datei ohne Kacheln wird abgelehnt', async () => {
  const leer = build(`
db.execute("CREATE TABLE metadata (name text, value text)")
`, 'leer.mbtiles');
  await assert.rejects(() => openMbtiles(leer), /Keine Kacheln/);
});

test('Fehlende Angaben werden verkraftet', async () => {
  const knapp = build(`
db.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob)")
db.execute("INSERT INTO tiles VALUES (3,1,2,X'0102')")
db.execute("CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row)")
`, 'knapp.mbtiles');
  const pack = await openMbtiles(knapp);
  assert.equal(pack.name, null);
  assert.equal(pack.format, 'png', 'ohne Angabe wird PNG angenommen');
  assert.equal(pack.bounds, null);
  const data = await pack.getTile(3, 1, 2 ** 3 - 1 - 2);
  assert.deepEqual([...data], [1, 2]);
});

test('Medientypen', () => {
  assert.equal(mediaType('png'), 'image/png');
  assert.equal(mediaType('JPG'), 'image/jpeg');
  assert.equal(mediaType('webp'), 'image/webp');
  assert.equal(mediaType(undefined), 'image/png');
});

/**
 * Prüfungen für den PDF-Schreiber und die Meilenbestätigung.
 *
 * Ein PDF, das kein Betrachter öffnet, fällt genau dann auf, wenn jemand es
 * an eine Prüfungsstelle schickt – und dann ist der Törn lange vorbei.
 * Deshalb wird hier der Aufbau der Datei geprüft, nicht nur, dass etwas
 * herauskommt: Kopfzeile, Objektzahl, Querverweistabelle und die Byteversätze
 * darin, die auf das Byte stimmen müssen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPdf, textWidth, mm, A4 } from '../js/lib/pdf.js';
import { buildMilesPdf } from '../js/lib/miles.js';

const alsText = (bytes) => Buffer.from(bytes).toString('latin1');

test('Ein leeres Dokument ist trotzdem ein gültiges PDF', () => {
  const pdf = createPdf({ title: 'Probe' });
  const s = alsText(pdf.build());
  assert.ok(s.startsWith('%PDF-1.4\n'), 'Kopfzeile fehlt');
  assert.ok(s.endsWith('%%EOF\n'), 'Ende fehlt');
  assert.match(s, /\/Type \/Catalog/);
  assert.match(s, /\/Type \/Pages/);
  assert.match(s, /\/Count 1/);
});

test('Die Querverweistabelle zeigt auf das richtige Byte', () => {
  const pdf = createPdf();
  pdf.text(mm(20), mm(30), 'Hallo');
  const bytes = pdf.build();
  const s = alsText(bytes);

  // startxref muss auf die Tabelle selbst zeigen.
  const startxref = Number(s.match(/startxref\n(\d+)\n/)[1]);
  assert.equal(s.slice(startxref, startxref + 4), 'xref');

  // Und jeder Eintrag auf den Anfang seines Objekts.
  const tabelle = s.slice(startxref);
  const zeilen = [...tabelle.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.ok(zeilen.length >= 6, `nur ${zeilen.length} Einträge`);
  zeilen.forEach((off, i) => {
    assert.equal(s.slice(off, off + String(i + 1).length + 6), `${i + 1} 0 obj`,
      `Versatz für Objekt ${i + 1} zeigt auf "${s.slice(off, off + 12)}"`);
  });

  // Die angegebene Objektzahl muss zur Tabelle passen.
  const size = Number(s.match(/\/Size (\d+)/)[1]);
  assert.equal(size, zeilen.length + 1);
});

test('Die Länge des Inhalts stimmt mit dem Strom überein', () => {
  const pdf = createPdf();
  pdf.text(50, 50, 'Ein Text mit Umlauten: Ölmühle, Größe, Fährschiff');
  const s = alsText(pdf.build());
  const m = s.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
  assert.ok(m, 'kein Inhaltsstrom gefunden');
  assert.equal(Number(m[1]), m[2].length,
    `angegeben ${m[1]}, tatsächlich ${m[2].length}`);
});

test('Umlaute und Gedankenstriche werden nach WinAnsi umgesetzt', () => {
  const pdf = createPdf();
  pdf.text(50, 50, 'Größe – „Öl“');
  const s = alsText(pdf.build());
  // ö ist 0xF6, Ö ist 0xD6, ß ist 0xDF – in Latin-1 deckungsgleich.
  assert.ok(s.includes('\xf6'), 'kleines ö fehlt');
  assert.ok(s.includes('\xdf'), 'ß fehlt');
  assert.ok(s.includes('\xd6'), 'großes Ö fehlt');
  // Der Gedankenstrich liegt in WinAnsi auf 0x96, nicht auf U+2013.
  assert.ok(s.includes('\x96'), 'Gedankenstrich nicht umgesetzt');
  // Die typografischen Anführungszeichen auf 0x84 und 0x93.
  assert.ok(s.includes('\x84') && s.includes('\x93'), 'Anführungszeichen nicht umgesetzt');
});

test('Klammern im Text beenden die Zeichenkette nicht', () => {
  const pdf = createPdf();
  pdf.text(50, 50, 'Kurs (rechtweisend) \\ 090');
  const s = alsText(pdf.build());
  assert.ok(s.includes('\\(rechtweisend\\)'), 'Klammern nicht geschützt');
  assert.ok(s.includes('\\\\'), 'Gegenschrägstrich nicht geschützt');
});

test('Mehrere Seiten werden auch als mehrere gezählt', () => {
  const pdf = createPdf();
  pdf.addPage();
  pdf.text(50, 50, 'eins');
  pdf.addPage();
  pdf.text(50, 50, 'zwei');
  const s = alsText(pdf.build());
  assert.match(s, /\/Count 2/);
  assert.equal((s.match(/\/Type \/Page\b/g) ?? []).length, 2);
});

test('Die Textbreite wächst mit Länge und Schriftgröße', () => {
  assert.ok(textWidth('MMMM', 10) > textWidth('iiii', 10));
  assert.ok(textWidth('Hallo', 20) > textWidth('Hallo', 10) * 1.9);
  assert.equal(textWidth('', 12), 0);
});

// ------------------------------------------------------- Meilenbestätigung

const TEXTE = Object.fromEntries([
  'title', 'subtitle', 'sectionPerson', 'person', 'role', 'area', 'sectionBoat',
  'boatName', 'boatCallsign', 'boatLoa', 'boatHome', 'sectionTrip', 'from', 'to',
  'milesTotal', 'milesNight', 'milesEngine', 'daysAboard', 'daysUnit', 'numbersHint',
  'declarationHead', 'declaration', 'skipper', 'placeDate', 'signature', 'footer',
].map((k) => [k, k]));

const eintragMB = (tag, stunde, lat, lon, extra = {}) => ({
  id: `x${tag}${stunde}`,
  ts: new Date(2026, 5, tag, stunde, 0, 0).getTime(),
  lat,
  lon,
  sog: 5,
  cog: 90,
  kind: 'auto',
  event: null,
  note: '',
  weather: {},
  ...extra,
});

test('Die Bestätigung entsteht als lesbares PDF mit den Namen darin', () => {
  const track = [
    eintragMB(1, 8, 54.0, 10.0),
    eintragMB(1, 12, 54.3, 10.0),
    eintragMB(2, 9, 54.6, 10.0),
  ];
  const bytes = buildMilesPdf({
    track,
    boat: { name: 'SEEBÄR', callsign: 'DA1234', mmsi: '211234560', loa: '11,20' },
    person: 'Änne Muster',
    skipper: 'Moritz Skipper',
    locale: 'de-DE',
    texte: TEXTE,
  });
  const s = alsText(bytes);

  assert.ok(s.startsWith('%PDF-1.4'), 'kein PDF');
  // Der Name der Person muss darin stehen – sonst bestätigt das Blatt nichts.
  assert.ok(s.includes('\xc4nne Muster'), 'Name der Person fehlt');
  assert.ok(s.includes('Moritz Skipper'), 'Name des Schiffsführers fehlt');
  assert.ok(s.includes('SEEB\xc4R'), 'Schiffsname fehlt');
  // Und die Zeile für die Unterschrift.
  assert.ok(s.includes('signature'), 'Unterschriftenfeld fehlt');
});

test('Ohne Einträge gibt es keine Bestätigung', () => {
  assert.equal(buildMilesPdf({ track: [], texte: TEXTE }), null);
});

test('Die Strecke im Dokument stimmt mit der Rechnung überein', async () => {
  const { stats } = await import('../js/lib/logbook.js');
  // 0,6° Breite sind 36 sm.
  const track = [eintragMB(1, 8, 54.0, 10.0), eintragMB(1, 14, 54.6, 10.0)];
  const k = stats(track);
  assert.ok(Math.abs(k.distance - 36) < 0.2, `Strecke ${k.distance}`);

  const s = alsText(buildMilesPdf({ track, person: 'A', texte: TEXTE, locale: 'de-DE' }));
  // Im Dokument mit deutschem Komma und einer Nachkommastelle.
  assert.ok(/\(3[56],\d\)/.test(s), 'Strecke steht nicht im Dokument');
});

test('Nachtmeilen werden getrennt ausgewiesen', async () => {
  const { nightDistance } = await import('../js/lib/logbook.js');
  // Mitten in der Nacht: 1. Januar, 2 bis 4 Uhr Weltzeit, Ostsee.
  const nachts = [
    { ts: Date.UTC(2026, 0, 1, 2), lat: 54.0, lon: 10.0, sog: 5 },
    { ts: Date.UTC(2026, 0, 1, 4), lat: 54.2, lon: 10.0, sog: 5 },
  ];
  assert.ok(nightDistance(nachts) > 11, `${nightDistance(nachts)} sm bei Nacht`);

  // Mittags im Juni ist nichts davon Nacht.
  const tags = [
    { ts: Date.UTC(2026, 5, 21, 10), lat: 54.0, lon: 10.0, sog: 5 },
    { ts: Date.UTC(2026, 5, 21, 12), lat: 54.2, lon: 10.0, sog: 5 },
  ];
  assert.equal(nightDistance(tags), 0);
});

test('Maschinenmeilen zählen nur zwischen „Motor an“ und „Motor aus“', async () => {
  const { engineDistance, trackDistance } = await import('../js/lib/logbook.js');
  const track = [
    eintragMB(1, 8, 54.0, 10.0, { event: 'engineOn' }),
    eintragMB(1, 10, 54.1, 10.0, { event: 'engineOff' }),
    eintragMB(1, 12, 54.3, 10.0),
  ];
  // Erstes Stück unter Maschine (6 sm), zweites unter Segeln (12 sm).
  assert.ok(Math.abs(engineDistance(track) - 6) < 0.1, `${engineDistance(track)} sm`);
  assert.ok(Math.abs(trackDistance(track) - 18) < 0.1, `${trackDistance(track)} sm gesamt`);
});

// ------------------------------------------------------------ Dateinamen

test('Dateinamen kommen ohne Umlaute aus', async () => {
  const { stamped } = await import('../js/lib/share.js');
  const when = new Date(2026, 7, 14, 15, 4);
  // Chromium wirft den Namen weg, sobald ein Zeichen über 127 darin steht,
  // und lädt die Datei als „download“ herunter. Wer Änne heißt, bekäme also
  // ein Blatt ohne Namen.
  assert.equal(stamped('Meilen Änne Muster', 'pdf', when), 'Meilen-Aenne-Muster-2026-08-14-1504.pdf');
  assert.equal(stamped('Törn Größe', 'gpx', when), 'Toern-Groesse-2026-08-14-1504.gpx');
  assert.equal(stamped('Île de Ré', 'csv', when), 'Ile-de-Re-2026-08-14-1504.csv');
  // Und nichts davon enthält noch ein Zeichen über 127.
  ['Meilen Änne Muster', 'Törn Größe', 'Île de Ré', 'Ostsee 2026'].forEach((n) => {
    const name = stamped(n, 'pdf', when);
    assert.ok([...name].every((ch) => ch.codePointAt(0) < 128), `${name} ist nicht rein`);
  });
});

test('Ein Name, von dem nichts übrig bleibt, wird nicht leer', async () => {
  const { stamped } = await import('../js/lib/share.js');
  const when = new Date(2026, 7, 14, 15, 4);
  assert.equal(stamped('§$%', 'pdf', when), 'logbuch-2026-08-14-1504.pdf');
  assert.equal(stamped('', 'pdf', when), 'logbuch-2026-08-14-1504.pdf');
});

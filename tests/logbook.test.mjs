/**
 * Prüfungen für das Logbuch – die Teile, die reine Rechnung sind.
 *
 * Speicher, Zeitgeber und Oberfläche gehören dem Browser; die prüft der
 * Rauchtest. Hier steht, was auch ohne Browser stimmen muss: die Strecke je
 * Tag, die Fahrtwerte und vor allem die Ausgabe. Ein GPX, das ein
 * Navigationsprogramm nicht liest, fällt sonst erst an Land auf – und dann
 * ist der Törn vorbei.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dailyRuns, speedStats, trackDistance, toGpx, toCsv, LOG_EVENTS,
} from '../js/lib/logbook.js';

/** Ein Eintrag, wie ihn das Logbuch anlegt. */
const eintrag = (tag, stunde, lat, lon, extra = {}) => ({
  id: `log${tag}${stunde}`,
  ts: new Date(2026, 5, tag, stunde, 0, 0).getTime(),
  lat,
  lon,
  sog: 5,
  cog: 90,
  accuracy: 8,
  kind: 'auto',
  event: null,
  note: '',
  tripId: null,
  weather: {
    windDir: 'SW', windForce: 4, sea: 3, vis: 'bis5', clouds: 5, pressure: 1013, temp: 18,
  },
  ...extra,
});

test('Etmal zählt die Strecke je Kalendertag, nicht Luftlinie', () => {
  // Zwei Tage: am ersten hin und zurück, am zweiten einmal geradeaus.
  const track = [
    eintrag(1, 8, 54.00, 10.00),
    eintrag(1, 10, 54.10, 10.00),
    eintrag(1, 12, 54.00, 10.00),
    eintrag(2, 8, 54.20, 10.00),
  ];
  const tage = dailyRuns(track);
  assert.equal(tage.length, 2);

  const ersterTag = tage.find((d) => d.day.endsWith('-01'));
  const zweiterTag = tage.find((d) => d.day.endsWith('-02'));

  // 0,10° Breite sind 6 sm; hin und zurück also 12 – und nicht 0, wie es die
  // Luftlinie zwischen erstem und letztem Punkt ergäbe.
  assert.ok(Math.abs(ersterTag.distance - 12) < 0.1, `erster Tag: ${ersterTag.distance}`);
  // Vom letzten Punkt des Vortages zum ersten des Folgetages: 0,20° = 12 sm.
  assert.ok(Math.abs(zweiterTag.distance - 12) < 0.1, `zweiter Tag: ${zweiterTag.distance}`);
});

test('Ohne zweiten Punkt gibt es kein Etmal', () => {
  assert.deepEqual(dailyRuns([eintrag(1, 8, 54, 10)]), []);
  assert.deepEqual(dailyRuns([]), []);
});

test('Fahrtwerte übergehen fehlende Angaben, statt daran zu scheitern', () => {
  const track = [
    eintrag(1, 8, 54.0, 10.0, { sog: 4 }),
    eintrag(1, 9, 54.1, 10.0, { sog: null }),
    eintrag(1, 10, 54.2, 10.0, { sog: 8 }),
  ];
  const s = speedStats(track);
  assert.equal(s.max, 8);
  assert.equal(s.avg, 6);
});

test('Ganz ohne Fahrtangaben wird nichts behauptet', () => {
  const s = speedStats([eintrag(1, 8, 54, 10, { sog: null })]);
  assert.equal(s.max, null);
  assert.equal(s.avg, null);
});

test('Die Strecke entlang der Spur ist die Summe der Teilstücke', () => {
  const track = [
    eintrag(1, 8, 54.0, 10.0),
    eintrag(1, 9, 54.1, 10.0),
    eintrag(1, 10, 54.2, 10.0),
  ];
  assert.ok(Math.abs(trackDistance(track) - 12) < 0.1, String(trackDistance(track)));
});

test('GPX enthält jede Position als Spurpunkt', () => {
  const track = [
    eintrag(1, 8, 54.5, 10.25),
    eintrag(1, 9, 54.6, 10.30),
  ];
  const gpx = toGpx(track, { boat: 'SEEBÄR' });

  assert.ok(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'XML-Kopf fehlt');
  assert.ok(gpx.includes('<gpx version="1.1"'), 'GPX-Fassung fehlt');
  assert.ok(gpx.includes('xmlns="http://www.topografix.com/GPX/1/1"'), 'Namensraum fehlt');
  assert.equal((gpx.match(/<trkpt /g) ?? []).length, 2);
  assert.ok(gpx.includes('lat="54.500000" lon="10.250000"'), gpx.slice(0, 400));
  assert.ok(gpx.includes('<trkseg>') && gpx.includes('</trkseg>'), 'Spurabschnitt fehlt');
  // Jedes offene Element wird auch geschlossen.
  assert.equal((gpx.match(/<trk>/g) ?? []).length, (gpx.match(/<\/trk>/g) ?? []).length);
});

test('Ereignisse stehen im GPX zusätzlich als eigener Punkt', () => {
  const track = [
    eintrag(1, 8, 54.5, 10.25, { kind: 'manual', event: 'anchorDown', note: 'Sandgrund' }),
    eintrag(1, 9, 54.6, 10.30),
  ];
  const gpx = toGpx(track);
  assert.equal((gpx.match(/<wpt /g) ?? []).length, 1);
  assert.ok(gpx.includes('anchorDown – Sandgrund'), gpx);
  // Der Spurpunkt bleibt trotzdem erhalten – sonst hätte die Spur ein Loch.
  assert.equal((gpx.match(/<trkpt /g) ?? []).length, 2);
});

test('GPX maskiert Zeichen, die XML zerlegen würden', () => {
  const track = [eintrag(1, 8, 54.5, 10.25, {
    kind: 'manual', event: 'reef', note: 'Wind <böig> & "hart"',
  })];
  const gpx = toGpx(track, { name: 'Törn & Rückweg' });
  assert.ok(gpx.includes('&lt;böig&gt;'), gpx);
  assert.ok(gpx.includes('&amp;'), gpx);
  assert.ok(!/<name>[^<]*<b/.test(gpx), 'unmaskiertes Kleinerzeichen im Namen');
});

test('Geschwindigkeit steht im GPX in Metern je Sekunde', () => {
  // GPX rechnet in m/s, an Bord wird in Knoten gedacht. Wer das verwechselt,
  // bekommt in jedem Navigationsprogramm den doppelten Wert.
  const gpx = toGpx([eintrag(1, 8, 54.5, 10.25, { sog: 10 })]);
  assert.ok(gpx.includes('<speed>5.14</speed>'), gpx);
});

test('Die Tabelle führt Wetter und Ereignis mit', () => {
  const csv = toCsv([
    eintrag(1, 8, 54.5, 10.25, { kind: 'manual', event: 'tack', note: 'Halse; mit "Anführung"' }),
  ]);
  const [kopf, zeile] = csv.split('\n');
  assert.ok(kopf.includes('ereignis'), kopf);
  assert.ok(kopf.includes('wind_bft'), kopf);
  assert.ok(zeile.includes('"tack"'), zeile);
  assert.ok(zeile.includes('"SW"') && zeile.includes('"4"'), zeile);
  // Anführungszeichen im Text werden verdoppelt, sonst bricht die Spalte auf.
  assert.ok(zeile.includes('""Anführung""'), zeile);
  // Ein Semikolon darf die Zeile nicht zerlegen – getrennt wird mit Komma.
  assert.equal(csv.split('\n').length, 2);
});

test('Die Tabelle hat für jeden Eintrag genau eine Zeile', () => {
  const track = [eintrag(1, 8, 54, 10), eintrag(1, 9, 54.1, 10), eintrag(1, 10, 54.2, 10)];
  assert.equal(toCsv(track).split('\n').length, 4);   // Kopfzeile plus drei
});

test('Jedes Ereignis hat ein Zeichen und einen eindeutigen Schlüssel', () => {
  const keys = LOG_EVENTS.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, 'doppelter Schlüssel');
  LOG_EVENTS.forEach((e) => {
    assert.ok(e.sym && e.sym.length <= 2, `${e.key} hat kein brauchbares Zeichen`);
  });
});

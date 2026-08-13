import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCoordinate, parsePositionPair, rhumbLine, greatCircleDistance,
  initialBearing, courseChain, formatLat, formatLon, norm360, norm180,
  destinationPoint, relativeSide, formatDuration, solve, formatSpoken, toParts, fromParts,
} from '../js/lib/geo.js';

const close = (a, b, eps, msg) =>
  assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} erwartet ${b} ± ${eps}, war ${a}`);

test('parseCoordinate: Grad und Dezimalminuten', () => {
  close(parseCoordinate("54°31.234' N"), 54.520566, 1e-5);
  close(parseCoordinate('54 31,234 N'), 54.520566, 1e-5);
  close(parseCoordinate('N 54 31.234'), 54.520566, 1e-5);
  close(parseCoordinate("011°22.345' E", 'lon'), 11.372416, 1e-5);
  close(parseCoordinate("011°22.345' O", 'lon'), 11.372416, 1e-5);
});

test('parseCoordinate: Grad, Minuten, Sekunden', () => {
  close(parseCoordinate(`54°31'14" N`), 54 + 31 / 60 + 14 / 3600, 1e-6);
  close(parseCoordinate('54:31:14 N'), 54 + 31 / 60 + 14 / 3600, 1e-6);
});

test('parseCoordinate: Dezimalgrad und Vorzeichen', () => {
  close(parseCoordinate('54.520567'), 54.520567, 1e-9);
  close(parseCoordinate('-33.8688'), -33.8688, 1e-9);
  close(parseCoordinate('33.8688 S'), -33.8688, 1e-9);
  close(parseCoordinate('151.2093 W', 'lon'), -151.2093, 1e-9);
});

test('parseCoordinate: unsinnige Eingaben werden abgewiesen', () => {
  assert.equal(parseCoordinate(''), null);
  assert.equal(parseCoordinate('abc'), null);
  assert.equal(parseCoordinate('95 00.0 N'), null, 'Breite über 90°');
  assert.equal(parseCoordinate('190 00.0 E', 'lon'), null, 'Länge über 180°');
  assert.equal(parseCoordinate('54 71.5 N'), null, 'Minuten über 60');
  assert.equal(parseCoordinate(`54 31 75" N`), null, 'Sekunden über 60');
});

test('parsePositionPair: die üblichen Schreibweisen', () => {
  const expect = (p, lat, lon) => {
    assert.ok(p, 'nicht erkannt');
    close(p.lat, lat, 1e-4, 'Breite');
    close(p.lon, lon, 1e-4, 'Länge');
  };
  expect(parsePositionPair(`54°31.234' N 011°22.345' E`), 54.520566, 11.372416);
  expect(parsePositionPair('54 31.234 N 11 22.345 E'), 54.520566, 11.372416);
  expect(parsePositionPair('N 54 31.234 E 011 22.345'), 54.520566, 11.372416);
  expect(parsePositionPair('54.520567, 11.372417'), 54.520567, 11.372417);
  expect(parsePositionPair('54.520567 11.372417'), 54.520567, 11.372417);
  expect(parsePositionPair('54,520567; 11,372417'), 54.520567, 11.372417);
  expect(parsePositionPair(`54°31'14"N 011°22'20"E`), 54.52056, 11.37222);
  expect(parsePositionPair('-33.8688, 151.2093'), -33.8688, 151.2093);
  expect(parsePositionPair('33 52.1 S 151 12.6 E'), -33.868333, 151.21);
});

test('parsePositionPair: Unsinn liefert null', () => {
  assert.equal(parsePositionPair('irgendwas'), null);
  assert.equal(parsePositionPair(''), null);
  assert.equal(parsePositionPair('54.5'), null, 'nur eine Zahl ist keine Position');
});

test('Entfernung und Kurs: bekannte Strecke', () => {
  // Kiel-Leuchtturm nach Fehmarnsund, grob geprüft gegen Seekarte.
  const a = { lat: 54.5, lon: 10.27 };
  const b = { lat: 54.43, lon: 11.19 };
  const rl = rhumbLine(a, b);
  close(rl.distance, 32.2, 0.6, 'Loxodrome');
  close(rl.bearing, 96.2, 1.5, 'Kartenkurs');
});

test('Entfernung: ein Grad Breite sind 60 Seemeilen', () => {
  const d = greatCircleDistance({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
  close(d, 60, 0.15);
});

test('Kurs: exakt Nord, Ost, Süd, West', () => {
  const o = { lat: 50, lon: 8 };
  close(initialBearing(o, { lat: 51, lon: 8 }), 0, 1e-6);
  close(initialBearing(o, { lat: 50, lon: 9 }), 90, 0.5);
  close(initialBearing(o, { lat: 49, lon: 8 }), 180, 1e-6);
  close(norm360(initialBearing(o, { lat: 50, lon: 7 })), 270, 0.5);
});

test('Loxodrome auf gleicher Breite läuft genau nach Osten', () => {
  const rl = rhumbLine({ lat: 54, lon: 10 }, { lat: 54, lon: 11 });
  close(rl.bearing, 90, 1e-6);
  close(rl.distance, 60 * Math.cos(54 * Math.PI / 180), 0.1);
});

test('Loxodrome über den 180. Meridian nimmt den kurzen Weg', () => {
  const rl = rhumbLine({ lat: 0, lon: 179 }, { lat: 0, lon: -179 });
  close(rl.distance, 120, 1, 'zwei Grad Länge am Äquator');
  close(rl.bearing, 90, 1e-6);
});

test('Zielpunkt und Rückrechnung passen zusammen', () => {
  const start = { lat: 54.5, lon: 10.27 };
  const ziel = destinationPoint(start, 135, 25);
  close(greatCircleDistance(start, ziel), 25, 0.01);
  close(initialBearing(start, ziel), 135, 0.05);
});

test('Kurswandlung: rechtweisend, missweisend, Kompass', () => {
  // Missweisung 3° Ost, Ablenkung 2° West
  const c = courseChain(100, 3, -2);
  close(c.true, 100, 1e-9);
  close(c.magnetic, 97, 1e-9);
  close(c.compass, 99, 1e-9);
  // Über 0° hinweg sauber normiert
  close(courseChain(2, 5, 0).magnetic, 357, 1e-9);
});

test('Seitenpeilung: Steuerbord oder Backbord', () => {
  assert.deepEqual(relativeSide(100, 60), { side: 'starboard', deg: 40 });
  assert.deepEqual(relativeSide(20, 60), { side: 'port', deg: 40 });
  assert.equal(relativeSide(60, 60).side, 'ahead');
  assert.equal(relativeSide(240, 60).side, 'astern');
  assert.deepEqual(relativeSide(10, 350), { side: 'starboard', deg: 20 }, 'über 0° hinweg');
});

test('Position zum Vorlesen, deutsch und englisch', () => {
  const pos = { lat: 54.520566, lon: 11.372416 };
  assert.match(formatSpoken(pos, 'de'), /^fünf vier Grad drei eins Komma zwei Minuten Nord/);
  assert.match(formatSpoken(pos, 'en'), /^five four degrees three one decimal two minutes north/);
  assert.match(formatSpoken({ lat: -33.8, lon: -70.5 }, 'de'), /Süd.*West/);
});

test('Winkelnormierung', () => {
  close(norm360(-10), 350, 1e-9);
  close(norm360(370), 10, 1e-9);
  close(norm180(190), -170, 1e-9);
  close(norm180(-190), 170, 1e-9);
});

test('Formatierung in Grad und Dezimalminuten', () => {
  assert.equal(formatLat(54.520566), `54°31,234' N`);
  assert.equal(formatLon(11.372416), `011°22,345' E`);
  assert.equal(formatLat(-33.868333), `33°52,100' S`);
  assert.equal(formatLon(-0.1276), `000°07,656' W`);
});

test('Formatierung: Rundung auf 60,000 Minuten zählt das Grad hoch', () => {
  assert.equal(formatLat(53.9999999), `54°00,000' N`);
});

test('Fahrzeit', () => {
  assert.equal(formatDuration(3600), '1 h 00 min');
  assert.equal(formatDuration(90), '1 min 30 s');
  assert.equal(formatDuration(null), '–');
});

test('solve liefert eine vollständige Lösung', () => {
  const r = solve({ lat: 54.5, lon: 10.27 }, { lat: 54.43, lon: 11.19 }, {
    variation: 3, deviation: 0, speed: 5.5, heading: 90,
  });
  close(r.distance, 32.2, 0.6);
  close(r.courses.magnetic, r.bearing - 3, 1e-9);
  close(r.reciprocal, norm360(r.bearing + 180), 1e-9);
  assert.equal(r.relative.side, 'starboard');
  close(r.eta, (32.2 / 5.5) * 3600, 200);
});

test('Koordinaten in Einzelfelder zerlegen', () => {
  const p = toParts({ lat: 54.520566, lon: 11.372416 });
  assert.equal(p.latDeg, '54');
  assert.equal(p.latMin, '31.234');
  assert.equal(p.latHemi, 'N');
  assert.equal(p.lonDeg, '011');
  assert.equal(p.lonMin, '22.345');
  assert.equal(p.lonHemi, 'E');

  const s = toParts({ lat: -33.868333, lon: -70.5 });
  assert.equal(s.latHemi, 'S');
  assert.equal(s.lonHemi, 'W');
  assert.equal(s.lonDeg, '070');

  assert.equal(toParts(null).latHemi, 'N', 'Vorbelegung ohne Position');
});

test('Einzelfelder wieder zu einer Position zusammensetzen', () => {
  const pos = fromParts({ latDeg: '54', latMin: '31.234', latHemi: 'N', lonDeg: '11', lonMin: '22.345', lonHemi: 'E' });
  close(pos.lat, 54.520566, 1e-5);
  close(pos.lon, 11.372416, 1e-5);

  // Dezimalkomma ist genauso zulässig wie der Punkt.
  const komma = fromParts({ latDeg: '54', latMin: '31,234', latHemi: 'N', lonDeg: '11', lonMin: '22,345', lonHemi: 'E' });
  close(komma.lat, 54.520566, 1e-5);

  // Ohne Minuten wird schlicht mit 0 gerechnet.
  close(fromParts({ latDeg: '54', latMin: '', latHemi: 'N', lonDeg: '11', lonMin: '', lonHemi: 'E' }).lat, 54, 1e-9);

  // Südliche Breite und westliche Länge werden negativ.
  const sw = fromParts({ latDeg: '33', latMin: '52.1', latHemi: 'S', lonDeg: '70', lonMin: '30', lonHemi: 'W' });
  close(sw.lat, -33.868333, 1e-5);
  close(sw.lon, -70.5, 1e-9);
});

test('Einzelfelder: unmögliche Eingaben liefern null', () => {
  const base = { latDeg: '54', latMin: '31.2', latHemi: 'N', lonDeg: '11', lonMin: '22.3', lonHemi: 'E' };
  assert.equal(fromParts({ ...base, latDeg: '' }), null, 'Breite fehlt');
  assert.equal(fromParts({ ...base, lonDeg: '' }), null, 'Länge fehlt');
  assert.equal(fromParts({ ...base, latDeg: '95' }), null, 'Breite über 90°');
  assert.equal(fromParts({ ...base, lonDeg: '190' }), null, 'Länge über 180°');
  assert.equal(fromParts({ ...base, latMin: '60' }), null, 'Minuten nicht kleiner 60');
  assert.equal(fromParts({ ...base, latMin: 'abc' }), null, 'keine Zahl');
  assert.equal(fromParts({ ...base, latDeg: '-5' }), null, 'Vorzeichen gehört in die Himmelsrichtung');
  assert.equal(fromParts(null), null);
});

test('Zerlegen und Zusammensetzen sind zueinander passend', () => {
  for (const pos of [
    { lat: 54.520566, lon: 11.372416 },
    { lat: -33.868333, lon: 151.209295 },
    { lat: 0, lon: 0 },
    { lat: 60.0, lon: -0.1276 },
  ]) {
    const back = fromParts(toParts(pos));
    close(back.lat, pos.lat, 1e-5, 'Breite');
    close(back.lon, pos.lon, 1e-5, 'Länge');
  }
});

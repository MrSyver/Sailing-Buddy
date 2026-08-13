/**
 * Prüfungen der fertigen Seegebiete.
 *
 * Ein Revier, das sich nicht am Stück laden lässt, ist in der Liste eine Falle:
 * Man tippt es an, freut sich – und bekommt eine Absage. Deshalb wird hier
 * nachgerechnet, statt es zu glauben.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEA_REGIONS, REGION_GROUPS, regionArea, regionContains, regionCenter,
} from '../js/data/searegions.js';
import { REGION_ZOOM_PRESETS, layers } from '../js/data/tilesources.js';
import { tilesForArea, MAX_TILES_PER_AREA, areaCovers } from '../js/lib/tiles.js';

const LAYERS = layers({}).length;
const abrufe = (region, preset) =>
  tilesForArea(regionArea(region, preset.zMin, preset.zMax)).length * LAYERS;

test('Jedes Gebiet hat, was es braucht', () => {
  const ids = new Set();
  const groups = new Set(REGION_GROUPS.map((g) => g.key));
  for (const r of SEA_REGIONS) {
    assert.ok(r.id && !ids.has(r.id), `Kennung fehlt oder kommt doppelt vor: ${r.id}`);
    ids.add(r.id);
    assert.ok(r.name && r.nameEn, `Name fehlt bei ${r.id}`);
    assert.ok(r.hint && r.hintEn, `Beschreibung fehlt bei ${r.id}`);
    assert.ok(groups.has(r.group), `Unbekannte Gruppe bei ${r.id}: ${r.group}`);
  }
});

test('Die Rechtecke sind richtig herum und plausibel groß', () => {
  for (const r of SEA_REGIONS) {
    const b = r.bounds;
    assert.ok(b.north > b.south, `${r.id}: Nord liegt nicht über Süd`);
    assert.ok(b.east > b.west, `${r.id}: Ost liegt nicht rechts von West`);
    assert.ok(Math.abs(b.north) <= 85 && Math.abs(b.south) <= 85, `${r.id}: außerhalb der Karte`);
    assert.ok(Math.abs(b.east) <= 180 && Math.abs(b.west) <= 180, `${r.id}: Länge außerhalb`);
    // Kein Gebiet darf ein halber Kontinent sein.
    assert.ok(b.north - b.south <= 12, `${r.id}: über zwölf Breitengrade hoch`);
    assert.ok(b.east - b.west <= 14, `${r.id}: über vierzehn Längengrade breit`);
  }
});

test('In der Übersichtsstufe ist jedes Gebiet am Stück ladbar', () => {
  const preset = REGION_ZOOM_PRESETS[1];
  const zuGross = SEA_REGIONS
    .map((r) => ({ id: r.id, n: abrufe(r, preset) }))
    .filter((x) => x.n > MAX_TILES_PER_AREA);
  assert.deepEqual(zuGross, [],
    `Diese Gebiete sprengen schon die Übersichtsstufe:\n  ${zuGross.map((x) => `${x.id}: ${x.n}`).join('\n  ')}`);
});

test('Die gröbste Stufe geht überall, und zwar deutlich', () => {
  const preset = REGION_ZOOM_PRESETS[0];
  for (const r of SEA_REGIONS) {
    const n = abrufe(r, preset);
    assert.ok(n > 0, `${r.id}: gar keine Kacheln`);
    assert.ok(n <= MAX_TILES_PER_AREA / 2,
      `${r.id}: ${n} Abrufe in der gröbsten Stufe – das sollte die Hälfte der Grenze nicht reißen`);
  }
});

test('Feinere Stufen bedeuten mehr Kacheln', () => {
  for (const r of SEA_REGIONS.slice(0, 6)) {
    const zahlen = REGION_ZOOM_PRESETS.map((p) => abrufe(r, p));
    for (let i = 1; i < zahlen.length; i += 1) {
      assert.ok(zahlen[i] > zahlen[i - 1],
        `${r.id}: Stufe ${i} hat nicht mehr Kacheln als Stufe ${i - 1} (${zahlen.join(' → ')})`);
    }
  }
});

test('Ein Gebiet erkennt Positionen in seinen Grenzen', () => {
  const kieler = SEA_REGIONS.find((r) => r.id === 'kieler-bucht');
  assert.ok(kieler, 'Kieler Bucht fehlt');
  assert.ok(regionContains(kieler, { lat: 54.5, lon: 10.27 }), 'Kiel liegt in der Kieler Bucht');
  assert.equal(regionContains(kieler, { lat: 43.5, lon: 16.4 }), false, 'Split liegt nicht darin');
  assert.equal(regionContains(kieler, null), false);
});

test('Ein geladenes Gebiet weiß, ob man darin fährt', () => {
  const kieler = SEA_REGIONS.find((r) => r.id === 'kieler-bucht');
  const area = regionArea(kieler, 6, 10);
  assert.ok(areaCovers(area, { lat: 54.5, lon: 10.27 }));
  assert.equal(areaCovers(area, { lat: 43.5, lon: 16.4 }), false);
});

test('Der Mittelpunkt liegt im Gebiet', () => {
  for (const r of SEA_REGIONS) {
    assert.ok(regionContains(r, regionCenter(r)), `${r.id}: Mittelpunkt fällt heraus`);
  }
});

test('Die deutsche Ostsee ist abgedeckt', () => {
  // Ein paar Häfen, die in der Liste vorkommen müssen – sonst nützt sie nichts.
  const proben = [
    ['Kiel', 54.32, 10.14],
    ['Flensburg', 54.79, 9.44],
    ['Rostock-Warnemünde', 54.18, 12.09],
    ['Stralsund', 54.31, 13.09],
    ['Helgoland', 54.18, 7.89],
    ['Split', 43.50, 16.44],
    ['Palma', 39.56, 2.63],
  ];
  for (const [name, lat, lon] of proben) {
    const treffer = SEA_REGIONS.filter((r) => regionContains(r, { lat, lon }));
    assert.ok(treffer.length > 0, `${name} liegt in keinem einzigen Gebiet`);
  }
});

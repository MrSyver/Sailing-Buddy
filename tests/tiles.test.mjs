/**
 * Prüfungen der Kachelrechnung.
 *
 * Fehler hier fallen teuer aus: Ein falscher Ausschnitt lädt entweder die
 * halbe Ostsee herunter oder ausgerechnet nicht das Stück, über das man
 * fahren will – und das merkt man erst ohne Netz.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lonToTileX, latToTileY, tileXToLon, tileYToLat, tileSizeNm,
  boundsAround, boundsOf, tilesForBounds, tilesAlongRoute, tileUrl,
  tilesForArea, formatBytes, MAX_TILES_PER_AREA,
} from '../js/lib/tiles.js';

const close = (a, b, eps, msg) =>
  assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} erwartet ${b} ± ${eps}, war ${a}`);

test('Kachelrechnung: bekannte Werte', () => {
  // Nullmeridian am Äquator liegt bei Zoom 1 genau in der Mitte.
  close(lonToTileX(0, 1), 1, 1e-9);
  close(latToTileY(0, 1), 1, 1e-9);
  // Zoomstufe 0 ist eine einzige Kachel.
  close(lonToTileX(-180, 0), 0, 1e-9);
  close(lonToTileX(180, 0), 1, 1e-9);
});

test('Kachelrechnung: hin und zurück', () => {
  for (const [lat, lon, z] of [[54.5, 10.27, 12], [-33.87, 151.21, 9], [0, 0, 5]]) {
    const x = lonToTileX(lon, z);
    const y = latToTileY(lat, z);
    close(tileXToLon(x, z), lon, 1e-6, 'Länge');
    close(tileYToLat(y, z), lat, 1e-6, 'Breite');
  }
});

test('Kachelgröße nimmt mit dem Zoom ab', () => {
  const a = tileSizeNm(54, 10);
  const b = tileSizeNm(54, 11);
  close(b, a / 2, 1e-6);
  // In der Ostsee ist eine Kachel bei Zoom 12 grob drei Seemeilen breit.
  close(tileSizeNm(54, 12), 3.1, 0.4);
});

test('Umkreis: Rechteck passt zum Radius', () => {
  const b = boundsAround({ lat: 54.5, lon: 10.27 }, 12);
  close((b.north - b.south) * 60, 24, 0.01, 'Höhe in Seemeilen');
  // In der Breite von 54,5° ist ein Längengrad kürzer.
  close((b.east - b.west) * 60 * Math.cos(54.5 * Math.PI / 180), 24, 0.3, 'Breite');
});

test('Umschließendes Rechteck einer Route', () => {
  const b = boundsOf([{ lat: 54, lon: 10 }, { lat: 55, lon: 11 }], 0);
  close(b.south, 54, 1e-9);
  close(b.north, 55, 1e-9);
  close(b.west, 10, 1e-9);
  close(b.east, 11, 1e-9);
});

test('Kacheln eines Rechtecks: Anzahl und Eindeutigkeit', () => {
  const bounds = boundsAround({ lat: 54.5, lon: 10.27 }, 5);
  const tiles = tilesForBounds(bounds, 10, 12);

  assert.ok(tiles.length > 0, 'keine Kacheln');
  const keys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
  assert.equal(keys.size, tiles.length, 'Kacheln kommen doppelt vor');

  // Höhere Zoomstufe heißt mehr Kacheln.
  const z10 = tiles.filter((t) => t.z === 10).length;
  const z12 = tiles.filter((t) => t.z === 12).length;
  assert.ok(z12 > z10, `Zoom 12 (${z12}) müsste mehr Kacheln haben als Zoom 10 (${z10})`);
});

test('Kacheln decken den angefragten Bereich wirklich ab', () => {
  const center = { lat: 54.5, lon: 10.27 };
  const bounds = boundsAround(center, 6);
  const z = 12;
  const tiles = tilesForBounds(bounds, z, z);

  // Für jede Ecke und die Mitte muss es eine Kachel geben.
  const proben = [
    center,
    { lat: bounds.north - 0.001, lon: bounds.west + 0.001 },
    { lat: bounds.south + 0.001, lon: bounds.east - 0.001 },
  ];
  for (const p of proben) {
    const x = Math.floor(lonToTileX(p.lon, z));
    const y = Math.floor(latToTileY(p.lat, z));
    assert.ok(tiles.some((t) => t.x === x && t.y === y),
      `Kachel ${z}/${x}/${y} fehlt für ${p.lat}/${p.lon}`);
  }
});

test('Route: Korridor spart gegenüber dem Rechteck', () => {
  // Lange, schräge Strecke – da ist das Rechteck viel größer als der Korridor.
  const route = [{ lat: 54.3, lon: 10.1 }, { lat: 55.0, lon: 11.6 }];
  const corridor = 3;
  const z = 11;

  const alongRoute = tilesAlongRoute(route, corridor, z, z);
  const box = tilesForBounds(boundsOf(route, corridor), z, z);

  assert.ok(alongRoute.length > 0, 'keine Kacheln entlang der Route');
  assert.ok(alongRoute.length < box.length,
    `Korridor (${alongRoute.length}) müsste sparsamer sein als das Rechteck (${box.length})`);
});

test('Route: die Wegpunkte selbst sind immer abgedeckt', () => {
  const route = [
    { lat: 54.3, lon: 10.1 },
    { lat: 54.6, lon: 10.9 },
    { lat: 54.4, lon: 11.4 },
  ];
  const z = 12;
  const tiles = tilesAlongRoute(route, 2, z, z);
  for (const p of route) {
    const x = Math.floor(lonToTileX(p.lon, z));
    const y = Math.floor(latToTileY(p.lat, z));
    assert.ok(tiles.some((t) => t.x === x && t.y === y),
      `Wegpunkt ${p.lat}/${p.lon} liegt außerhalb der geladenen Kacheln`);
  }
});

test('Route: die Mitte einer Strecke ist abgedeckt', () => {
  const route = [{ lat: 54.0, lon: 10.0 }, { lat: 54.8, lon: 11.2 }];
  const z = 11;
  const tiles = tilesAlongRoute(route, 2, z, z);
  const mid = { lat: 54.4, lon: 10.6 };
  const x = Math.floor(lonToTileX(mid.lon, z));
  const y = Math.floor(latToTileY(mid.lat, z));
  assert.ok(tiles.some((t) => t.x === x && t.y === y), 'Streckenmitte fehlt');
});

test('Route mit einem einzigen Punkt wird zum Umkreis', () => {
  const tiles = tilesAlongRoute([{ lat: 54.5, lon: 10.27 }], 4, 11, 11);
  assert.ok(tiles.length > 0);
});

test('Adressvorlage wird richtig gefüllt', () => {
  assert.equal(
    tileUrl('https://example.org/{z}/{x}/{y}.png', 12, 2200, 1330),
    'https://example.org/12/2200/1330.png',
  );
  // Verteilte Server: {s} wird zu a, b oder c
  assert.match(tileUrl('https://{s}.example.org/{z}/{x}/{y}.png', 5, 1, 1), /^https:\/\/[abc]\./);
});

test('tilesForArea unterscheidet Umkreis und Route', () => {
  const umkreis = tilesForArea({
    kind: 'radius', center: { lat: 54.5, lon: 10.27 }, radiusNm: 4, zMin: 11, zMax: 11,
  });
  const route = tilesForArea({
    kind: 'route',
    points: [{ lat: 54.3, lon: 10.1 }, { lat: 54.9, lon: 11.3 }],
    corridorNm: 2,
    zMin: 11,
    zMax: 11,
  });
  assert.ok(umkreis.length > 0 && route.length > 0);
  assert.notDeepEqual(umkreis, route);
});

test('Die Obergrenze ist gesetzt und maßvoll', () => {
  assert.ok(MAX_TILES_PER_AREA >= 500 && MAX_TILES_PER_AREA <= 20000,
    `Obergrenze ${MAX_TILES_PER_AREA} wirkt unpassend`);
});

test('Größenangaben', () => {
  assert.equal(formatBytes(0), '0 MB');
  assert.equal(formatBytes(500 * 1024), '500 kB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});

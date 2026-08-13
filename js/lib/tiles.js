/**
 * Kartenkacheln: Rechnung, Speicher und Herunterladen.
 *
 * Die Karten stammen aus OpenStreetMap und OpenSeaMap. Der Seezeichen-Layer
 * von OpenSeaMap ist durchsichtig und wird über eine Grundkarte gelegt.
 *
 * Wichtig zur Nutzung: Der Kachelserver von OpenStreetMap ist ausdrücklich
 * nicht für Massenabrufe gedacht. Deshalb sind die Mengen hier hart begrenzt,
 * die Abrufe laufen langsam und einzeln, und die Adresse der Grundkarte lässt
 * sich in den Einstellungen austauschen – etwa gegen einen eigenen Server oder
 * einen Anbieter, bei dem man ein Konto hat.
 *
 * Kachelschema: Slippy Map, Zoomstufe z, Spalte x, Zeile y, Web-Mercator.
 */

const DB_NAME = 'sailing-buddy-tiles';
const STORE_TILES = 'tiles';
const STORE_AREAS = 'areas';

/** Obergrenze je Herunterladevorgang – schützt Speicher und Kachelserver. */
export const MAX_TILES_PER_AREA = 4000;
/** Pause zwischen zwei Abrufen in Millisekunden. */
const REQUEST_DELAY = 120;
/** Grobe Schätzung je Kachel, für die Vorschau der Größe. */
export const BYTES_PER_TILE = 14000;

// ---------------------------------------------------------------------------
// Kachelrechnung
// ---------------------------------------------------------------------------

export const lonToTileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;

export function latToTileY(lat, z) {
  const rad = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

export const tileXToLon = (x, z) => (x / 2 ** z) * 360 - 180;

export function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Wie viele Seemeilen misst eine Kachel an dieser Stelle? */
export function tileSizeNm(lat, z) {
  const earthNm = 21600; // Erdumfang in Seemeilen
  return (earthNm * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

/** Umschließendes Rechteck um einen Punkt, Radius in Seemeilen. */
export function boundsAround(center, radiusNm) {
  const dLat = radiusNm / 60;
  const dLon = radiusNm / (60 * Math.max(0.05, Math.cos((center.lat * Math.PI) / 180)));
  return {
    north: center.lat + dLat,
    south: center.lat - dLat,
    east: center.lon + dLon,
    west: center.lon - dLon,
  };
}

/** Umschließendes Rechteck um eine Reihe von Punkten, mit Zugabe. */
export function boundsOf(points, marginNm = 0) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = marginNm / 60;
  const dLon = marginNm / (60 * Math.max(0.05, Math.cos((midLat * Math.PI) / 180)));
  return {
    north: Math.max(...lats) + dLat,
    south: Math.min(...lats) - dLat,
    east: Math.max(...lons) + dLon,
    west: Math.min(...lons) - dLon,
  };
}

/** Alle Kacheln in einem Rechteck, über mehrere Zoomstufen. */
export function tilesForBounds(bounds, zMin, zMax) {
  const out = [];
  for (let z = zMin; z <= zMax; z += 1) {
    const x0 = Math.floor(lonToTileX(bounds.west, z));
    const x1 = Math.floor(lonToTileX(bounds.east, z));
    const y0 = Math.floor(latToTileY(bounds.north, z));
    const y1 = Math.floor(latToTileY(bounds.south, z));
    const max = 2 ** z;
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        if (x < 0 || y < 0 || x >= max || y >= max) continue;
        out.push({ z, x, y });
      }
    }
  }
  return out;
}

/** Abstand eines Punktes von einer Strecke, in Seemeilen (lokal eben gerechnet). */
function distanceToSegment(point, a, b) {
  const k = Math.cos((point.lat * Math.PI) / 180);
  const px = (point.lon - a.lon) * 60 * k;
  const py = (point.lat - a.lat) * 60;
  const bx = (b.lon - a.lon) * 60 * k;
  const by = (b.lat - a.lat) * 60;
  const len = bx * bx + by * by;
  if (len < 1e-12) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len));
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Kacheln entlang einer Route: alles, was innerhalb des Korridors liegt.
 * Erst das umschließende Rechteck, dann jede Kachel gegen die Strecke prüfen –
 * das spart bei langen Routen sehr viele Kacheln gegenüber dem Rechteck.
 */
export function tilesAlongRoute(points, corridorNm, zMin, zMax) {
  if (points.length === 0) return [];
  if (points.length === 1) return tilesForBounds(boundsAround(points[0], corridorNm), zMin, zMax);

  const bounds = boundsOf(points, corridorNm);
  const out = [];
  for (let z = zMin; z <= zMax; z += 1) {
    const half = tileSizeNm(points[0].lat, z) / 2;
    // Die Kachel zählt, wenn ihr Mittelpunkt nah genug an der Route liegt.
    // Die halbe Kacheldiagonale kommt dazu, damit die Ränder mitkommen.
    const reach = corridorNm + half * 1.5;
    for (const tile of tilesForBounds(bounds, z, z)) {
      const center = {
        lat: tileYToLat(tile.y + 0.5, z),
        lon: tileXToLon(tile.x + 0.5, z),
      };
      let nearest = Infinity;
      for (let i = 1; i < points.length && nearest > reach; i += 1) {
        nearest = Math.min(nearest, distanceToSegment(center, points[i - 1], points[i]));
      }
      if (nearest <= reach) out.push(tile);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Speicher
// ---------------------------------------------------------------------------

let db = null;

function openDb() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const target = request.result;
      if (!target.objectStoreNames.contains(STORE_TILES)) target.createObjectStore(STORE_TILES);
      if (!target.objectStoreNames.contains(STORE_AREAS)) {
        target.createObjectStore(STORE_AREAS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB nicht verfügbar'));
  });
}

function run(store, mode, action) {
  return openDb().then((target) => new Promise((resolve, reject) => {
    const transaction = target.transaction(store, mode);
    const request = action(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

export const tileKey = (layer, z, x, y) => `${layer}|${z}|${x}|${y}`;

export const tileStore = {
  get: (layer, z, x, y) => run(STORE_TILES, 'readonly', (s) => s.get(tileKey(layer, z, x, y))),
  put: (layer, z, x, y, blob) => run(STORE_TILES, 'readwrite', (s) => s.put(blob, tileKey(layer, z, x, y))),
  has: async (layer, z, x, y) => Boolean(await run(STORE_TILES, 'readonly', (s) => s.getKey(tileKey(layer, z, x, y)))),
  count: () => run(STORE_TILES, 'readonly', (s) => s.count()),
  clear: () => run(STORE_TILES, 'readwrite', (s) => s.clear()),

  /** Löscht alle Kacheln einer Liste. */
  async removeMany(keys) {
    const target = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = target.transaction(STORE_TILES, 'readwrite');
      const store = transaction.objectStore(STORE_TILES);
      keys.forEach((key) => store.delete(key));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  },
};

export const areaStore = {
  async list() {
    const all = await run(STORE_AREAS, 'readonly', (s) => s.getAll());
    return (all ?? []).sort((a, b) => b.ts - a.ts);
  },
  put: (area) => run(STORE_AREAS, 'readwrite', (s) => s.put(area)),
  remove: (id) => run(STORE_AREAS, 'readwrite', (s) => s.delete(id)),
  get: (id) => run(STORE_AREAS, 'readonly', (s) => s.get(id)),
};

// ---------------------------------------------------------------------------
// Herunterladen
// ---------------------------------------------------------------------------

/** Setzt {z}/{x}/{y} in eine Adressvorlage ein. */
export function tileUrl(template, z, x, y) {
  return template
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    // Manche Anbieter verteilen auf mehrere Rechner: {s} → a, b, c
    .replace('{s}', 'abc'[(x + y) % 3]);
}

/**
 * Lädt die Kacheln eines Bereichs.
 *
 * Bewusst langsam und einzeln: Der Kachelserver ist ein Gemeingut, und ein
 * Segelboot braucht seine Karten nicht in zehn Sekunden.
 */
export async function downloadTiles(tiles, layers, {
  onProgress = () => {},
  signal = null,
  refresh = false,
} = {}) {
  const jobs = [];
  for (const layer of layers) {
    for (const tile of tiles) jobs.push({ layer: layer.id, template: layer.url, ...tile });
  }

  let done = 0;
  let stored = 0;
  let bytes = 0;
  const failed = [];

  for (const job of jobs) {
    if (signal?.aborted) break;

    // eslint-disable-next-line no-await-in-loop
    if (!refresh && await tileStore.has(job.layer, job.z, job.x, job.y)) {
      done += 1;
      onProgress({ done, total: jobs.length, stored, bytes, skipped: true });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(tileUrl(job.template, job.z, job.x, job.y), {
        signal,
        // Kacheln sind unveränderlich genug; der Browser-Cache darf helfen.
        cache: refresh ? 'reload' : 'default',
      });
      if (!response.ok) throw new Error(String(response.status));
      // eslint-disable-next-line no-await-in-loop
      const blob = await response.blob();
      // eslint-disable-next-line no-await-in-loop
      await tileStore.put(job.layer, job.z, job.x, job.y, blob);
      stored += 1;
      bytes += blob.size;
    } catch (err) {
      if (err.name === 'AbortError') break;
      failed.push(`${job.layer} ${job.z}/${job.x}/${job.y}: ${err.message}`);
    }

    done += 1;
    onProgress({ done, total: jobs.length, stored, bytes });
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, REQUEST_DELAY); });
  }

  return { done, total: jobs.length, stored, bytes, failed };
}

/** Die Kacheln eines Bereichs neu berechnen – für Anlegen und Auffrischen. */
export function tilesForArea(area) {
  if (area.kind === 'route') {
    return tilesAlongRoute(area.points, area.corridorNm, area.zMin, area.zMax);
  }
  return tilesForBounds(boundsAround(area.center, area.radiusNm), area.zMin, area.zMax);
}

/** Menschenlesbare Größe. */
export function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

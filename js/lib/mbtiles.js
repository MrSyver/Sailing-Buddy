/**
 * MBTiles – ein Kartenpaket als eine einzige Datei.
 *
 * MBTiles ist eine SQLite-Datei mit einer Tabelle voller Kachelbilder. Genau
 * so gibt OpenSeaMap seine Karten heraus: ein Paket je Seegebiet, von einem
 * Dateispiegel, der für große Downloads gedacht ist – statt zehntausender
 * Einzelabrufe auf einem Kachelserver, der das ausdrücklich nicht möchte.
 *
 * Die Datei wird nicht ausgepackt und nicht in den Speicher geladen. Sie
 * bleibt liegen, und für jede Kachel werden ein paar Kilobyte daraus gelesen.
 * Ein Paket von vierhundert Megabyte belegt damit vierhundert Megabyte und
 * nicht das Doppelte.
 *
 * Zwei Bauformen sind verbreitet, beide werden gelesen:
 *
 *   einfach          tiles(zoom_level, tile_column, tile_row, tile_data)
 *   mit Sparbüchse   map(zoom_level, tile_column, tile_row, tile_id)
 *                    images(tile_data, tile_id)
 *
 * Die zweite spart Platz, wenn dieselbe Kachel mehrfach vorkommt – etwa das
 * immer gleiche Blau der offenen See.
 *
 * Zeilenzählung: MBTiles zählt nach TMS von unten, die App wie üblich von
 * oben. Der Leser dreht das um, damit außerhalb niemand daran denken muss.
 */

import { openDatabase } from './sqlite.js';

/** Öffnet ein Kartenpaket. */
export async function openMbtiles(source) {
  const db = await openDatabase(source, { cachePages: 96 });
  const schema = await db.schema();
  const find = (type, name) => schema.find((s) => s.type === type && s.name === name);

  // --- Angaben zum Paket
  const metadata = {};
  const meta = find('table', 'metadata');
  if (meta) {
    await db.scanTable(meta.root, (row) => {
      if (typeof row[0] === 'string') metadata[row[0]] = row[1];
    });
  }

  // --- Wo stehen die Kacheln?
  const tiles = find('table', 'tiles');
  const map = find('table', 'map');
  const images = find('table', 'images');
  const deduplicated = !tiles && Boolean(map && images);
  if (!tiles && !deduplicated) throw new Error('Keine Kacheln in der Datei');

  const indexFor = (table, columns) => {
    // Zuerst der Name, den die MBTiles-Beschreibung vorsieht, sonst der erste
    // Index über die richtige Tabelle und die richtigen Spalten.
    const spelled = columns.map((c) => c.toLowerCase());
    return schema.find((s) => s.type === 'index' && s.table === table
      && typeof s.sql === 'string'
      && spelled.every((c) => s.sql.toLowerCase().includes(c))) ?? null;
  };

  const tileIndex = deduplicated
    ? indexFor('map', ['zoom_level', 'tile_column', 'tile_row'])
    : indexFor('tiles', ['zoom_level', 'tile_column', 'tile_row']);
  const imageIndex = deduplicated ? indexFor('images', ['tile_id']) : null;

  if (!tileIndex) throw new Error('Der Kachelindex fehlt – die Datei wäre unbrauchbar langsam');
  if (deduplicated && !imageIndex) throw new Error('Der Bildindex fehlt');

  const zoomRange = () => {
    const min = Number(metadata.minzoom);
    const max = Number(metadata.maxzoom);
    return {
      minzoom: Number.isFinite(min) ? min : 0,
      maxzoom: Number.isFinite(max) ? max : 20,
    };
  };

  /** „west,süd,ost,nord“ aus den Angaben, falls vorhanden. */
  const bounds = () => {
    const parts = String(metadata.bounds ?? '').split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    return {
      west: parts[0], south: parts[1], east: parts[2], north: parts[3],
    };
  };

  /**
   * Holt eine Kachel in der üblichen Zählung von oben.
   * Gibt `null` zurück, wenn sie nicht im Paket ist – das ist kein Fehler,
   * sondern die häufigste Antwort am Rand eines Gebiets.
   */
  async function getTile(z, x, y) {
    const row = 2 ** z - 1 - y;      // TMS zählt von unten
    if (row < 0) return null;

    const rowid = await db.rowidFromIndex(tileIndex.root, [z, x, row]);
    if (rowid === null || rowid === undefined) return null;

    if (!deduplicated) {
      const record = await db.rowById(tiles.root, rowid);
      return record?.[3] ?? null;
    }

    const record = await db.rowById(map.root, rowid);
    const id = record?.[3];
    if (id === null || id === undefined) return null;
    const imageRow = await db.rowidFromIndex(imageIndex.root, [id]);
    if (imageRow === null || imageRow === undefined) return null;
    const image = await db.rowById(images.root, imageRow);
    // In `images` steht das Bild in der ersten Spalte, die Kennung in der zweiten.
    return image?.[0] ?? null;
  }

  return {
    metadata,
    deduplicated,
    ...zoomRange(),
    bounds: bounds(),
    name: metadata.name ?? null,
    format: metadata.format ?? 'png',
    getTile,
  };
}

/** Ein Bildformat zu seinem Medientyp – für die Anzeige im Browser. */
export function mediaType(format) {
  switch (String(format).toLowerCase()) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'pbf':
    case 'mvt': return 'application/x-protobuf';
    default: return 'image/png';
  }
}

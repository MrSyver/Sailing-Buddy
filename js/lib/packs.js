/**
 * Kartenpakete: herunterladen, ablegen, wiederfinden.
 *
 * Ein Paket ist eine MBTiles-Datei von mehreren hundert Megabyte. Das stellt
 * drei Bedingungen, die den Aufbau hier bestimmen:
 *
 *   1. Es darf nie ganz im Arbeitsspeicher liegen. Deshalb wird der Download
 *      unmittelbar auf die Platte geschrieben und von dort seitenweise
 *      gelesen – über das private Dateisystem des Browsers (OPFS).
 *   2. Er muss fortsetzbar sein. Ein Download über Hafen-WLAN reißt ab, und
 *      dann noch einmal von vorn anzufangen ist keine Lösung. Angefangene
 *      Dateien bleiben liegen und werden per Bereichsabfrage weitergeführt.
 *   3. Er darf nichts kaputt machen. Erst wenn die Datei vollständig und als
 *      Kartenpaket lesbar ist, zählt sie als vorhanden.
 *
 * Wo OPFS fehlt, meldet sich das Modul als nicht verfügbar, statt zur Laufzeit
 * umzufallen. Die App bleibt dann bei den einzeln geladenen Kacheln.
 */

import { openMbtiles } from './mbtiles.js';
import { blobSource } from './sqlite.js';

const REGISTRY = 'sailing-buddy-packs';
const PART = '.teil';

/** Ist das private Dateisystem vorhanden? */
export function packsAvailable() {
  return typeof navigator !== 'undefined'
    && Boolean(navigator.storage?.getDirectory);
}

async function root() {
  if (!packsAvailable()) throw new Error('Kein Dateispeicher im Browser');
  return navigator.storage.getDirectory();
}

// ------------------------------------------------------------------ Verzeichnis

function readRegistry() {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY) ?? '{}');
  } catch {
    return {};
  }
}

function writeRegistry(data) {
  try {
    localStorage.setItem(REGISTRY, JSON.stringify(data));
  } catch {
    // Voller Speicher: Die Datei bleibt trotzdem lesbar, nur der Name fehlt.
  }
}

const fileName = (id) => `${id}.mbtiles`;

/**
 * Was liegt im Gerät?
 *
 * Gefragt wird das Dateisystem, nicht das Verzeichnis – eine Datei, die es
 * nicht mehr gibt, darf nicht als vorhanden gemeldet werden, und eine, die
 * jemand hineingelegt hat, soll auftauchen.
 */
export async function listPacks() {
  if (!packsAvailable()) return [];
  const dir = await root();
  const registry = readRegistry();
  const out = [];

  // Angefangene Downloads gehören mit in die Liste – sonst sucht man den
  // belegten Platz vergebens und weiß nicht, dass es weitergehen kann.
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue;
    const complete = name.endsWith('.mbtiles');
    const partial = name.endsWith(`.mbtiles${PART}`);
    if (!complete && !partial) continue;

    const id = name.slice(0, name.length - (complete ? '.mbtiles'.length : `.mbtiles${PART}`.length));
    // eslint-disable-next-line no-await-in-loop
    const file = await handle.getFile();
    out.push({
      id,
      name: registry[id]?.name ?? id,
      url: registry[id]?.url ?? null,
      ts: registry[id]?.ts ?? file.lastModified,
      bytes: file.size,
      total: registry[id]?.total ?? null,
      complete,
    });
  }

  return out.sort((a, b) => b.ts - a.ts);
}

/** Wie viel Platz steht überhaupt zur Verfügung? */
export async function storageEstimate() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? 0, quota: quota ?? 0, free: Math.max(0, (quota ?? 0) - (usage ?? 0)) };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- Herunterladen

/**
 * Holt ein Paket und legt es ab.
 *
 * Fortsetzbar: Liegt schon ein Teilstück, wird nur der Rest angefordert.
 * Antwortet der Server auf eine Bereichsabfrage mit der ganzen Datei, fängt
 * der Download von vorn an – lieber doppelt geladen als falsch
 * zusammengesetzt.
 */
export async function downloadPack({ id, name, url, expectedBytes = null }, {
  onProgress = () => {},
  signal = null,
} = {}) {
  const dir = await root();
  const partName = `${fileName(id)}${PART}`;

  let handle = await dir.getFileHandle(partName, { create: true });
  let done = (await handle.getFile()).size;

  /**
   * Fortsetzen kostet vorübergehend zusätzlichen Platz.
   *
   * `createWritable` schreibt nicht in die Datei selbst, sondern in eine
   * Zweitschrift, die beim Schließen eingewechselt wird. Mit
   * `keepExistingData` wird das Angefangene vorher dorthin kopiert – für
   * einen Augenblick liegt das Paket also doppelt im Gerät. Bei einem frisch
   * begonnenen Download passiert das nicht.
   *
   * Deshalb wird hier vorher nachgerechnet und im Zweifel klar gesagt, was zu
   * tun ist, statt mitten im Schreiben mit „Speicher voll“ abzubrechen.
   */
  if (done > 0) {
    const space = await storageEstimate();
    const brauche = done + Math.max(0, (expectedBytes ?? done * 2) - done);
    if (space && space.free < brauche) {
      throw new Error(
        `Zum Fortsetzen fehlt der Platz für die Zwischenkopie (nötig etwa ${Math.round(brauche / 1024 / 1024)} MB, frei ${Math.round(space.free / 1024 / 1024)} MB). Lösch das Angefangene und lade neu.`,
      );
    }
  }

  const registry = readRegistry();
  registry[id] = {
    ...registry[id], name, url, ts: Date.now(), total: expectedBytes,
  };
  writeRegistry(registry);

  const headers = done > 0 ? { Range: `bytes=${done}-` } : {};
  const response = await fetch(url, { headers, signal });
  if (!response.ok) throw new Error(`Der Server antwortet mit ${response.status}`);

  let append = done > 0;
  if (done > 0 && response.status !== 206) {
    // Kein Fortsetzen möglich – von vorn, aber diesmal ohne Altlast.
    append = false;
    done = 0;
  }

  const total = append
    ? done + Number(response.headers.get('content-length') ?? 0)
    : Number(response.headers.get('content-length') ?? 0) || expectedBytes || 0;

  if (append !== true) {
    handle = await dir.getFileHandle(partName, { create: true });
  }
  const writable = await handle.createWritable({ keepExistingData: append });
  if (append) await writable.seek(done);

  try {
    const reader = response.body.getReader();
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { value, done: finished } = await reader.read();
      if (finished) break;
      // eslint-disable-next-line no-await-in-loop
      await writable.write(value);
      done += value.byteLength;
      onProgress({ done, total });
    }
    await writable.close();
  } catch (err) {
    // Angefangenes bleibt liegen: Beim nächsten Versuch geht es dort weiter.
    await writable.close().catch(() => {});
    throw err;
  }

  // Erst prüfen, dann umbenennen. Eine halbe Datei darf nie als Karte gelten.
  const part = await handle.getFile();
  try {
    const pack = await openMbtiles(blobSource(part));
    registry[id] = {
      ...registry[id],
      name: pack.name ?? name,
      total: part.size,
      minzoom: pack.minzoom,
      maxzoom: pack.maxzoom,
      bounds: pack.bounds,
      format: pack.format,
      ts: Date.now(),
    };
    writeRegistry(registry);
  } catch (err) {
    throw new Error(`Die Datei ist kein lesbares Kartenpaket: ${err.message}`);
  }

  // Umbenennen statt kopieren: Ein zweites Mal vierhundert Megabyte zu
  // schreiben würde für den Augenblick doppelt so viel Platz brauchen – und
  // den hat ein Telefon selten übrig. Wo `move` fehlt, bleibt nur die Kopie.
  if (typeof handle.move === 'function') {
    await handle.move(fileName(id));
  } else {
    const finalHandle = await dir.getFileHandle(fileName(id), { create: true });
    const copy = await finalHandle.createWritable();
    await part.stream().pipeTo(copy);
    await dir.removeEntry(partName).catch(() => {});
  }

  return { id, bytes: part.size };
}

/** Wirft ein Paket weg, samt angefangenem Rest. */
export async function removePack(id) {
  const dir = await root();
  await dir.removeEntry(fileName(id)).catch(() => {});
  await dir.removeEntry(`${fileName(id)}${PART}`).catch(() => {});
  const registry = readRegistry();
  delete registry[id];
  writeRegistry(registry);
}

// ------------------------------------------------------------------- Lesen

const offen = new Map();

/** Öffnet ein abgelegtes Paket zum Lesen. Bleibt offen, solange die App läuft. */
export async function openPack(id) {
  if (offen.has(id)) return offen.get(id);
  const dir = await root();
  const handle = await dir.getFileHandle(fileName(id));
  const file = await handle.getFile();
  const pack = await openMbtiles(blobSource(file));
  offen.set(id, pack);
  return pack;
}

/** Alle vollständigen Pakete, zum Nachschlagen einer Kachel. */
export async function openAll() {
  const list = await listPacks();
  const out = [];
  for (const entry of list.filter((e) => e.complete)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      out.push({ entry, pack: await openPack(entry.id) });
    } catch {
      // Ein unlesbares Paket darf die übrigen nicht mitreißen.
    }
  }
  return out;
}

/** Vergisst die offenen Dateien – nach dem Löschen eines Pakets nötig. */
export function forgetOpen(id = null) {
  if (id === null) offen.clear();
  else offen.delete(id);
}

/**
 * Sprachaufnahmen für das Funk-Modul.
 *
 * Gedacht für den Fall, dass eine Meldung schneller kommt, als man mitschreiben
 * kann: Aufnahme starten, mithören, hinterher in Ruhe abhören. Etwa eine
 * empfangene Notmeldung, die man als MAYDAY RELAY weitergeben muss, oder die
 * Wettervorhersage.
 *
 * Alles bleibt im Gerät. Die Tondaten liegen in IndexedDB, weil localStorage
 * nur Text speichern kann und die Aufnahmen dafür zu groß sind.
 */

const DB_NAME = 'sailing-buddy-audio';
const STORE = 'recordings';

let db = null;

function openDb() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const target = request.result;
      if (!target.objectStoreNames.contains(STORE)) {
        target.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB nicht verfügbar'));
  });
}

function tx(mode, run) {
  return openDb().then((target) => new Promise((resolve, reject) => {
    const transaction = target.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = run(store);
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

/** Ist Aufnehmen auf diesem Gerät überhaupt möglich? */
export function canRecord() {
  return Boolean(
    navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined'
    && typeof indexedDB !== 'undefined',
  );
}

/**
 * Das erstbeste Format, das der Browser wirklich beherrscht.
 * Safari nimmt in mp4 auf, Chrome und Firefox in webm.
 */
function pickMimeType() {
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

let recorder = null;
let stream = null;
let chunks = [];
let startedAt = 0;

export const recording = {
  get active() {
    return recorder?.state === 'recording';
  },

  /** Startet die Aufnahme. Fragt beim ersten Mal nach der Mikrofonfreigabe. */
  async start() {
    if (this.active) return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks = [];
    startedAt = Date.now();
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();
  },

  /** Beendet die Aufnahme und legt sie ab. Liefert den neuen Eintrag. */
  async stop(name) {
    if (!recorder) return null;
    const active = recorder;
    const blob = await new Promise((resolve) => {
      active.onstop = () => resolve(new Blob(chunks, { type: active.mimeType || 'audio/mp4' }));
      active.stop();
    });

    stream?.getTracks().forEach((track) => track.stop());
    const entry = {
      id: `rec${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name?.trim() || '',
      blob,
      type: blob.type,
      size: blob.size,
      seconds: Math.round((Date.now() - startedAt) / 1000),
      ts: Date.now(),
    };
    recorder = null;
    stream = null;
    chunks = [];

    await tx('readwrite', (store) => store.put(entry));
    return entry;
  },

  /** Bricht ab, ohne etwas zu speichern. */
  cancel() {
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    stream?.getTracks().forEach((track) => track.stop());
    recorder = null;
    stream = null;
    chunks = [];
  },

  /** Sekunden seit dem Start der laufenden Aufnahme. */
  elapsed() {
    return this.active ? Math.round((Date.now() - startedAt) / 1000) : 0;
  },
};

export const recordings = {
  /** Alle Aufnahmen, neueste zuerst. */
  async list() {
    try {
      const all = await tx('readonly', (store) => store.getAll());
      return (all ?? []).sort((a, b) => b.ts - a.ts);
    } catch {
      return [];
    }
  },

  async remove(id) {
    await tx('readwrite', (store) => store.delete(id));
  },

  async rename(id, name) {
    const all = await this.list();
    const entry = all.find((r) => r.id === id);
    if (!entry) return;
    await tx('readwrite', (store) => store.put({ ...entry, name }));
  },

  async clear() {
    await tx('readwrite', (store) => store.clear());
  },
};

/** Sekunden als m:ss. */
export function formatSeconds(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

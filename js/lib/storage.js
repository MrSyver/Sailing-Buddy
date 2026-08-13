/**
 * Alles bleibt auf dem Gerät. Kein Server, kein Konto, keine Übertragung.
 * Gespeichert wird in localStorage – das überlebt Neustart und Offline-Betrieb.
 */

const KEY = 'sailing-buddy';

const DEFAULTS = {
  boat: '',
  callsign: '',
  mmsi: '',
  loa: '',
  draft: '',
  pob: '',
  descr: '',
  homeport: '',
  phone: '',
  // Anzeige
  theme: 'dark',       // 'light' | 'dark' | 'night'
  brightness: 100,     // 40…100 – zusätzlicher Dimmer für die Nacht
  uiLang: 'de',        // Sprache der gesamten Oberfläche: 'de' | 'en'
  phraseLang: 'de',    // Sprache nur der Funksprüche: 'de' | 'en'
  // Navigation
  variation: '',       // Missweisung in Grad, Ost positiv
  deviation: '',       // Ablenkung in Grad, Ost positiv
  manualSpeed: '',     // Ersatzgeschwindigkeit, wenn kein GPS-Speed anliegt
  compassCourseUp: false, // Kompass mitdrehend statt nordorientiert
  // Karten – leer heißt: die voreingestellte Quelle aus js/data/tilesources.js
  tileBaseUrl: '',
  tileSeamarkUrl: '',
  packBaseUrl: '',      // Verzeichnis der fertigen Kartenpakete
  packUrls: {},         // einzelne Pakete mit abweichender Adresse
  autoTiles: true,      // fehlende Kacheln bei Verbindung nachholen
  setupDone: false,
  waypoints: [],       // [{ id, name, lat, lon, kind, ts }]
};

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    cache = { ...DEFAULTS };
  }
  // Frühere Fassungen kannten nur eine gemeinsame Spracheinstellung.
  if (cache.lang && !cache.phraseLang) cache.phraseLang = cache.lang;
  delete cache.lang;
  return cache;
}

function write(data) {
  cache = data;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Speicher voll oder privater Modus – die App läuft trotzdem weiter.
  }
  listeners.forEach((fn) => fn(cache));
}

const listeners = new Set();

export const settings = {
  all: () => ({ ...read() }),
  get: (key) => read()[key],
  set(key, value) {
    write({ ...read(), [key]: value });
  },
  update(patch) {
    write({ ...read(), ...patch });
  },
  reset() {
    write({ ...DEFAULTS });
  },
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Sind die Angaben vorhanden, die ein Notruf braucht? */
  isComplete() {
    const s = read();
    return Boolean(s.boat && s.mmsi);
  },
};

// --- Wegpunkte -------------------------------------------------------------

export const waypoints = {
  list: () => [...(read().waypoints ?? [])],

  add({ name, lat, lon, kind = 'ziel' }) {
    const wp = {
      id: `wp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name?.trim() || 'Ohne Namen',
      lat,
      lon,
      kind,
      ts: Date.now(),
    };
    settings.set('waypoints', [wp, ...(read().waypoints ?? [])].slice(0, 100));
    return wp;
  },

  remove(id) {
    settings.set('waypoints', (read().waypoints ?? []).filter((w) => w.id !== id));
  },

  clear() {
    settings.set('waypoints', []);
  },
};

/**
 * Logbuch: Positionen mitschreiben, von Hand oder in festem Takt.
 *
 * Die Einträge liegen in einem eigenen localStorage-Schlüssel, nicht bei den
 * Einstellungen – ein langer Törn bringt schnell einige hundert Einträge
 * zusammen, und die sollen die Schiffsdaten nicht ausbremsen.
 *
 * Zum automatischen Mitschreiben: Der Takt läuft, solange die App im
 * Vordergrund ist. iOS hält Web-Apps im Hintergrund an, deshalb wird beim
 * Zurückkehren geprüft, ob ein Eintrag fällig war, und gegebenenfalls
 * sofort einer angelegt.
 */

import { gps } from './gps.js';
import { greatCircleDistance } from './geo.js';

const KEY = 'sailing-buddy-log';
const MAX_ENTRIES = 5000;

/** Wählbare Takte in Minuten. 0 bedeutet: nur von Hand. */
export const LOG_INTERVALS = [0, 5, 10, 15, 30, 60, 120];

let cache = null;
const listeners = new Set();

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    cache = {
      entries: Array.isArray(data?.entries) ? data.entries : [],
      intervalMinutes: Number(data?.intervalMinutes) || 0,
    };
  } catch {
    cache = { entries: [], intervalMinutes: 0 };
  }
  return cache;
}

function write(next) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Speicher voll: Der älteste Teil wird geopfert, damit weiter
    // mitgeschrieben werden kann.
    cache.entries = cache.entries.slice(0, Math.floor(cache.entries.length / 2));
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch { /* dann eben nur im Arbeitsspeicher */ }
  }
  listeners.forEach((fn) => fn(cache));
}

let timer = null;
let unsubscribeGps = null;

export const logbook = {
  /** Einträge, neueste zuerst. */
  entries: () => [...read().entries],

  /** Einträge in zeitlicher Reihenfolge – so wird die Spur gezeichnet. */
  track: () => [...read().entries].sort((a, b) => a.ts - b.ts),

  intervalMinutes: () => read().intervalMinutes,

  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Legt einen Eintrag an. Ohne Position wird nichts geschrieben. */
  add({ note = '', kind = 'manual', fix = null } = {}) {
    const position = fix ?? gps.fix;
    if (!position) return null;
    const entry = {
      id: `log${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      lat: position.lat,
      lon: position.lon,
      sog: position.speed ?? null,
      cog: position.heading ?? null,
      accuracy: position.accuracy ?? null,
      kind,
      note: note.trim(),
    };
    const data = read();
    write({ ...data, entries: [entry, ...data.entries].slice(0, MAX_ENTRIES) });
    return entry;
  },

  update(id, patch) {
    const data = read();
    write({
      ...data,
      entries: data.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  },

  remove(id) {
    const data = read();
    write({ ...data, entries: data.entries.filter((e) => e.id !== id) });
  },

  clear() {
    write({ ...read(), entries: [] });
  },

  /** Takt setzen und den Zeitgeber neu aufziehen. */
  setInterval(minutes) {
    write({ ...read(), intervalMinutes: Number(minutes) || 0 });
    this.startAuto();
  },

  /** Wann wurde zuletzt automatisch geschrieben? */
  lastAuto() {
    return read().entries.find((e) => e.kind === 'auto') ?? null;
  },

  /** Ist ein automatischer Eintrag fällig? */
  isDue() {
    const minutes = read().intervalMinutes;
    if (!minutes) return false;
    const last = this.lastAuto();
    if (!last) return true;
    return Date.now() - last.ts >= minutes * 60000;
  },

  /** Schreibt einen automatischen Eintrag, falls fällig und eine Position da ist. */
  tick() {
    if (!this.isDue()) return null;
    if (!gps.fix || gps.isStale(120000)) return null;
    return this.add({ kind: 'auto' });
  },

  /**
   * Startet das automatische Mitschreiben. Zwei Auslöser: ein Zeitgeber für
   * den ruhenden Fall und jede neue GPS-Meldung, damit der Takt auch nach
   * einer Pause im Hintergrund sofort wieder greift.
   */
  startAuto() {
    this.stopAuto();
    if (!read().intervalMinutes) return;
    timer = setInterval(() => this.tick(), 20000);
    unsubscribeGps = gps.onUpdate(() => this.tick());
    this.tick();
  },

  stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
    if (unsubscribeGps) unsubscribeGps();
    unsubscribeGps = null;
  },
};

/** Zurückgelegte Strecke entlang der Spur, in Seemeilen. */
export function trackDistance(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    sum += greatCircleDistance(points[i - 1], points[i]);
  }
  return sum;
}

/**
 * Rechnet die Spur in Bildkoordinaten um.
 *
 * Winkeltreue Zylinderprojektion mit Breitenkorrektur – für die paar Meilen
 * eines Törnabschnitts völlig ausreichend und ohne jede Kartendatei.
 * Rückgabe enthält auch den Maßstab, damit ein Maßstabsbalken gezeichnet
 * werden kann.
 */
export function projectTrack(points, width, height, padding = 14) {
  if (!points.length) return null;

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const latMid = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos(latMid * Math.PI / 180);

  // In Seemeilen relativ zum Südwesteck rechnen.
  const lat0 = Math.min(...lats);
  const lon0 = Math.min(...lons);
  const raw = points.map((p) => ({
    x: (p.lon - lon0) * 60 * kx,
    y: (p.lat - lat0) * 60,
    point: p,
  }));

  const spanX = Math.max(...raw.map((r) => r.x));
  const spanY = Math.max(...raw.map((r) => r.y));
  const usableW = width - 2 * padding;
  const usableH = height - 2 * padding;

  // Bei einer einzigen Position oder stillliegendem Schiff einen
  // Mindestausschnitt annehmen, sonst teilt man durch null.
  const span = Math.max(spanX, spanY, 0.02);
  const scale = Math.min(usableW, usableH) / span;

  const offsetX = padding + (usableW - spanX * scale) / 2;
  const offsetY = padding + (usableH - spanY * scale) / 2;

  return {
    scale,                       // Bildpunkte je Seemeile
    spanNm: span,
    points: raw.map((r) => ({
      x: offsetX + r.x * scale,
      // y umdrehen: Norden liegt oben.
      y: height - (offsetY + r.y * scale),
      point: r.point,
    })),
  };
}

/** Ein runder Wert für den Maßstabsbalken. */
export function niceScaleStep(spanNm) {
  const target = spanNm / 3;
  const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  return steps.find((s) => s >= target) ?? steps[steps.length - 1];
}

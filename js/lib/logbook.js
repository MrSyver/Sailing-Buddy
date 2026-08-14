/**
 * Logbuch: Törns, Einträge, Ereignisse, Wetter.
 *
 * Die Einträge liegen in einem eigenen localStorage-Schlüssel, nicht bei den
 * Einstellungen – ein langer Törn bringt schnell einige hundert Einträge
 * zusammen, und die sollen die Schiffsdaten nicht ausbremsen.
 *
 * Ein Eintrag ist mehr als eine Position. Er kann ein Ereignis tragen
 * (Ablegen, Anker fällt, Motor an) und einen Wetterstand. Das Wetter wird
 * fortgeschrieben: Was zuletzt eingetragen wurde, gilt weiter, bis jemand es
 * ändert – sonst müsste man alle zwanzig Minuten dieselbe Windstärke neu
 * eintippen, und das tut auf See niemand.
 *
 * Zum automatischen Mitschreiben: Der Takt läuft, solange die App im
 * Vordergrund ist. iOS hält Web-Apps im Hintergrund an, deshalb wird beim
 * Zurückkehren geprüft, ob ein Eintrag fällig war, und gegebenenfalls sofort
 * einer angelegt.
 */

import { gps } from './gps.js';
import { greatCircleDistance, norm360 } from './geo.js';

const KEY = 'sailing-buddy-log';
const MAX_ENTRIES = 5000;

/** Wählbare Takte in Minuten. 0 bedeutet: nur von Hand. */
export const LOG_INTERVALS = [0, 5, 10, 15, 30, 60, 120];

/**
 * Wie weit muss das Schiff sich bewegt haben, damit ein Taktpunkt zählt?
 *
 * Vor Anker steht die Position; ohne diese Schwelle sammeln sich über Nacht
 * hundert Einträge an derselben Stelle, und die Spur ist ein Fleck. Ein
 * Zehntel Seemeile liegt weit über dem Rauschen eines GPS-Empfängers.
 */
const MIN_MOVE_NM = 0.1;

/** Ab wann gilt eine Kurs- oder Fahrtänderung als ein eigener Punkt wert? */
const COURSE_CHANGE_DEG = 30;
const SPEED_CHANGE_KN = 1.5;

/**
 * Die Ereignisse, die ein Logbuch kennt.
 *
 * Bewusst eine feste Liste mit einem Griff je Eintrag: Wer bei Welle das
 * Ablegen notieren will, tippt keinen Satz. Das Zeichen steht später in der
 * Liste und auf der Spur.
 */
export const LOG_EVENTS = [
  { key: 'depart', sym: '⇥' },
  { key: 'arrive', sym: '⇤' },
  { key: 'anchorDown', sym: '⚓' },
  { key: 'anchorUp', sym: '↑' },
  { key: 'engineOn', sym: '⚙' },
  { key: 'engineOff', sym: '⊘' },
  { key: 'sails', sym: '⛵' },
  { key: 'reef', sym: '≡' },
  { key: 'tack', sym: '↺' },
  { key: 'watch', sym: '◷' },
  { key: 'mob', sym: '⚑' },
  { key: 'distress', sym: '‼' },
];

const EVENT_KEYS = new Set(LOG_EVENTS.map((e) => e.key));

/** Windrichtungen als acht Striche – feiner braucht es von Hand niemand. */
export const WIND_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Sichtstufen, in Seemeilen gedacht. */
export const VISIBILITY_STEPS = ['unter1', 'bis2', 'bis5', 'ueber5'];

const EMPTY_WEATHER = {
  windDir: null,     // 'SW'
  windForce: null,   // Beaufort 0–12
  sea: null,         // Seegang 0–9
  vis: null,         // eine der VISIBILITY_STEPS
  clouds: null,      // Achtel 0–8
  pressure: null,    // hPa
  temp: null,        // °C
};

let cache = null;
const listeners = new Set();

function read() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    cache = {
      entries: Array.isArray(data?.entries) ? data.entries : [],
      trips: Array.isArray(data?.trips) ? data.trips : [],
      currentTripId: data?.currentTripId ?? null,
      intervalMinutes: Number(data?.intervalMinutes) || 0,
      // Voreinstellung an: Ein Eintragsberg vor Anker nützt niemandem.
      onlyMoving: data?.onlyMoving !== false,
      onChange: Boolean(data?.onChange),
      weather: { ...EMPTY_WEATHER, ...(data?.weather ?? {}) },
    };
  } catch {
    cache = {
      entries: [],
      trips: [],
      currentTripId: null,
      intervalMinutes: 0,
      onlyMoving: true,
      onChange: false,
      weather: { ...EMPTY_WEATHER },
    };
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

const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let timer = null;
let unsubscribeGps = null;

export const logbook = {
  /** Einträge, neueste zuerst. */
  entries: () => [...read().entries],

  /** Einträge in zeitlicher Reihenfolge – so wird die Spur gezeichnet. */
  track: (tripId = undefined) => [...read().entries]
    .filter((e) => tripId === undefined || (e.tripId ?? null) === tripId)
    .sort((a, b) => a.ts - b.ts),

  intervalMinutes: () => read().intervalMinutes,
  onlyMoving: () => read().onlyMoving,
  onCourseChange: () => read().onChange,

  /** Der fortgeschriebene Wetterstand. */
  weather: () => ({ ...read().weather }),

  setWeather(patch) {
    const data = read();
    write({ ...data, weather: { ...data.weather, ...patch } });
  },

  /** Sagt Bescheid, wenn sich am Logbuch etwas geändert hat. */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // ------------------------------------------------------------------ Törns

  trips: () => [...read().trips].sort((a, b) => b.startTs - a.startTs),

  currentTrip() {
    const data = read();
    return data.trips.find((r) => r.id === data.currentTripId) ?? null;
  },

  trip(id) {
    return read().trips.find((r) => r.id === id) ?? null;
  },

  /**
   * Fängt einen Törn an. Ein laufender wird dabei beendet – zwei Reisen
   * gleichzeitig gibt es nicht.
   */
  startTrip({ name = '', from = '' } = {}) {
    const data = read();
    const trips = data.trips.map((r) => (r.id === data.currentTripId && !r.endTs
      ? { ...r, endTs: Date.now() }
      : r));
    const trip = {
      id: newId('trip'),
      name: name.trim(),
      from: from.trim(),
      to: '',
      startTs: Date.now(),
      endTs: null,
    };
    write({ ...data, trips: [trip, ...trips], currentTripId: trip.id });
    return trip;
  },

  /** Beendet den laufenden Törn. Die Einträge bleiben ihm zugeordnet. */
  endTrip({ to = '' } = {}) {
    const data = read();
    if (!data.currentTripId) return null;
    const trips = data.trips.map((r) => (r.id === data.currentTripId
      ? { ...r, to: to.trim(), endTs: Date.now() }
      : r));
    write({ ...data, trips, currentTripId: null });
    return trips.find((r) => r.id === data.currentTripId) ?? null;
  },

  updateTrip(id, patch) {
    const data = read();
    write({ ...data, trips: data.trips.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  },

  /**
   * Wirft einen Törn weg. Seine Einträge bleiben – sie sind das Logbuch, der
   * Törn nur die Klammer darum.
   */
  removeTrip(id) {
    const data = read();
    write({
      ...data,
      trips: data.trips.filter((r) => r.id !== id),
      currentTripId: data.currentTripId === id ? null : data.currentTripId,
      entries: data.entries.map((e) => (e.tripId === id ? { ...e, tripId: null } : e)),
    });
  },

  // --------------------------------------------------------------- Einträge

  /** Legt einen Eintrag an. Ohne Position wird nichts geschrieben. */
  add({
    note = '', kind = 'manual', event = null, fix = null, weather = null,
  } = {}) {
    const position = fix ?? gps.fix;
    if (!position) return null;
    const data = read();
    const stand = weather ? { ...data.weather, ...weather } : data.weather;
    const entry = {
      id: newId('log'),
      ts: Date.now(),
      lat: position.lat,
      lon: position.lon,
      sog: position.speed ?? null,
      cog: position.heading ?? null,
      accuracy: position.accuracy ?? null,
      kind,
      event: event && EVENT_KEYS.has(event) ? event : null,
      note: note.trim(),
      tripId: data.currentTripId,
      // Der Stand wird mitgeschrieben, nicht verwiesen: Ein Eintrag von
      // gestern soll das Wetter von gestern zeigen, auch wenn heute anderes
      // eingetragen wird.
      weather: { ...stand },
    };
    write({
      ...data,
      weather: stand,
      entries: [entry, ...data.entries].slice(0, MAX_ENTRIES),
    });
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

  // --------------------------------------------------------------- Automatik

  /** Takt setzen und den Zeitgeber neu aufziehen. */
  setInterval(minutes) {
    write({ ...read(), intervalMinutes: Number(minutes) || 0 });
    this.startAuto();
  },

  setOnlyMoving(value) {
    write({ ...read(), onlyMoving: Boolean(value) });
    // Sofort greifen lassen: Wer die Schwelle abschaltet, will den Punkt jetzt
    // und nicht in zwanzig Sekunden.
    this.startAuto();
  },

  setOnCourseChange(value) {
    write({ ...read(), onChange: Boolean(value) });
    this.startAuto();
  },

  /** Wann wurde zuletzt automatisch geschrieben? */
  lastAuto() {
    return read().entries.find((e) => e.kind === 'auto') ?? null;
  },

  /** Der jüngste Eintrag überhaupt – der Bezugspunkt für Bewegung und Kurs. */
  lastEntry() {
    return read().entries[0] ?? null;
  },

  /** Ist ein automatischer Eintrag nach dem Takt fällig? */
  isDue() {
    const minutes = read().intervalMinutes;
    if (!minutes) return false;
    const last = this.lastAuto();
    if (!last) return true;
    return Date.now() - last.ts >= minutes * 60000;
  },

  /**
   * Hat sich seit dem letzten Eintrag genug getan, um einen Punkt zu
   * rechtfertigen? Ohne vorherigen Eintrag immer ja.
   */
  hasMoved(fix = gps.fix) {
    if (!fix) return false;
    const last = this.lastEntry();
    if (!last) return true;
    return greatCircleDistance(last, fix) >= MIN_MOVE_NM;
  },

  /**
   * Deutliche Kurs- oder Fahrtänderung seit dem letzten Eintrag?
   *
   * Das ist der Punkt, den man später sucht: wo gewendet wurde, wo der Motor
   * ansprang. Ein fester Takt trifft ihn nur zufällig.
   */
  hasChanged(fix = gps.fix) {
    if (!fix) return false;
    const last = this.lastEntry();
    if (!last) return false;
    // Bei Schrittgeschwindigkeit ist der Kurs über Grund Rauschen; dann zählt
    // nur die Fahrt.
    const schnellGenug = (fix.speed ?? 0) >= 1 && (last.sog ?? 0) >= 1;
    if (schnellGenug && fix.heading !== null && fix.heading !== undefined
      && last.cog !== null && last.cog !== undefined) {
      const diff = Math.abs(norm360(fix.heading - last.cog + 180) - 180);
      if (diff >= COURSE_CHANGE_DEG) return true;
    }
    if (fix.speed !== null && fix.speed !== undefined
      && last.sog !== null && last.sog !== undefined) {
      if (Math.abs(fix.speed - last.sog) >= SPEED_CHANGE_KN) return true;
    }
    return false;
  },

  /** Schreibt einen automatischen Eintrag, falls einer angebracht ist. */
  tick() {
    const data = read();
    if (!gps.fix || gps.isStale(120000)) return null;

    const taktFaellig = this.isDue();
    const aenderung = data.onChange && this.hasChanged();
    if (!taktFaellig && !aenderung) return null;

    // Die Bewegungsschwelle gilt nur für den Takt. Eine Kursänderung an
    // derselben Stelle – aufschießen, Motor an – ist gerade das, was
    // festgehalten werden soll.
    if (taktFaellig && !aenderung && data.onlyMoving && !this.hasMoved()) return null;

    return this.add({ kind: 'auto' });
  },

  /**
   * Startet das automatische Mitschreiben. Zwei Auslöser: ein Zeitgeber für
   * den ruhenden Fall und jede neue GPS-Meldung, damit der Takt auch nach
   * einer Pause im Hintergrund sofort wieder greift.
   */
  startAuto() {
    this.stopAuto();
    const data = read();
    if (!data.intervalMinutes && !data.onChange) return;
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

  // --------------------------------------------------------------- Sicherung

  /** Das ganze Logbuch als Text, zum Wegschreiben in eine Datei. */
  backup() {
    const data = read();
    return JSON.stringify({
      format: 'sailing-buddy-logbook',
      version: 1,
      saved: new Date().toISOString(),
      entries: data.entries,
      trips: data.trips,
      intervalMinutes: data.intervalMinutes,
      onlyMoving: data.onlyMoving,
      onChange: data.onChange,
      weather: data.weather,
    }, null, 1);
  },

  /**
   * Liest eine Sicherung zurück – und zwar hinzufügend, nicht ersetzend.
   *
   * Wer eine Sicherung einliest, will Verlorenes zurückholen. Dabei das zu
   * löschen, was seither dazugekommen ist, wäre der zweite Verlust. Was
   * bereits da ist, wird an seiner Kennung erkannt und übersprungen.
   */
  restore(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Die Datei ist keine lesbare Sicherung.');
    }
    if (data?.format !== 'sailing-buddy-logbook' || !Array.isArray(data.entries)) {
      throw new Error('Die Datei ist keine Sicherung dieses Logbuchs.');
    }

    const now = read();
    const bekannt = new Set(now.entries.map((e) => e.id));
    const neueEintraege = data.entries.filter((e) => e && e.id && !bekannt.has(e.id)
      && Number.isFinite(e.lat) && Number.isFinite(e.lon));

    const bekannteTrips = new Set(now.trips.map((r) => r.id));
    const neueTrips = (Array.isArray(data.trips) ? data.trips : [])
      .filter((r) => r && r.id && !bekannteTrips.has(r.id));

    write({
      ...now,
      entries: [...now.entries, ...neueEintraege]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, MAX_ENTRIES),
      trips: [...now.trips, ...neueTrips],
    });

    return { entries: neueEintraege.length, trips: neueTrips.length };
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
 * Etmal: die Strecke je Kalendertag.
 *
 * Der klassische Eintrag im Logbuch – wie weit ist das Schiff seit gestern
 * gekommen. Gerechnet wird über die Spur, nicht Luftlinie: Wer kreuzt, ist
 * weiter gefahren, als die Karte zeigt.
 */
export function dailyRuns(track) {
  const days = new Map();
  for (let i = 1; i < track.length; i += 1) {
    const leg = greatCircleDistance(track[i - 1], track[i]);
    const d = new Date(track[i].ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.set(key, (days.get(key) ?? 0) + leg);
  }
  return [...days.entries()]
    .map(([day, distance]) => ({ day, distance }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** Höchste und mittlere Fahrt über Grund entlang der Spur. */
export function speedStats(track) {
  const werte = track
    .map((e) => e.sog)
    .filter((v) => v !== null && v !== undefined && Number.isFinite(v));
  if (!werte.length) return { max: null, avg: null };
  return {
    max: Math.max(...werte),
    avg: werte.reduce((a, b) => a + b, 0) / werte.length,
  };
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

// ------------------------------------------------------------------- Ausgabe

const xml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Die Spur als GPX.
 *
 * GPX öffnet jedes Navigationsprogramm und jede Karten-App – im Gegensatz zu
 * einem Textblock in der Zwischenablage, mit dem außerhalb dieser App niemand
 * etwas anfangen kann. Die Spur steht als `trk`, jeder Eintrag von Hand und
 * jedes Ereignis zusätzlich als `wpt`: So bleibt sichtbar, wo etwas passiert
 * ist, und nicht nur, wo das Schiff war.
 */
export function toGpx(track, { boat = '', name = '' } = {}) {
  const punkt = (e, tag) => [
    `  <${tag} lat="${e.lat.toFixed(6)}" lon="${e.lon.toFixed(6)}">`,
    `    <time>${new Date(e.ts).toISOString()}</time>`,
    e.event || e.note ? `    <name>${xml([e.event, e.note].filter(Boolean).join(' – '))}</name>` : null,
    e.sog !== null && e.sog !== undefined ? `    <speed>${(e.sog * 0.514444).toFixed(2)}</speed>` : null,
    e.cog !== null && e.cog !== undefined ? `    <course>${Math.round(e.cog)}</course>` : null,
    `  </${tag}>`,
  ].filter(Boolean).join('\n');

  const marken = track.filter((e) => e.event || (e.kind === 'manual' && e.note));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Sailing Buddy" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${xml(name || boat || 'Logbuch')}</name>`,
    `    <time>${new Date().toISOString()}</time>`,
    '  </metadata>',
    ...marken.map((e) => punkt(e, 'wpt')),
    '  <trk>',
    `    <name>${xml(name || 'Spur')}</name>`,
    '    <trkseg>',
    ...track.map((e) => punkt(e, 'trkpt').replace(/^ {2}/gm, '      ')),
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}

/** Die Spur als Tabelle – für die Tabellenkalkulation an Land. */
export function toCsv(track) {
  const rows = [[
    'zeit_iso', 'breite', 'laenge', 'sog_kn', 'cog_grad', 'art', 'ereignis',
    'wind_richtung', 'wind_bft', 'seegang', 'sicht', 'bewoelkung_achtel',
    'luftdruck_hpa', 'temperatur_c', 'bemerkung',
  ]];
  track.forEach((e) => {
    const w = e.weather ?? {};
    rows.push([
      new Date(e.ts).toISOString(),
      e.lat.toFixed(6),
      e.lon.toFixed(6),
      e.sog === null || e.sog === undefined ? '' : e.sog.toFixed(1),
      e.cog === null || e.cog === undefined ? '' : Math.round(e.cog),
      e.kind,
      e.event ?? '',
      w.windDir ?? '',
      w.windForce ?? '',
      w.sea ?? '',
      w.vis ?? '',
      w.clouds ?? '',
      w.pressure ?? '',
      w.temp ?? '',
      (e.note ?? '').replace(/"/g, '""'),
    ]);
  });
  return rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
}

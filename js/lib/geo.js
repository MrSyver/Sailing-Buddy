/**
 * Navigationsrechnung und Koordinaten-Parsing.
 *
 * Alle Winkel in Grad, alle Entfernungen in Seemeilen (sm), sofern nicht anders
 * vermerkt. Erdradius als Kugel – für Küstennavigation völlig ausreichend
 * (Abweichung gegenüber dem Ellipsoid deutlich unter 0,5 %).
 */

const R_NM = 3440.065; // mittlerer Erdradius in Seemeilen
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export const toRad = (d) => d * D2R;
export const toDeg = (r) => r * R2D;

/** Normiert einen Winkel auf 0…360°. */
export function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

/** Normiert eine Differenz auf -180…+180°. */
export function norm180(deg) {
  return ((((deg % 360) + 540) % 360)) - 180;
}

/**
 * Großkreisentfernung (Haversine) in Seemeilen.
 * Das ist die kürzeste Strecke über Grund.
 */
export function greatCircleDistance(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Anfangskurs des Großkreises (rechtweisend, 0…360°). */
export function initialBearing(a, b) {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return norm360(toDeg(Math.atan2(y, x)));
}

/**
 * Loxodrome (Kartenkurs): gleichbleibender Kurs von A nach B.
 * Liefert { distance, bearing } – das ist der Kurs, den man tatsächlich steuert.
 */
export function rhumbLine(a, b) {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLat = la2 - la1;
  let dLon = toRad(b.lon - a.lon);

  // Über den 180. Meridian immer den kürzeren Weg nehmen.
  if (Math.abs(dLon) > Math.PI) dLon = dLon > 0 ? dLon - 2 * Math.PI : dLon + 2 * Math.PI;

  // Vergrößerte Breite (Mercator)
  const dPhi = Math.log(Math.tan(la2 / 2 + Math.PI / 4) / Math.tan(la1 / 2 + Math.PI / 4));
  const q = Math.abs(dPhi) > 1e-12 ? dLat / dPhi : Math.cos(la1); // bei Ost-West-Kurs

  const distance = Math.sqrt(dLat * dLat + q * q * dLon * dLon) * R_NM;
  const bearing = norm360(toDeg(Math.atan2(dLon, dPhi)));
  return { distance, bearing };
}

/** Zielpunkt aus Startpunkt, Kurs und Entfernung (Großkreis). */
export function destinationPoint(a, bearingDeg, distanceNm) {
  const d = distanceNm / R_NM;
  const brg = toRad(bearingDeg);
  const la1 = toRad(a.lat);
  const lo1 = toRad(a.lon);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(brg));
  const lo2 = lo1 + Math.atan2(
    Math.sin(brg) * Math.sin(d) * Math.cos(la1),
    Math.cos(d) - Math.sin(la1) * Math.sin(la2),
  );
  return { lat: toDeg(la2), lon: norm180(toDeg(lo2)) };
}

/**
 * Kurswandlung nach deutscher Konvention (Ost-Werte positiv):
 *   missweisender Kurs = rechtweisender Kurs − Missweisung
 *   Kompasskurs        = missweisender Kurs − Ablenkung
 */
export function courseChain(trueCourse, variation = 0, deviation = 0) {
  const magnetic = norm360(trueCourse - variation);
  const compass = norm360(magnetic - deviation);
  return { true: norm360(trueCourse), magnetic, compass };
}

/** Relative Peilung (Seitenpeilung) aus rechtweisendem Kurs und anliegendem Kurs. */
export function relativeBearing(bearing, heading) {
  return norm360(bearing - heading);
}

/**
 * Peilung relativ zum anliegenden Kurs.
 * `side` ist ein sprachneutraler Schlüssel: 'ahead' | 'astern' | 'starboard' | 'port'.
 */
export function relativeSide(bearing, heading) {
  const rel = norm180(bearing - heading);
  if (Math.abs(rel) < 0.5) return { side: 'ahead', deg: 0 };
  if (Math.abs(rel) > 179.5) return { side: 'astern', deg: 180 };
  return { side: rel > 0 ? 'starboard' : 'port', deg: Math.round(Math.abs(rel)) };
}

/** Fahrzeit in Sekunden aus Entfernung (sm) und Geschwindigkeit (kn). */
export function timeToGo(distanceNm, speedKn) {
  if (!speedKn || speedKn <= 0.05) return null;
  return (distanceNm / speedKn) * 3600;
}

/** Sekunden als „2 h 15 min“ formatieren. */
export function formatDuration(seconds) {
  if (seconds === null || !isFinite(seconds)) return '–';
  const s = Math.round(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${s} s`;
}

// ---------------------------------------------------------------------------
// Koordinaten: formatieren
// ---------------------------------------------------------------------------

/**
 * Seemännisches Standardformat: Grad und Dezimalminuten, z. B. 54°31,234' N.
 * Genau die Schreibweise, die im Funk vorgelesen und in den Plotter getippt wird.
 */
export function formatLat(lat, decimals = 3) {
  return formatDM(lat, lat >= 0 ? 'N' : 'S', 2, decimals);
}

export function formatLon(lon, decimals = 3) {
  return formatDM(lon, lon >= 0 ? 'E' : 'W', 3, decimals);
}

function formatDM(value, hemi, degPad, decimals) {
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = (abs - deg) * 60;
  // Rundung kann 60,000' erzeugen – dann ein Grad hochzählen.
  if (Number(min.toFixed(decimals)) >= 60) {
    min = 0;
    deg += 1;
  }
  const minStr = min.toFixed(decimals).padStart(decimals + 3, '0').replace('.', ',');
  return `${String(deg).padStart(degPad, '0')}°${minStr}' ${hemi}`;
}

/** Beide Koordinaten in einer Zeile. */
export function formatPosition(pos, decimals = 3) {
  if (!pos) return '–';
  return `${formatLat(pos.lat, decimals)}   ${formatLon(pos.lon, decimals)}`;
}

/** Dezimalgrad, z. B. für Zwischenablage und andere Apps. */
export function formatDecimal(pos, decimals = 5) {
  if (!pos) return '–';
  return `${pos.lat.toFixed(decimals)}, ${pos.lon.toFixed(decimals)}`;
}

/**
 * Zum Vorlesen im Funk aufbereitet – Ziffern einzeln, ohne Sonderzeichen.
 * Aus 54°31,234' N wird: „fünf vier Grad drei eins Komma zwei drei vier Minuten Nord“.
 */
export function formatSpoken(pos, lang = 'de') {
  if (!pos) return '–';
  const w = SPOKEN_WORDS[lang] ?? SPOKEN_WORDS.de;
  const spell = (str) => str.split('').map((ch) => w.digits[ch] ?? ch).join(' ');
  const part = (val, hemiPos, hemiNeg, pad) => {
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(1);
    const [mWhole, mFrac] = min.split('.');
    return `${spell(String(deg).padStart(pad, '0'))} ${w.degrees} `
      + `${spell(mWhole.padStart(2, '0'))} ${w.decimal} ${spell(mFrac)} ${w.minutes} `
      + `${val >= 0 ? hemiPos : hemiNeg}`;
  };
  return `${part(pos.lat, w.north, w.south, 2)}, ${part(pos.lon, w.east, w.west, 3)}`;
}

const SPOKEN_WORDS = {
  de: {
    digits: {
      0: 'null', 1: 'eins', 2: 'zwei', 3: 'drei', 4: 'vier',
      5: 'fünf', 6: 'sechs', 7: 'sieben', 8: 'acht', 9: 'neun',
    },
    degrees: 'Grad', minutes: 'Minuten', decimal: 'Komma',
    north: 'Nord', south: 'Süd', east: 'Ost', west: 'West',
  },
  en: {
    digits: {
      0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four',
      5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
    },
    degrees: 'degrees', minutes: 'minutes', decimal: 'decimal',
    north: 'north', south: 'south', east: 'east', west: 'west',
  },
};

// ---------------------------------------------------------------------------
// Koordinaten: einlesen
// ---------------------------------------------------------------------------

const HEMI = { N: 1, S: -1, E: 1, O: 1, W: -1 };

/**
 * Liest eine einzelne Koordinate in nahezu jedem gebräuchlichen Format.
 *
 * Erkannt werden unter anderem:
 *   54°31.234' N · 54 31,234 N · N 54 31.234 · 54.520567 · -54.5205
 *   54°31'14" N · 54:31:14 N
 *
 * `axis` ist 'lat' oder 'lon' und dient nur der Plausibilitätsprüfung.
 * Rückgabe: Zahl in Dezimalgrad oder null.
 */
export function parseCoordinate(input, axis = 'lat') {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Himmelsrichtung herausziehen (kann vorn oder hinten stehen).
  let sign = 1;
  let hemiFound = false;
  s = s.replace(/[NSEWO]/gi, (m) => {
    const up = m.toUpperCase();
    // Ein "O" nur als Ost werten, wenn es allein steht (nicht Teil eines Wortes).
    sign = HEMI[up];
    hemiFound = true;
    return ' ';
  });

  // Vorzeichen merken, bevor Trennzeichen zu Leerraum werden.
  const negative = /^\s*-/.test(s);
  s = s.replace(/^\s*[-+]/, ' ');

  // Alle üblichen Grad-, Minuten- und Sekundenzeichen zu Leerraum machen.
  s = s.replace(/[°º^*:'`´’‘"“”″′]/g, ' ');

  // Dezimalkomma zu Punkt – aber nur zwischen Ziffern (deutsche Schreibweise).
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  // Übrig gebliebene Kommas trennen nur noch.
  s = s.replace(/,/g, ' ');

  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;

  const [d, m = 0, sec = 0] = nums.slice(0, 3).map(Number);
  let value = d + Number(m) / 60 + Number(sec) / 3600;

  if (negative && !hemiFound) sign = -1;
  else if (negative && hemiFound) sign = -Math.abs(sign);
  value *= sign;

  const limit = axis === 'lon' ? 180 : 90;
  if (!isFinite(value) || Math.abs(value) > limit) return null;
  // Minuten und Sekunden müssen kleiner als 60 sein.
  if (nums.length > 1 && Number(m) >= 60) return null;
  if (nums.length > 2 && Number(sec) >= 60) return null;
  return value;
}

/**
 * Liest ein komplettes Positionspaar aus einem einzigen Text, so wie er in einem
 * Notruf durchgegeben oder aus einer Nachricht kopiert wird.
 * Rückgabe: { lat, lon } oder null.
 */
export function parsePositionPair(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // Fall 1: zwei reine Dezimalzahlen, getrennt durch Komma oder Leerraum.
  const decPair = raw.match(/^\s*([-+]?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*([-+]?\d{1,3}(?:[.,]\d+)?)\s*$/);
  if (decPair) {
    const lat = Number(decPair[1].replace(',', '.'));
    const lon = Number(decPair[2].replace(',', '.'));
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon };
    }
  }

  // Fall 2: an der Himmelsrichtung trennen – N/S gehört zur Breite, E/W/O zur Länge.
  const lonStart = raw.search(/[EWO](?![a-zäöü])/i);
  const nsIdx = raw.search(/[NS](?![a-zäöü])/i);
  if (lonStart > -1 && nsIdx > -1) {
    // Steht die Himmelsrichtung hinter der Zahl (54 31.2 N 011 22.3 E)?
    const latPart = nsIdx < lonStart ? raw.slice(0, nsIdx + 1) : raw.slice(nsIdx);
    const lonPart = nsIdx < lonStart ? raw.slice(nsIdx + 1) : raw.slice(0, nsIdx);
    const lat = parseCoordinate(latPart, 'lat');
    const lon = parseCoordinate(lonPart, 'lon');
    if (lat !== null && lon !== null) return { lat, lon };
  }

  // Fall 3: Zahlenkolonne ohne Kennung gleichmäßig aufteilen.
  const nums = raw.match(/[-+]?\d+(?:[.,]\d+)?/g);
  if (nums && nums.length >= 2 && nums.length % 2 === 0) {
    const half = nums.length / 2;
    const lat = parseCoordinate(nums.slice(0, half).join(' '), 'lat');
    const lon = parseCoordinate(nums.slice(half).join(' '), 'lon');
    if (lat !== null && lon !== null) return { lat, lon };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Koordinaten: in Einzelfelder zerlegen und wieder zusammensetzen
// ---------------------------------------------------------------------------

/**
 * Zerlegt eine Position in die Felder, die an Bord auch so abgelesen werden:
 * Grad, ganze Minuten, Nachkommastellen und Himmelsrichtung. Damit lässt sie
 * sich ohne Gradzeichen, Hochkomma und Tastaturakrobatik eintippen.
 *
 * Die Nachkommastellen stehen bewusst in einem eigenen Feld: Wer eine Position
 * aus einem Notruf abschreibt, hört „vierundfünfzig Grad, einunddreißig Komma
 * zwei-drei-vier Minuten“ – und tippt genau in dieser Reihenfolge weiter, ohne
 * das Komma treffen zu müssen.
 */
export function toParts(pos) {
  if (!pos) {
    return {
      latDeg: '', latMin: '', latDec: '', latHemi: 'N',
      lonDeg: '', lonMin: '', lonDec: '', lonHemi: 'E',
    };
  }
  const split = (value, pad) => {
    const abs = Math.abs(value);
    let deg = Math.floor(abs);
    let min = (abs - deg) * 60;
    // Rundung kann 60,000' erzeugen – dann ein Grad hochzählen.
    if (Number(min.toFixed(3)) >= 60) {
      min = 0;
      deg += 1;
    }
    const [whole, dec] = min.toFixed(3).split('.');
    return {
      deg: String(deg).padStart(pad, '0'),
      min: whole.padStart(2, '0'),
      dec,
    };
  };
  const la = split(pos.lat, 2);
  const lo = split(pos.lon, 3);
  return {
    latDeg: la.deg,
    latMin: la.min,
    latDec: la.dec,
    latHemi: pos.lat >= 0 ? 'N' : 'S',
    lonDeg: lo.deg,
    lonMin: lo.min,
    lonDec: lo.dec,
    lonHemi: pos.lon >= 0 ? 'E' : 'W',
  };
}

/**
 * Baut aus den Einzelfeldern wieder eine Position.
 * Rückgabe: { lat, lon } oder null, wenn etwas fehlt oder unmöglich ist.
 *
 * Die Nachkommastellen dürfen im eigenen Feld stehen (`latDec`) oder – aus
 * eingefügtem Text – noch im Minutenfeld kleben. Beides ergibt dasselbe.
 */
export function fromParts(parts) {
  if (!parts) return null;
  const num = (value) => {
    const text = String(value ?? '').trim().replace(',', '.');
    if (text === '') return 0;
    if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
    return Number(text);
  };
  /** Reine Nachkommastellen: „234“ wird zu 0,234. */
  const frac = (value) => {
    const text = String(value ?? '').trim();
    if (text === '') return 0;
    if (!/^\d+$/.test(text)) return NaN;
    return Number(`0.${text}`);
  };

  // Ohne Gradangabe gibt es nichts zu rechnen.
  if (String(parts.latDeg ?? '').trim() === '' || String(parts.lonDeg ?? '').trim() === '') return null;

  const latDeg = num(parts.latDeg);
  const latMin = num(parts.latMin) + frac(parts.latDec);
  const lonDeg = num(parts.lonDeg);
  const lonMin = num(parts.lonMin) + frac(parts.lonDec);
  if ([latDeg, latMin, lonDeg, lonMin].some(Number.isNaN)) return null;
  if (latMin >= 60 || lonMin >= 60) return null;

  const lat = (latDeg + latMin / 60) * (parts.latHemi === 'S' ? -1 : 1);
  const lon = (lonDeg + lonMin / 60) * (parts.lonHemi === 'W' ? -1 : 1);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Vollständige Navigationslösung von A nach B. */
export function solve(from, to, opts = {}) {
  const { variation = 0, deviation = 0, speed = null, heading = null } = opts;
  const rl = rhumbLine(from, to);
  const gc = greatCircleDistance(from, to);
  const gcBrg = initialBearing(from, to);
  const courses = courseChain(rl.bearing, variation, deviation);
  return {
    distance: rl.distance,
    bearing: rl.bearing,
    greatCircle: gc,
    greatCircleBearing: gcBrg,
    reciprocal: norm360(rl.bearing + 180),
    courses,
    eta: timeToGo(rl.distance, speed),
    relative: heading === null || heading === undefined ? null : relativeSide(rl.bearing, heading),
  };
}

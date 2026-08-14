/**
 * Sonnenauf- und -untergang aus Position und Datum.
 *
 * Gerechnet, nicht abgefragt: Es gibt Dienste, die einem die Zeiten sagen –
 * aber die brauchen eine Verbindung, und wenn diese App irgendwo gebraucht
 * wird, dann dort, wo keine ist. Die Formeln stehen seit Jahrzehnten fest
 * (Näherung nach Meeus, wie sie auch der Wetterdienst verwendet); auf eine
 * Minute genau reicht das für die Frage, ob es dunkel ist, um ein Vielfaches.
 *
 * Alle Zeiten kommen als `Date` heraus. Gerechnet wird über den Stundenwinkel
 * der Sonne am Ort – das ist die Ortszeit, nach der gefragt war, unabhängig
 * davon, welche Zeitzone das Gerät eingestellt hat.
 */

const RAD = Math.PI / 180;
const J1970 = 2440588;
const J2000 = 2451545;
const DAY_MS = 86400000;

/** Schiefe der Ekliptik – die Neigung der Erdachse. */
const OBLIQUITY = 23.4397 * RAD;

/**
 * Der Sonnenstand, bei dem Auf- und Untergang gezählt werden.
 *
 * −0,833° statt 0°: Die Sonne steht scheinbar noch über dem Horizont, wenn sie
 * geometrisch schon darunter ist – die Lufthülle hebt das Bild um etwa 0,57°,
 * und gemeint ist der Oberrand der Scheibe, nicht ihre Mitte (0,27°).
 */
const HORIZON = -0.833 * RAD;

const toJulian = (date) => date.valueOf() / DAY_MS - 0.5 + J1970;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAY_MS);
const toDays = (date) => toJulian(date) - J2000;

const solarMeanAnomaly = (d) => RAD * (357.5291 + 0.98560028 * d);

function eclipticLongitude(M) {
  // Mittelpunktsgleichung: Die Erdbahn ist eine Ellipse, keine Kreisbahn.
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  // Länge des Perihels, plus 180° für den Wechsel Erde→Sonne.
  return M + C + RAD * 102.9372 + Math.PI;
}

const declination = (L) => Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));

/** Der Bruchteil eines Tages, den der Sonnenstand vom Mittag entfernt liegt. */
function hourAngle(h, phi, dec) {
  const cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  // Außerhalb von ±1 geht die Sonne an diesem Tag nicht durch diesen Winkel:
  // Mitternachtssonne oder Polarnacht. Beides gibt es in Fahrtgebieten, in
  // denen gesegelt wird.
  if (cosH > 1 || cosH < -1) return null;
  return Math.acos(cosH);
}

const J0 = 0.0009;
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

/**
 * Auf- und Untergang für einen Tag an einem Ort.
 *
 * `polar` sagt, warum eine Zeit fehlt: 'day' bei Mitternachtssonne, 'night'
 * bei Polarnacht. Ohne das wüsste man nur, dass etwas fehlt, nicht was.
 */
export function sunTimes(date, lat, lon) {
  // Westliche Länge positiv – so rechnet die Formel.
  const lw = RAD * -lon;
  const phi = RAD * lat;

  const d = toDays(date);
  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = approxTransit(0, lw, n);

  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);

  const noon = solarTransitJ(ds, M, L);
  const w = hourAngle(HORIZON, phi, dec);

  if (w === null) {
    // Steht die Sonne im höchsten Stand über dem Horizont, ist es
    // Mitternachtssonne; sonst Polarnacht. Der höchste Stand am Tag ist
    // 90° − |Breite − Deklination|.
    const hoechster = Math.PI / 2 - Math.abs(phi - dec);
    return { sunrise: null, sunset: null, polar: hoechster > HORIZON ? 'day' : 'night' };
  }

  const set = solarTransitJ(approxTransit(w, lw, n), M, L);
  const rise = noon - (set - noon);

  return { sunrise: fromJulian(rise), sunset: fromJulian(set), polar: null };
}

/**
 * Ist es an diesem Ort dunkel genug für den Nachtmodus?
 *
 * `offsetMinutes` verschiebt den Untergang nach hinten: Eine Stunde nach
 * Sonnenuntergang ist die bürgerliche Dämmerung vorbei und die Augen fangen
 * an, sich anzupassen – vorher wäre Rot auf Schwarz nur unbequem.
 *
 * Am Morgen gilt der Sonnenaufgang ohne Zuschlag: Sobald die Sonne steht, ist
 * die Dunkeladaption ohnehin dahin.
 */
export function isDark(date, lat, lon, offsetMinutes = 60) {
  const { sunrise, sunset, polar } = sunTimes(date, lat, lon);
  if (polar) return polar === 'night';
  if (date < sunrise) return true;
  return date.getTime() >= sunset.getTime() + offsetMinutes * 60000;
}

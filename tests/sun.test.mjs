/**
 * Prüfungen für die Sonnenzeiten.
 *
 * Gerechnet wird ohne Verbindung, also muss die Rechnung selbst stimmen –
 * einen Dienst, der sie im Zweifel korrigiert, gibt es unterwegs nicht.
 * Geprüft gegen veröffentlichte Zeiten, mit einer Toleranz von wenigen
 * Minuten: Für die Frage, ob es dunkel ist, reicht das um ein Vielfaches.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sunTimes, isDark } from '../js/lib/sun.js';

/** Die Uhrzeit in Weltzeit, als Minuten seit Mitternacht. */
const utcMinutes = (d) => d.getUTCHours() * 60 + d.getUTCMinutes();

const nahe = (ist, soll, toleranz, was) => assert.ok(
  Math.abs(ist - soll) <= toleranz,
  `${was}: ${Math.floor(ist / 60)}:${String(ist % 60).padStart(2, '0')} UTC, erwartet etwa ${Math.floor(soll / 60)}:${String(soll % 60).padStart(2, '0')} UTC`,
);

test('Kiel zur Sommersonnenwende', () => {
  // 21. Juni 2026, Kiel (54,32° N, 10,14° O).
  // Veröffentlicht: Aufgang 04:41, Untergang 21:59 Ortszeit (MESZ = UTC+2),
  // also 02:41 und 19:59 UTC.
  const { sunrise, sunset, polar } = sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), 54.32, 10.14);
  assert.equal(polar, null);
  nahe(utcMinutes(sunrise), 2 * 60 + 41, 5, 'Aufgang Kiel');
  nahe(utcMinutes(sunset), 19 * 60 + 59, 5, 'Untergang Kiel');
});

test('Kiel zur Wintersonnenwende', () => {
  // 21. Dezember 2026: Aufgang 08:39, Untergang 15:56 Ortszeit (MEZ = UTC+1).
  const { sunrise, sunset } = sunTimes(new Date(Date.UTC(2026, 11, 21, 12)), 54.32, 10.14);
  nahe(utcMinutes(sunrise), 7 * 60 + 39, 5, 'Aufgang Kiel im Winter');
  nahe(utcMinutes(sunset), 14 * 60 + 56, 5, 'Untergang Kiel im Winter');
});

test('Am Äquator geht die Sonne zur Tagundnachtgleiche gegen sechs auf und unter', () => {
  // Nicht auf die Minute sechs und achtzehn Uhr, und das ist richtig so:
  // Am 20. März geht die Sonnenuhr der Uhr um gut sieben Minuten nach
  // (Zeitgleichung), und die Lichtbrechung schiebt beide Zeiten um weitere
  // gut drei Minuten nach außen. Erwartet werden deshalb 06:04 und 18:11.
  const { sunrise, sunset } = sunTimes(new Date(Date.UTC(2026, 2, 20, 12)), 0, 0);
  nahe(utcMinutes(sunrise), 6 * 60 + 4, 4, 'Aufgang Äquator');
  nahe(utcMinutes(sunset), 18 * 60 + 11, 4, 'Untergang Äquator');
  // Und der Tag ist an der Tagundnachtgleiche gut zwölf Stunden lang.
  const laenge = (sunset - sunrise) / 60000;
  nahe(laenge, 12 * 60 + 7, 4, 'Taglänge');
});

test('Östlich und westlich verschiebt sich die Zeit mit der Länge', () => {
  const tag = new Date(Date.UTC(2026, 2, 20, 12));
  const west = sunTimes(tag, 0, 0).sunset;
  const ost = sunTimes(tag, 0, 15).sunset;
  // 15° Länge nach Osten sind eine Stunde früher in Weltzeit.
  const diff = (west.getTime() - ost.getTime()) / 60000;
  nahe(diff, 60, 6, 'Verschiebung je 15° Länge');
});

test('Nördlich des Polarkreises gibt es Mitternachtssonne und Polarnacht', () => {
  const sommer = sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), 78, 15);
  assert.equal(sommer.sunset, null);
  assert.equal(sommer.polar, 'day');

  const winter = sunTimes(new Date(Date.UTC(2026, 11, 21, 12)), 78, 15);
  assert.equal(winter.sunrise, null);
  assert.equal(winter.polar, 'night');
});

test('Dunkel wird es erst eine Stunde nach Sonnenuntergang', () => {
  const lat = 54.32;
  const lon = 10.14;
  const { sunset } = sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), lat, lon);

  const kurzDavor = new Date(sunset.getTime() - 10 * 60000);
  const kurzDanach = new Date(sunset.getTime() + 10 * 60000);
  const spaeter = new Date(sunset.getTime() + 61 * 60000);

  assert.equal(isDark(kurzDavor, lat, lon), false, 'vor dem Untergang');
  // Genau das ist der Zuschlag: Zehn Minuten nach dem Untergang ist es hell
  // genug, dass Rot auf Schwarz nur unbequem wäre.
  assert.equal(isDark(kurzDanach, lat, lon), false, 'kurz nach dem Untergang');
  assert.equal(isDark(spaeter, lat, lon), true, 'eine Stunde danach');
});

test('Vor dem Sonnenaufgang ist es noch dunkel', () => {
  const lat = 54.32;
  const lon = 10.14;
  const { sunrise } = sunTimes(new Date(Date.UTC(2026, 11, 21, 12)), lat, lon);
  assert.equal(isDark(new Date(sunrise.getTime() - 30 * 60000), lat, lon), true);
  assert.equal(isDark(new Date(sunrise.getTime() + 30 * 60000), lat, lon), false);
});

test('In der Polarnacht ist es dunkel, in der Mitternachtssonne nicht', () => {
  assert.equal(isDark(new Date(Date.UTC(2026, 11, 21, 12)), 78, 15), true);
  assert.equal(isDark(new Date(Date.UTC(2026, 5, 21, 0)), 78, 15), false);
});

test('Der Zuschlag lässt sich verstellen', () => {
  const lat = 54.32;
  const lon = 10.14;
  const { sunset } = sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), lat, lon);
  const zwanzigDanach = new Date(sunset.getTime() + 20 * 60000);
  assert.equal(isDark(zwanzigDanach, lat, lon, 60), false);
  assert.equal(isDark(zwanzigDanach, lat, lon, 10), true);
});

/**
 * Welche Bereiche es gibt – und welche davon unten in der Leiste stehen.
 *
 * Unten ist Platz für sechs Felder. Fünf gehören den Bereichen, das sechste
 * immer „Mehr“. Welche fünf das sind, entscheidet die Benutzung: Was zuletzt
 * gebraucht wurde, steht unten; der Rest liegt hinter „Mehr“ und rückt nach
 * vorn, sobald man es einmal aufruft.
 *
 * Zwei Dinge daran sind Absicht.
 *
 * Erstens entscheidet die Benutzung nur darüber, *ob* ein Bereich unten
 * steht, nicht *wo*. Die Reihenfolge in der Leiste ist immer die feste
 * unten – sonst wanderten die Felder unter dem Daumen umher, und genau darauf
 * verlässt man sich nach der zweiten Woche an Bord.
 *
 * Zweitens rutscht nie etwas heraus, das man gerade benutzt: Der offene
 * Bereich steht immer vorn in der Liste.
 */

import { settings } from './storage.js';

import * as radioView from '../views/radio.js';
import * as positionView from '../views/position.js';
import * as mapView from '../views/map.js';
import * as nightView from '../views/night.js';
import * as logbookView from '../views/logbook.js';
import * as knotsView from '../views/knots.js';
import * as rulesView from '../views/rules.js';
import * as settingsView from '../views/settings.js';

/** Die feste Reihenfolge. Sie bestimmt die Anordnung, nicht die Auswahl. */
export const MODULES = [
  { key: 'funk', label: 'tab.radio', title: 'title.radio', view: radioView, icon: '((•))' },
  { key: 'position', label: 'tab.position', title: 'title.position', view: positionView, icon: '◎' },
  { key: 'karte', label: 'tab.map', title: 'title.map', view: mapView, icon: '▤' },
  { key: 'nacht', label: 'tab.night', title: 'title.night', view: nightView, icon: '☾' },
  { key: 'logbuch', label: 'tab.log', title: 'title.log', view: logbookView, icon: '▤' },
  { key: 'regeln', label: 'more.rules', title: 'more.rules', view: rulesView, icon: '⇄' },
  { key: 'knoten', label: 'more.knots', title: 'more.knots', view: knotsView, icon: '∞' },
  { key: 'setup', label: 'more.settings', title: 'title.settings', view: settingsView, icon: '⚙' },
];

/** Wie viele Bereiche unten Platz haben – das sechste Feld ist „Mehr“. */
export const SLOTS = 5;

export const moduleFor = (key) => MODULES.find((m) => m.key === key) ?? null;

/** Die zuletzt benutzten Bereiche, neuester zuerst. */
function recent() {
  const gespeichert = settings.get('recentTabs');
  const gueltig = Array.isArray(gespeichert)
    ? gespeichert.filter((k) => MODULES.some((m) => m.key === k))
    : [];
  // Alles, was noch nie aufgerufen wurde, hängt in fester Reihenfolge hinten
  // an – beim ersten Start steht damit die gewohnte Leiste da.
  const rest = MODULES.map((m) => m.key).filter((k) => !gueltig.includes(k));
  return [...gueltig, ...rest];
}

/** Merkt sich, dass ein Bereich benutzt wurde. */
export function markUsed(key) {
  if (!moduleFor(key)) return;
  const next = [key, ...recent().filter((k) => k !== key)];
  settings.set('recentTabs', next);
}

/**
 * Was unten steht – in der festen Reihenfolge, nicht in der der Benutzung.
 *
 * `current` steht immer dabei: Der Bereich, den man gerade offen hat, darf
 * nicht aus der Leiste fallen, während man ihn ansieht.
 */
export function barModules(current = null) {
  const zuletzt = recent();
  const gewaehlt = new Set(zuletzt.slice(0, SLOTS));
  if (current && moduleFor(current) && !gewaehlt.has(current)) {
    // Platz schaffen: Der am längsten nicht benutzte weicht.
    const opfer = zuletzt.slice(0, SLOTS).at(-1);
    gewaehlt.delete(opfer);
    gewaehlt.add(current);
  }
  return MODULES.filter((m) => gewaehlt.has(m.key));
}

/** Was hinter „Mehr“ liegt – alles, was gerade nicht unten steht. */
export function restModules(current = null) {
  const unten = new Set(barModules(current).map((m) => m.key));
  return MODULES.filter((m) => !unten.has(m.key));
}

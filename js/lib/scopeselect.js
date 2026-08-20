/**
 * Welche Spur gerade gemeint ist – als Auswahlliste.
 *
 * Vorher stand dafür im Logbuch eine Reihe von Chips, eine je Törn und eine je
 * Etappe. Das liest sich gut, solange es drei sind; nach einer Saison ist es
 * eine Wand. Eine Auswahlliste bleibt eine Zeile hoch, egal wie viele Törns
 * dahinterstehen – und sie steht dort, wo man sie braucht: direkt an der Spur.
 *
 * Hier liegt sie und nicht in einer der beiden Ansichten, weil Logbuch und
 * Karte dieselbe Frage stellen. Zwei Listen, die auseinanderlaufen, wären
 * schlimmer als eine, die an der falschen Stelle wohnt.
 *
 * Der Ausschnitt ist ein schlichtes Objekt: `{}` alles, `{ tripId }` ein Törn,
 * `{ turnId }` eine Etappe, `{ orphan: true }` alles ohne Zuordnung.
 */

import { h } from './dom.js';
import { t, locale } from './i18n.js';
import { logbook } from './logbook.js';

const kurz = (ts) => new Date(ts).toLocaleDateString(locale(), {
  day: '2-digit', month: '2-digit', year: '2-digit',
});

/** Ein Ausschnitt als Zeichenkette – das braucht ein `<option>` als Wert. */
export function scopeValue(scope = {}) {
  if (scope.orphan) return 'ohne';
  if (scope.turnId) return `turn:${scope.turnId}`;
  if (scope.tripId) return `trip:${scope.tripId}`;
  return 'alles';
}

/** Und zurück. Unbekanntes heißt „alles“ – ein gelöschter Törn zum Beispiel. */
export function scopeFrom(value) {
  if (value === 'ohne') return { orphan: true };
  if (value?.startsWith('turn:')) return { turnId: value.slice(5) };
  if (value?.startsWith('trip:')) return { tripId: value.slice(5) };
  return {};
}

/**
 * Die Liste der wählbaren Ausschnitte.
 *
 * Etappen stehen unter ihrem Törn und eingerückt – ohne das weiß niemand,
 * wozu sie gehören. Was gerade läuft, ist gekennzeichnet: Danach greift man
 * unterwegs als Erstes.
 */
export function scopeList() {
  const laufenderTrip = logbook.currentTrip()?.id ?? null;
  const laufendeTurn = logbook.currentTurn()?.id ?? null;
  const marke = (name, laeuft) => (laeuft ? `${name} · ${t('log.scopeRunning')}` : name);

  const etappe = (et) => ({
    value: `turn:${et.id}`,
    label: `↳ ${marke(et.name || kurz(et.startTs), et.id === laufendeTurn)}`,
    count: logbook.track({ turnId: et.id }).length,
  });

  const liste = [{ value: 'alles', label: t('log.tripAll'), count: logbook.track().length }];

  logbook.trips().forEach((r) => {
    liste.push({
      value: `trip:${r.id}`,
      label: marke(r.name || kurz(r.startTs), r.id === laufenderTrip),
      count: logbook.track({ tripId: r.id }).length,
    });
    logbook.turns(r.id).forEach((et) => liste.push(etappe(et)));
  });
  logbook.turns(null).forEach((et) => liste.push(etappe(et)));

  // „Ohne Zuordnung“ nur, wenn es solche Einträge gibt. Sonst wäre es ein
  // Eintrag, der nichts erklärt – und meistens gibt es sie nicht.
  const ohne = logbook.track({ orphan: true }).length;
  if (ohne > 0) liste.push({ value: 'ohne', label: t('log.scopeNone'), count: ohne });

  return liste;
}

/**
 * Gibt es diesen Ausschnitt noch?
 *
 * Nach dem Löschen eines Törns zeigt eine gemerkte Auswahl ins Leere. Ohne
 * diese Prüfung bliebe der Reiter dann auf einem Ausschnitt stehen, den es
 * nicht mehr gibt – und zeigte gar nichts, ohne zu sagen warum.
 */
export function scopeExists(value) {
  if (value === 'alles') return true;
  return scopeList().some((o) => o.value === value);
}

/**
 * Die Auswahlliste selbst.
 *
 * `extra` hängt weitere Einträge vorn an – die Karte braucht ein „Keine Spur“,
 * das Logbuch nicht.
 */
export function scopeSelect({
  scope = {}, value = null, onPick, extra = [], label = t('log.scope'), name = 'wahl',
}) {
  const jetzt = value ?? scopeValue(scope);
  return h('label.field',
    h('span', label),
    h('select', { 'data-scope': name, onchange: (e) => onPick(e.target.value) },
      ...[...extra, ...scopeList()].map((o) => h('option', {
        value: o.value,
        selected: o.value === jetzt,
      }, o.count === undefined ? o.label : `${o.label} (${o.count})`)),
    ),
  );
}

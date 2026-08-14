/**
 * Modul „Position“ – eigene Position anzeigen, ein Ziel eingeben,
 * Entfernung und Kurs dorthin berechnen.
 *
 * Rechnet ausschließlich mit GPS und Geometrie. Es werden keine Karten,
 * keine Kacheln und keine Netzverbindung gebraucht.
 */

import { h, svg, render, copy, toast, fit } from '../lib/dom.js';
import { createChart, fullscreenButton } from '../lib/chartview.js';
import { settings, waypoints } from '../lib/storage.js';
import { gps, GPS_STATUS_KEY } from '../lib/gps.js';
import { t, locale, uiLang, num } from '../lib/i18n.js';
import {
  solve, parsePositionPair, formatPosition, formatLat,
  formatLon, formatDecimal, formatSpoken, formatDuration,
  toParts, fromParts, norm360,
} from '../lib/geo.js';

// Bleibt beim Reiterwechsel erhalten.
const state = {
  // Einzelfelder statt eines Textes: Grad, Minuten, Himmelsrichtung.
  // So braucht es keine Gradzeichen und keine Hochkommata auf der Tastatur.
  parts: toParts(null),
  target: null,      // { lat, lon }
  targetName: '',
  error: null,
  showSpoken: false, // eigene Position ausgeschrieben zum Vorlesen
  // Was an der Stelle des Kompasses steht: 'kompass' oder 'karte'.
  resultView: 'kompass',
};

let container = null;
let chart = null;
let chartFrame = null;
// Beim Umschalten auf die Karte einmal auf alle Punkte einpassen – danach
// gehört der Ausschnitt dem, der ihn zieht.
let fitChartNext = false;

export function view(root) {
  container = h('div');
  render(root, container);
  pruneMobs();
  draw();
  const off = gps.onUpdate(() => draw());
  return () => {
    off();
    clearTimeout(chartTimer);
    chart?.destroy();
    chart = null;
    chartFrame = null;
    container = null;
  };
}

/**
 * Was auf der kleinen Karte steht: die eigene Position, das Ziel, die
 * gemerkten Positionen. Ohne Spur – hier geht es um das Hinkommen, nicht um
 * das Gewesene.
 *
 * Dazu die Verbindung zwischen der eigenen Position und dem Ziel. Zwei Punkte
 * auf einer Seekarte sind zwei Punkte; erst der Strich dazwischen zeigt, was
 * sie miteinander zu tun haben – und genau darum geht es auf dieser Seite.
 */
function chartPoints() {
  const marks = [];
  const fix = gps.fix;
  if (fix) {
    marks.push({
      kind: 'own', lat: fix.lat, lon: fix.lon, name: t('map.own'), heading: fix.heading,
    });
  }
  if (state.target) {
    marks.push({
      kind: 'target',
      lat: state.target.lat,
      lon: state.target.lon,
      name: state.targetName || t('pos.target'),
    });
  }
  waypoints.list().forEach((wp) => {
    // Das Ziel steht schon da – nicht doppelt zeichnen.
    if (samePlace(state.target, wp)) return;
    marks.push({
      kind: wp.kind === 'mob' ? 'mob' : 'wp', lat: wp.lat, lon: wp.lon, name: wp.name,
    });
  });
  const leg = fix && state.target
    ? [{ lat: fix.lat, lon: fix.lon }, { lat: state.target.lat, lon: state.target.lon }]
    : [];
  return { marks, track: [], leg };
}

/**
 * Die Karte an der Stelle des Kompasses.
 *
 * Sie wird einmal angelegt und danach nur noch umgehängt. Beim Tippen baut
 * sich die Ergebniskarte ständig neu auf – würde die Karte jedes Mal
 * mitgehen, flackerte sie und läse bei jedem Zeichen die Kacheln neu.
 */
function chartBlock() {
  if (!chart) {
    chart = createChart({ collect: chartPoints, size: 'klein' });
    chartFrame = h('div.chart-frame');
    chartFrame.append(
      chart.el,
      h('div.chart-controls',
        fullscreenButton(chartFrame, chart),
        h('button.chart-btn', {
          type: 'button', 'aria-label': t('map.zoomIn'), onclick: () => chart.zoomBy(1),
        }, '＋'),
        h('button.chart-btn', {
          type: 'button', 'aria-label': t('map.zoomOut'), onclick: () => chart.zoomBy(-1),
        }, '－'),
        h('button.chart-btn', {
          type: 'button',
          'aria-label': t('map.fitAll'),
          title: t('map.fitAll'),
          onclick: () => chart.fit(),
        }, '⤢'),
      ),
    );
  }
  return [chartFrame, chart.note];
}

/**
 * Beim Tippen nicht bei jedem Zeichen neu zeichnen.
 *
 * Wer eine Koordinate eintippt, erzeugt ein halbes Dutzend Zwischenstände,
 * die alle woanders liegen. Die Karte springt sonst wild umher und holt
 * Kacheln für Orte, die nie gemeint waren.
 */
let chartTimer = null;
function paintChartSoon() {
  clearTimeout(chartTimer);
  chartTimer = setTimeout(() => chart?.paint(), 400);
}

/** Missweisung, Ablenkung und Geschwindigkeit aus den Einstellungen. */
function navOptions(s, fix) {
  return {
    variation: Number(String(s.variation).replace(',', '.')) || 0,
    deviation: Number(String(s.deviation).replace(',', '.')) || 0,
    speed: fix?.speed ?? (Number(String(s.manualSpeed).replace(',', '.')) || null),
    heading: fix?.heading ?? null,
  };
}

function draw() {
  if (!container) return;
  const s = settings.all();
  const fix = gps.fix;
  const opts = navOptions(s, fix);
  const nav = fix && state.target ? solve(fix, state.target, opts) : null;

  render(container,
    // Ganz oben und ohne Umweg: Wer die Seite aufschlägt, weil jemand über
    // Bord ist, darf nicht erst scrollen müssen.
    mobCard(fix),
    ownPosition(fix),
    targetInput(),
    // Eigener Container, damit sich das Ergebnis beim Tippen auffrischen lässt,
    // ohne die Eingabefelder neu zu bauen.
    h('div', { id: 'nav-result' }, nav ? result(nav, opts) : hintCard(fix)),
    // Eigener Container: Beim Tippen ändert sich, welcher Eintrag gerade das
    // Ziel ist – das muss mitziehen, ohne die Eingabefelder neu zu bauen.
    h('div', { id: 'wp-slot' }, waypointList(fix, opts)),
    navSettings(s),
  );

  // Erst nach dem Einhängen zeichnen: Vorher hat die Fläche keine Größe.
  if (state.resultView === 'karte') {
    // Beim Aufschlagen der Karte auf alle Punkte einpassen, damit die eigene
    // Position und das Ziel beide im Bild stehen. Danach nur noch neu zeichnen –
    // wer den Ausschnitt selbst gewählt hat, soll ihn behalten.
    if (fitChartNext) {
      fitChartNext = false;
      chart?.fit();
    } else {
      chart?.paint();
    }
  }
}

// --------------------------------------------------------- Mensch über Bord

/**
 * Die MOB-Taste steht allein und ganz oben.
 *
 * Sie ist die einzige Taste dieser App, bei der Sekunden zählen, und sie
 * gehört deshalb weder in eine Liste noch unter eine Überschrift. Die
 * gemerkte Position erscheint direkt darunter und bleibt dort – unter den
 * gemerkten Zielen taucht sie bewusst nicht noch einmal auf, sonst sucht man
 * im Ernstfall in zwei Listen.
 */
function mobCard(fix) {
  return h('div.card.mob-card',
    h('button.btn.danger.block.mob-btn', {
      type: 'button',
      disabled: !fix,
      onclick: () => markMob(fix),
    }, t('pos.mob')),

    !fix && h('p.small.muted', { style: { margin: '9px 0 0' } }, t('pos.mobNeedsFix')),

    h('div', { id: 'mob-slot' }, mobRow()),
  );
}

// ------------------------------------------------------- Eigene Position

function ownPosition(fix) {
  const status = gps.status;
  const stale = gps.isStale(60000);

  return h('div.card',
    h('div.row', { style: { 'margin-bottom': '10px' } },
      h('h2.grow', { style: { margin: 0 } }, t('pos.own')),
      h('button.btn.small', {
        type: 'button',
        onclick: () => { gps.start(); toast(t('gps.requested')); },
      }, '↻'),
    ),

    fix
      ? h('div',
        h('div.posline', formatLat(fix.lat), h('br'), formatLon(fix.lon)),
        stale && h('p.small', { style: { color: 'var(--warn)', margin: '7px 0 0' } }, t('pos.stale')),
        h('div.readout', { style: { 'margin-top': '12px' } },
          cell(t('pos.accuracy'), fix.accuracy ? `±${Math.round(fix.accuracy)}` : '–', 'm'),
          cell(t('pos.sog'), fix.speed === null ? '–' : num(fix.speed), 'kn'),
          cell(t('pos.cog'), fix.heading === null ? '–' : String(Math.round(fix.heading)).padStart(3, '0'), '°'),
        ),
        h('div.row.wrap', { style: { 'margin-top': '12px' } },
          h('button.btn.small.grow', {
            type: 'button',
            onclick: () => copy(formatPosition(fix), t('radio.copiedPosition')),
          }, t('pos.copyPos')),
          h('button.btn.small.grow', {
            type: 'button',
            onclick: () => copy(formatDecimal(fix), t('pos.copiedDec')),
          }, t('pos.copyDec')),
          h('button.btn.small.grow', {
            type: 'button',
            onclick: () => copy(
              formatSpoken(fix, settings.get('phraseLang') === 'en' ? 'en' : 'de'),
              t('pos.copiedSpoken'),
            ),
          }, t('pos.copySpoken')),
        ),
        // Ausgeschrieben zum Vorlesen – die Fassung, die im Funk gebraucht wird.
        h('button.btn.small.block', {
          type: 'button',
          style: { 'margin-top': '10px' },
          'aria-expanded': String(state.showSpoken),
          onclick: () => { state.showSpoken = !state.showSpoken; draw(); },
        }, state.showSpoken ? t('pos.spokenHide') : t('pos.spokenShow')),
        state.showSpoken && h('div.spoken-position', { style: { 'margin-top': '9px' } },
          formatSpoken(fix, settings.get('phraseLang') === 'en' ? 'en' : 'de')),

      )
      : h('div.empty',
        h('p', { style: { margin: '0 0 10px' } }, t(GPS_STATUS_KEY[status] ?? 'gps.none')),
        h('p.small', status === 'denied' ? t('gps.deniedHelp') : t('gps.searchHelp')),
        h('button.btn.primary', { type: 'button', onclick: () => gps.start() }, t('gps.start')),
      ),
  );
}

/** Alle MOB-Einträge, der jüngste zuerst. */
function mobList() {
  return waypoints.list()
    .filter((w) => w.kind === 'mob')
    .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

/** Die zuletzt gemerkte MOB-Position, falls es eine gibt. */
function lastMob() {
  return mobList()[0] ?? null;
}

/**
 * Es gibt genau eine MOB-Position, nie mehrere.
 *
 * Früher legte jeder Druck auf die Taste einen weiteren Eintrag an. Angezeigt
 * wurde ohnehin nur der jüngste, die übrigen lagen unsichtbar im Gerät und
 * standen auf der Karte als Geisterflaggen herum. Wer die Taste ein zweites
 * Mal drückt, meint die neue Stelle – nicht eine zweite Person über Bord.
 * Vorhandene Reste aus älteren Fassungen räumt das beim Aufschlagen der Seite
 * gleich mit weg.
 */
function pruneMobs() {
  mobList().slice(1).forEach((w) => waypoints.remove(w.id));
}

/** Liegt hier schon dieselbe Position? Auf Rechengenauigkeit verglichen. */
function samePlace(a, b) {
  return Boolean(a && b
    && Math.abs(a.lat - b.lat) < 1e-9
    && Math.abs(a.lon - b.lon) < 1e-9);
}

/** Anzeige der gemerkten MOB-Position mit Knopf zum Übernehmen als Ziel. */
function mobRow() {
  const mob = lastMob();
  if (!mob) return null;
  const isTarget = samePlace(state.target, mob);

  return h('div.mob-row',
    h('div.grow',
      h('div.mob-name', '⚑ ', mob.name),
      h('div.mob-pos.mono', formatPosition(mob, 3)),
    ),
    h('button.btn.small', {
      type: 'button',
      disabled: isTarget,
      title: t('pos.useAsTarget'),
      onclick: () => useWaypoint(mob),
    }, isTarget ? t('pos.isTarget') : t('pos.useAsTarget')),
    h('button.btn.small', {
      type: 'button',
      'aria-label': t('pos.mobDelete'),
      onclick: () => {
        if (!confirm(t('pos.mobConfirmDelete'))) return;
        waypoints.remove(mob.id);
        draw();
      },
    }, '✕'),
  );
}

function markMob(fix) {
  // Ersetzen, nicht anhängen: Es gibt eine MOB-Position, und das ist die
  // zuletzt gemerkte.
  mobList().forEach((old) => waypoints.remove(old.id));
  const wp = waypoints.add({
    name: `MOB ${new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`,
    lat: fix.lat,
    lon: fix.lon,
    kind: 'mob',
  });
  state.target = { lat: wp.lat, lon: wp.lon };
  state.parts = toParts(state.target);
  state.targetName = wp.name;
  state.error = null;
  toast(t('pos.mobSaved'));
  draw();
}

// ------------------------------------------------------------ Zieleingabe

function targetInput() {
  const p = state.parts;

  /**
   * Jedes Feld nimmt nur Ziffern. Grad, ganze Minuten und Nachkommastellen
   * stehen getrennt – so gibt es kein Komma zu treffen und eingefügte
   * Gradzeichen fallen weg, statt die Eingabe unbrauchbar zu machen.
   */
  const clean = (raw) => raw.replace(/\D/g, '');

  /** Ein Zahlenfeld – ruft die Zifferntastatur auf, sonst nichts. */
  const numField = (key, { max, label, hint, next }) => h('input.coord-input', {
    id: `coord-${key}`,
    value: p[key] ?? '',
    inputmode: 'decimal',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: false,
    maxlength: max,
    placeholder: hint,
    'aria-label': label,
    oninput: (e) => {
      const raw = e.target.value;
      const cleaned = clean(raw);
      if (cleaned !== raw) e.target.value = cleaned;
      state.parts = { ...state.parts, [key]: cleaned };
      applyParts({ redraw: false });
      // Ist das Feld voll, von selbst ins nächste springen. Ein getipptes
      // Komma oder Punkt tut dasselbe – so lässt sich „31,234“ am Stück
      // eintippen, obwohl es zwei Felder sind.
      const jump = cleaned.length >= max || /[.,]/.test(raw);
      if (next && jump) document.getElementById(next)?.focus();
    },
    onfocus: (e) => e.target.select(),
  });

  /** Himmelsrichtung als zwei große Schaltflächen. */
  const hemi = (key, a, b) => h('div.seg.coord-hemi',
    ...[a, b].map((code) => h('button', {
      type: 'button',
      'aria-pressed': String((p[key] ?? a) === code),
      onclick: () => {
        state.parts = { ...state.parts, [key]: code };
        applyParts();
      },
    }, code)),
  );

  const row = (label, degKey, minKey, decKey, hemiEl, degMax, degHint, minHint) => h('div.coord-row',
    h('span.coord-label', label),
    h('div.coord-fields',
      numField(degKey, {
        max: degMax,
        label: `${label} – ${t('pos.degrees')}`,
        hint: degHint,
        next: `coord-${minKey}`,
      }),
      h('span.coord-unit', '°'),
      numField(minKey, {
        max: 2,
        label: `${label} – ${t('pos.minutes')}`,
        hint: minHint,
        next: `coord-${decKey}`,
      }),
      h('span.coord-unit.comma', ','),
      // Eigenes Kästchen für die Nachkommastellen der Minuten.
      numField(decKey, { max: 3, label: `${label} – ${t('pos.decimals')}`, hint: '234' }),
      h('span.coord-unit', '′'),
    ),
    hemiEl,
  );

  return h('div.card',
    h('h2', t('pos.target')),
    h('p.small.muted', { style: { margin: '0 0 12px' } }, t('pos.targetHintSimple')),

    row(t('pos.latitude'), 'latDeg', 'latMin', 'latDec', hemi('latHemi', 'N', 'S'), 2, '54', '31'),
    row(t('pos.longitude'), 'lonDeg', 'lonMin', 'lonDec', hemi('lonHemi', 'E', 'W'), 3, '011', '22'),

    h('p.small.coord-error', {
      style: {
        color: 'var(--danger)', margin: '4px 0 0',
        display: state.error ? '' : 'none',
      },
    }, state.error ?? ''),
    h('p.coord-check.mono', {
      style: { display: state.target ? '' : 'none' },
    }, state.target ? `✓ ${formatPosition(state.target)}` : ''),

    // Eigener Container: Der Merken-Knopf hängt davon ab, ob die Eingabe
    // schon eine gültige Position ergibt – und das ändert sich beim Tippen.
    // Vorher wurde nur das Ergebnis darunter aufgefrischt, dieser Bereich
    // nicht: Der Knopf erschien nie, solange man nur tippte.
    h('div', { id: 'target-actions' }, targetActions()),
  );
}

/** Speichern und Leeren – wird beim Tippen mit aufgefrischt. */
function targetActions() {
  const p = state.parts;
  const etwasGetippt = Boolean(state.target || p.latDeg || p.lonDeg);

  return h('div', { style: { 'margin-top': '12px' } },
    // Eigene Zeile: Der Name bricht sonst um und der Knopf wird klobig.
    h('button.btn.primary.block', {
      type: 'button',
      disabled: !state.target,
      onclick: () => {
        // Die MOB-Position steht schon oben bei ihrer Taste. Sie ein zweites
        // Mal unter den gemerkten Zielen abzulegen hieße, im Ernstfall in zwei
        // Listen zu suchen – und genau das soll nicht passieren.
        if (samePlace(lastMob(), state.target)) { toast(t('pos.wpIsMob')); return; }
        const name = prompt(t('pos.wpNamePrompt'), state.targetName || t('pos.wpDefault'));
        if (name === null) return;
        waypoints.add({ ...state.target, name });
        toast(t('pos.wpSaved'));
        draw();
      },
    }, t('pos.saveTarget')),

    h('div.row.wrap', { style: { 'margin-top': '8px' } },
      // Aus einer Nachricht übernehmen: ein Knopf statt eines Aufklappfelds.
      // Im Notfall zählt jeder Griff, und die Zwischenablage hat den Text
      // ohnehin schon.
      h('button.btn.small.grow', {
        type: 'button',
        title: t('pos.pasteTitle'),
        onclick: pasteFromClipboard,
      }, t('common.paste')),

      etwasGetippt && h('button.btn.small.grow', {
        type: 'button',
        onclick: () => {
          state.parts = toParts(null);
          state.target = null;
          state.targetName = '';
          state.error = null;
          draw();
        },
      }, t('pos.clearTarget')),
    ),
  );
}

/**
 * Position aus der Zwischenablage übernehmen.
 *
 * Schreibweise egal – Gradzeichen, Hochkommata, Dezimalgrad. Genau das kommt
 * aus einer Nachricht oder einem mitgeschriebenen Notruf.
 */
async function pasteFromClipboard() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    // Manche Browser geben die Zwischenablage nicht ohne Weiteres her.
    text = prompt(t('pos.pasteHint'), '') ?? '';
  }
  if (!text.trim()) return;

  const parsed = parsePositionPair(text);
  if (!parsed) {
    state.error = t('pos.parseError');
    draw();
    return;
  }
  state.target = parsed;
  state.parts = toParts(parsed);
  state.targetName = '';
  state.error = null;
  toast(t('pos.pasteTaken'));
  draw();
}

/** Rechnet die Einzelfelder in eine Position um. */
function applyParts({ redraw = true } = {}) {
  const pos = fromParts(state.parts);
  const filled = String(state.parts.latDeg ?? '') !== '' && String(state.parts.lonDeg ?? '') !== '';
  state.target = pos;
  state.targetName = pos ? state.targetName : '';
  state.error = !pos && filled ? t('pos.partsError') : null;
  if (redraw) draw();
  else updateResultOnly();
}

/**
 * Beim Tippen nur das Ergebnis auffrischen, nicht die Eingabefelder – sonst
 * springt der Textcursor und die Tastatur klappt zu. Alles, was sich dabei
 * ändern kann, wird hier von Hand nachgezogen.
 */
function updateResultOnly() {
  if (!container) return;
  const s = settings.all();
  const fix = gps.fix;
  const opts = navOptions(s, fix);
  const nav = fix && state.target ? solve(fix, state.target, opts) : null;

  const slot = container.querySelector('#nav-result');
  if (slot) render(slot, nav ? result(nav, opts) : hintCard(fix));
  // Die Karte hängt wieder im Ergebnis – aber erst zeichnen, wenn das Tippen
  // zur Ruhe gekommen ist.
  if (state.resultView === 'karte') paintChartSoon();

  const check = container.querySelector('.coord-check');
  if (check) {
    check.textContent = state.target ? `✓ ${formatPosition(state.target)}` : '';
    check.style.display = state.target ? '' : 'none';
  }

  const error = container.querySelector('.coord-error');
  if (error) {
    error.textContent = state.error ?? '';
    error.style.display = state.error ? '' : 'none';
  }

  // Die MOB-Zeile und die gemerkten Ziele zeigen an, welcher Eintrag gerade
  // das Ziel ist. Das ändert sich beim Tippen mit und muss mitziehen – sonst
  // steht dort „Ist Ziel“ an einem Eintrag, der es längst nicht mehr ist.
  const mobSlot = container.querySelector('#mob-slot');
  if (mobSlot) render(mobSlot, mobRow());

  const wpSlot = container.querySelector('#wp-slot');
  if (wpSlot) render(wpSlot, waypointList(fix, opts));

  // Der Merken-Knopf wird erst brauchbar, wenn die Eingabe eine gültige
  // Position ergibt. Ohne diese Zeile erschien er beim Tippen nie.
  const actions = container.querySelector('#target-actions');
  if (actions) render(actions, targetActions());
}

// ----------------------------------------------------------- Rechenergebnis

function result(nav, opts) {
  const { distance, bearing, courses, reciprocal, eta, relative } = nav;
  const hasVar = opts.variation !== 0;
  const hasHeading = opts.heading !== null && opts.heading !== undefined;
  const courseUp = Boolean(settings.get('compassCourseUp'));

  return h('div.card',
    h('h2', state.targetName ? t('pos.toNamed', { name: state.targetName }) : t('pos.toTarget')),

    h('div.readout',
      heroCell(t('pos.distance'), num(distance, distance < 10 ? 2 : 1), 'sm', metres(distance)),
      heroCell(t('pos.trueCourse'), deg3(bearing), '°', t('pos.trueCourseSub')),
    ),

    // Kompass oder Karte an derselben Stelle. Der Kompass sagt, wohin; die
    // Karte, wo das im Verhältnis zum Übrigen liegt. Beides braucht denselben
    // Platz, also teilen sie ihn sich statt untereinander zu stehen.
    h('div.seg', { style: { margin: '14px 0 10px' } },
      h('button', {
        type: 'button',
        'data-view': 'kompass',
        'aria-pressed': String(state.resultView !== 'karte'),
        onclick: () => { state.resultView = 'kompass'; draw(); },
      }, t('pos.viewCompass')),
      h('button', {
        type: 'button',
        'data-view': 'karte',
        'aria-pressed': String(state.resultView === 'karte'),
        onclick: () => {
          // Beim Wechsel einmal einpassen: Wer auf die Karte schaltet, will
          // sehen, wo er ist und wo das Ziel liegt – beides zugleich.
          if (state.resultView !== 'karte') fitChartNext = true;
          state.resultView = 'karte';
          draw();
        },
      }, t('pos.viewChart')),
    ),

    state.resultView === 'karte' ? chartBlock() : [
      compassRose(bearing, opts.heading, relative),

      // Nordorientiert oder mitdrehend – auf einem krängenden Schiff ist die
      // mitdrehende Ansicht leichter zu lesen, weil oben immer voraus ist.
      //
      // Beide Schaltflächen bleiben bedienbar, auch ohne Kurs über Grund. Ein
      // Schalter, der bei jedem Stillstand ausgraut, ist genau dann nicht da,
      // wenn man ihn umlegen will – und die Rose weiß sich zu behelfen: Ohne
      // Fahrt nimmt sie Nord an.
      h('div.seg', { style: { 'margin-top': '10px' } },
        h('button', {
          type: 'button',
          'aria-pressed': String(!courseUp),
          onclick: () => { settings.set('compassCourseUp', false); draw(); },
        }, t('pos.northUp')),
        h('button', {
          type: 'button',
          'aria-pressed': String(courseUp),
          onclick: () => { settings.set('compassCourseUp', true); draw(); },
        }, t('pos.courseUp')),
      ),
      courseUp && !hasHeading
        && h('p.small.muted', { style: { margin: '7px 0 0' } }, t('pos.courseUpNorth')),
    ],

    // Immer dieselben Kästchen, immer gleich groß.
    //
    // Ob ein Kurs über Grund anliegt und ob eine Geschwindigkeit bekannt ist,
    // wechselt unterwegs ständig – im Hafen, in der Flaute, beim Aufschießen.
    // Kämen und gingen die Kästchen damit, sprängen bei jedem Fix alle
    // übrigen um und man läse jedes Mal an einer anderen Stelle. Also stehen
    // sie fest und zeigen „–“, solange die Angabe fehlt.
    h('div.readout.readout-fest', { style: { 'margin-top': '12px' } },
      cell(t('pos.magnetic'), deg3(courses.magnetic), '°',
        t('pos.magneticSub', { v: fmtSigned(opts.variation) })),
      cell(t('pos.compass'), deg3(courses.compass), '°',
        t('pos.compassSub', { v: fmtSigned(opts.deviation) })),
      cell(t('pos.reciprocal'), deg3(reciprocal), '°', t('pos.reciprocalSub')),
      cell(t('pos.eta'), formatDuration(eta), null,
        opts.speed ? t('pos.etaAt', { v: num(opts.speed) }) : t('pos.etaNoSpeed')),
      cell(t('pos.relative'), relative ? relativeText(relative) : '–', null,
        relative ? t('pos.relativeSub') : t('pos.relativeNone')),
      cell(
        t('pos.arrival'),
        eta
          ? new Date(Date.now() + eta * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
          : '–',
        eta ? t('pos.clock') : null,
        t('pos.arrivalSub'),
      ),
    ),

    !hasVar && h('p.small.muted', { style: { margin: '11px 0 0' } }, t('pos.noVariation')),

    h('button.btn.block', {
      type: 'button',
      style: { 'margin-top': '12px' },
      onclick: () => copy(summary(nav, opts), t('pos.copiedResult')),
    }, t('pos.copyResult')),
  );
}

const deg3 = (v) => String(Math.round(v) % 360).padStart(3, '0');

/** „40° an Steuerbord“ bzw. „40° to starboard“. */
function relativeText(rel) {
  if (rel.side === 'ahead') return t('pos.ahead');
  if (rel.side === 'astern') return t('pos.astern');
  return t('pos.relFmt', { deg: rel.deg, side: t(`pos.${rel.side}`) });
}

function summary(nav, opts) {
  const lines = [
    `${t('pos.sumTarget')}: ${formatPosition(state.target)}`,
    `${t('pos.sumDistance')}: ${num(nav.distance, 2)} sm`,
    `${t('pos.sumTrue')}: ${Math.round(nav.bearing)}°`,
  ];
  if (opts.variation) lines.push(`${t('pos.sumMagnetic')}: ${Math.round(nav.courses.magnetic)}°`);
  if (opts.deviation) lines.push(`${t('pos.sumCompass')}: ${Math.round(nav.courses.compass)}°`);
  if (nav.eta) lines.push(`${t('pos.sumEta')}: ${formatDuration(nav.eta)}`);
  return lines.join('\n');
}

function metres(nm) {
  const m = nm * 1852;
  if (m < 1000) return `${Math.round(m)} m`;
  return `${num(m / 1000)} km`;
}

function fmtSigned(v) {
  if (!v) return '0°';
  const value = num(Math.abs(v), Number.isInteger(v) ? 0 : 1);
  return `${value}° ${v > 0 ? t('pos.east') : t('pos.west')}`;
}

function cell(label, value, unit, sub) {
  return h('div.cell',
    h('div.label', label),
    h(`div.value${fit(value)}`, value, unit && h('span.unit', unit)),
    sub && h('div.sub', sub),
  );
}

/** Die beiden großen Kacheln oben: Entfernung und rechtweisender Kurs. */
function heroCell(label, value, unit, sub) {
  return h('div.cell.hero',
    h('div.label', label),
    h(`div.value${fit(value)}`, value, unit && h('span.unit', unit)),
    sub && h('div.sub', sub),
  );
}

// -------------------------------------------------------------- Kompassrose

function compassRose(bearing, heading, relative) {
  const C = 100;
  const R = 86;
  const hasHeading = heading !== null && heading !== undefined;
  // Mitdrehend: Die Rose wird um den eigenen Kurs zurückgedreht, damit oben
  // immer die eigene Fahrtrichtung liegt.
  //
  // Liegt kein Kurs über Grund an – im Hafen, in der Flaute, beim Aufschießen –,
  // wird Nord angenommen. Das ist die einzige Annahme, die stimmt, solange man
  // steht: Ein Schiff ohne Fahrt hat keine Fahrtrichtung, und die Rose in die
  // zuletzt bekannte zu drehen wäre eine Behauptung. Vor allem aber bleibt die
  // Einstellung dadurch erhalten, statt bei jedem Stillstand umzuspringen.
  const courseUp = Boolean(settings.get('compassCourseUp'));
  const turn = courseUp ? -(hasHeading ? heading : 0) : 0;

  const el = svg('svg.compass', {
    viewBox: '0 0 200 200',
    role: 'img',
    'aria-label': `${t('pos.trueCourse')} ${Math.round(bearing)}°`,
  });

  el.appendChild(svg('circle', { class: 'ring', cx: C, cy: C, r: R }));

  // Alles, was sich mitdreht, kommt in eine gemeinsame Gruppe.
  const rose = svg('g', { transform: `rotate(${turn} ${C} ${C})` });
  el.appendChild(rose);

  for (let a = 0; a < 360; a += 10) {
    const major = a % 30 === 0;
    const rad = (a - 90) * Math.PI / 180;
    const r1 = R - (major ? 12 : 6);
    rose.appendChild(svg('line', {
      class: major ? 'tick major' : 'tick',
      x1: C + r1 * Math.cos(rad), y1: C + r1 * Math.sin(rad),
      x2: C + R * Math.cos(rad), y2: C + R * Math.sin(rad),
    }));
  }

  // Im Deutschen heißt der Osten „O“, im Englischen „E“.
  const east = uiLang() === 'en' ? 'E' : 'O';
  [['N', 0], [east, 90], ['S', 180], ['W', 270]].forEach(([label, a]) => {
    const rad = (a - 90) * Math.PI / 180;
    const x = C + (R - 24) * Math.cos(rad);
    const y = C + (R - 24) * Math.sin(rad) + 3;
    rose.appendChild(svg('text', {
      class: 'card-label',
      x, y,
      'text-anchor': 'middle',
      // Die Beschriftung soll lesbar bleiben, also wieder zurückdrehen.
      transform: turn ? `rotate(${-turn} ${x} ${y - 3})` : null,
    }, label));
  });

  // Eigener Kurs: nordorientiert als gestrichelte Linie, mitdrehend liegt er
  // fest oben und wird als Bugsymbol gezeichnet.
  if (hasHeading && !courseUp) {
    const rad = (heading - 90) * Math.PI / 180;
    el.appendChild(svg('line', {
      class: 'heading',
      x1: C, y1: C,
      x2: C + (R - 16) * Math.cos(rad),
      y2: C + (R - 16) * Math.sin(rad),
    }));
  }
  if (courseUp) {
    el.appendChild(svg('polygon', { class: 'own-ship', points: '100,44 94,60 106,60' }));
    el.appendChild(svg('line', { class: 'heading', x1: C, y1: 60, x2: C, y2: C }));
  }

  // Zeiger zum Ziel – mitdrehend zeigt er die Seitenpeilung.
  el.appendChild(svg('polygon', {
    class: 'needle',
    points: '100,10 91,34 100,29 109,34',
    transform: `rotate(${norm360(bearing + turn)} ${C} ${C})`,
  }));

  el.appendChild(svg('text', {
    class: 'center-text', x: C, y: C + 4, 'font-size': '30',
  }, `${deg3(bearing)}°`));
  el.appendChild(svg('text', { class: 'center-sub', x: C, y: C + 20 },
    courseUp
      ? (hasHeading ? t('pos.courseUpShort') : t('pos.courseUpShortNorth'))
      : t('pos.compassTrue')));

  if (relative) {
    el.appendChild(svg('text', { class: 'center-sub', x: C, y: C + 36 }, relativeText(relative)));
  }

  return h('div', { style: { 'margin-top': '14px' } }, el);
}

// ---------------------------------------------------------------- Wegpunkte

function waypointList(fix, opts) {
  // Die MOB-Position steht oben bei ihrer Taste und nirgends sonst.
  const list = waypoints.list().filter((wp) => wp.kind !== 'mob');
  if (!list.length) return null;

  return h('div.card',
    h('div.row', { style: { 'margin-bottom': '4px' } },
      h('h2.grow', { style: { margin: 0 } }, t('pos.saved')),
      h('button.btn.small', {
        type: 'button',
        onclick: () => {
          if (!confirm(t('pos.confirmClear'))) return;
          // Nur die Ziele – die gemerkte MOB-Position bleibt, die hat mit
          // dieser Liste nichts zu tun.
          list.forEach((wp) => waypoints.remove(wp.id));
          draw();
        },
      }, t('common.deleteAll')),
    ),
    ...list.map((wp) => {
      const nav = fix ? solve(fix, wp, opts) : null;
      const isTarget = samePlace(state.target, wp);
      return h('div.wp-item',
        h('div.grow',
          h('div.wp-name', wp.name),
          h('div.wp-pos', formatPosition(wp, 2)),
        ),
        nav && h('div.wp-dist',
          `${num(nav.distance, nav.distance < 10 ? 2 : 1)} sm`,
          h('small', `${deg3(nav.bearing)}°`),
        ),
        // Ein Klick genügt, um die gemerkte Position wieder als Ziel zu setzen.
        h('button.btn.small', {
          type: 'button',
          disabled: isTarget,
          onclick: () => useWaypoint(wp),
        }, isTarget ? t('pos.isTarget') : t('pos.useAsTarget')),
        h('button.btn.small', {
          type: 'button',
          'aria-label': `${wp.name} – ${t('common.delete')}`,
          onclick: () => { waypoints.remove(wp.id); draw(); },
        }, '✕'),
      );
    }),
  );
}

function useWaypoint(wp) {
  state.target = { lat: wp.lat, lon: wp.lon };
  state.parts = toParts(state.target);
  state.targetName = wp.name;
  state.error = null;
  toast(t('pos.targetSet', { name: wp.name }));
  draw();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ------------------------------------------------------- Navigationsangaben

function navSettings(s) {
  const numField = (key, label, hint, placeholder) => h('label.field',
    h('span', label),
    h('input.mono', {
      value: s[key] ?? '',
      inputmode: 'decimal',
      placeholder,
      onchange: (e) => { settings.set(key, e.target.value.trim()); draw(); },
    }),
    h('span.hint', hint),
  );

  return h('details.foldout',
    h('summary', t('pos.navSettings')),
    h('div',
      numField('variation', t('pos.variation'), t('pos.variationHint'), '3'),
      numField('deviation', t('pos.deviation'), t('pos.deviationHint'), '-1'),
      numField('manualSpeed', t('pos.manualSpeed'), t('pos.manualSpeedHint'), '5,5'),
      h('p.small.muted', { style: { margin: 0 } }, t('pos.chainHint')),
    ),
  );
}

function hintCard(fix) {
  return h('div.card',
    h('div.empty',
      h('p', { style: { margin: 0 } }, fix ? t('pos.hintWithFix') : t('pos.hintNoFix')),
    ),
  );
}

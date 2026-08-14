/**
 * Modul „Logbuch“ – Törns, Einträge, Ereignisse, Wetter, Spur.
 *
 * Die Spur wird ohne jedes Kartenmaterial gezeichnet: eigene Positionen,
 * Linien dazwischen, Nordpfeil und Maßstabsbalken. Das läuft überall auf der
 * Welt, braucht keinen Speicherplatz für Kacheln und täuscht vor allem keine
 * Tiefenangaben vor, die es nicht gibt.
 *
 * Zwei Dinge bestimmen den Aufbau. Erstens: Was man unterwegs braucht, steht
 * oben und geht mit einem Griff – die Ereignisse als Reihe von Tasten, nicht
 * als Textfeld. Zweitens: Was man an Land braucht – Ausgabe, Sicherung,
 * Törnverwaltung – steht unten und darf ruhig ein paar Griffe kosten.
 */

import { h, svg, render, toast, fit } from '../lib/dom.js';
import { gps } from '../lib/gps.js';
import { settings } from '../lib/storage.js';
import { t, locale, num } from '../lib/i18n.js';
import { formatPosition, formatDuration, formatLat, formatLon } from '../lib/geo.js';
import { shareFile, downloadFile, stamped } from '../lib/share.js';
import { buildMilesPdf } from '../lib/miles.js';
import { ROLES, QUALIFICATIONS, OTHER } from '../data/milesfields.js';
import {
  logbook, trackDistance, projectTrack, niceScaleStep, dailyRuns, stats,
  toGpx, toCsv, LOG_INTERVALS, LOG_EVENTS, WIND_DIRECTIONS, VISIBILITY_STEPS,
} from '../lib/logbook.js';

let container = null;
let noteDraft = '';
/**
 * Was gerade gezeigt wird.
 *
 * `{}` heißt alles, `{ tripId }` ein ganzer Törn, `{ turnId }` eine einzelne
 * Etappe. Danach richten sich Liste, Spur, Kennzahlen und Ausgabe – wer eine
 * Etappe anschaut, will auch ihre Zahlen und ihr GPX, nicht die der ganzen
 * Saison.
 */
let scope = {};
let showWeather = false;
/**
 * Die Angaben für die Meilenbestätigung.
 *
 * Sie stehen im Modul und nicht im Speicher: Eine Bestätigung wird für
 * jemanden ausgestellt, und wessen Name da zuletzt stand, geht die nächste
 * nichts an.
 */
const miles = {
  person: '', area: '', skipper: '', place: '', notes: '', detail: false,
  // Funktion und Befähigung kommen aus einer Liste; „other“ macht daneben ein
  // Textfeld auf, in dem der freie Wert steht.
  role: '', roleOther: '',
  qualification: '', qualificationOther: '',
};

export function view(root) {
  container = h('div');
  render(root, container);
  // Beim Aufschlagen das Engste zeigen, was gerade läuft: die Etappe, sonst
  // den Törn, sonst alles.
  const turn = logbook.currentTurn();
  const trip = logbook.currentTrip();
  scope = turn ? { turnId: turn.id } : (trip ? { tripId: trip.id } : {});
  draw();
  const offLog = logbook.onChange(() => draw());
  const offGps = gps.onUpdate(() => draw());
  return () => { offLog(); offGps(); container = null; };
}

/** Die Einträge, die gerade gezeigt werden – neueste zuerst. */
function selection() {
  const all = logbook.entries();
  if (scope.turnId) return all.filter((e) => e.turnId === scope.turnId);
  if (scope.tripId) return all.filter((e) => e.tripId === scope.tripId);
  return all;
}

/** Wie heißt der gewählte Ausschnitt? Für Überschrift und Dateiname. */
function scopeName() {
  if (scope.turnId) {
    const turn = logbook.turn(scope.turnId);
    return turn?.name || t('log.turnUnnamed');
  }
  if (scope.tripId) {
    const trip = logbook.trip(scope.tripId);
    return trip?.name || t('log.tripUnnamed');
  }
  return '';
}

function draw() {
  if (!container) return;
  const entries = selection();
  const track = [...entries].sort((a, b) => a.ts - b.ts);
  render(container,
    tripCard(),
    recorderCard(),
    track.length > 0 && trackCard(track),
    entriesCard(entries),
    outputCard(track),
  );
}

// -------------------------------------------------------------------- Törn

/**
 * Der laufende Törn.
 *
 * Ohne diese Klammer ist ein Logbuch ein endloser Strom, in dem die Fahrt von
 * letztem Juni und die von heute Morgen dieselbe Spur bilden. Mit ihr gehört
 * jeder Eintrag zu einer Reise, und Strecke, Etmal und Ausgabe beziehen sich
 * auf das, was man gerade fährt.
 */
function tripCard() {
  const trip = logbook.currentTrip();
  const turn = logbook.currentTurn();
  const trips = logbook.trips();

  return h('div.card',
    h('div.row', { style: { 'margin-bottom': '10px' } },
      h('h2.grow', { style: { margin: 0 } }, t('log.trip')),
      trip
        ? h('button.btn.small', { type: 'button', onclick: endTrip }, t('log.tripEnd'))
        : h('button.btn.small.primary', { type: 'button', onclick: startTrip }, t('log.tripStart')),
    ),

    trip
      ? h('div',
        h('div.trip-name', trip.name || t('log.tripUnnamed')),
        h('div.small.muted',
          [trip.from, t('log.tripSince', { v: whenShort(trip.startTs) })]
            .filter(Boolean).join(' · ')),
      )
      : h('p.small.muted', { style: { margin: 0 } }, t('log.tripNone')),

    // Die Etappe darunter: ein Schlag von hier nach dort, meist ein Tag. Sie
    // darf auch ohne Törn stehen – wer nur einen Tagesschlag mitschreibt,
    // soll dafür nicht erst eine Reise anlegen müssen.
    h('div.turn-row', { style: { 'margin-top': '12px' } },
      h('div.grow',
        h('div.small.muted', t('log.turn')),
        turn
          ? h('div', { style: { 'font-weight': '650' } },
            turn.name || t('log.turnUnnamed'),
            h('span.small.muted', { style: { 'margin-left': '7px' } },
              t('log.tripSince', { v: whenShort(turn.startTs) })))
          : h('div.small.muted', t('log.turnNone')),
      ),
      turn
        ? h('button.btn.small', { type: 'button', onclick: endTurn }, t('log.turnEnd'))
        : h('button.btn.small', { type: 'button', onclick: startTurn }, t('log.turnStart')),
    ),

    // Umschalten, worauf sich Liste, Spur, Kennzahlen und Ausgabe beziehen.
    h('div.filter-chips', { style: { 'margin-top': '12px' }, 'data-scope': 'wahl' },
      h('button.chip', {
        type: 'button',
        'data-scope': 'alles',
        'aria-pressed': String(!scope.tripId && !scope.turnId),
        onclick: () => { scope = {}; draw(); },
      }, t('log.tripAll')),
      ...trips.flatMap((r) => [
        h('button.chip', {
          type: 'button',
          'aria-pressed': String(scope.tripId === r.id),
          onclick: () => { scope = { tripId: r.id }; draw(); },
        }, r.name || whenShort(r.startTs)),
        // Die Etappen eines Törns direkt darunter, eingerückt – sonst weiß
        // niemand, wozu sie gehören.
        ...logbook.turns(r.id).map((et) => h('button.chip.chip-sub', {
          type: 'button',
          'aria-pressed': String(scope.turnId === et.id),
          onclick: () => { scope = { turnId: et.id }; draw(); },
        }, `↳ ${et.name || whenShort(et.startTs)}`)),
      ]),
      // Etappen ohne Törn stehen für sich.
      ...logbook.turns(null).map((et) => h('button.chip.chip-sub', {
        type: 'button',
        'aria-pressed': String(scope.turnId === et.id),
        onclick: () => { scope = { turnId: et.id }; draw(); },
      }, `↳ ${et.name || whenShort(et.startTs)}`)),
    ),

    trips.length > 0 && h('details.foldout', { style: { 'margin-top': '12px', 'margin-bottom': 0 } },
      h('summary', t('log.tripList', { v: trips.length })),
      h('div',
        ...trips.map((r) => h('div',
          verwaltungsZeile(r, false),
          ...logbook.turns(r.id).map((et) => h('div', { style: { 'padding-left': '18px' } },
            verwaltungsZeile(et, true))),
        )),
        ...logbook.turns(null).map((et) => verwaltungsZeile(et, true)),
      ),
    ),
  );
}

/** Eine Zeile zum Umbenennen und Wegwerfen – für Törns wie für Etappen. */
function verwaltungsZeile(eintrag, istEtappe) {
  const name = eintrag.name || t(istEtappe ? 'log.turnUnnamed' : 'log.tripUnnamed');
  const umbenennen = t(istEtappe ? 'log.turnRename' : 'log.tripRename');
  const nachfrage = t(istEtappe ? 'log.turnConfirmDelete' : 'log.tripConfirmDelete');

  return h('div.wp-item',
    h('div.grow',
      h('div.wp-name', name),
      h('div.small.muted',
        [eintrag.from, eintrag.to].filter(Boolean).join(' → ')
        || t('log.tripSpan', {
          a: whenShort(eintrag.startTs),
          b: eintrag.endTs ? whenShort(eintrag.endTs) : t('log.tripOpen'),
        })),
    ),
    h('button.btn.small', {
      type: 'button',
      'aria-label': `${name} – ${umbenennen}`,
      onclick: () => {
        const neuerName = prompt(umbenennen, eintrag.name ?? '');
        if (neuerName === null) return;
        if (istEtappe) logbook.updateTurn(eintrag.id, { name: neuerName.trim() });
        else logbook.updateTrip(eintrag.id, { name: neuerName.trim() });
        draw();
      },
    }, '✎'),
    h('button.btn.small', {
      type: 'button',
      'aria-label': `${name} – ${t('common.delete')}`,
      onclick: () => {
        if (!confirm(nachfrage)) return;
        if (istEtappe) logbook.removeTurn(eintrag.id);
        else logbook.removeTrip(eintrag.id);
        if (scope.tripId === eintrag.id || scope.turnId === eintrag.id) scope = {};
        draw();
      },
    }, '✕'),
  );
}

function startTrip() {
  const name = prompt(t('log.tripNamePrompt'), '');
  if (name === null) return;
  const from = prompt(t('log.tripFromPrompt'), '') ?? '';
  const trip = logbook.startTrip({ name, from });
  scope = { tripId: trip.id };
  // Der Anfang einer Reise gehört ins Logbuch, nicht nur in die Verwaltung.
  logbook.add({ kind: 'manual', event: 'depart', note: from.trim() });
  toast(t('log.tripStarted'));
  draw();
}

function endTrip() {
  const to = prompt(t('log.tripToPrompt'), '');
  if (to === null) return;
  logbook.add({ kind: 'manual', event: 'arrive', note: to.trim() });
  logbook.endTrip({ to });
  toast(t('log.tripEnded'));
  draw();
}

function startTurn() {
  const name = prompt(t('log.turnNamePrompt'), '');
  if (name === null) return;
  const from = prompt(t('log.tripFromPrompt'), '') ?? '';
  const turn = logbook.startTurn({ name, from });
  scope = { turnId: turn.id };
  logbook.add({ kind: 'manual', event: 'depart', note: from.trim() });
  toast(t('log.turnStarted'));
  draw();
}

function endTurn() {
  const to = prompt(t('log.tripToPrompt'), '');
  if (to === null) return;
  logbook.add({ kind: 'manual', event: 'arrive', note: to.trim() });
  logbook.endTurn({ to });
  toast(t('log.turnEnded'));
  draw();
}

const whenShort = (ts) => new Date(ts).toLocaleDateString(locale(), {
  day: '2-digit', month: '2-digit', year: '2-digit',
});

// ------------------------------------------------------------ Mitschreiben

function recorderCard() {
  const fix = gps.fix;
  const minutes = logbook.intervalMinutes();

  const noteField = h('input', {
    value: noteDraft,
    placeholder: t('log.notePlaceholder'),
    'aria-label': t('log.note'),
    oninput: (e) => { noteDraft = e.target.value; },
  });

  return h('div.card',
    h('h2', t('log.title')),

    !fix && h('div.notice.warn', { style: { margin: '0 0 12px' } }, t('log.noFix')),

    // Die Ereignisse zuerst und als Tasten: Wer bei Welle das Ablegen notieren
    // will, tippt keinen Satz.
    h('div.event-grid',
      ...LOG_EVENTS
        // Notruf und MOB trägt die App selbst ein, wenn es so weit ist –
        // von Hand sind sie hier fehl am Platz.
        .filter((ev) => ev.key !== 'mob' && ev.key !== 'distress')
        .map((ev) => h('button.btn.small.event-btn', {
          type: 'button',
          disabled: !fix,
          onclick: () => addEntry({ event: ev.key }),
        }, h('span.event-sym', ev.sym), h('span', t(`log.ev.${ev.key}`)))),
    ),

    h('label.field', { style: { 'margin-top': '14px' } },
      h('span', t('log.note')),
      noteField,
      h('span.hint', t('log.noteHint')),
    ),

    h('button.btn.primary.block', {
      type: 'button',
      disabled: !fix,
      style: { 'min-height': '58px', 'font-size': '1.05rem' },
      onclick: () => addEntry({}),
    }, t('log.addManual')),

    weatherFold(),

    // Automatischer Takt
    h('label.field', { style: { 'margin-top': '16px', 'margin-bottom': 0 } },
      h('span', t('log.interval')),
      h('div.filter-chips',
        ...LOG_INTERVALS.map((value) => h('button.chip', {
          type: 'button',
          'aria-pressed': String(minutes === value),
          onclick: () => { logbook.setInterval(value); draw(); },
        }, value === 0 ? t('log.intervalOff') : intervalLabel(value))),
      ),
      h('span.hint', minutes ? t('log.autoOn', { v: intervalLabel(minutes) }) : t('log.autoOff')),
    ),

    // Zwei Schalter, die aus dem Takt eine brauchbare Spur machen.
    h('div.filter-chips', { style: { 'margin-top': '10px' } },
      h('button.chip', {
        type: 'button',
        'aria-pressed': String(logbook.onlyMoving()),
        title: t('log.onlyMovingHint'),
        onclick: () => { logbook.setOnlyMoving(!logbook.onlyMoving()); draw(); },
      }, t('log.onlyMoving')),
      h('button.chip', {
        type: 'button',
        'aria-pressed': String(logbook.onCourseChange()),
        title: t('log.onChangeHint'),
        onclick: () => { logbook.setOnCourseChange(!logbook.onCourseChange()); draw(); },
      }, t('log.onChange')),
    ),
    h('p.small.muted', { style: { margin: '8px 0 0' } },
      logbook.onlyMoving() ? t('log.onlyMovingHint') : t('log.onlyMovingOff')),

    (minutes > 0 || logbook.onCourseChange())
      && h('p.small.muted', { style: { margin: '8px 0 0' } }, t('log.autoLimit')),
  );
}

function addEntry({ event = null }) {
  const entry = logbook.add({ note: noteDraft, kind: 'manual', event });
  if (!entry) {
    toast(t('log.noFix'));
    return;
  }
  noteDraft = '';
  toast(event ? t('log.addedEvent', { v: t(`log.ev.${event}`) }) : t('log.added'));
  draw();
}

function intervalLabel(minutes) {
  return minutes >= 60
    ? t('log.hours', { v: minutes / 60 })
    : t('log.minutes', { v: minutes });
}

// ------------------------------------------------------------------ Wetter

/**
 * Der Wetterstand.
 *
 * Aufgeklappt, weil er selten geändert wird und sonst die halbe Seite füllt.
 * Alles zum Antippen statt zum Tippen; was hier steht, wird auf jeden
 * folgenden Eintrag übernommen, bis es jemand ändert – Windstärke alle zwanzig
 * Minuten neu einzugeben tut auf See niemand.
 */
function weatherFold() {
  const w = logbook.weather();
  const gesetzt = Object.values(w).some((v) => v !== null && v !== '');

  const chips = (label, werte, key, beschriften = String) => h('label.field',
    h('span', label),
    // Eine Kennung je Gruppe: „4“ heißt bei der Windstärke etwas anderes als
    // beim Seegang, und von außen sind die Schaltflächen sonst nicht zu
    // unterscheiden.
    h('div.filter-chips', { 'data-weather': key },
      ...werte.map((value) => h('button.chip', {
        type: 'button',
        'aria-pressed': String(w[key] === value),
        onclick: () => {
          // Nochmal drücken hebt auf – sonst wird man eine falsche Angabe
          // nie wieder los.
          logbook.setWeather({ [key]: w[key] === value ? null : value });
          draw();
        },
      }, beschriften(value))),
    ),
  );

  const zahl = (label, key, hint, einheit) => h('label.field',
    h('span', label),
    h('input.mono', {
      value: w[key] ?? '',
      inputmode: 'decimal',
      placeholder: hint,
      onchange: (e) => {
        const raw = e.target.value.trim().replace(',', '.');
        logbook.setWeather({ [key]: raw === '' ? null : Number(raw) });
        draw();
      },
    }),
    h('span.hint', einheit),
  );

  return h('details.foldout', {
    open: showWeather,
    style: { 'margin-top': '14px' },
    ontoggle: (e) => { showWeather = e.target.open; },
  },
  h('summary', gesetzt ? t('log.weatherSet', { v: weatherShort(w) }) : t('log.weather')),
  h('div',
    h('p.small.muted', { style: { 'margin-top': 0 } }, t('log.weatherHint')),
    chips(t('log.windDir'), WIND_DIRECTIONS, 'windDir'),
    chips(t('log.windForce'), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'windForce'),
    chips(t('log.sea'), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'sea'),
    chips(t('log.vis'), VISIBILITY_STEPS, 'vis', (v) => t(`log.vis.${v}`)),
    chips(t('log.clouds'), [0, 1, 2, 3, 4, 5, 6, 7, 8], 'clouds'),
    zahl(t('log.pressure'), 'pressure', '1013', 'hPa'),
    zahl(t('log.temp'), 'temp', '18', '°C'),
    gesetzt && h('button.btn.small.block', {
      type: 'button',
      style: { 'margin-top': '6px' },
      onclick: () => {
        logbook.setWeather({
          windDir: null, windForce: null, sea: null, vis: null,
          clouds: null, pressure: null, temp: null,
        });
        draw();
      },
    }, t('log.weatherClear')),
  ));
}

/** Der Wetterstand in einer Zeile – „SW 4 · See 3 · 1013 hPa“. */
function weatherShort(w) {
  if (!w) return '';
  return [
    w.windDir && `${w.windDir} ${w.windForce ?? ''}`.trim(),
    w.sea !== null && w.sea !== undefined ? t('log.seaShort', { v: w.sea }) : null,
    w.vis ? t(`log.vis.${w.vis}`) : null,
    w.clouds !== null && w.clouds !== undefined ? t('log.cloudsShort', { v: w.clouds }) : null,
    w.pressure ? `${num(w.pressure, 0)} hPa` : null,
    w.temp !== null && w.temp !== undefined && w.temp !== '' ? `${num(w.temp, 0)} °C` : null,
  ].filter(Boolean).join(' · ');
}

// ------------------------------------------------------------------- Spur

function trackCard(track) {
  const k = stats(track);
  const etmale = dailyRuns(track);
  const name = scopeName();

  return h('div.card',
    h('div.row', { style: { 'margin-bottom': '10px' } },
      h('h2.grow', { style: { margin: 0 } }, t('log.track')),
      // Woraufhin gerechnet wird, muss dabeistehen – sonst weiß man nicht,
      // ob 312 Seemeilen die Etappe oder die Saison sind.
      name && h('span.rule', name),
    ),

    trackPlot(track),

    // Immer dieselben Kästchen, immer gleich groß – wie im Ergebnis auf der
    // Positionsseite. Was fehlt, steht als Strich da.
    h('div.readout.readout-fest', { style: { 'margin-top': '12px' } },
      cell(t('log.distance'), num(k.distance, k.distance < 10 ? 2 : 1), 'sm', t('log.distanceSub')),
      cell(t('log.duration'), formatDuration(k.seconds), null, t('log.durationSub')),
      cell(t('log.speedOverGround'),
        k.avgOverGround === null ? '–' : num(k.avgOverGround), 'kn', t('log.speedOverGroundSub')),
      cell(t('log.speedAvg'), k.avgSog === null ? '–' : num(k.avgSog), 'kn', t('log.speedAvgSub')),
      cell(t('log.speedMax'), k.maxSog === null ? '–' : num(k.maxSog), 'kn', t('log.speedMaxSub')),
      cell(t('log.engine'), k.engineSeconds ? formatDuration(k.engineSeconds) : '–', null,
        t('log.engineSub')),
      cell(t('log.points'), String(k.points), null, t('log.pointsSub', { v: k.events })),
      cell(t('log.days'), String(Math.max(1, k.days)), null, t('log.daysSub')),
    ),

    // Etmal: der klassische Eintrag – wie weit ist das Schiff seit gestern
    // gekommen. Nur zeigen, wenn es mehr als einen Tag zu zeigen gibt.
    etmale.length > 1 && h('details.foldout', { style: { 'margin-top': '12px', 'margin-bottom': 0 } },
      h('summary', t('log.etmal')),
      h('div',
        ...etmale.map((d) => h('div.wp-item',
          h('div.grow', h('div.wp-name', dayLabel(d.day))),
          h('div.wp-dist', `${num(d.distance, d.distance < 10 ? 2 : 1)} sm`),
        )),
      ),
    ),

    h('p.small.muted', { style: { margin: '11px 0 0' } }, t('log.plotHint')),
  );
}

function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), {
    weekday: 'short', day: '2-digit', month: '2-digit',
  });
}

/** Die Spur als Zeichnung: Linien zwischen den Positionen, Norden oben. */
function trackPlot(track) {
  const W = 320;
  const H = 260;
  const projected = projectTrack(track, W, H);
  if (!projected) return null;

  const el = svg('svg.track-plot', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': t('log.track'),
  });

  el.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, class: 'plot-bg' }));

  // Linien zwischen den Positionen
  if (projected.points.length > 1) {
    el.appendChild(svg('polyline', {
      class: 'plot-line',
      points: projected.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    }));
  }

  // Die Positionen selbst; von Hand gesetzte Einträge größer.
  projected.points.forEach((p, i) => {
    const manual = p.point.kind === 'manual';
    const last = i === projected.points.length - 1;
    el.appendChild(svg('circle', {
      class: last ? 'plot-dot now' : `plot-dot${manual ? ' manual' : ''}`,
      cx: p.x.toFixed(1),
      cy: p.y.toFixed(1),
      r: last ? 6 : (manual ? 4.5 : 2.6),
    }));
  });

  // Ereignisse bekommen ihr Zeichen an die Stelle, an der sie passiert sind.
  // Das ist der Unterschied zwischen einer Spur und einem Logbuch: Man sieht,
  // wo gewendet und wo geankert wurde.
  const symbols = new Map(LOG_EVENTS.map((e) => [e.key, e.sym]));
  projected.points.forEach((p) => {
    if (!p.point.event) return;
    el.appendChild(svg('text', {
      class: 'plot-event',
      x: p.x.toFixed(1),
      y: (p.y - 9).toFixed(1),
      'text-anchor': 'middle',
    }, symbols.get(p.point.event) ?? '•'));
  });

  // Start kennzeichnen
  const first = projected.points[0];
  el.appendChild(svg('text', {
    class: 'plot-label', x: first.x + 8, y: first.y - 6,
  }, t('log.start')));

  // Nordpfeil – die Zeichnung ist immer nordorientiert.
  el.appendChild(svg('path', {
    class: 'plot-north', d: `M${W - 22} 30 L${W - 22} 10 M${W - 27} 16 L${W - 22} 10 L${W - 17} 16`,
  }));
  el.appendChild(svg('text', { class: 'plot-label', x: W - 22, y: 44, 'text-anchor': 'middle' }, 'N'));

  // Maßstabsbalken
  const step = niceScaleStep(projected.spanNm);
  const barPx = step * projected.scale;
  if (barPx > 12 && barPx < W - 40) {
    const y = H - 16;
    el.appendChild(svg('path', {
      class: 'plot-scale',
      d: `M14 ${y - 5} V${y} H${14 + barPx} V${y - 5}`,
    }));
    el.appendChild(svg('text', {
      class: 'plot-label', x: 14, y: y - 9,
    }, `${step < 1 ? num(step, 2) : num(step, step < 10 ? 1 : 0)} sm`));
  }

  return el;
}

function cell(label, value, unit, sub) {
  return h('div.cell',
    h('div.label', label),
    h(`div.value${fit(value)}`, value, unit && h('span.unit', unit)),
    sub && h('div.sub', sub),
  );
}

// ---------------------------------------------------------------- Einträge

function entriesCard(entries) {
  if (!entries.length) {
    return h('div.card', h('div.empty', t('log.empty')));
  }

  const symbols = new Map(LOG_EVENTS.map((e) => [e.key, e.sym]));

  return h('div.card',
    h('div.row', { style: { 'margin-bottom': '6px' } },
      h('h2.grow', { style: { margin: 0 } }, t('log.entries')),
      h('button.btn.small', {
        type: 'button',
        onclick: () => {
          if (!confirm(t('log.confirmClear'))) return;
          logbook.clear();
          draw();
        },
      }, t('common.deleteAll')),
    ),

    ...entries.map((entry) => h('div.log-item',
      h('div.row', { style: { 'align-items': 'flex-start' } },
        h('div.grow',
          h('div.row', { style: { gap: '7px', 'align-items': 'baseline' } },
            h('span.log-time.mono', new Date(entry.ts).toLocaleString(locale(), {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })),
            entry.event && h('span.log-event',
              symbols.get(entry.event) ?? '•', ' ', t(`log.ev.${entry.event}`)),
            entry.kind === 'auto' && h('span.rule', t('log.auto')),
          ),
          h('div.log-pos.mono', formatLat(entry.lat), '  ', formatLon(entry.lon)),
          h('div.small.muted',
            entry.sog !== null && entry.sog !== undefined ? `${num(entry.sog)} kn` : '',
            entry.cog !== null && entry.cog !== undefined
              ? `  ${String(Math.round(entry.cog)).padStart(3, '0')}°` : '',
          ),
          weatherShort(entry.weather)
            && h('div.small.muted.log-weather', weatherShort(entry.weather)),
          entry.note && h('div.log-note', entry.note),
        ),
        h('button.btn.small', {
          type: 'button',
          'aria-label': t('log.editNote'),
          onclick: () => {
            const note = prompt(t('log.editNote'), entry.note ?? '');
            if (note === null) return;
            logbook.update(entry.id, { note: note.trim() });
            draw();
          },
        }, '✎'),
        h('button.btn.small', {
          type: 'button',
          'aria-label': t('log.deleteEntry'),
          onclick: () => {
            if (!confirm(t('log.confirmDelete'))) return;
            logbook.remove(entry.id);
            draw();
          },
        }, '✕'),
      ),
    )),
  );
}

// ------------------------------------------------------- Ausgabe, Sicherung

/**
 * Herausgeben und sichern.
 *
 * Beides als Datei, nicht in die Zwischenablage: Fünfhundert Einträge lassen
 * sich auf einem Telefon nirgends einfügen. GPX öffnet jedes
 * Navigationsprogramm; die Sicherung liest nur diese App wieder ein, dafür
 * vollständig.
 */
function outputCard(track) {
  const s = settings.all();
  const basis = scopeName() || s.boat || 'logbuch';

  const geben = async (endung, mime, inhalt, leerMeldung) => {
    if (!inhalt) { toast(leerMeldung); return; }
    try {
      const art = await shareFile(stamped(basis, endung), mime, inhalt);
      if (art !== 'abgebrochen') toast(t(art === 'geteilt' ? 'log.shared' : 'log.downloaded'));
    } catch (err) {
      toast(t('log.shareFailed', { v: err.message }));
    }
  };

  return h('div.card',
    h('h2', t('log.output')),
    h('p.small.muted', { style: { margin: '0 0 12px' } }, t('log.outputHint')),

    h('div.row.wrap',
      h('button.btn.small.grow', {
        type: 'button',
        onclick: () => geben('gpx', 'application/gpx+xml',
          track.length ? toGpx(track, { boat: s.boat, name: scopeName() }) : '',
          t('log.emptyTrack')),
      }, t('log.asGpx')),
      h('button.btn.small.grow', {
        type: 'button',
        onclick: () => geben('csv', 'text/csv',
          track.length ? toCsv(track) : '', t('log.emptyTrack')),
      }, t('log.asCsv')),
      h('button.btn.small.grow', {
        type: 'button',
        onclick: () => geben('txt', 'text/plain',
          track.length ? asText(track, s) : '', t('log.emptyTrack')),
      }, t('log.asText')),
    ),

    h('h3', { style: { margin: '18px 0 6px', 'font-size': '.95rem' } }, t('log.backup')),
    h('p.small.muted', { style: { margin: '0 0 10px' } }, t('log.backupHint')),

    h('div.row.wrap',
      h('button.btn.small.grow', {
        type: 'button',
        onclick: () => geben('json', 'application/json', logbook.backup(), t('log.emptyTrack')),
      }, t('log.backupSave')),
    ),

    milesBlock(track, s),

    h('label.field', { style: { 'margin-top': '10px', 'margin-bottom': 0 } },
      h('span', t('log.restore')),
      h('input.pack-file', {
        type: 'file',
        id: 'log-restore',
        'aria-label': t('log.restore'),
        onchange: async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            const zahl = logbook.restore(await file.text());
            toast(t('log.restored', { v: zahl.entries }));
          } catch (err) {
            toast(t('log.restoreFailed', { v: err.message }));
          }
          draw();
        },
      }),
      h('span.hint', t('log.restoreHint')),
    ),
  );
}

/**
 * Die Meilenbestätigung.
 *
 * Zwei Namen genügen, um sie auszustellen: für wen sie ist und wer sie
 * unterschreibt. Alles andere steht schon im Logbuch oder ist freiwillig.
 * Die Zahlen kommen aus dem gewählten Ausschnitt – wer eine Etappe angezeigt
 * hat, bestätigt die Etappe.
 */
function milesBlock(track, s) {
  const feld = (key, label, hint, placeholder) => h('label.field',
    h('span', label),
    h('input', {
      value: miles[key],
      placeholder,
      autocapitalize: 'words',
      'data-miles': key,
      oninput: (e) => { miles[key] = e.target.value; },
    }),
    hint && h('span.hint', hint),
  );

  /**
   * Ein Feld zum Aussuchen, mit Textfeld hinter „Anderes“.
   *
   * Die Liste deckt ab, was auf einer Yacht vorkommt; wer eine Funktion hat,
   * die darin fehlt, soll sie hinschreiben können statt sich für die falsche
   * zu entscheiden.
   */
  const auswahl = (key, label, optionen, praefix, hint) => {
    const otherKey = `${key}Other`;
    const frei = h('input', {
      value: miles[otherKey],
      placeholder: t(`log.miles${key === 'role' ? 'Role' : 'Qual'}Placeholder`),
      autocapitalize: 'words',
      style: { 'margin-top': '8px', display: miles[key] === OTHER ? '' : 'none' },
      'aria-label': t('log.milesOtherLabel', { v: label }),
      'data-miles': otherKey,
      oninput: (e) => { miles[otherKey] = e.target.value; },
    });
    return h('div.field',
      h('label',
        h('span', label),
        h('select', {
          value: miles[key],
          'data-miles': key,
          onchange: (e) => {
            miles[key] = e.target.value;
            frei.style.display = miles[key] === OTHER ? '' : 'none';
            if (miles[key] === OTHER) frei.focus();
          },
        },
        h('option', { value: '' }, t('log.milesPick')),
        ...optionen.map((o) => h('option', { value: o }, t(`${praefix}.${o}`))),
        h('option', { value: OTHER }, t('log.milesOther')),
        ),
      ),
      frei,
      hint && h('span.hint', hint),
    );
  };

  /**
   * Der ausführliche Nachweis.
   *
   * Freiwillig, weil er nicht immer gebraucht wird: Manche Prüfungsstelle
   * will genau ein Blatt mit einer Unterschrift, und mehr wäre dort im Weg.
   * Wer den Törn dagegen belegen oder in zehn Jahren wiederfinden will,
   * bekommt Route, Etappen und jeden Eintrag hinten angehängt.
   */
  const ausfuehrlich = h('label.check',
    h('input', {
      type: 'checkbox',
      checked: miles.detail,
      'data-miles': 'detail',
      onchange: (e) => { miles.detail = e.target.checked; },
    }),
    h('span.grow',
      h('span', t('log.milesDetail')),
      h('span.hint', t('log.milesDetailHint')),
    ),
  );

  return h('details.foldout', { style: { 'margin-top': '18px', 'margin-bottom': 0 } },
    h('summary', t('log.miles')),
    h('div',
      h('p.small.muted', { style: { 'margin-top': 0 } }, t('log.milesHint')),

      feld('person', t('log.milesPerson'), t('log.milesPersonHint'), ''),
      auswahl('role', t('log.milesRole'), ROLES, 'role', null),
      feld('skipper', t('log.milesSkipper'), t('log.milesSkipperHint'), ''),
      auswahl('qualification', t('log.milesQual'), QUALIFICATIONS, 'qual', null),

      h('label.field',
        h('span', t('log.milesNotes')),
        h('textarea', {
          rows: 3,
          value: miles.notes,
          placeholder: t('log.milesNotesPlaceholder'),
          'data-miles': 'notes',
          oninput: (e) => { miles.notes = e.target.value; },
        }),
        h('span.hint', t('log.milesNotesHint')),
      ),

      h('details.foldout', { style: { 'margin-bottom': '12px' } },
        h('summary', t('log.milesMore')),
        h('div',
          feld('area', t('log.milesArea'), null, t('log.milesAreaPlaceholder')),
          feld('place', t('log.milesPlace'), null, ''),
        ),
      ),

      ausfuehrlich,

      h('button.btn.primary.block', {
        type: 'button',
        id: 'miles-make',
        onclick: () => makeMiles(track, s),
      }, t('log.milesMake')),

      h('p.small.muted', { style: { margin: '10px 0 0' } }, t('log.milesDisclaimer')),
    ),
  );
}

/** Der Wert eines Auswahlfeldes als Text – aufgelöst, nicht als Schlüssel. */
function milesChoice(key, praefix) {
  const wert = miles[key];
  if (!wert) return '';
  if (wert === OTHER) return miles[`${key}Other`].trim();
  return t(`${praefix}.${wert}`);
}

async function makeMiles(track, s) {
  if (!track.length) { toast(t('log.emptyTrack')); return; }
  if (!miles.person.trim()) { toast(t('log.milesNeedsPerson')); return; }

  const bytes = buildMilesPdf({
    track,
    boat: {
      name: s.boat, callsign: s.callsign, mmsi: s.mmsi, loa: s.loa, homeport: s.homeport,
    },
    person: miles.person.trim(),
    skipper: miles.skipper.trim(),
    qualification: milesChoice('qualification', 'qual'),
    area: miles.area.trim() || scopeName(),
    role: milesChoice('role', 'role'),
    place: miles.place.trim() || s.homeport || '',
    notes: miles.notes.trim(),
    detail: miles.detail,
    // Nur die Etappen, die im gewählten Ausschnitt überhaupt vorkommen –
    // sonst stünden im Nachweis einer Etappe die Namen der ganzen Saison.
    turns: milesTurns(track),
    locale: locale(),
    texte: milesTexts(),
  });
  if (!bytes) { toast(t('log.emptyTrack')); return; }

  // Direkt herunterladen, nicht erst das Teilen-Blatt zeigen.
  //
  // Die anderen Ausgaben – GPX, CSV, Sicherung – gehen meist weiter: in die
  // Navigations-App, in eine Mail. Eine Meilenbestätigung will man erst
  // einmal haben. Ein Blatt, das sich zwischen Klick und Datei schiebt, ist
  // da ein Griff zu viel; teilen kann man sie hinterher aus „Dateien“.
  try {
    const name = stamped(`Meilen ${miles.person.trim()}`, 'pdf');
    downloadFile(name, 'application/pdf', bytes);
    toast(t('log.downloaded'));
  } catch (err) {
    toast(t('log.shareFailed', { v: err.message }));
  }
}

/** Die Etappen, in deren Zeitraum der gezeigte Ausschnitt fällt – älteste zuerst. */
function milesTurns(track) {
  const ids = new Set(track.map((e) => e.turnId).filter(Boolean));
  return logbook.turns()
    .filter((r) => ids.has(r.id))
    .sort((a, b) => a.startTs - b.startTs);
}

/** Alle Beschriftungen des Dokuments – das PDF-Modul übersetzt nicht selbst. */
function milesTexts() {
  const keys = [
    'title', 'subtitle', 'sectionPerson', 'person', 'role', 'area', 'sectionBoat',
    'boatName', 'boatCallsign', 'boatLoa', 'boatHome', 'sectionTrip', 'from', 'to',
    'milesTotal', 'milesNight', 'milesEngine', 'daysAboard', 'daysUnit',
    'notesHead', 'declarationHead', 'declaration', 'skipper', 'placeDate',
    'signature', 'footer',
    // Die Anlage.
    'detailTitle', 'routeHead', 'routeStart', 'routeEnd', 'north', 'noRoute',
    'legsHead', 'legUnnamed', 'legNone', 'wholeTrip',
    'colLeg', 'colPeriod', 'colDistance', 'colDuration',
    'entriesHead', 'colTime', 'colPosition', 'colSpeed', 'colEntry', 'entriesCount',
  ];
  return {
    ...Object.fromEntries(keys.map((k) => [k, t(`miles.${k}`)])),
    // Die Ereignisse heißen im Dokument, wie sie in der App heißen.
    events: Object.fromEntries(LOG_EVENTS.map((ev) => [ev.key, t(`log.ev.${ev.key}`)])),
  };
}

function asText(track, s) {
  const head = [s.boat, s.callsign, s.mmsi].filter(Boolean).join(' · ');
  const trip = scope.tripId ? logbook.trip(scope.tripId) : null;
  const lines = track.map((e) => {
    const when = new Date(e.ts).toLocaleString(locale());
    const speed = e.sog !== null && e.sog !== undefined ? ` ${num(e.sog)} kn` : '';
    const course = e.cog !== null && e.cog !== undefined
      ? ` ${String(Math.round(e.cog)).padStart(3, '0')}°` : '';
    const event = e.event ? `  [${t(`log.ev.${e.event}`)}]` : '';
    const wetter = weatherShort(e.weather) ? `  ${weatherShort(e.weather)}` : '';
    return `${when}  ${formatPosition(e)}${speed}${course}${event}${wetter}${e.note ? `  ${e.note}` : ''}`;
  });
  const distance = trackDistance(track);
  return [
    head,
    scopeName() || null,
    trip ? [trip.from, trip.to].filter(Boolean).join(' → ') || null : null,
    `${t('log.distance')}: ${num(distance, 2)} sm`,
    '',
    ...lines,
    '',
  ].filter((l) => l !== null).join('\n');
}

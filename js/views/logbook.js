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
import { shareFile, stamped } from '../lib/share.js';
import {
  logbook, trackDistance, projectTrack, niceScaleStep, dailyRuns, speedStats,
  toGpx, toCsv, LOG_INTERVALS, LOG_EVENTS, WIND_DIRECTIONS, VISIBILITY_STEPS,
} from '../lib/logbook.js';

let container = null;
let noteDraft = '';
// Welcher Törn in Spur und Liste gezeigt wird: null = alles.
let filterTripId = null;
let showWeather = false;

export function view(root) {
  container = h('div');
  render(root, container);
  // Beim Aufschlagen den laufenden Törn zeigen, sonst alles.
  filterTripId = logbook.currentTrip()?.id ?? null;
  draw();
  const offLog = logbook.onChange(() => draw());
  const offGps = gps.onUpdate(() => draw());
  return () => { offLog(); offGps(); container = null; };
}

/** Die Einträge, die gerade gezeigt werden. */
function selection() {
  const all = logbook.entries();
  if (!filterTripId) return all;
  return all.filter((e) => e.tripId === filterTripId);
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
  const current = logbook.currentTrip();
  const trips = logbook.trips();

  return h('div.card',
    h('div.row', { style: { 'margin-bottom': '10px' } },
      h('h2.grow', { style: { margin: 0 } }, t('log.trip')),
      current
        ? h('button.btn.small', { type: 'button', onclick: endTrip }, t('log.tripEnd'))
        : h('button.btn.small.primary', { type: 'button', onclick: startTrip }, t('log.tripStart')),
    ),

    current
      ? h('div',
        h('div.trip-name', current.name || t('log.tripUnnamed')),
        h('div.small.muted',
          [current.from, t('log.tripSince', { v: whenShort(current.startTs) })]
            .filter(Boolean).join(' · ')),
      )
      : h('p.small.muted', { style: { margin: 0 } }, t('log.tripNone')),

    // Umschalten, was Spur und Liste zeigen. Ohne das sieht man immer alles.
    trips.length > 0 && h('div.filter-chips', { style: { 'margin-top': '12px' } },
      h('button.chip', {
        type: 'button',
        'aria-pressed': String(filterTripId === null),
        onclick: () => { filterTripId = null; draw(); },
      }, t('log.tripAll')),
      ...trips.map((trip) => h('button.chip', {
        type: 'button',
        'aria-pressed': String(filterTripId === trip.id),
        onclick: () => { filterTripId = trip.id; draw(); },
      }, trip.name || whenShort(trip.startTs))),
    ),

    trips.length > 0 && h('details.foldout', { style: { 'margin-top': '12px', 'margin-bottom': 0 } },
      h('summary', t('log.tripList', { v: trips.length })),
      h('div',
        ...trips.map((trip) => h('div.wp-item',
          h('div.grow',
            h('div.wp-name', trip.name || t('log.tripUnnamed')),
            h('div.small.muted',
              [trip.from, trip.to].filter(Boolean).join(' → ')
              || t('log.tripSpan', {
                a: whenShort(trip.startTs),
                b: trip.endTs ? whenShort(trip.endTs) : t('log.tripOpen'),
              })),
          ),
          h('button.btn.small', {
            type: 'button',
            'aria-label': `${trip.name || t('log.tripUnnamed')} – ${t('log.tripRename')}`,
            onclick: () => {
              const name = prompt(t('log.tripRename'), trip.name ?? '');
              if (name === null) return;
              logbook.updateTrip(trip.id, { name: name.trim() });
              draw();
            },
          }, '✎'),
          h('button.btn.small', {
            type: 'button',
            'aria-label': `${trip.name || t('log.tripUnnamed')} – ${t('common.delete')}`,
            onclick: () => {
              if (!confirm(t('log.tripConfirmDelete'))) return;
              logbook.removeTrip(trip.id);
              if (filterTripId === trip.id) filterTripId = null;
              draw();
            },
          }, '✕'),
        )),
      ),
    ),
  );
}

function startTrip() {
  const name = prompt(t('log.tripNamePrompt'), '');
  if (name === null) return;
  const from = prompt(t('log.tripFromPrompt'), '') ?? '';
  const trip = logbook.startTrip({ name, from });
  filterTripId = trip.id;
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
  const distance = trackDistance(track);
  const from = track[0];
  const to = track[track.length - 1];
  const duration = (to.ts - from.ts) / 1000;
  const speeds = speedStats(track);
  const etmale = dailyRuns(track);

  return h('div.card',
    h('h2', t('log.track')),

    trackPlot(track),

    h('div.readout', { style: { 'margin-top': '12px' } },
      cell(t('log.points'), String(track.length), ''),
      cell(t('log.distance'), num(distance, distance < 10 ? 2 : 1), 'sm'),
      cell(t('log.duration'), formatDuration(duration), ''),
      cell(t('log.speedMax'), speeds.max === null ? '–' : num(speeds.max), 'kn'),
      cell(t('log.speedAvg'), speeds.avg === null ? '–' : num(speeds.avg), 'kn'),
      cell(t('log.days'), String(etmale.length), ''),
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

function cell(label, value, unit) {
  return h('div.cell',
    h('div.label', label),
    h(`div.value.mid${fit(value)}`, value, unit && h('span.unit', unit)),
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
  const trip = filterTripId ? logbook.trip(filterTripId) : null;
  const basis = trip?.name || s.boat || 'logbuch';

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
          track.length ? toGpx(track, { boat: s.boat, name: trip?.name ?? '' }) : '',
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

function asText(track, s) {
  const head = [s.boat, s.callsign, s.mmsi].filter(Boolean).join(' · ');
  const trip = filterTripId ? logbook.trip(filterTripId) : null;
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
    trip ? [trip.name, trip.from, trip.to].filter(Boolean).join(' · ') : null,
    `${t('log.distance')}: ${num(distance, 2)} sm`,
    '',
    ...lines,
    '',
  ].filter((l) => l !== null).join('\n');
}

/**
 * Modul „Logbuch“ – Positionen mitschreiben und als Spur zeichnen.
 *
 * Die Spur wird ohne jedes Kartenmaterial gezeichnet: eigene Positionen,
 * Linien dazwischen, Nordpfeil und Maßstabsbalken. Das läuft überall auf der
 * Welt, braucht keinen Speicherplatz für Kacheln und täuscht vor allem keine
 * Tiefenangaben vor, die es nicht gibt.
 */

import { h, svg, render, copy, toast, fit } from '../lib/dom.js';
import { gps } from '../lib/gps.js';
import { settings } from '../lib/storage.js';
import { t, locale, num } from '../lib/i18n.js';
import { formatPosition, formatDuration, formatLat, formatLon } from '../lib/geo.js';
import {
  logbook, trackDistance, projectTrack, niceScaleStep, LOG_INTERVALS,
} from '../lib/logbook.js';

let container = null;
let noteDraft = '';

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  const offLog = logbook.onChange(() => draw());
  const offGps = gps.onUpdate(() => draw());
  return () => { offLog(); offGps(); container = null; };
}

function draw() {
  if (!container) return;
  const entries = logbook.entries();
  const track = logbook.track();
  render(container,
    recorderCard(),
    track.length > 0 && trackCard(track),
    entriesCard(entries),
  );
}

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

    h('label.field',
      h('span', t('log.note')),
      noteField,
      h('span.hint', t('log.noteHint')),
    ),

    h('button.btn.primary.block', {
      type: 'button',
      disabled: !fix,
      style: { 'min-height': '58px', 'font-size': '1.05rem' },
      onclick: () => {
        const entry = logbook.add({ note: noteDraft, kind: 'manual' });
        if (!entry) {
          toast(t('log.noFix'));
          return;
        }
        noteDraft = '';
        toast(t('log.added'));
        draw();
      },
    }, t('log.addManual')),

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

    minutes > 0 && h('p.small.muted', { style: { margin: '10px 0 0' } }, t('log.autoLimit')),
  );
}

function intervalLabel(minutes) {
  return minutes >= 60
    ? t('log.hours', { v: minutes / 60 })
    : t('log.minutes', { v: minutes });
}

// ------------------------------------------------------------------- Spur

function trackCard(track) {
  const distance = trackDistance(track);
  const from = track[0];
  const to = track[track.length - 1];
  const duration = (to.ts - from.ts) / 1000;

  return h('div.card',
    h('h2', t('log.track')),

    trackPlot(track),

    h('div.readout', { style: { 'margin-top': '12px' } },
      cell(t('log.points'), String(track.length), ''),
      cell(t('log.distance'), num(distance, distance < 10 ? 2 : 1), 'sm'),
      cell(t('log.duration'), formatDuration(duration), ''),
    ),

    h('div.row.wrap', { style: { 'margin-top': '12px' } },
      h('button.btn.small.grow', {
        type: 'button',
        onclick: () => copy(asText(track), t('log.copied')),
      }, t('log.copy')),
      h('button.btn.small.grow', {
        type: 'button',
        onclick: () => copy(asCsv(track), t('log.copied')),
      }, t('log.copyCsv')),
    ),

    h('p.small.muted', { style: { margin: '11px 0 0' } }, t('log.plotHint')),
  );
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
            entry.kind === 'auto' && h('span.rule', t('log.auto')),
          ),
          h('div.log-pos.mono', formatLat(entry.lat), '  ', formatLon(entry.lon)),
          h('div.small.muted',
            entry.sog !== null && entry.sog !== undefined ? `${num(entry.sog)} kn` : '',
            entry.cog !== null && entry.cog !== undefined
              ? `  ${String(Math.round(entry.cog)).padStart(3, '0')}°` : '',
          ),
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

// ------------------------------------------------------------------ Ausgabe

function asText(track) {
  const s = settings.all();
  const head = [s.boat, s.callsign, s.mmsi].filter(Boolean).join(' · ');
  const lines = track.map((e) => {
    const when = new Date(e.ts).toLocaleString(locale());
    const speed = e.sog !== null && e.sog !== undefined ? ` ${num(e.sog)} kn` : '';
    const course = e.cog !== null && e.cog !== undefined
      ? ` ${String(Math.round(e.cog)).padStart(3, '0')}°` : '';
    return `${when}  ${formatPosition(e)}${speed}${course}${e.note ? `  ${e.note}` : ''}`;
  });
  const distance = trackDistance(track);
  return [
    head,
    `${t('log.distance')}: ${num(distance, 2)} sm`,
    '',
    ...lines,
  ].filter((l) => l !== null).join('\n');
}

function asCsv(track) {
  const rows = [['zeit_iso', 'breite', 'laenge', 'sog_kn', 'cog_grad', 'art', 'bemerkung']];
  track.forEach((e) => rows.push([
    new Date(e.ts).toISOString(),
    e.lat.toFixed(6),
    e.lon.toFixed(6),
    e.sog === null || e.sog === undefined ? '' : e.sog.toFixed(1),
    e.cog === null || e.cog === undefined ? '' : Math.round(e.cog),
    e.kind,
    (e.note ?? '').replace(/"/g, '""'),
  ]));
  return rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
}

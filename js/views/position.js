/**
 * Modul „Position“ – eigene Position anzeigen, ein Ziel eingeben,
 * Entfernung und Kurs dorthin berechnen.
 *
 * Rechnet ausschließlich mit GPS und Geometrie. Es werden keine Karten,
 * keine Kacheln und keine Netzverbindung gebraucht.
 */

import { h, svg, render, copy, toast } from '../lib/dom.js';
import { settings, waypoints } from '../lib/storage.js';
import { gps, GPS_STATUS_KEY } from '../lib/gps.js';
import { t, locale, uiLang, num } from '../lib/i18n.js';
import {
  solve, parsePositionPair, formatPosition, formatLat,
  formatLon, formatDecimal, formatSpoken, formatDuration,
} from '../lib/geo.js';

// Bleibt beim Reiterwechsel erhalten.
const state = {
  raw: '',
  target: null,      // { lat, lon }
  targetName: '',
  error: null,
};

let container = null;

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  const off = gps.onUpdate(() => draw());
  return () => { off(); container = null; };
}

function draw() {
  if (!container) return;
  const s = settings.all();
  const fix = gps.fix;
  const opts = {
    variation: Number(String(s.variation).replace(',', '.')) || 0,
    deviation: Number(String(s.deviation).replace(',', '.')) || 0,
    speed: fix?.speed ?? (Number(String(s.manualSpeed).replace(',', '.')) || null),
    heading: fix?.heading ?? null,
  };
  const nav = fix && state.target ? solve(fix, state.target, opts) : null;

  render(container,
    ownPosition(fix),
    targetInput(),
    nav ? result(nav, opts) : hintCard(fix),
    waypointList(fix, opts),
    navSettings(s),
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
        h('button.btn.danger.block', {
          type: 'button',
          style: { 'margin-top': '10px' },
          onclick: () => markMob(fix),
        }, t('pos.mob')),
      )
      : h('div.empty',
        h('p', { style: { margin: '0 0 10px' } }, t(GPS_STATUS_KEY[status] ?? 'gps.none')),
        h('p.small', status === 'denied' ? t('gps.deniedHelp') : t('gps.searchHelp')),
        h('button.btn.primary', { type: 'button', onclick: () => gps.start() }, t('gps.start')),
      ),
  );
}

function markMob(fix) {
  const wp = waypoints.add({
    name: `MOB ${new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`,
    lat: fix.lat,
    lon: fix.lon,
    kind: 'mob',
  });
  state.target = { lat: wp.lat, lon: wp.lon };
  state.targetName = wp.name;
  state.raw = formatPosition(wp);
  state.error = null;
  toast(t('pos.mobSaved'));
  draw();
}

// ------------------------------------------------------------ Zieleingabe

function targetInput() {
  const field = h('textarea.mono', {
    value: state.raw,
    rows: 2,
    placeholder: `54°31.234' N   011°22.345' E`,
    inputmode: 'text',
    autocapitalize: 'characters',
    spellcheck: false,
    oninput: (e) => { state.raw = e.target.value; },
    onchange: () => applyInput(),
  });

  return h('div.card',
    h('h2', t('pos.target')),
    h('p.small.muted', { style: { margin: '0 0 9px' } }, t('pos.targetHint')),
    field,
    state.error && h('p.small', { style: { color: 'var(--danger)', margin: '7px 0 0' } }, state.error),
    state.target && h('p.small.mono', { style: { margin: '7px 0 0', color: 'var(--ok)' } },
      '✓ ', formatPosition(state.target)),
    h('div.row.wrap', { style: { 'margin-top': '10px' } },
      h('button.btn.primary.grow', { type: 'button', onclick: () => applyInput(field) }, t('common.apply')),
      h('button.btn.small', {
        type: 'button',
        onclick: async () => {
          try {
            const text = await navigator.clipboard.readText();
            state.raw = text;
            field.value = text;
            applyInput(field);
          } catch {
            toast(t('common.clipboardUnreadable'));
          }
        },
      }, t('common.paste')),
      state.target && h('button.btn.small', {
        type: 'button',
        onclick: () => {
          const name = prompt(t('pos.wpNamePrompt'), state.targetName || t('pos.wpDefault'));
          if (name === null) return;
          waypoints.add({ ...state.target, name });
          toast(t('pos.wpSaved'));
          draw();
        },
      }, t('common.save')),
      state.target && h('button.btn.small', {
        type: 'button',
        onclick: () => {
          state.target = null;
          state.raw = '';
          state.error = null;
          draw();
        },
      }, t('pos.clearTarget')),
    ),
  );
}

function applyInput(field) {
  const text = (field ? field.value : state.raw).trim();
  state.raw = text;
  if (!text) {
    state.target = null;
    state.error = null;
    draw();
    return;
  }
  const parsed = parsePositionPair(text);
  if (parsed) {
    state.target = parsed;
    state.targetName = '';
    state.error = null;
  } else {
    state.target = null;
    state.error = t('pos.parseError');
  }
  draw();
}

// ----------------------------------------------------------- Rechenergebnis

function result(nav, opts) {
  const { distance, bearing, courses, reciprocal, eta, relative } = nav;
  const hasVar = opts.variation !== 0;
  const hasDev = opts.deviation !== 0;

  return h('div.card',
    h('h2', state.targetName ? t('pos.toNamed', { name: state.targetName }) : t('pos.toTarget')),

    h('div.readout',
      h('div.cell.hero',
        h('div.label', t('pos.distance')),
        h('div.value', num(distance, distance < 10 ? 2 : 1), h('span.unit', 'sm')),
        h('div.sub', metres(distance)),
      ),
      h('div.cell.hero',
        h('div.label', t('pos.trueCourse')),
        h('div.value', deg3(bearing), h('span.unit', '°')),
        h('div.sub', t('pos.trueCourseSub')),
      ),
    ),

    compassRose(bearing, opts.heading, relative),

    h('div.readout', { style: { 'margin-top': '12px' } },
      hasVar && h('div.cell',
        h('div.label', t('pos.magnetic')),
        h('div.value', deg3(courses.magnetic), h('span.unit', '°')),
        h('div.sub', t('pos.magneticSub', { v: fmtSigned(opts.variation) })),
      ),
      hasDev && h('div.cell',
        h('div.label', t('pos.compass')),
        h('div.value', deg3(courses.compass), h('span.unit', '°')),
        h('div.sub', t('pos.compassSub', { v: fmtSigned(opts.deviation) })),
      ),
      h('div.cell',
        h('div.label', t('pos.reciprocal')),
        h('div.value', deg3(reciprocal), h('span.unit', '°')),
        h('div.sub', t('pos.reciprocalSub')),
      ),
      h('div.cell',
        h('div.label', t('pos.eta')),
        h('div.value', { style: { 'font-size': '1.4rem' } }, formatDuration(eta)),
        h('div.sub', opts.speed ? t('pos.etaAt', { v: num(opts.speed) }) : t('pos.etaNoSpeed')),
      ),
      relative && h('div.cell.wide',
        h('div.label', t('pos.relative')),
        h('div.value', { style: { 'font-size': '1.4rem' } }, relativeText(relative)),
        h('div.sub', t('pos.relativeSub')),
      ),
      eta && h('div.cell.wide',
        h('div.label', t('pos.arrival')),
        h('div.value', { style: { 'font-size': '1.4rem' } },
          new Date(Date.now() + eta * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }),
          t('pos.clock') && h('span.unit', t('pos.clock'))),
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
    h('div.value', value, unit && h('span.unit', unit)),
    sub && h('div.sub', sub),
  );
}

// -------------------------------------------------------------- Kompassrose

function compassRose(bearing, heading, relative) {
  const C = 100;
  const R = 86;
  const el = svg('svg.compass', {
    viewBox: '0 0 200 200',
    role: 'img',
    'aria-label': `${t('pos.trueCourse')} ${Math.round(bearing)}°`,
  });

  el.appendChild(svg('circle', { class: 'ring', cx: C, cy: C, r: R }));

  for (let a = 0; a < 360; a += 10) {
    const major = a % 30 === 0;
    const rad = (a - 90) * Math.PI / 180;
    const r1 = R - (major ? 12 : 6);
    el.appendChild(svg('line', {
      class: major ? 'tick major' : 'tick',
      x1: C + r1 * Math.cos(rad), y1: C + r1 * Math.sin(rad),
      x2: C + R * Math.cos(rad), y2: C + R * Math.sin(rad),
    }));
  }

  // Im Deutschen heißt der Osten „O“, im Englischen „E“.
  const east = uiLang() === 'en' ? 'E' : 'O';
  [['N', 0], [east, 90], ['S', 180], ['W', 270]].forEach(([label, a]) => {
    const rad = (a - 90) * Math.PI / 180;
    el.appendChild(svg('text', {
      class: 'card-label',
      x: C + (R - 24) * Math.cos(rad),
      y: C + (R - 24) * Math.sin(rad) + 3,
      'text-anchor': 'middle',
    }, label));
  });

  // Kurs über Grund als gestrichelte Linie
  if (heading !== null && heading !== undefined) {
    const rad = (heading - 90) * Math.PI / 180;
    el.appendChild(svg('line', {
      class: 'heading',
      x1: C, y1: C,
      x2: C + (R - 16) * Math.cos(rad),
      y2: C + (R - 16) * Math.sin(rad),
    }));
  }

  // Zeiger zum Ziel
  el.appendChild(svg('polygon', {
    class: 'needle',
    points: '100,10 91,34 100,29 109,34',
    transform: `rotate(${bearing} ${C} ${C})`,
  }));

  el.appendChild(svg('text', {
    class: 'center-text', x: C, y: C + 4, 'font-size': '30',
  }, `${deg3(bearing)}°`));
  el.appendChild(svg('text', { class: 'center-sub', x: C, y: C + 20 }, t('pos.compassTrue')));

  if (relative) {
    el.appendChild(svg('text', { class: 'center-sub', x: C, y: C + 36 }, relativeText(relative)));
  }

  return h('div', { style: { 'margin-top': '14px' } }, el);
}

// ---------------------------------------------------------------- Wegpunkte

function waypointList(fix, opts) {
  const list = waypoints.list();
  if (!list.length) return null;

  return h('div.card',
    h('div.row', { style: { 'margin-bottom': '4px' } },
      h('h2.grow', { style: { margin: 0 } }, t('pos.saved')),
      h('button.btn.small', {
        type: 'button',
        onclick: () => {
          if (confirm(t('pos.confirmClear'))) {
            waypoints.clear();
            draw();
          }
        },
      }, t('common.deleteAll')),
    ),
    ...list.map((wp) => {
      const nav = fix ? solve(fix, wp, opts) : null;
      return h('div.wp-item',
        h('div.grow', { style: { cursor: 'pointer' }, onclick: () => useWaypoint(wp) },
          h('div.wp-name', wp.kind === 'mob' ? `⚑ ${wp.name}` : wp.name),
          h('div.wp-pos', formatPosition(wp, 2)),
        ),
        nav && h('div.wp-dist',
          `${num(nav.distance, nav.distance < 10 ? 2 : 1)} sm`,
          h('small', `${deg3(nav.bearing)}°`),
        ),
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
  state.targetName = wp.name;
  state.raw = formatPosition(wp);
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

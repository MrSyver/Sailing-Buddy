/** Modul „Nachtfahrt“ – Lichterführung und Schallsignale zum Nachschlagen. */

import { h, svg, render } from '../lib/dom.js';
import { audio } from '../lib/audio.js';
import { t, loc, uiLang } from '../lib/i18n.js';
import {
  LIGHTS, LIGHT_COLORS, LIGHT_FILTERS, LIGHT_CATEGORIES, LIGHT_TYPES, LIGHT_RANGES,
} from '../data/lights.js';
import { SOUNDS, SOUND_GROUPS, SOUND_BASICS, DISTRESS_VISUAL } from '../data/sounds.js';

const state = {
  tab: 'lichter',        // 'lichter' | 'schall' | 'grundlagen'
  colors: new Set(),     // Farbfilter für „Was sehe ich?“
  category: 'all',
  soundGroup: 'manoever',
  playing: null,
};

let container = null;

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  const off = audio.onStateChange((running) => {
    if (!running) state.playing = null;
    draw();
  });
  return () => { off(); audio.stop(); container = null; };
}

function draw() {
  if (!container) return;
  render(container,
    h('div.seg', { style: { 'margin-bottom': '14px' } },
      tabBtn('lichter', t('night.tab.lights')),
      tabBtn('schall', t('night.tab.sounds')),
      tabBtn('grundlagen', t('night.tab.basics')),
    ),
    state.tab === 'lichter' ? lightsView()
      : state.tab === 'schall' ? soundsView()
        : basicsView(),
  );
}

function tabBtn(key, label) {
  return h('button', {
    type: 'button',
    'aria-pressed': String(state.tab === key),
    onclick: () => { state.tab = key; draw(); window.scrollTo(0, 0); },
  }, label);
}

const en = () => uiLang() === 'en';

// ================================================================== Lichter

function lightsView() {
  const filtered = LIGHTS.filter((l) => {
    if (state.category !== 'all' && l.category !== state.category) return false;
    if (state.colors.size === 0) return true;
    // Alle angetippten Farben müssen an dem Fahrzeug vorkommen.
    return [...state.colors].every((c) => l.seen.includes(c));
  });

  return h('div',
    h('div.card',
      h('h2', t('night.whatISee')),
      h('p.small.muted', { style: { margin: '0 0 10px' } }, t('night.whatISeeHint')),
      h('div.filter-chips',
        ...LIGHT_FILTERS.map((f) => h('button.chip', {
          type: 'button',
          'aria-pressed': String(state.colors.has(f.key)),
          onclick: () => {
            if (state.colors.has(f.key)) state.colors.delete(f.key);
            else state.colors.add(f.key);
            draw();
          },
        },
        h('span.swatch', { style: { background: LIGHT_COLORS[f.key].hex } }),
        en() ? f.labelEn : f.label,
        )),
        state.colors.size > 0 && h('button.chip', {
          type: 'button',
          onclick: () => { state.colors.clear(); draw(); },
        }, t('night.resetFilter')),
      ),
      h('div.filter-chips', { style: { 'margin-top': '9px' } },
        ...LIGHT_CATEGORIES.map((c) => h('button.chip', {
          type: 'button',
          'aria-pressed': String(state.category === c.key),
          onclick: () => { state.category = c.key; draw(); },
        }, en() ? c.labelEn : c.label)),
      ),
    ),

    filtered.length === 0
      ? h('div.card', h('div.empty', t('night.noMatch')))
      : h('div', ...filtered.map(lightCard)),

    h('p.disclaimer', t('night.lightsDisclaimer')),
  );
}

function lightCard(l) {
  const mnemonic = loc(l, 'mnemonic');
  const note = loc(l, 'note');
  return h('div.card.light-card',
    h('div.light-head',
      lightSchematic(l.view),
      h('div.txt',
        h('div.row', { style: { gap: '7px', 'align-items': 'flex-start' } },
          h('div.grow',
            h('h3', loc(l, 'title')),
            h('div.sub', loc(l, 'subtitle')),
          ),
          h('span.rule', loc(l, 'rule')),
        ),
        h('p.light-pattern', loc(l, 'pattern')),
      ),
    ),
    h('ul.checklist.plain', { style: { 'margin-top': '10px' } },
      ...loc(l, 'lights').map((x) => h('li', x))),
    mnemonic && h('div.mnemonic', '„', mnemonic, '“'),
    note && h('p.small.muted', { style: { margin: '10px 0 0' } }, note),
  );
}

/** Schematische Ansicht von vorn: Lichter als Punkte auf dunklem Grund. */
function lightSchematic(view) {
  const el = svg('svg.light-view', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });

  // Angedeuteter Rumpf als Orientierung
  el.appendChild(svg('path', {
    d: 'M18 84 L82 84 L74 94 L26 94 Z',
    fill: '#1a2433',
    stroke: '#2b3949',
    'stroke-width': '1',
  }));
  el.appendChild(svg('line', {
    x1: '50', y1: '84', x2: '50', y2: '8',
    stroke: '#2b3949', 'stroke-width': '1.4',
  }));

  (view?.lights ?? []).forEach((lt) => {
    const hex = LIGHT_COLORS[lt.c].hex;
    const g = svg('g');
    // Weicher Lichthof, damit die Punkte wie Laternen wirken
    g.appendChild(svg('circle', { cx: lt.x, cy: lt.y, r: 8.5, fill: hex, opacity: '0.22' }));
    g.appendChild(svg('circle', {
      cx: lt.x, cy: lt.y, r: 4, fill: hex, stroke: '#000', 'stroke-width': '.6',
    }));
    if (lt.flash) {
      g.appendChild(svg('animate', {
        attributeName: 'opacity', values: '1;.15;1', dur: '.9s', repeatCount: 'indefinite',
      }));
    }
    el.appendChild(g);
  });

  return el;
}

// ============================================================== Schallsignale

function soundsView() {
  const group = SOUND_GROUPS.find((g) => g.key === state.soundGroup);
  const items = SOUNDS.filter((s) => s.group === state.soundGroup);

  return h('div',
    h('div.filter-chips', { style: { 'margin-bottom': '12px' } },
      ...SOUND_GROUPS.map((g) => h('button.chip', {
        type: 'button',
        'aria-pressed': String(state.soundGroup === g.key),
        onclick: () => { state.soundGroup = g.key; audio.stop(); draw(); },
      }, loc(g, 'label'))),
    ),

    h('div.notice', h('strong', loc(group, 'label'), ': '), loc(group, 'hint')),

    h('div.card', ...items.map(soundItem)),

    state.soundGroup === 'not' && h('div.card',
      h('h2', t('night.visualDistress')),
      h('ul.checklist.plain', ...DISTRESS_VISUAL.map((x) => h('li', en() ? x.en : x.de))),
    ),

    audio.isPlaying && h('button.btn.danger.block', {
      type: 'button',
      style: { position: 'sticky', bottom: '78px' },
      onclick: () => { audio.stop(); state.playing = null; draw(); },
    }, t('night.stop')),

    h('p.disclaimer', t('night.soundDisclaimer')),
  );
}

function soundItem(s) {
  const isPlaying = state.playing === s.id;
  const interval = loc(s, 'interval');
  return h('div.sound-item',
    h('div.sound-head',
      h('h3', loc(s, 'title')),
      h('span.rule', { style: { 'font-size': '.7rem', color: 'var(--text-dim)' } }, loc(s, 'rule')),
    ),
    interval && h('span.sound-interval', interval),
    h('div.sound-symbol', loc(s, 'symbol')),
    h('p.small', { style: { margin: '0 0 9px' } }, loc(s, 'desc')),
    h('div.row.wrap',
      h('button.btn.small', {
        type: 'button',
        disabled: isPlaying,
        onclick: () => playSound(s, 1),
      }, isPlaying ? t('night.playing') : t('night.play')),
      h('button.btn.small', {
        type: 'button',
        disabled: isPlaying,
        onclick: () => playSound(s, 3),
      }, t('night.playFast')),
    ),
  );
}

async function playSound(s, speed) {
  state.playing = s.id;
  draw();
  await audio.play(s.pattern, { speed });
  if (state.playing === s.id) {
    state.playing = null;
    draw();
  }
}

// ================================================================ Grundlagen

function basicsView() {
  return h('div',
    h('div.card',
      h('h2', t('night.lanterns')),
      h('table.data',
        h('thead', h('tr',
          h('th', t('night.table.lantern')),
          h('th', t('night.table.sector')),
          h('th', t('night.table.description')),
        )),
        h('tbody', ...LIGHT_TYPES.map((x) => h('tr',
          h('td.k', loc(x, 'name')),
          h('td.k', loc(x, 'sector')),
          h('td.small', loc(x, 'desc')),
        ))),
      ),
    ),

    h('div.card',
      h('h2', t('night.ranges')),
      h('table.data',
        h('thead', h('tr',
          h('th', t('night.table.length')),
          h('th', t('night.table.mast')),
          h('th', t('night.table.side')),
          h('th', t('night.table.stern')),
          h('th', t('night.table.allround')),
        )),
        h('tbody', ...LIGHT_RANGES.map((r) => h('tr',
          h('td.small', loc(r, 'len')),
          h('td.k', loc(r, 'topp')),
          h('td.k', loc(r, 'seite')),
          h('td.k', loc(r, 'heck')),
          h('td.k', loc(r, 'rundum')),
        ))),
      ),
      h('p.small.muted', { style: { margin: '9px 0 0' } }, t('night.rangeHint')),
    ),

    h('div.card',
      h('h2', t('night.toneLengths')),
      h('table.data',
        h('tbody', ...SOUND_BASICS.map((x) => h('tr',
          h('td', loc(x, 'a')),
          h('td.small.muted', loc(x, 'b')),
          h('td.k', x.c),
        ))),
      ),
    ),

    h('div.card',
      h('h2', t('night.vision')),
      h('ul.checklist.plain',
        h('li', t('night.vision.1')),
        h('li', t('night.vision.2')),
        h('li', t('night.vision.3')),
        h('li', t('night.vision.4')),
        h('li', t('night.vision.5')),
      ),
    ),
  );
}

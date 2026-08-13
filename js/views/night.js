/** Modul „Nachtfahrt“ – Lichterführung und Schallsignale zum Nachschlagen. */

import { h, svg, render } from '../lib/dom.js';
import { audio } from '../lib/audio.js';
import { t, loc, uiLang } from '../lib/i18n.js';
import {
  LIGHTS, LIGHT_COLORS, LIGHT_CATEGORIES, LIGHT_TYPES, LIGHT_RANGES,
  LIGHT_FACETS, FACET_GROUPS, filterLights, matchesFacets,
} from '../data/lights.js';
import { SOUNDS, SOUND_GROUPS, SOUND_BASICS, DISTRESS_VISUAL } from '../data/sounds.js';
import {
  BUOYS, BUOY_GROUPS, BUOY_COLORS, LIGHT_RHYTHMS, LIGHT_COLOR_CODES,
} from '../data/buoys.js';

/**
 * Die Suche geht über Fahrzeuge und Seezeichen zugleich – nachts sieht man
 * ein Licht und weiß gerade nicht, ob da ein Schiff fährt oder eine Tonne
 * liegt. Genau das soll die Suche beantworten.
 */
function searchAll(keys, category = 'all') {
  const vessels = category === 'tonnen' ? [] : LIGHTS
    .filter((l) => (category === 'all' || l.category === category) && matchesFacets(l, keys))
    .map((l) => ({ item: l, kind: 'vessel' }));
  const buoys = (category === 'all' || category === 'tonnen')
    ? BUOYS.filter((b) => matchesFacets(b, keys)).map((b) => ({ item: b, kind: 'buoy' }))
    : [];
  return [...vessels, ...buoys];
}

const state = {
  tab: 'lichter',        // 'lichter' | 'schall' | 'grundlagen'
  facets: new Set(),     // gewählte Merkmale der Lichtersuche
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
  return () => { off(); audio.stop(); closeSearchQuietly(); container = null; };
}

/** Beim Verlassen des Moduls darf kein Blatt offen bleiben. */
function closeSearchQuietly() {
  const overlay = document.getElementById('light-search');
  if (overlay?._onKey) document.removeEventListener('keydown', overlay._onKey);
  overlay?.remove();
}

function draw() {
  if (!container) return;
  render(container,
    h('div.seg', { style: { 'margin-bottom': '14px' } },
      tabBtn('lichter', t('night.tab.lights')),
      tabBtn('tonnen', t('night.tab.buoys')),
      tabBtn('schall', t('night.tab.sounds')),
      tabBtn('grundlagen', t('night.tab.basics')),
    ),
    state.tab === 'lichter' ? lightsView()
      : state.tab === 'tonnen' ? buoysView()
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
  const active = [...state.facets];
  // Fahrzeuge und Seezeichen stehen immer zusammen in einer Liste – nachts
  // weiß man nicht, ob da ein Schiff fährt oder eine Tonne liegt.
  const found = searchAll(state.facets, state.category);

  return h('div',
    // Ein großer Knopf statt einer Filterleiste: Nachts will niemand
    // zwischen kleinen Schaltflächen zielen.
    h('button.btn.primary.block', {
      type: 'button',
      style: { 'margin-bottom': '12px', 'min-height': '58px', 'font-size': '1.05rem' },
      onclick: openSearch,
    }, t('night.searchOpen')),

    active.length > 0 && h('div.card',
      h('div.row.wrap', { style: { gap: '7px' } },
        h('span.small.muted', { style: { width: '100%' } }, t('night.activeFilter')),
        ...active.map((key) => {
          const facet = LIGHT_FACETS.find((f) => f.key === key);
          return h('button.chip', {
            type: 'button',
            'aria-pressed': 'true',
            onclick: () => { state.facets.delete(key); draw(); },
          },
          facet?.kind === 'color'
            && h('span.swatch', { style: { background: LIGHT_COLORS[key].hex } }),
          `${en() ? facet?.labelEn : facet?.label} ✕`);
        }),
        h('button.chip', {
          type: 'button',
          onclick: () => { state.facets.clear(); draw(); },
        }, t('night.resetFilter')),
      ),
    ),

    h('div.filter-chips', { style: { 'margin-bottom': '12px' } },
      ...LIGHT_CATEGORIES.map((c) => h('button.chip', {
        type: 'button',
        'aria-pressed': String(state.category === c.key),
        onclick: () => { state.category = c.key; draw(); },
      }, en() ? c.labelEn : c.label)),
    ),

    found.length === 0
      ? h('div.card', h('div.empty', t('night.noMatch')))
      : h('div', ...found.map((f) => (f.kind === 'buoy' ? buoyCard(f.item, true) : lightCard(f.item)))),

    h('p.disclaimer', t('night.lightsDisclaimer')),
  );
}

/**
 * Suchmaske. Bei jeder Auswahl wird neu gerechnet, was überhaupt noch
 * möglich ist – Merkmale, die zu keinem Ergebnis mehr führen, verschwinden.
 * So kann man sich nie in eine leere Antwort hineinklicken.
 */
function openSearch() {
  const overlay = h('div.sheet-overlay', {
    id: 'light-search',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('night.searchTitle'),
    onclick: (e) => { if (e.target.id === 'light-search') closeSearch(); },
  });
  const sheet = h('div.sheet');
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const onKey = (e) => { if (e.key === 'Escape') closeSearch(); };
  document.addEventListener('keydown', onKey);
  overlay._onKey = onKey;

  const paint = () => {
    const found = searchAll(state.facets, 'all');

    const groups = FACET_GROUPS.map((group) => {
      const chips = LIGHT_FACETS
        .filter((f) => f.group === group.key)
        .map((facet) => {
          const chosen = state.facets.has(facet.key);
          // Wie viele Ergebnisse bliebe es, wenn man dieses Merkmal wählte?
          const probe = new Set(state.facets);
          if (chosen) probe.delete(facet.key);
          else probe.add(facet.key);
          const count = searchAll(probe, 'all').length;
          // Was zu nichts mehr führt, wird gar nicht erst angeboten.
          if (!chosen && count === 0) return null;
          return h('button.facet', {
            type: 'button',
            'data-facet': facet.key,
            'aria-pressed': String(chosen),
            onclick: () => {
              if (chosen) state.facets.delete(facet.key);
              else state.facets.add(facet.key);
              paint();
            },
          },
          facet.kind === 'color'
            && h('span.swatch', { style: { background: LIGHT_COLORS[facet.key].hex } }),
          en() ? facet.labelEn : facet.label,
          !chosen && h('span.count', String(count)),
          );
        })
        .filter(Boolean);

      if (!chips.length) return null;
      return h('div.facet-group',
        h('h4', en() ? group.labelEn : group.label),
        h('div.facet-chips', ...chips),
      );
    }).filter(Boolean);

    render(sheet,
      h('div.sheet-head',
        h('strong.grow', t('night.searchTitle')),
        h('button.btn.small', { type: 'button', onclick: closeSearch }, t('night.searchClose')),
      ),
      h('p.small.muted', { style: { margin: '0 0 14px' } }, t('night.searchHint')),
      ...groups,
      h('div.sheet-result',
        h('span.n', String(found.length)),
        h('span.grow.small', t('night.searchResults')),
        state.facets.size > 0 && h('button.btn.small', {
          type: 'button',
          onclick: () => { state.facets.clear(); paint(); },
        }, t('night.resetFilter')),
        h('button.btn.small.primary', { type: 'button', onclick: closeSearch }, t('night.searchShow')),
      ),
    );
  };

  paint();
}

function closeSearch() {
  const overlay = document.getElementById('light-search');
  if (overlay?._onKey) document.removeEventListener('keydown', overlay._onKey);
  overlay?.remove();
  draw();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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

// ================================================================== Seezeichen

function buoysView() {
  return h('div',
    h('div.notice', t('night.buoyIntro')),

    ...BUOY_GROUPS.map((group) => h('div',
      h('h2.section', loc(group, 'label')),
      h('p.small.muted', { style: { margin: '0 4px 9px' } }, loc(group, 'hint')),
      ...BUOYS.filter((b) => b.group === group.key).map(buoyCard),
    )),

    h('div.card',
      h('h2', t('night.rhythms')),
      h('table.data',
        h('tbody', ...LIGHT_RHYTHMS.map((r) => h('tr',
          h('td.k', r.abbr),
          h('td.small', en() ? r.en : r.de),
        ))),
      ),
      h('h3', { style: { margin: '15px 0 8px', 'font-size': '.9rem' } }, t('night.colorCodes')),
      h('div.row.wrap',
        ...LIGHT_COLOR_CODES.map((c) => h('span.chip', { style: { 'min-height': 'auto', padding: '5px 11px' } },
          h('b', { style: { 'font-family': 'var(--mono)', 'margin-right': '6px' } }, c.abbr),
          en() ? c.en : c.de)),
      ),
    ),

    h('p.disclaimer', t('night.buoyDisclaimer')),
  );
}

function buoyCard(b, marked = false) {
  const memo = loc(b, 'memo');
  return h('div.card.light-card',
    h('div.light-head',
      buoySchematic(b),
      h('div.txt',
        h('div.row', { style: { gap: '7px', 'align-items': 'flex-start' } },
          h('h3.grow', loc(b, 'title')),
          marked && h('span.rule', t('night.isBuoy')),
        ),
        h('div.sub', loc(b, 'subtitle')),
        h('p.buoy-light',
          h('span.buoy-dot', { style: { background: lightSwatch(b.lightColor) } }),
          h('span.mono', loc(b, 'light')),
        ),
        h('p.small', { style: { margin: '4px 0 0' } }, loc(b, 'lightPlain')),
        rhythmBar(b.rhythm, b.rhythmIsExample),
      ),
    ),
    h('p.small', { style: { margin: '10px 0 0' } }, loc(b, 'meaning')),
    memo && h('div.mnemonic', '„', memo, '“'),
  );
}

/**
 * Die Feuerkennung als Balken über eine Wiederkehr: helle Abschnitte in der
 * Farbe des Feuers, dazwischen Dunkelheit. So lässt sich das, was man am
 * Horizont blinken sieht, unmittelbar vergleichen.
 */
function rhythmBar(rhythm, isExample = false) {
  if (!rhythm) return null;
  const W = 240;
  const H = 22;
  const el = svg('svg.rhythm-bar', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': t('night.rhythmBar', { v: rhythm.period }),
  });

  el.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, class: 'rhythm-dark' }));

  let x = 0;
  rhythm.segments.forEach((seg) => {
    const width = (seg.d / rhythm.period) * W;
    if (seg.c) {
      el.appendChild(svg('rect', {
        x: x.toFixed(2), y: 0, width: Math.max(1.2, width).toFixed(2), height: H,
        fill: BUOY_COLORS[seg.c] ?? BUOY_COLORS.w,
      }));
    }
    x += width;
  });

  return h('div', { style: { 'margin-top': '9px' } },
    el,
    h('p.small.muted', { style: { margin: '3px 0 0' } },
      t('night.rhythmBar', { v: rhythm.period }),
      isExample ? ` · ${t('night.rhythmExample')}` : ''),
  );
}

function lightSwatch(code) {
  if (code === 'buy') return `linear-gradient(90deg, ${BUOY_COLORS.bu} 50%, ${BUOY_COLORS.y} 50%)`;
  return BUOY_COLORS[code] ?? BUOY_COLORS.w;
}

/** Schematische Tonne: Farbfolge und Toppzeichen. */
function buoySchematic(b) {
  const el = svg('svg.light-view', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
  const bodyTop = 42;
  const bodyBottom = 92;
  const height = bodyBottom - bodyTop;
  const bands = b.bands ?? ['y'];

  if (b.stripes) {
    // Senkrechte Streifen (Mittefahrwasser, Wrackzeichen)
    const width = 34 / bands.length;
    bands.forEach((c, i) => el.appendChild(svg('rect', {
      x: 33 + i * width, y: bodyTop, width, height,
      fill: BUOY_COLORS[c],
    })));
  } else {
    // Waagerechte Bänder
    const band = height / bands.length;
    bands.forEach((c, i) => el.appendChild(svg('rect', {
      x: 33, y: bodyTop + i * band, width: 34, height: band,
      fill: BUOY_COLORS[c],
    })));
  }

  el.appendChild(svg('rect', {
    x: 33, y: bodyTop, width: 34, height,
    fill: 'none', stroke: '#2b3949', 'stroke-width': '1.2',
  }));
  // Stange zum Toppzeichen
  el.appendChild(svg('line', {
    x1: 50, y1: bodyTop, x2: 50, y2: 8, stroke: '#2b3949', 'stroke-width': '1.4',
  }));

  const color = BUOY_COLORS[b.topmarkColor] ?? BUOY_COLORS.b;
  const cone = (cx, cy, up, size = 9) => svg('polygon', {
    points: up
      ? `${cx},${cy - size} ${cx - size * 0.8},${cy + size * 0.6} ${cx + size * 0.8},${cy + size * 0.6}`
      : `${cx},${cy + size} ${cx - size * 0.8},${cy - size * 0.6} ${cx + size * 0.8},${cy - size * 0.6}`,
    fill: color,
  });

  switch (b.topmark) {
    case 'cones-up':      // Nord: beide Spitzen nach oben
      el.appendChild(cone(50, 14, true));
      el.appendChild(cone(50, 32, true));
      break;
    case 'cones-down':    // Süd: beide Spitzen nach unten
      el.appendChild(cone(50, 14, false));
      el.appendChild(cone(50, 32, false));
      break;
    case 'cones-base':    // Ost: Grundflächen aneinander
      el.appendChild(cone(50, 14, true));
      el.appendChild(cone(50, 32, false));
      break;
    case 'cones-point':   // West: Spitzen zueinander
      el.appendChild(cone(50, 14, false));
      el.appendChild(cone(50, 32, true));
      break;
    case 'cone':
      el.appendChild(cone(50, 26, true, 11));
      break;
    case 'cylinder':
      el.appendChild(svg('rect', { x: 40, y: 16, width: 20, height: 20, fill: color }));
      break;
    case 'sphere':
      el.appendChild(svg('circle', { cx: 50, cy: 26, r: 10, fill: color }));
      break;
    case 'balls2':
      el.appendChild(svg('circle', { cx: 50, cy: 15, r: 8, fill: color }));
      el.appendChild(svg('circle', { cx: 50, cy: 33, r: 8, fill: color }));
      break;
    case 'cross-x':
      el.appendChild(svg('path', {
        d: 'M40 16 L60 36 M60 16 L40 36', stroke: color, 'stroke-width': '5', 'stroke-linecap': 'round',
      }));
      break;
    case 'cross-upright':
      el.appendChild(svg('path', {
        d: 'M50 14 V38 M39 26 H61', stroke: color, 'stroke-width': '5', 'stroke-linecap': 'round',
      }));
      break;
    default:
      break;
  }

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

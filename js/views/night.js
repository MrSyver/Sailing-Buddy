/**
 * Modul „Lichter & Zeichen“ – was ein Fahrzeug über sich sagt, und wie man es
 * liest.
 *
 * Dasselbe Fahrzeug sagt bei Tag und bei Nacht dasselbe, nur mit anderen
 * Mitteln: nachts mit Laternen, tags mit schwarzen Signalkörpern. Deshalb
 * stehen beide hier zusammen und werden oben umgeschaltet, statt in zwei
 * Modulen zu liegen, zwischen denen niemand den Zusammenhang sieht.
 *
 * Der Aufbau ist in beiden Betriebsarten derselbe: eine Suche nach dem, was
 * man sieht – nicht nach dem Namen des Fahrzeugs, den kennt man ja gerade
 * nicht –, darunter die Treffer als Karten mit Zeichnung, Regel und dem
 * Merksatz dazu.
 */

import { h, svg, render } from '../lib/dom.js';
import { audio } from '../lib/audio.js';
import { t, loc, uiLang } from '../lib/i18n.js';
import {
  LIGHTS, LIGHT_COLORS, LIGHT_CATEGORIES, LIGHT_TYPES, LIGHT_RANGES,
  LIGHT_FACETS, FACET_GROUPS, matchesFacets,
} from '../data/lights.js';
import { SOUNDS, SOUND_GROUPS, SOUND_BASICS, DISTRESS_VISUAL } from '../data/sounds.js';
import {
  BUOYS, BUOY_GROUPS, BUOY_COLORS, LIGHT_RHYTHMS, LIGHT_COLOR_CODES,
} from '../data/buoys.js';
import {
  DAY_SHAPES, DAY_CATEGORIES, DAY_FACETS, DAY_FACET_GROUPS, SHAPE_KINDS,
  SIGNAL_FLAGS, matchesDayFacets, buoyDayTraits, signDayTraits,
} from '../data/dayshapes.js';
import { WATER_SIGNS, SIGN_GROUPS } from '../data/watersigns.js';

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
  // Bei Tag oder bei Nacht – bestimmt, welche Reiter es überhaupt gibt.
  mode: 'nacht',         // 'nacht' | 'tag'
  tab: 'lichter',        // nachts: lichter|tonnen|schall|grundlagen
  //                        tags: koerper|flaggen|schall|grundlagen
  facets: new Set(),     // gewählte Merkmale der Lichtersuche
  dayFacets: new Set(),  // gewählte Merkmale der Signalkörpersuche
  category: 'all',
  dayCategory: 'all',
  aspect: 'bow',         // Blickrichtung auf das fremde Fahrzeug
  soundGroup: 'manoever',
  playing: null,
};

/** Welche Reiter gehören zu welcher Betriebsart? */
const TABS = {
  nacht: ['lichter', 'tonnen', 'schall', 'grundlagen'],
  tag: ['koerper', 'tonnen', 'schilder', 'schall', 'grundlagen'],
};

const TAB_LABEL = {
  lichter: 'night.tab.lights',
  tonnen: 'night.tab.buoys',
  koerper: 'night.tab.shapes',
  schilder: 'night.tab.signs',
  schall: 'night.tab.sounds',
  grundlagen: 'night.tab.basics',
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
  const tabs = TABS[state.mode];
  // Nach dem Umschalten kann der bisherige Reiter in der neuen Betriebsart
  // gar nicht vorkommen – dann auf den ersten zurückfallen.
  if (!tabs.includes(state.tab)) [state.tab] = tabs;

  render(container,
    // Tag oder Nacht steht ganz oben und über allem anderen: Es ist keine
    // Auswahl unter Gleichen, sondern die Frage, welcher Satz Zeichen
    // überhaupt gilt.
    h('div.seg.mode-seg', { style: { 'margin-bottom': '10px' } },
      modeBtn('nacht', t('night.mode.night')),
      modeBtn('tag', t('night.mode.day')),
    ),

    // Bei fünf Reitern wird die Schrift kleiner statt der Leiste breiter.
    h(`div.seg${tabs.length > 4 ? '.seg-eng' : ''}`, { style: { 'margin-bottom': '14px' } },
      ...tabs.map((key) => tabBtn(key, t(TAB_LABEL[key]))),
    ),

    state.tab === 'lichter' ? lightsView()
      : state.tab === 'tonnen' ? buoysView()
        : state.tab === 'koerper' ? shapesView()
          : state.tab === 'schilder' ? signsView()
            : state.tab === 'schall' ? soundsView()
              : basicsView(),
  );
}

function modeBtn(key, label) {
  return h('button', {
    type: 'button',
    'data-mode': key,
    'aria-pressed': String(state.mode === key),
    onclick: () => {
      if (state.mode === key) return;
      state.mode = key;
      [state.tab] = TABS[key];
      draw();
      window.scrollTo(0, 0);
    },
  }, label);
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
    h('div.notice', t('night.searchHint')),

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

    // Die Merkmale stehen offen da, wie bei Tage auch.
    //
    // Vorher lagen sie hinter einem Knopf und einem Blatt, das sich über den
    // Schirm legte. Der Gedanke war, nachts große Flächen zum Zielen zu
    // bieten; in Wahrheit waren es zwei Griffe mehr für dieselbe Frage, und
    // die Antwort stand hinter dem Blatt, das man erst wegschieben musste.
    // Jetzt tippt man ein Merkmal an und sieht darunter sofort, was bleibt.
    facetCard(),

    h('div.filter-chips', { style: { 'margin-bottom': '12px' } },
      ...LIGHT_CATEGORIES.map((c) => h('button.chip', {
        type: 'button',
        'aria-pressed': String(state.category === c.key),
        onclick: () => { state.category = c.key; draw(); },
      }, en() ? c.labelEn : c.label)),
    ),

    h('p.small.muted', { style: { margin: '0 4px 10px' } },
      t('night.searchCount', { n: found.length })),

    found.length === 0
      ? h('div.card', h('div.empty', t('night.noMatch')))
      : h('div', ...found.map((f) => (f.kind === 'buoy' ? buoyCard(f.item, true) : lightCard(f.item)))),

    h('p.disclaimer', t('night.lightsDisclaimer')),
  );
}

/**
 * Die Merkmale, nach Gruppen.
 *
 * Was zu keinem Ergebnis mehr führte, wird gar nicht erst angeboten – so
 * kann man sich nicht in eine leere Antwort hineinklicken. Diese Rechnung
 * stammt aus der alten Suchmaske und ist das einzige daran, was zu behalten
 * sich lohnte.
 *
 * Die Zahl auf dem Merkmal sagt, was danach bliebe. Nachts, wenn man ein
 * grünes Licht sieht und nicht weiß, ob es ein Fahrzeug oder eine Tonne ist,
 * ist das der Unterschied zwischen einem Griff und vieren.
 */
function facetCard() {
  const gruppen = FACET_GROUPS.map((group) => {
    const chips = LIGHT_FACETS
      .filter((f) => f.group === group.key)
      .map((facet) => {
        const chosen = state.facets.has(facet.key);
        const probe = new Set(state.facets);
        if (chosen) probe.delete(facet.key);
        else probe.add(facet.key);
        const count = searchAll(probe, 'all').length;
        if (!chosen && count === 0) return null;
        return h('button.chip', {
          type: 'button',
          'data-facet': facet.key,
          'aria-pressed': String(chosen),
          onclick: () => {
            if (chosen) state.facets.delete(facet.key);
            else state.facets.add(facet.key);
            draw();
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
    return h('div', { style: { 'margin-bottom': '10px' } },
      h('div.small.muted', { style: { 'margin-bottom': '6px' } },
        en() ? group.labelEn : group.label),
      h('div.filter-chips', ...chips),
    );
  }).filter(Boolean);

  return h('div.card', ...gruppen);
}

function lightCard(l) {
  const mnemonic = loc(l, 'mnemonic');
  const note = loc(l, 'note');
  return h('div.card.light-card',
    h('div.light-head',
      h('div.light-aspect',
        lightSchematic(l, state.aspect),
        aspectSwitch(),
      ),
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
    h('p.aspect-caption', t(`night.aspect.${state.aspect}.caption`)),
    h('ul.checklist.plain', { style: { 'margin-top': '10px' } },
      ...loc(l, 'lights').map((x) => h('li', x))),
    mnemonic && h('div.mnemonic', '„', mnemonic, '“'),
    note && h('p.small.muted', { style: { margin: '10px 0 0' } }, note),
  );
}

/** Umschalter für die Ansicht – gilt für alle Karten zugleich. */
function aspectSwitch() {
  return h('div.seg.aspect-seg', {
    role: 'group',
    'aria-label': t('night.aspect.label'),
  },
  ...ASPECTS.map((key) => h('button', {
    type: 'button',
    'data-aspect': key,
    'aria-pressed': String(state.aspect === key),
    title: t(`night.aspect.${key}.title`),
    onclick: () => { state.aspect = key; draw(); },
  }, t(`night.aspect.${key}.short`))),
  );
}

// -------------------------------------------------- Ansichten aus den Sektoren

export const ASPECTS = ['bow', 'beam', 'stern'];

/**
 * Welche Laterne ist aus welcher Richtung zu sehen?
 *
 * Grundlage sind die Sektoren der KVR Regel 21. Aus jeder Laterne werden die
 * Lichter abgeleitet, die in der gewählten Ansicht tatsächlich brennen – so
 * kann kein Bild etwas zeigen, was von dort gar nicht sichtbar wäre.
 *
 *   bow    querab bis querab über den Bug   – Topplichter, beide Seitenlichter
 *   beam   genau querab, Steuerbordseite    – Topplichter, ein Seitenlicht
 *   stern  über das Heck                    – Heck- und Schlepplicht
 */
function visibleLights(lantern, aspect, ctx = {}) {
  const { k, c, y, at } = lantern;
  switch (k) {
    case 'masthead': {
      if (aspect === 'stern') return [];
      // Zwei Topplichter stehen längsschiffs versetzt: Das achtere steht
      // höher. Von der Seite muss man das sehen, von vorn stehen sie in Linie.
      const along = ctx.mastheads > 1 ? (ctx.rank === 0 ? 'mastAft' : 'mastFore') : 'mast';
      return [{ c: 'w', y, along }];
    }
    case 'side':
      if (aspect === 'stern') return [];
      if (aspect === 'beam') return [{ c: 'g', y: 74, along: 'fore' }];
      return [
        // Kommt sie auf dich zu, liegt ihre Steuerbordseite links von dir.
        { c: 'g', y: 74, across: lantern.wide ? -34 : -26 },
        { c: 'r', y: 74, across: lantern.wide ? 34 : 26 },
      ];
    case 'stern':
      return aspect === 'stern' ? [{ c: 'w', y: 70, along: 'mast' }] : [];
    case 'towing':
      return aspect === 'stern' ? [{ c: 'y', y: y ?? 52, along: 'mast' }] : [];
    case 'tricolor':
      if (aspect === 'stern') return [{ c: 'w', y, along: 'mast' }];
      if (aspect === 'beam') return [{ c: 'g', y, along: 'mast' }];
      return [{ c: 'g', y, across: -9 }, { c: 'r', y, across: 9 }];
    case 'flash':
      return [{ c: c ?? 'y', y, along: at ?? 'mast', flash: true }];
    case 'torch':
      return [{ c: 'w', y, along: 'mast' }];
    case 'allround':
    default:
      return [{ c: c ?? 'w', y, along: at ?? 'mast' }];
  }
}

/** Rechnet Höhe und Lage in Bildkoordinaten um. */
function place(light, aspect) {
  const MAST = 50;
  if (aspect === 'beam') {
    // Seitenansicht: Bug rechts. Vorn liegt weiter rechts, achtern links.
    const along = {
      mast: MAST, fore: 74, aft: 26, port: MAST - 4, stbd: MAST + 4,
      mastAft: 38, mastFore: 62,
    };
    const x = light.across !== undefined
      ? MAST + light.across * 0.55
      : along[light.along] ?? MAST;
    return { ...light, x };
  }
  // Bug- und Heckansicht: längsschiffs versetzte Laternen stehen in Linie,
  // querschiffs versetzte spreizen sich auf.
  const across = { port: -26, stbd: 26 };
  const offset = light.across !== undefined
    ? light.across
    : (across[light.along] ?? 0);
  // Von achtern gesehen liegt Backbord rechts – die Seite kippt.
  return { ...light, x: MAST + (aspect === 'stern' ? -offset : offset) };
}

/**
 * Schematische Ansicht: Lichter als Punkte auf dunklem Grund, dazu ein
 * angedeuteter Rumpf, damit erkennbar bleibt, wohin man schaut.
 */
function lightSchematic(l, aspect) {
  const el = svg('svg.light-view', {
    viewBox: '0 0 100 100',
    role: 'img',
    'aria-label': `${loc(l, 'title')} – ${t(`night.aspect.${aspect}.title`)}`,
  });

  hull(el, aspect);

  const lanterns = l.lanterns ?? [];
  // Reihenfolge der Topplichter von oben nach unten – das oberste ist das
  // achtere. Nur so lässt sich der Längsversatz richtig zeichnen.
  const mastheads = lanterns
    .filter((x) => x.k === 'masthead')
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));

  const lights = lanterns
    .flatMap((lantern) => visibleLights(lantern, aspect, {
      mastheads: mastheads.length,
      rank: mastheads.indexOf(lantern),
    }))
    .map((light) => place(light, aspect));

  lights.forEach((lt) => {
    const hex = LIGHT_COLORS[lt.c]?.hex ?? LIGHT_COLORS.w.hex;
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

  // Zeigt sie aus dieser Richtung gar nichts, ist das die Antwort – kein Bug.
  if (!lights.length) {
    el.appendChild(svg('text', {
      class: 'aspect-none', x: 50, y: 46, 'text-anchor': 'middle', 'font-size': '9',
    }, t('night.aspect.dark')));
  }

  return el;
}

/** Rumpfandeutung je nach Blickrichtung. */
function hull(el, aspect) {
  const line = { fill: '#1a2433', stroke: '#2b3949', 'stroke-width': '1' };
  if (aspect === 'beam') {
    // Längsseits, Bug nach rechts
    el.appendChild(svg('path', { ...line, d: 'M10 84 L84 84 L94 89 L86 95 L16 95 Z' }));
    el.appendChild(svg('line', {
      x1: '50', y1: '84', x2: '50', y2: '8', stroke: '#2b3949', 'stroke-width': '1.4',
    }));
    return;
  }
  // Von vorn und von achtern: schmaler Querschnitt. Das Heck steht kantiger.
  el.appendChild(svg('path', {
    ...line,
    d: aspect === 'stern' ? 'M20 84 L80 84 L78 94 L22 94 Z' : 'M18 84 L82 84 L74 94 L26 94 Z',
  }));
  el.appendChild(svg('line', {
    x1: '50', y1: '84', x2: '50', y2: '8', stroke: '#2b3949', 'stroke-width': '1.4',
  }));
}

// ================================================================== Seezeichen

function buoysView() {
  const byDay = state.mode === 'tag';
  return h('div',
    h('div.notice', byDay ? t('night.buoyIntroDay') : t('night.buoyIntro')),

    ...BUOY_GROUPS.map((group) => h('div',
      h('h2.section', loc(group, 'label')),
      h('p.small.muted', { style: { margin: '0 4px 9px' } }, loc(group, 'hint')),
      ...BUOYS.filter((b) => b.group === group.key)
        .map((b) => buoyCard(b, false, state.mode === 'tag')),
    )),

    !byDay && h('div.card',
      h('h2', t('night.rhythms')),
      h('table.data.kv',
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

function buoyCard(b, marked = false, byDay = false) {
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
        // Bei Tage sieht man von einer Tonne die Farben und das Toppzeichen,
        // nicht das Feuer. Die Kennung dann anzuzeigen hieße, nach etwas
        // suchen zu lassen, was gar nicht zu sehen ist.
        byDay
          ? h('p.buoy-day',
            ...(b.bands ?? []).map((c) => h('span.buoy-band', {
              style: { background: BUOY_COLORS[c] },
              title: colorName(c),
            })),
            h('span.small.muted', { style: { 'margin-left': '8px' } },
              (b.bands ?? []).map(colorName).join('–')),
          )
          : [
            h('p.buoy-light',
              h('span.buoy-dot', { style: { background: lightSwatch(b.lightColor) } }),
              h('span.mono', loc(b, 'light')),
            ),
            h('p.small', { style: { margin: '4px 0 0' } }, loc(b, 'lightPlain')),
            rhythmBar(b.rhythm, b.rhythmIsExample),
          ],
      ),
    ),
    h('p.small', { style: { margin: '10px 0 0' } }, loc(b, 'meaning')),
    memo && h('div.mnemonic', '„', memo, '“'),
  );
}

/** Der Name einer Farbe in der Sprache der Oberfläche. */
function colorName(key) {
  const facet = DAY_FACETS.find((f) => f.kind === 'color' && f.key === key);
  return (en() ? facet?.labelEn : facet?.label) ?? key;
}

// ================================================================== Schilder

/**
 * Die Tafeln am Ufer.
 *
 * Vier Klassen, und man erkennt sie an der Tafel, bevor man das Sinnbild
 * darauf lesen kann – aus der Entfernung ist genau das die einzige
 * Information, die ankommt. Gezeichnet wird deshalb die Klasse, das Sinnbild
 * steht daneben im Text: Ein nachgemaltes Sinnbild, das nicht genau stimmt,
 * wäre schlimmer als eine ehrliche Beschreibung.
 */
function signsView() {
  return h('div',
    h('div.notice', t('night.signsIntro')),

    ...SIGN_GROUPS.map((g) => h('div',
      h('h2.section', en() ? g.labelEn : g.label),
      h('p.small.muted', { style: { margin: '0 4px 9px' } }, en() ? g.hintEn : g.hint),
      ...WATER_SIGNS.filter((x) => x.group === g.key).map((x) => signCard(x)),
    )),

    h('div.card',
      h('h2', t('night.distressDay')),
      h('p.small.muted', { style: { margin: '0 0 9px' } }, t('night.distressDayHint')),
      h('ul.checklist.plain', ...DISTRESS_VISUAL.map((x) => h('li', en() ? x.en : x.de))),
    ),

    h('p.disclaimer', t('night.signsDisclaimer')),
  );
}

function signCard(x, marked = false) {
  return h('div.card.sign-card',
    signPlate(x),
    h('div.grow',
      h('div.row', { style: { gap: '7px', 'align-items': 'flex-start' } },
        h('h3.grow', { style: { margin: 0 } }, en() ? x.titleEn : x.title),
        marked && h('span.rule', t('night.isSign')),
      ),
      h('div.sub', en() ? x.lookEn : x.look),
      h('p', { style: { margin: '7px 0 0' } }, en() ? x.meaningEn : x.meaning),
      h('p.small.muted', { style: { margin: '5px 0 0' } },
        t('night.signWhere'), ' ', en() ? x.whereEn : x.where),
    ),
  );
}

/** Die Tafel selbst – Grundfarbe, Rand, Balken, und ein Zeichen darauf. */
function signPlate(x) {
  const W = 64;
  const H = 64;
  const p = x.plate ?? {};
  const el = svg('svg.sign-plate', {
    viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': en() ? x.lookEn : x.look,
  });

  const felder = { white: '#ffffff', red: '#e02020', blue: '#1263d2' };
  el.appendChild(svg('rect', {
    x: 1, y: 1, width: W - 2, height: H - 2, rx: 3, fill: felder[p.field] ?? '#ffffff',
  }));

  if (p.border === 'red') {
    el.appendChild(svg('rect', {
      x: 4, y: 4, width: W - 8, height: H - 8, rx: 2,
      fill: 'none', stroke: '#e02020', 'stroke-width': 7,
    }));
  }

  // Der weiße Querstreifen des allgemeinen Fahrverbots.
  if (p.bar === 'stripe') {
    el.appendChild(svg('rect', { x: 1, y: 27, width: W - 2, height: 10, fill: '#ffffff' }));
  }
  // Der rote Schrägbalken über dem Sinnbild.
  if (p.bar === 'diagonal') {
    el.appendChild(svg('line', {
      x1: 11, y1: 53, x2: 53, y2: 11, stroke: '#e02020', 'stroke-width': 6,
    }));
  }
  if (p.bar === 'end') {
    el.appendChild(svg('line', {
      x1: 10, y1: 32, x2: 54, y2: 32, stroke: '#111418', 'stroke-width': 5,
    }));
  }

  if (p.glyph) {
    el.appendChild(svg('text', {
      class: 'sign-glyph', x: W / 2, y: H / 2 + 6,
      'text-anchor': 'middle',
      fill: p.field === 'blue' ? '#ffffff' : '#111418',
      'font-size': String(p.glyph.length > 2 ? 16 : 24),
    }, p.glyph));
  }

  el.appendChild(svg('rect', {
    x: 1, y: 1, width: W - 2, height: H - 2, rx: 3,
    fill: 'none', class: 'sign-frame',
  }));
  return el;
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
  const el = svg('svg.light-view.buoy-view', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
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

// ============================================================== Signalkörper

/**
 * Die Signalkörper – dieselbe Suche wie bei den Laternen, nur nach Formen.
 *
 * Bei Tage zählt nicht die Farbe, sondern die Form und ihre Anzahl. Man sieht
 * schwarze Körper an einem Mast und will wissen, was sie bedeuten – nicht,
 * wie das Fahrzeug heißt.
 */
function shapesView() {
  const active = [...state.dayFacets];
  // Wie nachts die Lichter: Fahrzeuge, Seezeichen und Tafeln stehen in einer
  // Liste. Man sieht bei Tage etwas Schwarzes, Rotes oder Gelbes und weiß
  // gerade nicht, ob da ein Fahrzeug fährt, eine Tonne liegt oder eine Tafel
  // am Ufer steht.
  const koerper = DAY_SHAPES
    .filter((d) => (state.dayCategory === 'all' || d.category === state.dayCategory)
      && matchesDayFacets(d, state.dayFacets))
    .map((item) => ({ item, kind: 'shape' }));

  // Tonnen und Tafeln nur, wenn nach einem Merkmal gesucht wird, das sie
  // haben kann – sonst stünden bei „alle“ vierzig Einträge übereinander.
  const gesucht = state.dayFacets.size > 0;
  const tonnen = gesucht && state.dayCategory === 'all'
    ? BUOYS.filter((b) => matchesDayFacets({ traits: buoyDayTraits(b) }, state.dayFacets))
      .map((item) => ({ item, kind: 'buoy' }))
    : [];
  const tafeln = gesucht && state.dayCategory === 'all'
    ? WATER_SIGNS.filter((x) => matchesDayFacets({ traits: signDayTraits(x) }, state.dayFacets))
      .map((item) => ({ item, kind: 'sign' }))
    : [];

  const found = [...koerper, ...tonnen, ...tafeln];

  return h('div',
    h('div.notice', t('night.shapesIntro')),

    active.length > 0 && h('div.card',
      h('div.row.wrap', { style: { gap: '7px' } },
        h('span.small.muted', { style: { width: '100%' } }, t('night.activeFilter')),
        ...active.map((key) => {
          const facet = DAY_FACETS.find((f) => f.key === key);
          return h('button.chip', {
            type: 'button',
            'aria-pressed': 'true',
            onclick: () => { state.dayFacets.delete(key); draw(); },
          },
          facet?.kind === 'color' && h('span.swatch', { style: { background: BUOY_COLORS[key] } }),
          `${en() ? facet?.labelEn : facet?.label} ✕`);
        }),
        h('button.chip', {
          type: 'button',
          onclick: () => { state.dayFacets.clear(); draw(); },
        }, t('night.resetFilter')),
      ),
    ),

    // Die Merkmale stehen offen da statt hinter einem Knopf: Es sind wenige,
    // und bei Tage hat man die Ruhe, sie zu lesen.
    h('div.card',
      ...DAY_FACET_GROUPS.map((g) => h('div', { style: { 'margin-bottom': '10px' } },
        h('div.small.muted', { style: { 'margin-bottom': '6px' } }, en() ? g.labelEn : g.label),
        h('div.filter-chips',
          ...DAY_FACETS.filter((f) => f.kind === g.kind).map((f) => h('button.chip', {
            type: 'button',
            'aria-pressed': String(state.dayFacets.has(f.key)),
            onclick: () => {
              if (state.dayFacets.has(f.key)) state.dayFacets.delete(f.key);
              else state.dayFacets.add(f.key);
              draw();
            },
          },
          f.kind === 'color' && h('span.swatch', { style: { background: BUOY_COLORS[f.key] } }),
          en() ? f.labelEn : f.label)),
        ),
      )),
    ),

    h('div.filter-chips', { style: { 'margin-bottom': '12px' } },
      ...DAY_CATEGORIES.map((c) => h('button.chip', {
        type: 'button',
        'aria-pressed': String(state.dayCategory === c.key),
        onclick: () => { state.dayCategory = c.key; draw(); },
      }, en() ? c.labelEn : c.label)),
    ),

    found.length === 0
      ? h('div.card', h('div.empty', t('night.noMatch')))
      : h('div', ...found.map((f) => (f.kind === 'buoy' ? buoyCard(f.item, true, true)
        : f.kind === 'sign' ? signCard(f.item, true)
          : shapeCard(f.item)))),

    !gesucht && h('p.small.muted', { style: { margin: '0 4px 12px' } }, t('night.dayAlsoHint')),

    // Die fünf Formen selbst, zum Vergleich nebeneinander.
    h('div.card',
      h('h2', t('night.shapeKinds')),
      h('div.shape-legend',
        ...SHAPE_KINDS.map((k) => h('div.shape-legend-item',
          shapeGlyph(k.key, 34),
          h('div',
            h('div.wp-name', en() ? k.labelEn : k.label),
            h('div.small.muted', en() ? k.hintEn : k.hint),
          ),
        )),
      ),
    ),

    // Die Flaggen gehören dazu: Auch sie hängt das Fahrzeug auf, um etwas zu
    // sagen – nur aus Tuch statt aus Holz.
    h('h2.section', t('night.tab.flags')),
    h('p.small.muted', { style: { margin: '0 4px 9px' } }, t('night.flagsIntro')),
    ...SIGNAL_FLAGS.map((f) => h('div.card.flag-card',
      flagGlyph(f),
      h('div.grow',
        h('div.row', { style: { gap: '8px', 'align-items': 'baseline' } },
          h('h3', { style: { margin: 0 } }, f.key),
          h('span.small.muted', f.name),
        ),
        h('p', { style: { margin: '4px 0 0' } }, en() ? f.meaningEn : f.meaning),
      ),
    )),

    h('p.disclaimer', t('night.lightsDisclaimer')),
  );
}

function shapeCard(d) {
  const note = loc(d, 'note');
  return h('div.card.light-card',
    h('div.light-head',
      h('div.light-aspect', shapeSchematic(d)),
      h('div.txt',
        h('div.row', { style: { gap: '7px', 'align-items': 'flex-start' } },
          h('div.grow',
            h('h3', loc(d, 'title')),
            h('div.sub', loc(d, 'subtitle')),
          ),
          h('span.rule', loc(d, 'rule')),
        ),
        h('p.light-pattern', loc(d, 'pattern')),
      ),
    ),
    h('ul.checklist.plain', { style: { 'margin-top': '10px' } },
      ...loc(d, 'signs').map((x) => h('li', x))),
    note && h('p.small.muted', { style: { margin: '10px 0 0' } }, note),
  );
}

/** Mast mit den Körpern daran, wie man sie von der Seite sieht. */
function shapeSchematic(d) {
  const el = svg('svg.light-view.day-view', {
    viewBox: '0 0 100 100',
    role: 'img',
    'aria-label': `${loc(d, 'title')} – ${loc(d, 'pattern')}`,
  });

  // Rumpf und Mast: nur so viel, dass man die Höhe einordnen kann.
  el.appendChild(svg('path', {
    class: 'day-hull', d: 'M14 84 L86 84 L94 89 L86 95 L20 95 Z',
  }));
  el.appendChild(svg('line', {
    class: 'day-mast', x1: 50, y1: 84, x2: 50, y2: 10,
  }));

  const shapes = d.shapes ?? [];
  if (!shapes.length) {
    el.appendChild(svg('text', {
      class: 'aspect-none', x: 50, y: 46, 'text-anchor': 'middle', 'font-size': '8',
    }, t('night.noShape')));
    return el;
  }

  shapes.forEach((sh) => {
    // Die Minensucher-Bälle hängen an den Rahnocken, nicht am Mast.
    const x = sh.at === 'port' ? 26 : sh.at === 'stb' ? 74 : 50;
    if (sh.at) {
      el.appendChild(svg('line', { class: 'day-mast', x1: 26, y1: sh.y, x2: 74, y2: sh.y }));
    }
    el.appendChild(shapeGlyphAt(sh.k, x, sh.y, 9));
  });

  return el;
}

/**
 * Ein einzelner Signalkörper.
 *
 * Schwarz, mit heller Kontur: Auf einem dunklen Hintergrund wäre ein schwarzer
 * Ball sonst nicht von der Fläche zu unterscheiden – und diese App läuft auch
 * im dunklen Schema.
 */
function shapeGlyphAt(kind, cx, cy, r) {
  const g = svg('g', { class: 'day-shape' });
  const add = (tag, attrs) => g.appendChild(svg(tag, attrs));

  if (kind === 'ball') {
    add('circle', { cx, cy, r });
  } else if (kind === 'cone-down') {
    add('polygon', { points: `${cx - r},${cy - r} ${cx + r},${cy - r} ${cx},${cy + r}` });
  } else if (kind === 'cone-up') {
    add('polygon', { points: `${cx - r},${cy + r} ${cx + r},${cy + r} ${cx},${cy - r}` });
  } else if (kind === 'biconic') {
    // Zwei Kegel, Spitzen aneinander – das Zeichen für den Fischfang.
    add('polygon', { points: `${cx - r},${cy - r * 1.5} ${cx + r},${cy - r * 1.5} ${cx},${cy}` });
    add('polygon', { points: `${cx - r},${cy + r * 1.5} ${cx + r},${cy + r * 1.5} ${cx},${cy}` });
  } else if (kind === 'cylinder') {
    // Doppelt so hoch wie breit, wie in Anlage I.
    add('rect', { x: cx - r * 0.7, y: cy - r * 1.4, width: r * 1.4, height: r * 2.8, rx: 1 });
  } else if (kind === 'diamond') {
    add('polygon', {
      points: `${cx},${cy - r * 1.4} ${cx + r},${cy} ${cx},${cy + r * 1.4} ${cx - r},${cy}`,
    });
  } else if (kind === 'flag-a') {
    // Steifes Abbild der Flagge Alfa: weiß am Stock, blau mit Schwalbenschwanz.
    add('rect', { class: 'flag-white', x: cx - r, y: cy - r, width: r, height: r * 2 });
    add('polygon', {
      class: 'flag-blue',
      points: `${cx},${cy - r} ${cx + r * 1.3},${cy - r} ${cx + r * 0.75},${cy} ${cx + r * 1.3},${cy + r} ${cx},${cy + r}`,
    });
  }
  return g;
}

/** Derselbe Körper freistehend, für die Übersicht der Formen. */
function shapeGlyph(kind, size) {
  const el = svg('svg.shape-glyph', {
    viewBox: '0 0 40 40', width: size, height: size, 'aria-hidden': 'true',
  });
  el.appendChild(shapeGlyphAt(kind, 20, 20, 11));
  return el;
}

// =================================================================== Flaggen

/**
 * Die Flaggen, die auf einer Yacht wirklich vorkommen.
 *
 * Das ganze Signalbuch hat vierzig Flaggen; die meisten davon sieht man nie.
 * Hier stehen die, deren Bedeutung im Fahrwasser oder im Notfall zählt –
 * gezeichnet statt als Bilddatei, damit sie auch ohne Verbindung da sind.
 */
/** Eine Flagge als Zeichnung – Streifen, Felder, Schrägen. */
function flagGlyph(f) {
  const W = 60;
  const H = 40;
  const el = svg('svg.flag-view', {
    viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${f.key} – ${f.name}`,
  });

  const rect = (x, y, w, hgt, c) => el.appendChild(svg('rect', {
    x, y, width: w, height: hgt, fill: c,
  }));

  if (f.shape === 'checker') {
    // November: 16 Felder im Schachbrett, blau und weiß.
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        rect(col * W / 4, row * H / 4, W / 4, H / 4, f.bands[(row + col) % 2].c);
      }
    }
  } else if (f.shape === 'diag') {
    // Oscar: schräg geteilt, rot oben links, gelb unten rechts.
    rect(0, 0, W, H, f.bands[1].c);
    el.appendChild(svg('polygon', { points: `0,0 ${W},0 0,${H}`, fill: f.bands[0].c }));
  } else if (f.shape === 'saltire') {
    // Victor: rotes Andreaskreuz auf Weiß.
    rect(0, 0, W, H, f.bands[0].c);
    el.appendChild(svg('path', {
      d: `M0 0 L${W} ${H} M${W} 0 L0 ${H}`,
      stroke: f.bands[1].c, 'stroke-width': 11, fill: 'none',
    }));
  } else if (f.shape === 'swallow') {
    // Alfa: weiß am Stock, blau mit Schwalbenschwanz.
    rect(0, 0, W / 2, H, f.bands[0].c);
    el.appendChild(svg('polygon', {
      points: `${W / 2},0 ${W},0 ${W * 0.76},${H / 2} ${W},${H} ${W / 2},${H}`,
      fill: f.bands[1].c,
    }));
  } else if (f.horizontal) {
    let y = 0;
    f.bands.forEach((b) => { rect(0, y, W, H * b.w / 100, b.c); y += H * b.w / 100; });
  } else {
    let x = 0;
    f.bands.forEach((b) => { rect(x, 0, W * b.w / 100, H, b.c); x += W * b.w / 100; });
  }

  // Rahmen, damit eine weiße Flagge auf hellem Grund nicht verschwindet.
  el.appendChild(svg('rect', {
    x: 0.5, y: 0.5, width: W - 1, height: H - 1, class: 'flag-frame', fill: 'none',
  }));
  return el;
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

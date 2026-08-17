/**
 * Modul „Ausweichregeln“ – wer weicht wem aus, als Lage von oben.
 *
 * Eine Ausweichregel ist eine räumliche Sache: Wer wo steht, wer wohin fährt,
 * von welcher Seite der Wind kommt. In Worten braucht das drei Sätze und einen
 * zweiten Anlauf; als Draufsicht sieht man es. Deshalb steht bei jeder Regel
 * die Lage, und der Text daneben sagt nur, was zu tun ist.
 *
 * Zwei Dinge stehen bewusst bei jeder Regel:
 *
 * Erstens, wer *nicht* ausweicht. „Kurs und Fahrt beibehalten“ ist eine
 * Pflicht und keine Erlaubnis, und sie ist genauso Teil der Regel wie das
 * Ausweichen selbst – wer aus Höflichkeit vom Kurs abgeht, macht die Lage für
 * den anderen unberechenbar.
 *
 * Zweitens Regel 17: Der Kurshalter muss selbst handeln, sobald erkennbar
 * wird, dass der andere nichts tut. Ein Recht auf Vorfahrt gibt es auf See
 * nicht, und ein Blechschaden mit Recht ist immer noch ein Blechschaden.
 */

import { h, svg, render } from '../lib/dom.js';
import { t, loc, uiLang } from '../lib/i18n.js';
import { SEA_RULES, RULE_GROUPS, RULE_ORDER } from '../data/searules.js';

let container = null;
let gruppe = 'alle-zeigen';

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  return () => { container = null; };
}

const en = () => uiLang() === 'en';

function draw() {
  if (!container) return;
  const treffer = gruppe === 'alle-zeigen'
    ? SEA_RULES
    : SEA_RULES.filter((r) => r.group === gruppe);

  render(container,
    h('div.notice', t('rules.intro')),

    h('div.filter-chips', { style: { 'margin-bottom': '14px' } },
      h('button.chip', {
        type: 'button',
        'data-group': 'alle-zeigen',
        'aria-pressed': String(gruppe === 'alle-zeigen'),
        onclick: () => { gruppe = 'alle-zeigen'; draw(); },
      }, t('rules.allGroups')),
      ...RULE_GROUPS.map((g) => h('button.chip', {
        type: 'button',
        'data-group': g.key,
        'aria-pressed': String(gruppe === g.key),
        onclick: () => { gruppe = g.key; draw(); },
      }, en() ? g.labelEn : g.label)),
    ),

    ...treffer.map(ruleCard),

    rankCard(),

    // Der Satz, der über allen anderen steht.
    h('div.card',
      h('h2', t('rules.rule17')),
      h('p', { style: { margin: 0 } }, t('rules.rule17Text')),
    ),

    h('p.disclaimer', t('rules.disclaimer')),
  );
}

function ruleCard(r) {
  const weichtA = r.weicht === 'a' || r.weicht === 'beide';
  const weichtB = r.weicht === 'b' || r.weicht === 'beide';

  return h('div.card.rule-card',
    h('div.row', { style: { gap: '8px', 'align-items': 'baseline', 'margin-bottom': '4px' } },
      h('h3.grow', { style: { margin: 0 } }, loc(r, 'title')),
      h('span.rule', r.rule),
    ),

    h('p.small.muted', { style: { margin: '0 0 10px' } }, loc(r, 'situation')),

    plan(r),

    // Wer was tut – als zwei Zeilen, nicht als Fließtext. Auf See liest man
    // keinen Absatz, sondern sucht die eigene Rolle.
    h('div.rule-roles',
      rolle(r.a, weichtA, r),
      rolle(r.b, weichtB, r),
    ),

    h('p', { style: { margin: '10px 0 0' } }, loc(r, 'action')),

    r.mnemonic && h('div.mnemonic', '„', loc(r, 'mnemonic'), '“'),
  );
}

function rolle(schiff, weicht, r) {
  const name = schiff.name && !en() ? schiff.name : (schiff.name ?? '');
  return h('div.rule-role', { class: weicht ? 'weicht' : 'haelt' },
    h('span.rule-role-dot', { 'aria-hidden': 'true' }),
    h('span.grow',
      h('span.rule-role-who', name || (schiff.art === 'segel' ? t('rules.sail') : t('rules.power'))),
      h('span.rule-role-what', weicht
        ? t('rules.givesWay')
        : (r.weicht === 'beide' ? t('rules.givesWay') : t('rules.standsOn'))),
    ),
  );
}

/**
 * Die Lage von oben.
 *
 * Norden ist nicht oben – oben ist die Richtung, in die man schaut. Eine
 * Ausweichlage ist relativ: Es zählt, wer von wo kommt, nicht wo Norden liegt.
 */
function plan(r) {
  const el = svg('svg.rule-plan', {
    viewBox: '0 0 100 100',
    role: 'img',
    'aria-label': `${loc(r, 'title')} – ${loc(r, 'situation')}`,
  });

  // Ein enges Fahrwasser bekommt seine Tonnenlinien.
  if (r.fahrwasser) {
    [26, 74].forEach((x) => el.appendChild(svg('line', {
      class: 'plan-channel', x1: x, y1: 2, x2: x, y2: 98,
    })));
  }

  // Der Wind, wo er zur Regel gehört.
  if (r.wind !== undefined) windArrow(el, r.wind);

  [['a', r.a], ['b', r.b]].forEach(([key, schiff]) => {
    const weicht = r.weicht === key || r.weicht === 'beide';
    el.appendChild(courseArrow(schiff, weicht));
    el.appendChild(boat(schiff, weicht));
  });

  return h('div.rule-plan-frame', el);
}

/** Ein Fahrzeug von oben: spitzer Bug, damit man den Kurs auch ohne Pfeil sieht. */
function boat(schiff, weicht) {
  const g = svg('g', { class: `plan-boat ${weicht ? 'weicht' : 'haelt'} ${schiff.art}` });
  g.setAttribute('transform', `translate(${schiff.x} ${schiff.y}) rotate(${schiff.kurs})`);
  g.appendChild(svg('path', {
    class: 'plan-hull',
    d: 'M0 -11 L4.5 -3 L4 9 L-4 9 L-4.5 -3 Z',
  }));
  // Segelfahrzeuge bekommen ein Segel, damit man sie ohne Beschriftung
  // unterscheidet – bei den Ausweichregeln ist das der halbe Fall.
  if (schiff.art === 'segel') {
    g.appendChild(svg('path', { class: 'plan-sail', d: 'M0 -6 Q5 0 1 7' }));
  } else {
    g.appendChild(svg('circle', { class: 'plan-sail', cx: 0, cy: 1, r: 2.2 }));
  }
  return g;
}

/** Der Kurs als Pfeil vor dem Bug – so weiß man, wohin, nicht nur wohin es zeigt. */
function courseArrow(schiff, weicht) {
  const rad = (schiff.kurs - 90) * Math.PI / 180;
  const x2 = schiff.x + Math.cos(rad) * 26;
  const y2 = schiff.y + Math.sin(rad) * 26;
  const g = svg('g', { class: `plan-course ${weicht ? 'weicht' : 'haelt'}` });
  g.appendChild(svg('line', {
    x1: schiff.x + Math.cos(rad) * 13,
    y1: schiff.y + Math.sin(rad) * 13,
    x2,
    y2,
  }));
  g.appendChild(svg('path', {
    class: 'plan-head',
    d: 'M0 -4 L7 0 L0 4 Z',
    transform: `translate(${x2} ${y2}) rotate(${schiff.kurs - 90})`,
  }));
  return g;
}

/** Woher der Wind kommt – als Fahne am Rand, nicht mitten in der Lage. */
function windArrow(el, richtung) {
  const rad = (richtung - 90) * Math.PI / 180;
  const x = 50 + Math.cos(rad) * 42;
  const y = 50 + Math.sin(rad) * 42;
  const g = svg('g', { class: 'plan-wind' });
  g.setAttribute('transform', `translate(${x} ${y}) rotate(${richtung + 180})`);
  g.appendChild(svg('path', { d: 'M0 -7 L0 9 M0 -7 L-3.5 -1 M0 -7 L3.5 -1' }));
  el.appendChild(g);
  el.appendChild(svg('text', {
    class: 'plan-wind-label',
    x: x + (Math.cos(rad) > 0 ? -9 : 9),
    y: y + 3,
    'text-anchor': Math.cos(rad) > 0 ? 'end' : 'start',
  }, t('rules.wind')));
}

/** Die Rangfolge aus Regel 18 – von oben nach unten gelesen. */
function rankCard() {
  return h('div.card',
    h('h2', t('rules.order')),
    h('p.small.muted', { style: { margin: '0 0 12px' } }, t('rules.orderHint')),
    h('ol.rank-list',
      ...RULE_ORDER.map((x) => h('li',
        h('span.rank-name', en() ? x.labelEn : x.label),
        h('span.rank-hint', en() ? x.hintEn : x.hint),
      )),
    ),
  );
}

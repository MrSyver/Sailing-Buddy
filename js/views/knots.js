/**
 * Modul „Knoten“ – nachschlagen, was man gerade braucht.
 *
 * Der Filter steht oben und fragt nach dem Zweck, nicht nach dem Namen: Wer
 * einen Knoten sucht, weiß, was er vorhat, und gerade nicht, wie das Ding
 * heißt. Erst darunter kommen die Treffer.
 *
 * Bei jedem Knoten steht nicht nur, wie er gelegt wird, sondern auch, was er
 * hält und was nicht. Das ist die Hälfte, die man an Deck vergisst – und die,
 * bei der es darauf ankommt.
 */

import { h, render } from '../lib/dom.js';
import { t, loc, uiLang } from '../lib/i18n.js';
import { KNOTS, KNOT_USES, KNOT_TRAITS, matchesKnot } from '../data/knots.js';

const state = {
  uses: new Set(),
  traits: new Set(),
};

let container = null;

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  return () => { container = null; };
}

const en = () => uiLang() === 'en';

function draw() {
  if (!container) return;
  const found = KNOTS.filter((k) => matchesKnot(k, state.uses, state.traits));

  render(container,
    h('div.notice', t('knots.intro')),

    h('div.card',
      h('h2', t('knots.what')),
      h('div.filter-chips', { 'data-filter': 'use' },
        ...KNOT_USES.map((u) => h('button.chip', {
          type: 'button',
          'aria-pressed': String(state.uses.has(u.key)),
          onclick: () => { toggle(state.uses, u.key); draw(); },
        }, en() ? u.labelEn : u.label)),
      ),

      h('h3', { style: { margin: '16px 0 8px', 'font-size': '.95rem' } }, t('knots.how')),
      h('div.filter-chips', { 'data-filter': 'trait' },
        ...KNOT_TRAITS.map((tr) => h('button.chip', {
          type: 'button',
          'aria-pressed': String(state.traits.has(tr.key)),
          onclick: () => { toggle(state.traits, tr.key); draw(); },
        }, en() ? tr.labelEn : tr.label)),
      ),

      (state.uses.size > 0 || state.traits.size > 0) && h('button.btn.small.block', {
        type: 'button',
        style: { 'margin-top': '12px' },
        onclick: () => { state.uses.clear(); state.traits.clear(); draw(); },
      }, t('night.resetFilter')),
    ),

    h('p.small.muted', { style: { margin: '0 4px 10px' } },
      t('knots.count', { n: found.length, all: KNOTS.length })),

    found.length === 0
      ? h('div.card', h('div.empty', t('knots.noMatch')))
      : h('div', ...found.map(knotCard)),

    h('p.disclaimer', t('knots.disclaimer')),
  );

}

function toggle(set, key) {
  if (set.has(key)) set.delete(key);
  else set.add(key);
}

function knotCard(k) {
  const aka = en() ? k.akaEn : k.aka;
  const mnemonic = en() ? k.mnemonicEn : k.mnemonic;
  const caution = en() ? k.cautionEn : k.caution;

  return h('div.card.knot-card',
    h('div.row', { style: { gap: '8px', 'align-items': 'baseline' } },
      h('h3.grow', { style: { margin: 0 } }, en() ? k.nameEn : k.name),
      // Wofür er da ist, als Merkmal – damit man beim Blättern sieht, in
      // welche Schublade er gehört.
      h('div.row.wrap', { style: { gap: '5px' } },
        ...k.use.map((u) => h('span.rule',
          en()
            ? KNOT_USES.find((x) => x.key === u)?.labelEn
            : KNOT_USES.find((x) => x.key === u)?.label)),
      ),
    ),
    aka && h('div.small.muted', { style: { 'margin-top': '2px' } }, aka),

    h('p.knot-purpose', en() ? k.purposeEn : k.purpose),

    h('h4', t('knots.steps')),
    h('ol.checklist', ...(en() ? k.stepsEn : k.steps).map((x) => h('li', x))),

    mnemonic && h('div.mnemonic', '„', mnemonic, '“'),

    h('p.small', { style: { margin: '10px 0 0' } },
      h('strong', t('knots.holds')), ' ', en() ? k.holdsEn : k.holds),

    caution && h('div.notice.warn', { style: { margin: '10px 0 0' } },
      h('strong', t('knots.caution')), caution),
  );
}

/** Die Übersetzung eines Feldes – hier nur für den Titel gebraucht. */
export function knotTitle(k) {
  return loc(k, 'name');
}

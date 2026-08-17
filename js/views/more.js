/**
 * Modul „Mehr“ – die Tür zu allem, was gerade nicht unten steht.
 *
 * Unten ist Platz für sechs Felder: fünf Bereiche und „Mehr“. Welche fünf das
 * sind, entscheidet die Benutzung. Was hier steht, ist deshalb kein
 * Abstellraum, sondern der Rest – und wer ihn einmal aufruft, findet ihn beim
 * nächsten Mal unten wieder.
 *
 * Genau darum zeigt diese Seite die Bereiche nicht in sich selbst an, sondern
 * ruft sie auf: Ein angetipptes Modul rückt in die Leiste, und dann gehört es
 * dorthin – nicht hinter einen Zurück-Knopf zwei Ebenen tief.
 */

import { h, render } from '../lib/dom.js';
import { t } from '../lib/i18n.js';
import { restModules } from '../lib/modules.js';

/**
 * Zeichen für die Bereiche.
 *
 * Bewusst Textzeichen und keine Emoji: Emoji bringen ihre eigene Farbe mit,
 * und im Nachtmodus ist jede Farbe außer langwelligem Rot ein Verlust an
 * Dunkeladaption.
 */
const ICONS = {
  funk: '((•))',
  position: '◎',
  karte: '▤',
  nacht: '☾',
  logbuch: '▤',
  regeln: '⇄',
  knoten: '∞',
  setup: '⚙',
};

const HINTS = {
  regeln: 'more.rulesHint',
  knoten: 'more.knotsHint',
  setup: 'more.settingsHint',
};

export function view(root) {
  const uebrige = restModules('mehr');
  render(root,
    h('p.small.muted', { style: { margin: '0 4px 12px' } }, t('more.intro')),
    ...uebrige.map((m) => h('button.more-item', {
      type: 'button',
      'data-mod': m.key,
      // Aufrufen heißt benutzen: Der Bereich rückt unten in die Leiste nach
      // und wird dort geöffnet – `show()` in der Hülle erledigt beides.
      onclick: () => window.dispatchEvent(new CustomEvent('sb:open', { detail: m.key })),
    },
    h('span.more-icon', { 'aria-hidden': 'true' }, ICONS[m.key] ?? '▪'),
    h('span.grow',
      h('span.more-name', t(m.label)),
      HINTS[m.key] && h('span.more-hint', t(HINTS[m.key])),
    ),
    h('span.more-arrow', { 'aria-hidden': 'true' }, '›'),
    )),
  );
  return null;
}

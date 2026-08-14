/**
 * Modul „Mehr“ – alles, was keinen eigenen Reiter braucht.
 *
 * Unten ist Platz für sechs Reiter, und die gehören dem, was unterwegs zählt:
 * Funk, Position, Karte, Zeichen, Logbuch. Alles andere – Knoten,
 * Einstellungen und was noch dazukommt – liegt dahinter. Das ist kein
 * Abstellraum, sondern eine Reihenfolge: Was man bei Welle mit einem Griff
 * braucht, steht unten; was man in Ruhe sucht, einen Griff weiter.
 *
 * Die Module werden hier eingehängt, nicht nachgebaut. Jedes bringt seine
 * eigene `view(root)` mit und räumt hinterher selbst auf.
 */

import { h, render } from '../lib/dom.js';
import { t } from '../lib/i18n.js';

import * as knotsView from './knots.js';
import * as settingsView from './settings.js';

/**
 * Was hinter „Mehr“ liegt.
 *
 * `icon` ist ein Textzeichen und bewusst kein Emoji: Emoji bringen ihre eigene
 * Farbe mit, und im Nachtmodus ist jede Farbe außer langwelligem Rot ein
 * Verlust an Dunkeladaption.
 */
const MODULES = [
  { key: 'knoten', icon: '∞', label: 'more.knots', hint: 'more.knotsHint', mod: knotsView },
  { key: 'einstellungen', icon: '⚙', label: 'more.settings', hint: 'more.settingsHint', mod: settingsView },
];

let container = null;
let host = null;
let openKey = null;
let closeSub = null;

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  return () => {
    teardownSub();
    container = null;
    host = null;
    // Beim nächsten Aufschlagen wieder die Liste zeigen: Wer den Reiter
    // verlässt und zurückkommt, sucht die Übersicht, nicht das, was er
    // zuletzt offen hatte.
    openKey = null;
  };
}

function teardownSub() {
  if (closeSub) closeSub();
  closeSub = null;
}

function draw() {
  if (!container) return;
  teardownSub();

  if (!openKey) {
    render(container,
      h('p.small.muted', { style: { margin: '0 4px 12px' } }, t('more.intro')),
      ...MODULES.map((m) => h('button.more-item', {
        type: 'button',
        'data-mod': m.key,
        onclick: () => { openKey = m.key; draw(); window.scrollTo(0, 0); },
      },
      h('span.more-icon', { 'aria-hidden': 'true' }, m.icon),
      h('span.grow',
        h('span.more-name', t(m.label)),
        h('span.more-hint', t(m.hint)),
      ),
      h('span.more-arrow', { 'aria-hidden': 'true' }, '›'),
      )),
    );
    return;
  }

  const modul = MODULES.find((m) => m.key === openKey);
  host = h('div');
  render(container,
    h('div.row', { style: { 'margin-bottom': '12px' } },
      h('button.btn.small', {
        type: 'button',
        onclick: () => { openKey = null; draw(); window.scrollTo(0, 0); },
      }, t('common.back')),
      h('h2.grow', { style: { margin: 0, 'font-size': '1rem' } }, t(modul.label)),
    ),
    host,
  );
  closeSub = modul.mod.view(host);
}

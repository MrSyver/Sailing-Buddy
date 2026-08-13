/**
 * Sailing Buddy – Anwendungshülle.
 *
 * Bewusst ohne Framework und ohne Bauschritt: Was im Verzeichnis liegt, läuft
 * im Browser. Das hält die App klein, schnell und vollständig offline-fähig.
 */

import { h, svg, render } from './lib/dom.js';
import { settings } from './lib/storage.js';
import { gps, GPS_STATUS_KEY } from './lib/gps.js';
import { applyTheme, toggleNight } from './lib/theme.js';
import { formatPosition } from './lib/geo.js';
import { t } from './lib/i18n.js';

import * as radioView from './views/radio.js';
import * as positionView from './views/position.js';
import * as nightView from './views/night.js';
import * as settingsView from './views/settings.js';
import * as setupView from './views/setup.js';

const TABS = [
  { key: 'funk', label: 'tab.radio', title: 'title.radio', view: radioView, icon: iconRadio },
  { key: 'position', label: 'tab.position', title: 'title.position', view: positionView, icon: iconTarget },
  { key: 'nacht', label: 'tab.night', title: 'title.night', view: nightView, icon: iconMoon },
  { key: 'setup', label: 'tab.settings', title: 'title.settings', view: settingsView, icon: iconGear },
];

let current = 'funk';
let teardown = null;

const app = document.getElementById('app');

// -------------------------------------------------------------------- Start

applyTheme();
gps.start();
boot();

function boot() {
  if (!settings.get('setupDone') && !settings.isComplete()) {
    render(app, h('main', h('div', { id: 'setup-root' })));
    setupView.view(document.getElementById('setup-root'), () => {
      shell();
      show(current);
    });
    return;
  }
  shell();
  show(current);
}

// ------------------------------------------------------------------- Hülle

function shell() {
  render(app,
    topbar(),
    gpsbar(),
    h('main', { id: 'main' }),
    tabbar(),
  );
  gps.onUpdate(updateGpsBar);
  window.addEventListener('sb:settings', updateTopbar);
  // Sprachwechsel: die gesamte Oberfläche neu aufbauen.
  window.addEventListener('sb:lang', () => {
    shell();
    show(current);
  });
}

function topbar() {
  return h('header.topbar', { id: 'topbar' }, ...topbarContent());
}

function topbarContent() {
  const s = settings.all();
  const tab = TABS.find((tb) => tb.key === current);
  return [
    h('h1',
      tab ? t(tab.title) : t('app.name'),
      s.boat && h('span.boat-tag', s.boat, s.mmsi ? ` · MMSI ${s.mmsi}` : ''),
    ),
    h('button.icon-btn', {
      type: 'button',
      title: t('night.toggle'),
      'aria-label': t('night.toggle'),
      'aria-pressed': String(s.theme === 'night'),
      onclick: () => {
        toggleNight();
        updateTopbar();
      },
    }, s.theme === 'night' ? iconMoon() : iconContrast()),
  ];
}

function updateTopbar() {
  const bar = document.getElementById('topbar');
  if (bar) render(bar, ...topbarContent());
}

function gpsbar() {
  return h('div.gpsbar', { id: 'gpsbar' }, h('span.dot'), h('span.txt', t('gps.starting')));
}

function updateGpsBar({ fix, status }) {
  const bar = document.getElementById('gpsbar');
  if (!bar) return;
  const stale = gps.isStale(60000);
  bar.className = `gpsbar ${status === 'ok' && !stale ? 'ok' : status === 'searching' ? 'searching' : status === 'ok' ? 'searching' : 'bad'}`;
  render(bar,
    h('span.dot'),
    fix
      ? h('span.pos.grow', formatPosition(fix, 2))
      : h('span.grow', t(GPS_STATUS_KEY[status] ?? 'gps.none')),
    fix?.accuracy && h('span', `±${Math.round(fix.accuracy)} m`),
  );
}

function tabbar() {
  return h('nav.tabs', { id: 'tabs' }, ...TABS.map((tab) => h('button', {
    type: 'button',
    'aria-current': current === tab.key ? 'page' : null,
    onclick: () => show(tab.key),
  }, tab.icon(), h('span', t(tab.label)))));
}

function show(key) {
  const tab = TABS.find((tb) => tb.key === key);
  if (!tab) return;
  current = key;
  if (typeof teardown === 'function') teardown();
  const main = document.getElementById('main');
  if (!main) return;
  // Beim Wechsel zurück auf die Übersicht der Funksprüche.
  if (key === 'funk' && radioView.resetView) radioView.resetView();
  teardown = tab.view.view(main) ?? null;
  updateTopbar();
  document.querySelectorAll('nav.tabs button').forEach((btn, i) => {
    btn.setAttribute('aria-current', TABS[i].key === key ? 'page' : 'false');
  });
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ Symbole

function icon(...paths) {
  const el = svg('svg', {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  });
  paths.forEach((d) => el.appendChild(svg('path', { d })));
  return el;
}

function iconRadio() {
  const el = icon('M4 10h16v9H4z', 'M7 6l10-3');
  el.appendChild(svg('circle', { cx: '8.5', cy: '14.5', r: '2.5' }));
  el.appendChild(svg('path', { d: 'M14 13h4M14 16h4' }));
  return el;
}

function iconTarget() {
  const el = icon('M12 2v3M12 19v3M2 12h3M19 12h3');
  el.appendChild(svg('circle', { cx: '12', cy: '12', r: '7' }));
  el.appendChild(svg('circle', { cx: '12', cy: '12', r: '2.5' }));
  return el;
}

function iconMoon() {
  return icon('M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z');
}

/** Halb gefüllter Kreis – steht für „Farbschema umschalten“. */
function iconContrast() {
  const el = icon('M12 3a9 9 0 0 0 0 18z');
  el.querySelector('path').setAttribute('fill', 'currentColor');
  el.appendChild(svg('circle', { cx: '12', cy: '12', r: '9' }));
  return el;
}

function iconGear() {
  const el = icon('M11 3h2l.4 2.2a7 7 0 0 1 1.8.75l1.9-1.2 1.4 1.4-1.2 1.9c.33.55.58 1.16.75 1.8L20.3 11v2l-2.2.4a7 7 0 0 1-.75 1.8l1.2 1.9-1.4 1.4-1.9-1.2c-.55.33-1.16.58-1.8.75L13 20.3h-2l-.4-2.2a7 7 0 0 1-1.8-.75l-1.9 1.2-1.4-1.4 1.2-1.9a7 7 0 0 1-.75-1.8L3.7 13v-2l2.2-.4c.17-.64.42-1.25.75-1.8L5.45 6.9l1.4-1.4 1.9 1.2c.55-.33 1.16-.58 1.8-.75z');
  el.appendChild(svg('circle', { cx: '12', cy: '12', r: '2.8' }));
  return el;
}

// ------------------------------------------------------- Offline-Bereitstellung

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Ohne Service Worker läuft die App weiter, nur eben nicht offline.
    });
  });
}

// GPS beim Zurückkehren aus dem Hintergrund neu anstoßen (iOS pausiert die Ortung).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') gps.start();
});

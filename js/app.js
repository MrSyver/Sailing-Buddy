/**
 * Sailing Buddy – Anwendungshülle.
 *
 * Bewusst ohne Framework und ohne Bauschritt: Was im Verzeichnis liegt, läuft
 * im Browser. Das hält die App klein, schnell und vollständig offline-fähig.
 */

import { h, svg, render } from './lib/dom.js';
import { settings } from './lib/storage.js';
import { gps, GPS_STATUS_KEY } from './lib/gps.js';
import { applyTheme, applyAutoNight, toggleNight } from './lib/theme.js';
import { formatPosition } from './lib/geo.js';
import { t } from './lib/i18n.js';
import { initOffline, onOfflineChange } from './lib/offline.js';
import { logbook } from './lib/logbook.js';

import * as radioView from './views/radio.js';
import * as positionView from './views/position.js';
import * as mapView from './views/map.js';
import * as nightView from './views/night.js';
import * as logbookView from './views/logbook.js';
import * as settingsView from './views/settings.js';
import * as setupView from './views/setup.js';

const TABS = [
  { key: 'funk', label: 'tab.radio', title: 'title.radio', view: radioView, icon: iconRadio },
  { key: 'position', label: 'tab.position', title: 'title.position', view: positionView, icon: iconTarget },
  { key: 'karte', label: 'tab.map', title: 'title.map', view: mapView, icon: iconMap },
  { key: 'nacht', label: 'tab.night', title: 'title.night', view: nightView, icon: iconMoon },
  { key: 'logbuch', label: 'tab.log', title: 'title.log', view: logbookView, icon: iconBook },
  { key: 'setup', label: 'tab.settings', title: 'title.settings', view: settingsView, icon: iconGear },
];

let current = 'funk';
let teardown = null;

const app = document.getElementById('app');

// -------------------------------------------------------------------- Start

applyTheme();
// Steht die letzte bekannte Position schon fest, gleich nach der Sonne
// entscheiden – sonst blitzt beim Öffnen in der Nacht ein heller Bildschirm
// auf, bevor der erste Fix da ist.
applyAutoNight(settings.get('lastPos'));
gps.start();
watchDaylight();
// Das Logbuch schreibt unabhängig vom gerade sichtbaren Reiter mit.
logbook.startAuto();
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
    // Sprache der Funksprüche: klein und immer erreichbar. Sie wird im
    // Ernstfall gewechselt, nicht beim Einrichten – dann zählt jeder Griff.
    h('button.icon-btn.lang-btn', {
      type: 'button',
      title: t('radio.phraseLang'),
      'aria-label': `${t('radio.phraseLang')}: ${s.phraseLang === 'en' ? 'English' : 'Deutsch'}`,
      onclick: () => {
        settings.set('phraseLang', s.phraseLang === 'en' ? 'de' : 'en');
        updateTopbar();
      },
    }, s.phraseLang === 'en' ? 'EN' : 'DE'),

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

function iconBook() {
  const el = icon('M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z', 'M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5A2.5 2.5 0 0 1 4 20.5z');
  el.appendChild(svg('path', { d: 'M8 7h7M8 10.5h7' }));
  return el;
}

/** Aufgeschlagene Seekarte mit Falz. */
function iconMap() {
  const el = icon('M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z', 'M9 4v13.5M15 6.5V20');
  el.appendChild(svg('circle', { cx: '12', cy: '11', r: '1.6' }));
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

// Anmelden, dauerhaften Speicher anfordern, Vollständigkeit prüfen und
// Lücken schließen, solange noch eine Verbindung da ist.
initOffline();

// Fehlt etwas, erfährt man das hier und nicht erst auf See.
onOfflineChange((offline) => {
  const bar = document.getElementById('offline-warning');
  const show = offline.supported && offline.controlled && !offline.ready && !offline.checking;
  if (!show) {
    bar?.remove();
    return;
  }
  if (bar) return;
  const main = document.getElementById('main');
  if (!main) return;
  main.prepend(h('div.notice.danger', { id: 'offline-warning' },
    h('strong', t('offline.incomplete.title')),
    t('offline.incomplete.text'),
  ));
});

// GPS beim Zurückkehren aus dem Hintergrund neu anstoßen (iOS pausiert die Ortung).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    gps.start();
    // Zurückkehren ist Aufschlagen: Wer die App nach dem Abendessen wieder
    // hervorholt, soll sie im Nachtmodus vorfinden.
    applyAutoNight(gps.fix ?? settings.get('lastPos'));
  }
});

/**
 * Die Position für die Sonnenrechnung mitführen.
 *
 * Beim Öffnen ist noch kein Fix da – der Empfänger braucht seine Sekunden.
 * Deshalb wird die zuletzt bekannte Position abgelegt und beim Start
 * verwendet; ein paar Seemeilen daneben ändern am Sonnenuntergang nichts.
 * Geschrieben wird einmal je Sitzung, nicht bei jedem Fix: Das Logbuch führt
 * die Spur, die Einstellungen nur den Anhaltspunkt.
 */
function watchDaylight() {
  let gemerkt = false;
  const off = gps.onUpdate(({ fix }) => {
    if (!fix) return;
    applyAutoNight(fix);
    if (gemerkt) return;
    gemerkt = true;
    settings.set('lastPos', { lat: fix.lat, lon: fix.lon, ts: Date.now() });
    off();
  });
}

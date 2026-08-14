/** Modul „Einstellungen“ – Schiffsdaten, Sprache, Darstellung, Datensicherung. */

import { h, render, copy, toast, keepAwake, isAwake, group } from '../lib/dom.js';
import { settings } from '../lib/storage.js';
import { gps } from '../lib/gps.js';
import { applyTheme, applyAutoNight, sunsetHere, themes } from '../lib/theme.js';
import { t, UI_LANGS, uiLang, locale } from '../lib/i18n.js';
import {
  offlineState, onOfflineChange, checkReadiness, refreshOfflineCopy, formatBytes,
} from '../lib/offline.js';
import { chartsTab } from './charts.js';

let container = null;
let offOffline = null;
// Bleibt beim Wechsel zwischen den Reitern erhalten.
let tab = 'allgemein';

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  // Die Offline-Karte zeigt immer den aktuellen Stand.
  offOffline = onOfflineChange(() => draw());
  return () => {
    if (offOffline) offOffline();
    offOffline = null;
    container = null;
  };
}

function draw() {
  if (!container) return;
  const s = settings.all();
  render(container,
    // Die Karten bekommen einen eigenen Reiter: Sie haben mit den
    // Schiffsdaten nichts zu tun und brauchen viel Platz.
    h('div.seg', { style: { 'margin-bottom': '14px' } },
      tabBtn('allgemein', t('set.tab.general')),
      tabBtn('karten', t('set.tab.charts')),
    ),
    tab === 'karten'
      ? chartsTab()
      : h('div',
        offlineCard(),
        boatCard(s),
        displayCard(s),
        backupCard(),
        aboutCard(),
      ),
  );
}

function tabBtn(key, label) {
  return h('button', {
    type: 'button',
    'aria-pressed': String(tab === key),
    onclick: () => { tab = key; draw(); window.scrollTo(0, 0); },
  }, label);
}

// ------------------------------------------------------ Offline-Bereitschaft

function offlineCard() {
  const o = offlineState();

  const status = () => {
    if (!o.supported) return { cls: 'danger', text: t('offline.unsupported') };
    if (o.checking) return { cls: '', text: t('offline.checking') };
    if (!o.controlled) return { cls: 'warn', text: t('offline.setupPending') };
    if (o.ready) return { cls: 'ok', text: t('offline.ready') };
    return {
      cls: 'danger',
      text: `${t('offline.notReady')} – ${t('offline.missing', { n: o.missing.length, total: o.total })}`,
    };
  };

  const s = status();
  const colors = { ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)', '': 'var(--text-dim)' };

  return h('div.card',
    h('h2', t('offline.title')),

    h('div.row', { style: { 'align-items': 'flex-start', gap: '10px', 'margin-bottom': '10px' } },
      h('span', {
        style: { color: colors[s.cls], 'font-size': '1.3rem', 'line-height': '1.2' },
        'aria-hidden': 'true',
      }, o.ready ? '✓' : o.checking ? '…' : '!'),
      h('div.grow',
        h('div', { style: { 'font-weight': '650', color: colors[s.cls] } }, s.text),
        o.ready && h('div.small.muted', t('offline.readyHint')),
      ),
    ),

    o.supported && h('div.small.muted', { style: { 'margin-bottom': '10px' } },
      h('div', o.persisted === true ? `✓ ${t('offline.persisted')}`
        : o.persisted === false ? `! ${t('offline.notPersisted')}`
          : t('offline.persistUnknown')),
      h('div', { style: { 'margin-top': '3px' } },
        o.persisted === true ? t('offline.persistedHint')
          : o.persisted === false ? t('offline.notPersistedHint') : ''),
    ),

    o.error && h('p.small', { style: { color: 'var(--danger)', margin: '0 0 10px' } }, o.error),

    h('div.small.muted.mono', { style: { 'margin-bottom': '10px' } },
      o.total ? t('offline.files', { n: o.total }) : '',
      o.usageBytes !== null ? ` · ${t('offline.size')} ${formatBytes(o.usageBytes)}` : '',
      o.version ? ` · ${o.version}` : '',
      h('br'),
      t('offline.lastCheck', {
        time: o.lastCheck
          ? new Date(o.lastCheck).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
          : t('offline.never'),
      }),
    ),

    h('div.row.wrap',
      h('button.btn.small.grow', {
        type: 'button',
        disabled: o.checking || !o.supported,
        onclick: async () => {
          await checkReadiness({ repair: true });
          toast(t('offline.checkedNow'));
        },
      }, t('offline.check')),
      h('button.btn.small.grow', {
        type: 'button',
        disabled: o.checking || !o.supported,
        onclick: async () => {
          if (!navigator.onLine) {
            toast(t('offline.needsConnection'));
            return;
          }
          await refreshOfflineCopy();
          toast(t('offline.checkedNow'));
        },
      }, t('offline.refresh')),
    ),

    h('p.small.muted', { style: { margin: '11px 0 0' } }, t('offline.explain')),
  );
}

function field(s, key, label, hint, extra = {}) {
  return h('label.field',
    h('span', label),
    h('input', {
      value: s[key] ?? '',
      autocapitalize: extra.autocapitalize ?? 'sentences',
      spellcheck: false,
      ...extra,
      onchange: (e) => {
        settings.set(key, e.target.value.trim());
        window.dispatchEvent(new CustomEvent('sb:settings'));
      },
    }),
    hint && h('span.hint', hint),
  );
}

function boatCard(s) {
  return h('div.card',
    h('h2', t('set.boat')),
    h('p.small.muted', { style: { margin: '0 0 14px' } }, t('set.boatHint')),

    field(s, 'boat', t('set.name'), t('set.nameHint'),
      { class: 'mono', autocapitalize: 'characters', placeholder: 'SEEBÄR' }),
    field(s, 'callsign', t('set.callsign'), t('set.callsignHint'),
      { class: 'mono', autocapitalize: 'characters', placeholder: 'DA1234' }),
    field(s, 'mmsi', t('set.mmsi'), t('set.mmsiHint'),
      { class: 'mono', inputmode: 'numeric', maxlength: 9, placeholder: '211234560' }),
    field(s, 'pob', t('set.pob'), t('set.pobHint'),
      { class: 'mono', inputmode: 'numeric', placeholder: '4' }),
    field(s, 'descr', t('set.descr'), t('set.descrHint'),
      { placeholder: t('set.descrPlaceholder') }),

    h('div.row',
      h('div.grow', field(s, 'loa', t('set.loa'), null,
        { class: 'mono', inputmode: 'decimal', placeholder: '11,20' })),
      h('div.grow', field(s, 'draft', t('set.draft'), null,
        { class: 'mono', inputmode: 'decimal', placeholder: '1,80' })),
    ),

    field(s, 'homeport', t('set.homeport'), null, { placeholder: '' }),
    field(s, 'phone', t('set.phone'), t('set.phoneHint'),
      { class: 'mono', inputmode: 'tel', type: 'tel', placeholder: '+49 …' }),

    !settings.isComplete() && h('div.notice.warn', { style: { margin: '4px 0 0' } }, t('set.incomplete')),
  );
}

/**
 * Nachtmodus nach der Sonne.
 *
 * Eine feste Uhrzeit taugt dafür nicht: Im Juni ist es an der Ostsee um
 * 22 Uhr noch hell, im Dezember um 17 Uhr längst dunkel. Gerechnet wird
 * deshalb aus der eigenen Position – ohne Verbindung, ohne Dienst.
 */
function autoNightRow(s) {
  const an = s.autoNight !== false;
  const zeiten = sunsetHere(gps.fix ?? s.lastPos);

  return group(t('set.autoNight'),
    h('div.seg',
      h('button', {
        type: 'button',
        'aria-pressed': String(an),
        onclick: () => { settings.set('autoNight', true); applyAutoNight(gps.fix ?? s.lastPos); draw(); },
      }, t('common.on')),
      h('button', {
        type: 'button',
        'aria-pressed': String(!an),
        onclick: () => { settings.update({ autoNight: false, nightAuto: false }); draw(); },
      }, t('common.off')),
    ),
    !an
      ? t('set.autoNightHint')
      : (zeiten?.sunset
        ? t('set.autoNightAt', {
          sunset: zeiten.sunset.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }),
          from: new Date(zeiten.sunset.getTime() + 3600000)
            .toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }),
        })
        : t('set.autoNightNoFix')));
}

function displayCard(s) {
  const awake = isAwake();
  const themeList = themes();

  return h('div.card',
    h('h2', t('set.display')),

    // Sprache der gesamten Oberfläche. Die Funksprüche werden getrennt davon
    // im Funk-Modul umgeschaltet.
    group(t('set.uiLang'),
      h('div.seg',
        ...UI_LANGS.map((l) => h('button', {
          type: 'button',
          'aria-pressed': String(uiLang() === l.key),
          onclick: () => {
            if (uiLang() === l.key) return;
            settings.set('uiLang', l.key);
            applyTheme();
            // Die gesamte Oberfläche neu aufbauen, damit auch Reiter und
            // Kopfzeile die neue Sprache übernehmen.
            window.dispatchEvent(new CustomEvent('sb:lang'));
          },
        }, l.label)),
      ),
      t('set.uiLangHint')),

    group(t('set.theme'),
      h('div.seg',
        ...themeList.map((th) => h('button', {
          type: 'button',
          'aria-pressed': String(s.theme === th.key),
          onclick: () => {
            // Von Hand gewählt heißt: dabei bleiben. Die Sonne darf das
            // nicht beim nächsten Öffnen wieder umwerfen.
            settings.update({ theme: th.key, nightAuto: false });
            applyTheme();
            draw();
          },
        }, th.label)),
      ),
      themeList.find((th) => th.key === s.theme)?.hint ?? ''),

    autoNightRow(s),

    group(t('set.brightness'),
      h('div.brightness-row',
        h('input', {
          type: 'range',
          min: 25,
          max: 100,
          step: 5,
          value: s.brightness ?? 100,
          'aria-label': t('set.brightness'),
          oninput: (e) => {
            settings.set('brightness', Number(e.target.value));
            applyTheme();
            const val = container.querySelector('.brightness-row .val');
            if (val) val.textContent = `${e.target.value} %`;
          },
        }),
        h('span.val', `${s.brightness ?? 100} %`),
      ),
      t('set.brightnessHint')),

    h('div.row', { style: { 'margin-top': '4px' } },
      h('div.grow',
        h('div', { style: { 'font-weight': '620' } }, t('set.awake')),
        h('div.small.muted', t('set.awakeHint')),
      ),
      h('button.btn.small', {
        type: 'button',
        'aria-pressed': String(awake),
        onclick: async () => {
          const ok = await keepAwake(!awake);
          if (!ok) toast(t('common.unsupported'));
          draw();
        },
      }, awake ? t('common.on') : t('common.off')),
    ),

    h('div.notice', { style: { 'margin-top': '14px' } },
      h('strong', t('set.nightExplain.title')),
      t('set.nightExplain.text')),
  );
}

function backupCard() {
  return h('details.foldout',
    h('summary', t('set.backup')),
    h('div',
      h('p.small.muted', t('set.backupHint')),
      h('div.row.wrap',
        h('button.btn.small.grow', {
          type: 'button',
          onclick: () => copy(JSON.stringify(settings.all(), null, 2), t('set.backupCopied')),
        }, t('set.backupCopy')),
        h('button.btn.small.grow', {
          type: 'button',
          onclick: async () => {
            let text = '';
            try {
              text = await navigator.clipboard.readText();
            } catch {
              text = prompt(t('set.backupPrompt')) ?? '';
            }
            if (!text.trim()) return;
            try {
              const data = JSON.parse(text);
              if (typeof data !== 'object' || data === null || Array.isArray(data)) {
                throw new Error('not an object');
              }
              settings.update(data);
              applyTheme();
              toast(t('set.backupRead'));
              window.dispatchEvent(new CustomEvent('sb:lang'));
            } catch {
              toast(t('set.backupBad'));
            }
          },
        }, t('set.backupPaste')),
      ),
      h('button.btn.small.block', {
        type: 'button',
        style: { 'margin-top': '9px' },
        onclick: () => {
          if (!confirm(t('set.resetConfirm'))) return;
          settings.reset();
          applyTheme();
          toast(t('set.resetDone'));
          window.dispatchEvent(new CustomEvent('sb:lang'));
        },
      }, t('set.resetAll')),
    ),
  );
}

function aboutCard() {
  return h('div',
    h('details.foldout',
      h('summary', t('set.offline')),
      h('div',
        h('ul.checklist.plain',
          h('li', t('set.offline.1')),
          h('li', t('set.offline.2')),
          h('li', t('set.offline.3')),
          h('li', t('set.offline.4')),
        ),
      ),
    ),
    h('p.disclaimer', h('strong', t('app.name')), t('set.disclaimer')),
  );
}

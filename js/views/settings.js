/** Modul „Einstellungen“ – Schiffsdaten, Sprache, Darstellung, Datensicherung. */

import { h, render, copy, toast, keepAwake, isAwake, group } from '../lib/dom.js';
import { settings } from '../lib/storage.js';
import { applyTheme, themes } from '../lib/theme.js';
import { t, UI_LANGS, uiLang } from '../lib/i18n.js';

let container = null;

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  return () => { container = null; };
}

function draw() {
  if (!container) return;
  const s = settings.all();
  render(container,
    boatCard(s),
    displayCard(s),
    backupCard(),
    aboutCard(),
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
            settings.set('theme', th.key);
            applyTheme();
            draw();
          },
        }, th.label)),
      ),
      themeList.find((th) => th.key === s.theme)?.hint ?? ''),

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

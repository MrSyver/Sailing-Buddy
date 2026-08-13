/** Erstes Einrichten – die paar Angaben, ohne die ein Notruf nichts taugt. */

import { h, render, group } from '../lib/dom.js';
import { settings } from '../lib/storage.js';
import { applyTheme, themes } from '../lib/theme.js';
import { t, UI_LANGS, uiLang } from '../lib/i18n.js';

export function view(root, onDone) {
  build(root, onDone);
}

function build(root, onDone) {
  const s = settings.all();
  const draft = { boat: s.boat, callsign: s.callsign, mmsi: s.mmsi, pob: s.pob, descr: s.descr };

  const input = (key, props) => h('input', {
    value: draft[key] ?? '',
    spellcheck: false,
    ...props,
    oninput: (e) => { draft[key] = e.target.value; validate(); },
  });

  const submit = h('button.btn.primary.block', {
    type: 'button',
    onclick: () => {
      settings.update({
        boat: (draft.boat ?? '').trim(),
        callsign: (draft.callsign ?? '').trim().toUpperCase(),
        mmsi: (draft.mmsi ?? '').trim(),
        pob: (draft.pob ?? '').trim(),
        descr: (draft.descr ?? '').trim(),
        setupDone: true,
      });
      onDone();
    },
  }, t('setup.go'));

  const warn = h('p.small', {
    style: { color: 'var(--warn)', margin: '0 0 10px', 'min-height': '1.2em' },
  });

  function validate() {
    const mmsi = (draft.mmsi ?? '').trim();
    const ok = Boolean((draft.boat ?? '').trim()) && /^\d{9}$/.test(mmsi);
    submit.disabled = !ok;
    submit.textContent = ok ? t('setup.go') : t('setup.needed');
    warn.textContent = mmsi && !/^\d{9}$/.test(mmsi) ? t('setup.mmsiBad') : '';
  }

  render(root,
    h('div.setup-hero',
      h('h2', t('setup.welcome')),
      h('p', t('setup.intro')),
    ),

    // Sprache zuerst: Wer die Oberfläche auf Englisch will, soll den Rest
    // der Einrichtung schon auf Englisch lesen.
    h('div.card', { style: { 'margin-top': '18px' } },
      group(t('setup.language'),
        h('div.seg',
          ...UI_LANGS.map((l) => h('button', {
            type: 'button',
            'aria-pressed': String(uiLang() === l.key),
            onclick: () => {
              if (uiLang() === l.key) return;
              settings.set('uiLang', l.key);
              settings.set('phraseLang', l.key);
              applyTheme();
              // Neu aufbauen, aber die bereits getippten Angaben behalten.
              settings.update(draft);
              build(root, onDone);
            },
          }, l.label)),
        )),
    ),

    h('div.card',
      h('label.field',
        h('span', `${t('set.name')} *`),
        input('boat', { class: 'mono', autocapitalize: 'characters', placeholder: 'SEEBÄR' }),
        h('span.hint', t('set.nameHint')),
      ),
      h('label.field',
        h('span', `${t('set.mmsi')} *`),
        input('mmsi', { class: 'mono', inputmode: 'numeric', maxlength: 9, placeholder: '211234560' }),
        h('span.hint', t('set.mmsiHint')),
      ),
      h('label.field',
        h('span', t('set.callsign')),
        input('callsign', { class: 'mono', autocapitalize: 'characters', placeholder: 'DA1234' }),
      ),
      h('label.field',
        h('span', t('set.pob')),
        input('pob', { class: 'mono', inputmode: 'numeric', placeholder: '4' }),
        h('span.hint', t('setup.pobHint')),
      ),
      h('label.field',
        h('span', t('set.descr')),
        input('descr', { placeholder: t('set.descrPlaceholder') }),
        h('span.hint', t('setup.descrHint')),
      ),
      warn,
      submit,
    ),

    h('div.card',
      h('h3', t('set.theme')),
      h('div.seg',
        ...themes().map((th) => h('button', {
          type: 'button',
          'aria-pressed': String(settings.get('theme') === th.key),
          onclick: (e) => {
            settings.set('theme', th.key);
            applyTheme();
            [...e.currentTarget.parentElement.children]
              .forEach((b) => b.setAttribute('aria-pressed', 'false'));
            e.currentTarget.setAttribute('aria-pressed', 'true');
          },
        }, th.label)),
      ),
      h('p.small.muted', { style: { margin: '9px 0 0' } }, t('setup.themeHint')),
    ),

    h('p.disclaimer', t('setup.footer')),
  );

  validate();
}

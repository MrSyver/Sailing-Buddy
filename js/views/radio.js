/**
 * Modul „Funksprüche“ – fertige Sprechtexte mit eingesetzten Schiffsdaten.
 *
 * Die Sprache der Funksprüche ist von der Sprache der Oberfläche unabhängig:
 * Die Menüs können auf Deutsch stehen, während der Notruf auf Englisch
 * vorgelesen wird. Umgeschaltet wird hier im Modul, oben über der Liste.
 */

import { h, render, copy, group } from '../lib/dom.js';
import { settings } from '../lib/storage.js';
import { gps } from '../lib/gps.js';
import { formatPosition, formatSpoken } from '../lib/geo.js';
import { t, uiLang } from '../lib/i18n.js';
import {
  PHRASES, CHANNELS, EMERGENCY_CONTACTS, SPELLING_ALPHABET,
  SPELLING_NUMBERS, PROWORDS, fillPlaceholders, localized,
} from '../data/phrases.js';

let openId = null;

/** Sprache der Funksprüche – unabhängig von der Oberflächensprache. */
function phraseLang() {
  return settings.get('phraseLang') === 'en' ? 'en' : 'de';
}

/** Sammelt alles, was in die Platzhalter eingesetzt wird. */
function values() {
  const s = settings.all();
  const fix = gps.fix;
  return {
    boat: s.boat || null,
    callsign: s.callsign || null,
    mmsi: s.mmsi || null,
    pob: s.pob || null,
    loa: s.loa ? `${s.loa} m` : null,
    draft: s.draft ? `${s.draft} m` : null,
    descr: s.descr || null,
    position: fix ? formatPosition(fix) : null,
  };
}

export function view(root) {
  const wrap = h('div');
  render(root, wrap);
  draw(wrap);
  // Bei neuem GPS-Fix die Position im offenen Funkspruch nachziehen.
  const off = gps.onUpdate(() => { if (openId) draw(wrap); });
  return () => off();
}

function draw(wrap) {
  const phrase = openId ? PHRASES.find((p) => p.id === openId) : null;
  render(wrap, phrase ? detail(wrap, phrase) : list(wrap));
}

/** Umschalter für die Sprache der Funksprüche. */
function langSwitch(wrap) {
  const lang = phraseLang();
  const btn = (code, label) => h('button', {
    type: 'button',
    'aria-pressed': String(lang === code),
    onclick: () => { settings.set('phraseLang', code); draw(wrap); },
  }, label);
  const el = group(t('radio.phraseLang'), h('div.seg', btn('de', 'Deutsch'), btn('en', 'English')));
  el.style.marginBottom = '0';
  return el;
}

// ---------------------------------------------------------------- Übersicht

function list(wrap) {
  const s = settings.all();
  const lang = phraseLang();
  const parts = [];

  if (!s.boat || !s.mmsi) {
    parts.push(h('div.notice.warn',
      h('strong', t('radio.missingData.title')),
      t('radio.missingData.text'),
    ));
  }

  parts.push(h('div.card', langSwitch(wrap)));

  parts.push(h('h2.section', t('radio.heading')));
  parts.push(h('div.phrase-list', ...PHRASES.map((p) => h('button.phrase-btn', {
    'data-level': p.level,
    type: 'button',
    lang,
    onclick: () => { openId = p.id; draw(wrap); window.scrollTo(0, 0); },
  },
  h('div.row', { style: { gap: '8px', 'align-items': 'baseline' } },
    h('strong.grow', localized(p, 'title', lang)),
    h('span.badge', { class: p.level, lang: uiLang() }, t(`radio.level.${p.level}`)),
  ),
  h('span', localized(p, 'short', lang)),
  ))));

  parts.push(h('h2.section', t('radio.reference')));
  parts.push(foldout(t('radio.ref.spelling'), spellingTable(), true));
  parts.push(foldout(t('radio.ref.prowords'), prowordsTable()));
  parts.push(foldout(t('radio.ref.channels'), channelTable()));
  parts.push(foldout(t('radio.ref.contacts'), contactsTable()));

  parts.push(h('p.disclaimer', t('radio.disclaimer')));

  return parts;
}

function foldout(title, content, open = false) {
  return h('details.foldout', { open }, h('summary', title), h('div', content));
}

function spellingTable() {
  return [
    h('div.alphabet', ...SPELLING_ALPHABET.map(([l, w, p]) =>
      h('div', h('b', l), w, h('span', p)))),
    h('h3', { style: { margin: '15px 0 8px', 'font-size': '.9rem' } }, t('radio.ref.numbers')),
    h('div.alphabet', ...SPELLING_NUMBERS.map(([l, w, p]) =>
      h('div', h('b', l), w, h('span', p)))),
    h('p.small.muted', { style: { 'margin-bottom': '0' } }, t('radio.ref.spellingHint')),
  ];
}

function prowordsTable() {
  const en = uiLang() === 'en';
  return h('table.data',
    h('thead', h('tr',
      h('th', t('radio.table.word')),
      !en && h('th', t('radio.table.german')),
      h('th', t('radio.table.meaning')),
    )),
    h('tbody', ...PROWORDS.map(([w, de, meanDe, meanEn]) =>
      h('tr',
        h('td.k', w),
        !en && h('td', de),
        h('td.small', en ? meanEn : meanDe),
      ))),
  );
}

function channelTable() {
  const en = uiLang() === 'en';
  return h('table.data',
    h('thead', h('tr', h('th', t('radio.table.channel')), h('th', t('radio.table.usage')))),
    h('tbody', ...CHANNELS.map((c) =>
      h('tr', h('td.k', c.ch), h('td.small', en ? c.useEn : c.use)))),
  );
}

function contactsTable() {
  const en = uiLang() === 'en';
  return h('div', ...EMERGENCY_CONTACTS.map((c) => h('div.wp-item',
    h('div.grow',
      h('div.wp-name', en ? c.nameEn : c.name),
      h('div.small.muted', en ? c.hintEn : c.hint),
    ),
    h('button.btn.small', {
      type: 'button',
      onclick: () => copy(c.value, `${c.value} ${t('common.copied').toLowerCase()}`),
    }, c.value),
  )));
}

// ------------------------------------------------------------------ Detail

function detail(wrap, phrase) {
  const lang = phraseLang();
  const lines = localized(phrase, 'lines', lang);
  const checklist = localized(phrase, 'checklist', lang);
  const before = localized(phrase, 'before', lang);
  const after = localized(phrase, 'after', lang);
  const v = values();
  const parts = [];

  parts.push(h('div.row', { style: { 'margin-bottom': '12px' } },
    h('button.btn.small', {
      type: 'button',
      onclick: () => { openId = null; draw(wrap); window.scrollTo(0, 0); },
    }, t('common.back')),
    h('div.grow'),
    h('div.seg', { style: { width: '150px' } },
      h('button', {
        type: 'button',
        'aria-pressed': String(lang === 'de'),
        onclick: () => { settings.set('phraseLang', 'de'); draw(wrap); },
      }, 'Deutsch'),
      h('button', {
        type: 'button',
        'aria-pressed': String(lang === 'en'),
        onclick: () => { settings.set('phraseLang', 'en'); draw(wrap); },
      }, 'English'),
    ),
  ));

  parts.push(h('div.card', { lang },
    h('div.row', { style: { 'align-items': 'baseline', gap: '9px' } },
      h('h2.grow', { style: { margin: 0 } }, localized(phrase, 'title', lang)),
      h('span.badge', { class: phrase.level, lang: uiLang() }, t(`radio.level.${phrase.level}`)),
    ),
    h('p.small.muted', { style: { margin: '5px 0 0' } }, localized(phrase, 'short', lang)),
    localized(phrase, 'channel', lang) && h('p.small', { style: { margin: '9px 0 0', 'font-weight': '650' } },
      localized(phrase, 'channel', lang)),
  ));

  if (before?.length) {
    parts.push(h('div.notice', { lang },
      h('strong', { lang: uiLang() }, t('radio.before')),
      h('ul.checklist.plain', { style: { 'margin-top': '6px' } },
        ...before.map((x) => h('li', x))),
    ));
  }

  if (checklist?.length) {
    parts.push(h('div.card', { lang },
      h('h3', { lang: uiLang() }, t('radio.steps')),
      h('ol.checklist', ...checklist.map((x) => h('li', x))),
    ));
  }

  if (lines?.length) {
    // Warnung, wenn ohne GPS-Fix eine Position im Text steht.
    const needsPos = lines.some((l) => l.text?.includes('{{position}}'));
    if (needsPos && !v.position) {
      parts.push(h('div.notice.warn',
        h('strong', t('radio.noPosition.title')),
        t('radio.noPosition.text'),
      ));
    }

    parts.push(h('div.card',
      h('div.script', { lang }, ...lines.map((l) => renderLine(l, v))),
    ));

    parts.push(h('div.row.wrap', { style: { 'margin-bottom': '12px' } },
      h('button.btn.grow', {
        type: 'button',
        onclick: () => copy(plainText(phrase, lines, v, lang), t('radio.copiedText')),
      }, t('radio.copyText')),
      v.position && h('button.btn.grow', {
        type: 'button',
        onclick: () => copy(formatSpoken(gps.fix, lang), t('radio.copiedPosition')),
      }, t('radio.copyDigits')),
    ));

    if (v.position) {
      parts.push(h('div.card',
        h('h3', t('radio.spokenTitle')),
        h('p.small.muted', { style: { margin: '0 0 7px' } }, t('radio.spokenHint')),
        h('div', { lang, style: { 'font-size': '1.05rem', 'font-weight': '600' } },
          formatSpoken(gps.fix, lang)),
      ));
    }
  }

  if (after?.length) {
    parts.push(h('div.notice', { lang },
      h('strong', { lang: uiLang() }, t('radio.after')),
      h('ul.checklist.plain', { style: { 'margin-top': '6px' } },
        ...after.map((x) => h('li', x))),
    ));
  }

  return parts;
}

function renderLine(line, v) {
  if (line.t === 'gap') return h('div.line.gap');
  const text = fillPlaceholders(line.text ?? '', v);
  if (line.t === 'note') return h('div.line.note', text);
  if (line.t === 'fill') return h('div.line.fill', text);
  return h('div.line', text);
}

function plainText(phrase, lines, v, lang) {
  const title = localized(phrase, 'title', lang);
  const body = lines
    .map((l) => (l.t === 'gap' ? '' : fillPlaceholders(l.text ?? '', v)))
    .join('\n');
  return `${title}\n${'-'.repeat(title.length)}\n${body}`;
}

export function resetView() {
  openId = null;
}

/**
 * Modul „Funksprüche“ – fertige Sprechtexte mit eingesetzten Schiffsdaten.
 *
 * Die Sprache der Funksprüche ist von der Sprache der Oberfläche unabhängig:
 * Die Menüs können auf Deutsch stehen, während der Notruf auf Englisch
 * vorgelesen wird. Umgeschaltet wird oben in der Kopfzeile.
 *
 * Die Trennlinie verläuft dabei zwischen Sprechen und Lesen. In der Sprache
 * der Funksprüche steht ausschließlich, was ins Mikrofon gesprochen wird –
 * der Sprechtext selbst und die Formulierungen, die in seine offenen Stellen
 * eingesetzt werden. Alles andere ist Erklärung: Name, Beschreibung, Kanal,
 * Ablauf, Hinweise davor und danach. Das steht in der Sprache der Oberfläche,
 * denn wer die Menüs auf Deutsch führt, sucht auch die Beschreibung auf
 * Deutsch – auch dann, wenn er gleich Englisch sprechen wird.
 */

import { h, render, copy, toast } from '../lib/dom.js';
import { settings, waypoints } from '../lib/storage.js';
import { gps } from '../lib/gps.js';
import { logbook } from '../lib/logbook.js';
import { formatPosition, formatSpoken } from '../lib/geo.js';
import { t, uiLang, locale } from '../lib/i18n.js';
import {
  canRecord, recording, recordings, formatSeconds,
} from '../lib/recorder.js';
import {
  PHRASES, CHANNELS, EMERGENCY_CONTACTS, SPELLING_ALPHABET,
  SPELLING_NUMBERS, PROWORDS, fillPlaceholders, localized,
  emergenciesFor, spellOut,
} from '../data/phrases.js';

let openId = null;
// Gewählter Notfall je Funkspruch. Bleibt beim Sprachwechsel erhalten.
let emergencyId = null;
// Aufnahmen und der Zustand der laufenden Aufnahme.
let recList = [];
let recTimer = null;
let recError = null;
// Position im Funkspruch: Zahlen oder ausgeschrieben zum Vorlesen.
let spokenPosition = false;
/**
 * Der Zustand der Aufnahmetaste – bewusst im Modul, nicht im Knopf.
 *
 * Das Drücken startet die Aufnahme, und das zeichnet die Karte neu: Der Knopf
 * unter dem Finger ist danach ein anderes Element. Läge der Zustand an ihm,
 * träfe das Loslassen einen Knopf, der vom Drücken nichts weiß – und die
 * Aufnahme liefe weiter.
 */
let druckSeit = null;
let druckStartete = false;
let zeigerErledigt = false;

/** Sprache der Funksprüche – unabhängig von der Oberflächensprache. */
function phraseLang() {
  return settings.get('phraseLang') === 'en' ? 'en' : 'de';
}

/**
 * Wie die Ziffern im ausgeschriebenen Rufzeichen aussehen.
 *
 * Voreingestellt als Ziffer: „Delta Alfa 1 2 3 4“. Die Zahlwörter des
 * Seefunks – Unaone, Bissotwo, Terrathree, Kartefour – sind über schlechtes
 * Rauschen sicherer zu verstehen, aber nur, wenn man sie kann. Wer sie vom
 * Blatt abliest und dabei stockt, ist schlechter dran als mit „eins zwei
 * drei vier“. Deshalb ist es ein Schalter und keine Vorschrift.
 */
const buchst = () => ({ zahlwoerter: settings.get('spellNumbers') === true });

/**
 * Ein Feld in der Sprache der Oberfläche.
 *
 * Für alles, was über einen Funkspruch gesagt wird statt in ihm: Name,
 * Beschreibung, Kanal, Ablauf, Hinweise. Der Sprechtext geht weiter über
 * `localized(…, phraseLang())`.
 */
function menu(phrase, field) {
  return localized(phrase, field, uiLang());
}

/** Die zuletzt gemerkte MOB-Position, falls es eine gibt. */
function mobPosition() {
  return waypoints.list().find((w) => w.kind === 'mob') ?? null;
}

/**
 * Sammelt alles, was in die Platzhalter eingesetzt wird.
 *
 * Beim Funkspruch „Mensch über Bord“ zählt nicht, wo das Schiff gerade ist,
 * sondern wo die Person über Bord ging – bis der Notruf abgesetzt ist, ist
 * man längst weitergetrieben. Liegt eine gemerkte MOB-Position vor, wird
 * deshalb diese eingesetzt.
 */
function values(phrase = null) {
  const s = settings.all();
  const mob = phrase?.id === 'mob' ? mobPosition() : null;
  const source = mob ?? gps.fix;
  const lang = phraseLang();
  return {
    boat: s.boat || null,
    // „Ausgeschrieben“ gilt für alles, was im Funk buchstabiert wird, nicht
    // nur für die Position: Ein Rufzeichen wird Zeichen für Zeichen
    // gesprochen, und die MMSI Ziffer für Ziffer. Wer im Notfall vorliest,
    // soll das Fertige vor Augen haben.
    callsign: s.callsign ? (spokenPosition ? spellOut(s.callsign, buchst()) : s.callsign) : null,
    mmsi: s.mmsi ? (spokenPosition ? spellOut(s.mmsi, buchst()) : s.mmsi) : null,
    pob: s.pob || null,
    loa: s.loa ? `${s.loa} m` : null,
    draft: s.draft ? `${s.draft} m` : null,
    descr: s.descr || null,
    position: source
      ? (spokenPosition ? formatSpoken(source, lang) : formatPosition(source))
      : null,
    // Für die Anzeige: Woher stammt die Position?
    positionSource: mob ? 'mob' : (gps.fix ? 'gps' : null),
    positionRaw: source,
    mobName: mob?.name ?? null,
  };
}

export function view(root) {
  const wrap = h('div');
  render(root, wrap);
  draw(wrap);

  // Gespeicherte Aufnahmen nachladen – IndexedDB antwortet erst später.
  recordings.list().then((list) => {
    recList = list;
    if (!openId) draw(wrap);
  });

  // Bei neuem GPS-Fix die Position im offenen Funkspruch nachziehen.
  const off = gps.onUpdate(() => { if (openId) draw(wrap); });

  // Die Sprache der Funksprüche wird oben in der Kopfzeile umgeschaltet –
  // dieses Modul muss davon erfahren, egal wer sie ändert.
  let letzteSprache = phraseLang();
  const offSettings = settings.onChange(() => {
    if (phraseLang() === letzteSprache) return;
    letzteSprache = phraseLang();
    draw(wrap);
  });

  return () => {
    off();
    offSettings();
    // Eine laufende Aufnahme nicht heimlich weiterlaufen lassen.
    if (recording.active) recording.cancel();
    clearInterval(recTimer);
    recTimer = null;
  };
}

function draw(wrap) {
  const phrase = openId ? PHRASES.find((p) => p.id === openId) : null;
  render(wrap, phrase ? detail(wrap, phrase) : list(wrap));
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

  // Aufnehmen steht vor den Funksprüchen: Eine hereinkommende Meldung ist
  // schneller vorbei, als man den Reiter findet.
  parts.push(recorderCard(wrap));

  parts.push(h('h2.section', t('radio.heading')));
  parts.push(h('div.phrase-list', ...PHRASES.map((p) => h('button.phrase-btn', {
    'data-level': p.level,
    type: 'button',
    lang: uiLang(),
    onclick: () => { openId = p.id; emergencyId = null; draw(wrap); window.scrollTo(0, 0); },
  },
  h('div.row', { style: { gap: '8px', 'align-items': 'baseline' } },
    h('strong.grow', menu(p, 'title')),
    h('span.badge', { class: p.level, lang: uiLang() }, t(`radio.level.${p.level}`)),
  ),
  h('span', menu(p, 'short')),
  ))));

  parts.push(h('h2.section', t('radio.reference')));
  // Alle Nachschlagewerke eingeklappt, auch die Buchstabiertafel: Sie ist
  // die längste von allen und schob die übrigen sonst unter den Bildrand.
  parts.push(foldout(t('radio.ref.spelling'), spellingTable()));
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
    // Die Spaltenbreiten stehen fest, sonst richtet sich die Tabelle nach
    // ihrem breitesten Wort und läuft auf dem Telefon rechts aus dem Bild.
    // Die Erklärung bekommt die Hälfte – sie ist der Grund für die Tabelle.
    en
      ? h('colgroup', h('col', { style: { width: '34%' } }), h('col'))
      : h('colgroup',
        h('col', { style: { width: '26%' } }),
        h('col', { style: { width: '24%' } }),
        h('col')),
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
  return h('table.data.kv',
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

// ------------------------------------------------------------- Aufnahmen

/**
 * Sprachaufnahme. Eine empfangene Meldung ist oft schneller vorbei, als man
 * mitschreiben kann – aufnehmen, dann in Ruhe abhören.
 */
function recorderCard(wrap) {
  if (!canRecord()) {
    return h('div.card', h('p.small.muted', { style: { margin: 0 } }, t('radio.recUnsupported')));
  }

  const active = recording.active;

  // Ein runder Knopf mit rotem Punkt statt einer Schaltfläche mit Text: Das
  // Zeichen fürs Aufnehmen kennt jeder, es braucht keine Übersetzung, und es
  // ist auch mit klammen Fingern zu treffen. Beim Laufen wird daraus ein
  // Viereck – dieselbe Stelle, dieselbe Größe, kein Suchen.
  /** Anschalten oder ausschalten – die eigentliche Arbeit. */
  const umschalten = async () => {
    recError = null;
    if (recording.active) {
      clearInterval(recTimer);
      recTimer = null;
      try {
        await recording.stop();
        recList = await recordings.list();
      } catch (err) {
        recError = err.message;
      }
      draw(wrap);
      return;
    }
    try {
      await recording.start();
      // Laufzeit im Sekundentakt mitschreiben.
      recTimer = setInterval(() => {
        const label = document.getElementById('rec-elapsed');
        if (label) label.textContent = formatSeconds(recording.elapsed());
      }, 1000);
    } catch (err) {
      // Häufigster Fall: Mikrofonfreigabe abgelehnt.
      recError = err.name === 'NotAllowedError' ? t('radio.recDenied') : err.message;
    }
    draw(wrap);
  };

  // Ein runder Knopf mit rotem Punkt statt einer Schaltfläche mit Text: Das
  // Zeichen fürs Aufnehmen kennt jeder, es braucht keine Übersetzung, und es
  // ist auch mit klammen Fingern zu treffen. Beim Laufen wird daraus ein
  // Viereck – dieselbe Stelle, dieselbe Größe, kein Suchen.
  const startStop = h('button.rec-trigger', {
    class: active ? 'rec-trigger running' : 'rec-trigger',
    type: 'button',
    'aria-label': active ? t('radio.recStop') : t('radio.recStart'),
    title: active ? t('radio.recStop') : t('radio.recStart'),
  }, h('span.rec-glyph', { 'aria-hidden': 'true' }));

  /**
   * Zwei Arten, denselben Knopf zu bedienen.
   *
   * Antippen schaltet an und beim nächsten Antippen wieder aus. Gedrückt
   * halten nimmt auf, solange man hält, und beendet beim Loslassen – wie eine
   * Sprechtaste. Zweimal zu treffen ist zweimal zu zielen, und beim zweiten
   * Mal ist die Meldung vorbei.
   *
   * Unterschieden wird an der Haltedauer: Unter einer Viertelsekunde war es
   * ein Tippen, darüber ein Halten. Beides muss auf dieselbe Fläche, weil es
   * nur eine gibt, auf die man im Dunkeln blind zielt.
   */
  const HALTEN_AB = 250;

  startStop.onpointerdown = () => {
    druckSeit = Date.now();
    druckStartete = false;
    zeigerErledigt = true;
    if (!recording.active) {
      druckStartete = true;
      umschalten();
    }
  };

  const losgelassen = () => {
    if (druckSeit === null) return;
    const gehalten = Date.now() - druckSeit;
    druckSeit = null;
    if (!recording.active) return;
    // Gehalten: beenden. Getippt, während schon lief: ebenfalls beenden.
    if (gehalten >= HALTEN_AB || !druckStartete) umschalten();
  };

  startStop.onpointerup = losgelassen;
  // Fährt der Finger vom Knopf herunter oder kommt etwas dazwischen, gilt das
  // als Loslassen: Eine Aufnahme, die heimlich weiterläuft, wäre schlimmer
  // als eine, die zu früh endet.
  startStop.onpointerleave = losgelassen;
  startStop.onpointercancel = losgelassen;

  // Für Tastatur und Vorlesehilfen, die keine Zeigerereignisse schicken.
  startStop.onclick = () => {
    if (zeigerErledigt) { zeigerErledigt = false; return; }
    umschalten();
  };

  return h('div.card.rec-card',
    h('div.rec-head',
      startStop,
      // Der Anreißer sagt in einer Zeile, wofür das gut ist. Ohne ihn ist ein
      // roter Punkt neben Notrufen nur ein roter Punkt.
      h('div.grow',
        h('div.rec-title', active ? t('radio.recRunning') : t('radio.recordings')),
        active
          ? h('div.rec-teaser.mono', { id: 'rec-elapsed' }, formatSeconds(recording.elapsed()))
          : h('div.rec-teaser', t('radio.recTeaser')),
      ),
      active && h('button.btn.small', {
        type: 'button',
        onclick: () => {
          clearInterval(recTimer);
          recTimer = null;
          recording.cancel();
          draw(wrap);
        },
      }, t('radio.recDiscard')),
    ),

    recError && h('p.small', { style: { color: 'var(--danger)', margin: '9px 0 0' } }, recError),

    recList.length > 0 && h('div', { style: { 'margin-top': '10px' } },
      ...recList.map((rec) => recordingRow(wrap, rec)),
      h('button.btn.small.block', {
        type: 'button',
        style: { 'margin-top': '8px' },
        onclick: async () => {
          if (!confirm(t('radio.recConfirmClear'))) return;
          await recordings.clear();
          recList = await recordings.list();
          draw(wrap);
        },
      }, t('radio.recDeleteAll')),
    ),
  );
}

/**
 * Eine gespeicherte Aufnahme mit eigenem Abspieler.
 *
 * Bewusst nicht die Bordmittel des Browsers: Deren Regler ist klein, und ohne
 * vorher geladene Datei kennt Safari die Länge nicht – dann lässt sich gar
 * nicht spulen. Die Länge steht hier aber ohnehin im Speicher, also wird ein
 * eigener Regler gebaut, der von Anfang an funktioniert und groß genug für
 * nasse Finger ist.
 */
function recordingRow(wrap, rec) {
  const url = URL.createObjectURL(rec.blob);
  const audio = h('audio', { preload: 'metadata', src: url });
  const dauer = () => (Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : Math.max(1, rec.seconds || 1));

  const stelle = h('input.rec-seek', {
    type: 'range',
    min: '0',
    max: '1000',
    value: '0',
    step: '1',
    'aria-label': t('radio.recSeek'),
    oninput: (e) => {
      audio.currentTime = (Number(e.target.value) / 1000) * dauer();
      zeit.textContent = formatSeconds(Math.round(audio.currentTime));
    },
  });

  const zeit = h('span.rec-time.mono', formatSeconds(0));
  const gesamt = h('span.rec-time.mono.muted', formatSeconds(rec.seconds));

  const spielen = h('button.btn.small.rec-play', {
    type: 'button',
    'aria-label': t('radio.recPlay'),
    onclick: () => {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    },
  }, '▶');

  const zeichen = () => { spielen.textContent = audio.paused ? '▶' : '❚❚'; };
  audio.addEventListener('play', zeichen);
  audio.addEventListener('pause', zeichen);
  audio.addEventListener('ended', () => {
    stelle.value = '0';
    zeit.textContent = formatSeconds(0);
    zeichen();
  });
  audio.addEventListener('timeupdate', () => {
    stelle.value = String(Math.round((audio.currentTime / dauer()) * 1000));
    zeit.textContent = formatSeconds(Math.round(audio.currentTime));
  });
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      gesamt.textContent = formatSeconds(Math.round(audio.duration));
    }
  });

  const when = new Date(rec.ts).toLocaleString(locale(), {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return h('div.rec-item',
    h('div.row',
      h('div.grow',
        h('div.rec-name', rec.name || t('radio.recUnnamed')),
        h('div.small.muted.mono', when),
      ),
      h('button.btn.small', {
        type: 'button',
        'aria-label': t('radio.recRename'),
        onclick: async () => {
          const name = prompt(t('radio.recRename'), rec.name || '');
          if (name === null) return;
          await recordings.rename(rec.id, name.trim());
          recList = await recordings.list();
          draw(wrap);
        },
      }, '✎'),
      h('button.btn.small', {
        type: 'button',
        'aria-label': t('radio.recDelete'),
        onclick: async () => {
          if (!confirm(t('radio.recConfirmDelete'))) return;
          audio.pause();
          URL.revokeObjectURL(url);
          await recordings.remove(rec.id);
          recList = await recordings.list();
          draw(wrap);
        },
      }, '✕'),
    ),

    h('div.rec-player', spielen, zeit, stelle, gesamt, audio),
  );
}

// ------------------------------------------------------------------ Detail

function detail(wrap, phrase) {
  const lang = phraseLang();
  // Gesprochen wird in der Sprache der Funksprüche, gelesen in der der
  // Oberfläche. Der Ablauf und die Hinweise werden gelesen.
  const lines = localized(phrase, 'lines', lang);
  const checklist = menu(phrase, 'checklist');
  const before = menu(phrase, 'before');
  const after = menu(phrase, 'after');
  const cases = emergenciesFor(phrase);
  const chosen = cases.find((e) => e.id === emergencyId) ?? null;
  const v = values(phrase);
  const parts = [];

  // --- Kopfzeile: nur zurück. Die Sprache sitzt oben in der Titelleiste. -----
  parts.push(h('div.row', { style: { 'margin-bottom': '10px' } },
    h('button.btn.small', {
      type: 'button',
      onclick: () => { openId = null; draw(wrap); window.scrollTo(0, 0); },
    }, t('common.back')),
  ));

  // --- Der Funkspruch, direkt darunter --------------------------------------
  const needsPos = Boolean(lines?.some((l) => l.text?.includes('{{position}}')));

  if (lines?.length) {
    if (needsPos && !v.position) {
      parts.push(h('div.notice.warn',
        h('strong', t('radio.noPosition.title')),
        t('radio.noPosition.text'),
      ));
    }

    if (v.positionSource === 'mob') {
      parts.push(h('div.notice', { style: { 'border-left-color': 'var(--danger)' } },
        h('strong', t('radio.mobPosition.title')),
        t('radio.mobPosition.text', { name: v.mobName ?? '' }),
      ));
    }

    parts.push(h('div.card',
      h('div.row', { style: { 'align-items': 'baseline', gap: '8px', 'margin-bottom': '10px' } },
        h('h2.grow', { style: { margin: 0, 'font-size': '1rem' }, lang: uiLang() },
          menu(phrase, 'title')),
        h('span.badge', { class: phrase.level, lang: uiLang() }, t(`radio.level.${phrase.level}`)),
      ),
      h('div.script', { lang }, ...lines.map((l) => renderLine(l, v, chosen, lang))),

      // Die Position lässt sich zwischen Zahlen und Sprechweise umschalten –
      // im Funk wird sie Ziffer für Ziffer gesprochen.
      needsPos && v.position && h('div.seg', { style: { 'margin-top': '12px' } },
        h('button', {
          type: 'button',
          'aria-pressed': String(!spokenPosition),
          onclick: () => { spokenPosition = false; draw(wrap); },
        }, t('radio.posNumbers')),
        h('button', {
          type: 'button',
          'aria-pressed': String(spokenPosition),
          onclick: () => { spokenPosition = true; draw(wrap); },
        }, t('radio.posSpoken')),
      ),

      // Und wie die Ziffern darin aussehen. Nur solange ausgeschrieben ist:
      // Bei Zahlen gibt es nichts umzustellen, und ein Schalter, der gerade
      // nichts tut, lehrt einen, ihn zu übersehen.
      needsPos && v.position && spokenPosition && h('button.btn.small.block', {
        type: 'button',
        id: 'digit-style',
        style: { 'margin-top': '8px' },
        'aria-pressed': String(settings.get('spellNumbers') === true),
        onclick: () => {
          settings.set('spellNumbers', settings.get('spellNumbers') !== true);
          draw(wrap);
        },
      }, settings.get('spellNumbers') === true
        ? t('radio.digitsWords')
        : t('radio.digitsPlain')),
    ));

    parts.push(h('div.row.wrap', { style: { 'margin-bottom': '12px' } },
      h('button.btn.grow', {
        type: 'button',
        onclick: () => copy(plainText(phrase, lines, v, lang, chosen), t('radio.copiedText')),
      }, t('radio.copyText')),
      v.positionRaw && h('button.btn.grow', {
        type: 'button',
        onclick: () => copy(formatSpoken(v.positionRaw, lang), t('radio.copiedPosition')),
      }, t('radio.copyDigits')),
    ));

    // Ein abgesetzter Not- oder Dringlichkeitsruf gehört ins Logbuch, mit
    // Zeit und Position. Bewusst als eigener Griff und nicht beim Kopieren:
    // Text in die Zwischenablage zu legen heißt nicht, ihn gesprochen zu
    // haben, und ein Logbuch, das Dinge behauptet, ist keins.
    if (phrase.level === 'distress' || phrase.level === 'urgency') {
      parts.push(h('button.btn.block', {
        type: 'button',
        style: { 'margin-bottom': '12px' },
        onclick: () => {
          const entry = logbook.add({
            kind: 'manual',
            event: 'distress',
            note: localized(phrase, 'title', uiLang()),
          });
          toast(entry ? t('radio.logged') : t('radio.logNoFix'));
        },
      }, t('radio.logIt')));
    }
  } else {
    // Funksprüche ohne Sprechtext (etwa der DSC-Ablauf) zeigen den Titel oben.
    parts.push(h('div.card', { lang: uiLang() },
      h('div.row', { style: { 'align-items': 'baseline', gap: '9px' } },
        h('h2.grow', { style: { margin: 0 } }, menu(phrase, 'title')),
        h('span.badge', { class: phrase.level, lang: uiLang() }, t(`radio.level.${phrase.level}`)),
      ),
      h('p.small.muted', { style: { margin: '5px 0 0' } }, menu(phrase, 'short')),
    ));
  }

  // --- Häufige Notfälle ------------------------------------------------------
  if (cases.length) parts.push(emergencyPicker(wrap, cases, chosen, lang));

  // --- Hinweise und Ablauf, erst danach --------------------------------------
  const info = [];

  const channel = menu(phrase, 'channel');
  if (channel) {
    info.push(h('p.small', {
      style: { margin: '0 0 10px', 'font-weight': '650' }, lang: uiLang(),
    }, channel));
  }
  if (lines?.length) {
    info.push(h('p.small.muted', { style: { margin: '0 0 12px' }, lang: uiLang() },
      menu(phrase, 'short')));
  }
  if (before?.length) {
    info.push(h('div.notice', { lang: uiLang() },
      h('strong', { lang: uiLang() }, t('radio.before')),
      h('ul.checklist.plain', { style: { 'margin-top': '6px' } }, ...before.map((x) => h('li', x))),
    ));
  }
  if (checklist?.length) {
    info.push(h('h3', { style: { margin: '14px 0 6px', 'font-size': '.95rem' }, lang: uiLang() },
      t('radio.steps')));
    info.push(h('ol.checklist', { lang: uiLang() }, ...checklist.map((x) => h('li', x))));
  }
  if (after?.length) {
    info.push(h('div.notice', { lang: uiLang(), style: { 'margin-top': '12px' } },
      h('strong', { lang: uiLang() }, t('radio.after')),
      h('ul.checklist.plain', { style: { 'margin-top': '6px' } }, ...after.map((x) => h('li', x))),
    ));
  }

  if (info.length) {
    parts.push(h('details.foldout', { open: !lines?.length },
      h('summary', t('radio.details')),
      h('div', ...info),
    ));
  }

  return parts;
}

/** Auswahl häufiger Notfälle – füllt die offenen Stellen im Funkspruch. */
function emergencyPicker(wrap, cases, chosen, lang) {
  return h('div.card',
    h('h3', t('radio.emergencies')),
    h('p.small.muted', { style: { margin: '0 0 10px' } }, t('radio.emergenciesHint')),
    h('div.emergency-grid',
      ...cases.map((e) => h('button.emergency', {
        type: 'button',
        lang: uiLang(),
        'aria-pressed': String(chosen?.id === e.id),
        onclick: () => {
          // Nochmaliges Antippen hebt die Auswahl wieder auf.
          emergencyId = chosen?.id === e.id ? null : e.id;
          draw(wrap);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      },
      h('span.ico', { 'aria-hidden': 'true' }, e.icon),
      h('span.txt', localized(e, 'label', uiLang())),
      )),
    ),
    chosen
      ? h('div', { style: { 'margin-top': '11px' } },
        chosen.dsc && h('p.small', { style: { margin: '0 0 8px', 'font-weight': '600' } },
          t('radio.dscCategory', { v: chosen.dsc })),
        h('button.btn.small', {
          type: 'button',
          onclick: () => { emergencyId = null; draw(wrap); window.scrollTo({ top: 0, behavior: 'smooth' }); },
        }, t('radio.clearEmergency')),
      )
      : h('p.small.muted', { style: { margin: '11px 0 0' } }, t('radio.noEmergency')),
  );
}

function renderLine(line, v, chosen, lang) {
  if (line.t === 'gap') return h('div.line.gap');

  // Offene Stelle, die aus dem gewählten Notfall gefüllt wird.
  if (line.t === 'slot') {
    const filled = chosen ? localized(chosen, line.slot, lang) : null;
    return filled
      ? h('div.line.slot-filled', filled)
      : h('div.line.fill', line.hint);
  }

  const text = fillPlaceholders(line.text ?? '', v);
  if (line.t === 'note') return h('div.line.note', text);
  if (line.t === 'fill') return h('div.line.fill', text);
  // Die eigene Position ist die Zeile, auf die es ankommt – größer setzen.
  if (line.text?.includes('{{position}}')) return h('div.line.position', text);
  return h('div.line', text);
}

function plainText(phrase, lines, v, lang, chosen) {
  const title = localized(phrase, 'title', lang);
  const body = lines.map((l) => {
    if (l.t === 'gap') return '';
    if (l.t === 'slot') {
      return chosen ? localized(chosen, l.slot, lang) : l.hint;
    }
    return fillPlaceholders(l.text ?? '', v);
  }).join('\n');
  return `${title}\n${'-'.repeat(title.length)}\n${body}`;
}

export function resetView() {
  openId = null;
  emergencyId = null;
}

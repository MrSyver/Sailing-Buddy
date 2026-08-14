/**
 * Farbschema und Helligkeit.
 *
 * Der Nachtmodus setzt `data-theme="night"` auf dem Wurzelelement. Alle Farben
 * kommen aus CSS-Variablen, deshalb genügt dieser eine Schalter.
 * Der Dimmer legt zusätzlich eine schwarze Fläche über die Oberfläche und
 * kommt so unter die kleinste Helligkeitsstufe, die iOS selbst zulässt.
 */

import { settings } from './storage.js';
import { t } from './i18n.js';
import { isDark, sunTimes } from './sun.js';

export const THEME_KEYS = ['light', 'dark', 'night'];

/** Themes mit übersetzten Beschriftungen. */
export function themes() {
  return THEME_KEYS.map((key) => ({
    key,
    label: t(`theme.${key}`),
    hint: t(`theme.${key}.hint`),
  }));
}

const THEME_COLOR = { light: '#ffffff', dark: '#161b22', night: '#000000' };

export function applyTheme() {
  const s = settings.all();
  const theme = THEME_KEYS.includes(s.theme) ? s.theme : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.lang = settings.get('uiLang') === 'en' ? 'en' : 'de';

  // Farbe der Statusleiste in der installierten App mitziehen.
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLOR[theme];

  const dimmer = document.getElementById('dimmer');
  if (dimmer) {
    const b = Math.min(100, Math.max(25, Number(s.brightness) || 100));
    // 100 % lässt die Fläche unsichtbar, 25 % legt 75 % Schwarz darüber.
    dimmer.style.opacity = String((100 - b) / 100);
  }
}

/**
 * Schnellumschalter in der Kopfzeile: Nachtmodus an und wieder aus.
 *
 * Beim Einschalten wird gemerkt, wo man herkam, und beim Ausschalten geht es
 * genau dorthin zurück. Vorher landete jeder wieder im dunklen Schema – wer
 * tagsüber im hellen unterwegs war und nachts kurz nachsah, saß danach im
 * Dunkeln, ohne etwas geändert zu haben.
 */
export function toggleNight() {
  const current = settings.get('theme');

  if (current !== 'night') {
    // Von Hand umgelegt: Die Uhr soll das nicht gleich wieder zurückdrehen.
    settings.update({ themeBefore: current, theme: 'night', nightAuto: false });
    applyTheme();
    return settings.get('theme');
  }

  const back = settings.get('themeBefore');
  settings.update({
    theme: THEME_KEYS.includes(back) && back !== 'night' ? back : 'dark',
    themeBefore: '',
    nightAuto: false,
  });
  applyTheme();
  return settings.get('theme');
}

/**
 * Nachtmodus nach der Sonne, nicht nach der Uhr.
 *
 * Eine Stunde nach Sonnenuntergang am eigenen Ort ist die bürgerliche
 * Dämmerung vorbei; wer dann die App aufschlägt, will nicht von einem weißen
 * Bildschirm geblendet werden und die halbe Stunde Dunkeladaption verlieren,
 * die er gerade gewonnen hat. Eine feste Uhrzeit taugt dafür nicht: Im Juni
 * ist es an der Ostsee um 22 Uhr noch hell, im Dezember um 17 Uhr längst
 * dunkel.
 *
 * Zurückgeschaltet wird nur, was diese Funktion selbst gesetzt hat – daran
 * erinnert sich `nightAuto`. Wer von Hand in den Nachtmodus geht, bleibt
 * dort, auch wenn die Sonne scheint.
 *
 * `now` gibt es nur, damit sich das prüfen lässt, ohne die Uhr des Geräts zu
 * verstellen – im Betrieb ist es immer die aktuelle Zeit.
 *
 * Rückgabe: true, wenn etwas umgestellt wurde.
 */
export function applyAutoNight(fix, now = new Date()) {
  if (!settings.get('autoNight')) return false;
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return false;

  const dunkel = isDark(now, fix.lat, fix.lon);
  const theme = settings.get('theme');

  if (dunkel && theme !== 'night') {
    settings.update({ themeBefore: theme, theme: 'night', nightAuto: true });
    applyTheme();
    return true;
  }

  if (!dunkel && theme === 'night' && settings.get('nightAuto')) {
    const back = settings.get('themeBefore');
    settings.update({
      theme: THEME_KEYS.includes(back) && back !== 'night' ? back : 'dark',
      themeBefore: '',
      nightAuto: false,
    });
    applyTheme();
    return true;
  }

  return false;
}

/** Wann geht heute an diesem Ort die Sonne unter? Für die Anzeige. */
export function sunsetHere(fix) {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return null;
  return sunTimes(new Date(), fix.lat, fix.lon);
}

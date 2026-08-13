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

/** Schnellumschalter in der Kopfzeile: dunkel ⇄ Nacht. */
export function toggleNight() {
  const current = settings.get('theme');
  settings.set('theme', current === 'night' ? 'dark' : 'night');
  applyTheme();
  return settings.get('theme');
}

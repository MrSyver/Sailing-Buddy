/**
 * Modul „Karte“ – die Karte, groß.
 *
 * Hier hat die Fläche Vorrang vor allem anderen: Sie füllt den Bildschirm bis
 * auf die Leisten, die Bedienung liegt als kleine Knöpfe darauf statt darüber.
 * Was man auf einer Seekarte sucht, sieht man nur, wenn genug davon zu sehen
 * ist – eine Karte, die sich zwischen Überschriften und Schaltflächen drängt,
 * ist keine.
 *
 * Das Kartenbild ist deshalb hier auch nicht abschaltbar. Zuschaltbar ist es
 * dort, wo es eine Beigabe ist: auf der Positionsseite neben dem Kompass.
 *
 * Die Liste darunter nennt jede Position mit Entfernung und Kurs – wer sie
 * braucht, scrollt; wer die Karte will, hat sie ohne einen Griff.
 */

import { h, render, toast } from '../lib/dom.js';
import { gps } from '../lib/gps.js';
import { waypoints } from '../lib/storage.js';
import { t, num } from '../lib/i18n.js';
import { formatPosition, rhumbLine } from '../lib/geo.js';
import { logbook } from '../lib/logbook.js';
import { createChart, fullscreenButton } from '../lib/chartview.js';
import { scopeSelect, scopeFrom, scopeExists } from '../lib/scopeselect.js';
import { ATTRIBUTION } from '../data/tilesources.js';

/**
 * Welche Spur auf der Karte liegt.
 *
 * Früher stand hier ein schlichtes Ja/Nein für „alle Logbucheinträge“. Das
 * reicht nicht: Wer drei Törns mitgeschrieben hat, sieht sonst drei Törns
 * übereinander und kann nur beides oder nichts haben. Jetzt ist es ein
 * Ausschnitt – derselbe Begriff wie im Logbuch, damit beide Reiter dasselbe
 * meinen, wenn sie „Spur“ sagen.
 *
 * `'aus'` heißt keine Spur; alles andere wird von `scopeFrom` gelesen.
 */
const state = {
  trackScope: 'alles',
  /** Wohin der Schnellschalter zurückspringt, wenn man ihn wieder einschaltet. */
  letzte: 'alles',
};

let container = null;
let chart = null;

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  const offGps = gps.onUpdate(() => chart?.paint());
  return () => {
    offGps();
    chart?.destroy();
    chart = null;
    container = null;
  };
}

/**
 * Alles, was auf die Karte gehört: die eigene Position, jede gemerkte
 * Position und – falls gewünscht – die Spur aus dem Logbuch.
 */
function collect() {
  const marks = [];
  const fix = gps.fix;
  if (fix) {
    marks.push({
      kind: 'own', lat: fix.lat, lon: fix.lon, name: t('map.own'), heading: fix.heading,
    });
  }
  waypoints.list().forEach((wp) => marks.push({
    kind: wp.kind === 'mob' ? 'mob' : 'wp',
    lat: wp.lat,
    lon: wp.lon,
    name: wp.name,
    id: wp.id,
  }));
  const track = state.trackScope === 'aus'
    ? []
    : logbook.track(scopeFrom(state.trackScope));
  return { marks, track };
}

function draw() {
  if (!container) return;
  // Ein gelöschter Törn darf die Karte nicht leer stehen lassen.
  if (state.trackScope !== 'aus' && !scopeExists(state.trackScope)) state.trackScope = 'alles';
  const { marks, track } = collect();

  chart?.destroy();
  chart = createChart({ collect, size: 'gross' });

  const frame = h('div.chart-frame');

  render(container,
    marks.length === 0
      ? h('div.card', h('div.empty', t('map.nothing')))
      : frame,

    chart.note,
    marks.length > 0 && h('p.small.muted.chart-credit', ATTRIBUTION),
    trackCard(),
    legend(marks, track),
  );

  if (marks.length > 0) {
    frame.append(
      chart.el,
      // Die Bedienung liegt auf der Karte, nicht darüber – jede Zeile
      // darüber wäre eine Zeile weniger Karte.
      h('div.chart-controls',
        fullscreenButton(frame, chart),
        h('button.chart-btn', {
          type: 'button', 'aria-label': t('map.zoomIn'), onclick: () => chart.zoomBy(1),
        }, '＋'),
        h('button.chart-btn', {
          type: 'button', 'aria-label': t('map.zoomOut'), onclick: () => chart.zoomBy(-1),
        }, '－'),
        h('button.chart-btn', {
          type: 'button',
          'aria-label': t('map.centerOwn'),
          title: t('map.centerOwn'),
          onclick: () => {
            const fix = gps.fix;
            if (!fix) { toast(t('map.noFix')); return; }
            chart.centerOn(fix);
          },
        }, '◎'),
        h('button.chart-btn', {
          type: 'button',
          'aria-label': t('map.fitAll'),
          title: t('map.fitAll'),
          onclick: () => chart.fit(),
        }, '⤢'),
        // Der Schnellschalter bleibt: Ein Griff, und die Spur ist weg, wenn
        // sie im Weg liegt. *Welche* Spur, sagt die Liste unter der Karte.
        h('button.chart-btn', {
          type: 'button',
          'aria-pressed': String(state.trackScope !== 'aus'),
          'aria-label': t('map.trackToggle'),
          title: t('map.trackToggle'),
          onclick: () => {
            if (state.trackScope === 'aus') state.trackScope = state.letzte;
            else { state.letzte = state.trackScope; state.trackScope = 'aus'; }
            draw();
          },
        }, '〜'),
      ),
    );
  }

  chart.paint();
}

/**
 * Welche Spur gezeigt wird.
 *
 * Nur, wenn überhaupt etwas mitgeschrieben ist – sonst wäre es eine
 * Auswahlliste mit einem Eintrag, und die erklärt nichts.
 */
function trackCard() {
  if (logbook.entries().length === 0) return null;
  return h('div.card', { style: { 'margin-top': '12px' } },
    scopeSelect({
      value: state.trackScope,
      name: 'karte',
      label: t('log.scope'),
      extra: [{ value: 'aus', label: t('map.trackOff') }],
      onPick: (wert) => {
        state.trackScope = wert;
        if (wert !== 'aus') state.letzte = wert;
        draw();
      },
    }),
  );
}

// ------------------------------------------------------------------ Legende

function legend(marks, track) {
  const fix = gps.fix;
  const others = marks.filter((m) => m.kind !== 'own');
  if (others.length === 0 && !fix) return null;

  return h('div.card', { style: { 'margin-top': '12px' } },
    h('h2', t('map.list')),
    fix && h('div.wp-item',
      h('div.grow',
        h('div.wp-name', `◎ ${t('map.own')}`),
        h('div.wp-pos', formatPosition(fix, 2)),
      ),
    ),
    ...others.map((mark) => {
      const leg = fix ? rhumbLine(fix, mark) : null;
      return h('div.wp-item',
        h('div.grow',
          h('div.wp-name', mark.kind === 'mob' ? `⚑ ${mark.name}` : mark.name),
          h('div.wp-pos', formatPosition(mark, 2)),
        ),
        leg && h('div.wp-dist',
          `${num(leg.distance, leg.distance < 10 ? 2 : 1)} sm`,
          h('small', `${String(Math.round(leg.bearing) % 360).padStart(3, '0')}°`),
        ),
        h('button.btn.small', {
          type: 'button',
          onclick: () => {
            chart?.centerOn(mark, 12);
            chart?.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }, t('map.show')),
      );
    }),
    track.length > 1 && h('p.small.muted', { style: { margin: '10px 0 0' } },
      t('map.trackHint', { v: track.length })),
  );
}

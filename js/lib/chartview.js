/**
 * Der Kartenausschnitt als eigener Baustein.
 *
 * Zwei Stellen brauchen dieselbe Karte in verschiedenen Größen: der Reiter
 * „Karte“ als große Fläche und die Positionsseite als Beigabe neben dem
 * Kompass. Deshalb steht hier alles, was eine Karte ausmacht – Ausschnitt,
 * Kacheln, Zeichnung, Ziehen und Kneifen –, und zwar je Karte für sich statt
 * in Modulvariablen. Zwei Karten auf einer Seite kommen sich so nicht ins
 * Gehege.
 *
 * Fehlt eine Kachel im Gerät und besteht eine Verbindung, wird sie nachgeholt
 * und gleich abgelegt. Nachgeholt wird ausschließlich der sichtbare
 * Ausschnitt, einzeln und mit Pause: Ein Bildschirm voll Kacheln bei Bedarf
 * ist gewöhnliche Kartennutzung, im Gegensatz zum Herunterladen ganzer
 * Seegebiete. Ohne Verbindung bleibt die Fläche leer und sagt das auch.
 *
 * Die Höhe kommt aus dem Stylesheet, nicht aus dieser Datei – gemessen wird,
 * was daraus geworden ist. So bleibt „groß“ eine Frage der Gestaltung.
 */

import { h, svg, render } from './dom.js';
import { settings } from './storage.js';
import { t, num } from './i18n.js';
import {
  lonToTileX, latToTileY, tileXToLon, tileYToLat, tileStore, tileUrl,
} from './tiles.js';
import { layers } from '../data/tilesources.js';
import { openAll } from './packs.js';
import { mediaType } from './mbtiles.js';
import { LOG_EVENTS } from './logbook.js';

/** Die Zeichen der Logbuchereignisse – für die Spur auf der Karte. */
const EVENT_SYMBOL = new Map(LOG_EVENTS.map((e) => [e.key, e.sym]));

const TILE = 256;
const MIN_Z = 3;
const MAX_Z = 16;
/** Pause zwischen zwei nachgeholten Kacheln, in Millisekunden. */
const FETCH_DELAY = 80;

/**
 * Legt eine Karte an.
 *
 *   collect()  liefert `{ marks, track }` – bei jeder Neuzeichnung frisch,
 *              damit die Karte keine veraltete Kopie hält.
 *   size       'gross' oder 'klein' – bestimmt nur die Klasse im Stylesheet.
 *
 * Rückgabe: `{ el, note, paint, fit, zoomBy, centerOn, destroy }`.
 */
export function createChart({ collect, size = 'klein' }) {
  const el = h(`div.chart.chart-${size}`);
  const note = h('div.chart-note');

  const state = { zoom: null, center: null };
  // Der zuletzt gezeichnete Ausschnitt. Das Ziehen rechnet damit weiter,
  // statt mit Werten, die beim Anhängen der Handler galten.
  let shown = { z: 10, center: { lat: 54.5, lon: 10.2 } };
  const pointers = new Map();
  let dragStart = null;
  let objectUrls = [];
  let lastKey = null;
  // Zählt jede Neuzeichnung mit: Nachgeladene Kacheln aus einem alten
  // Ausschnitt dürfen nicht in einen neuen hineinfallen.
  let generation = 0;
  let alive = true;

  function releaseUrls() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
  }

  // ------------------------------------------------------------- Ausschnitt

  function measure() {
    const box = el.getBoundingClientRect();
    const width = Math.round(box.width || 320);
    const height = Math.round(box.height || Math.max(260, width * 0.95));
    return { width, height };
  }

  function viewport() {
    const { marks, track, leg = [] } = collect();
    const points = [...marks, ...track, ...leg];
    const { width, height } = measure();

    if (points.length === 0) {
      return {
        z: state.zoom ?? 10,
        center: state.center ?? { lat: 54.5, lon: 10.2 },
        width,
        height,
      };
    }

    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const bounds = {
      north: Math.max(...lats), south: Math.min(...lats),
      east: Math.max(...lons), west: Math.min(...lons),
    };
    const center = state.center ?? {
      lat: (bounds.north + bounds.south) / 2,
      lon: (bounds.east + bounds.west) / 2,
    };

    let z = state.zoom;
    if (z === null) {
      z = MIN_Z;
      for (let candidate = MAX_Z; candidate >= MIN_Z; candidate -= 1) {
        const w = (lonToTileX(bounds.east, candidate) - lonToTileX(bounds.west, candidate)) * TILE;
        const hgt = (latToTileY(bounds.south, candidate) - latToTileY(bounds.north, candidate)) * TILE;
        // Etwas Rand lassen, damit die äußersten Punkte nicht am Rand kleben.
        if (w <= width * 0.82 && hgt <= height * 0.82) { z = candidate; break; }
      }
      // Ein einzelner Punkt spannt kein Rechteck auf – dann ein fester Maßstab.
      if (bounds.north === bounds.south && bounds.east === bounds.west) z = Math.min(13, MAX_Z);
    }

    return { z, center, width, height };
  }

  // --------------------------------------------------------------- Zeichnen

  async function paint() {
    if (!alive || !el.isConnected) return;

    const { z, center, width, height } = viewport();
    const { marks, track, leg = [] } = collect();

    // Weltkoordinaten in Bildpunkten; der Ausschnitt liegt mittig darin.
    const originX = lonToTileX(center.lon, z) * TILE - width / 2;
    const originY = latToTileY(center.lat, z) * TILE - height / 2;
    const toXY = (p) => ({
      x: lonToTileX(p.lon, z) * TILE - originX,
      y: latToTileY(p.lat, z) * TILE - originY,
    });

    // Der GPS-Empfänger meldet sich im Sekundentakt. Solange sich der
    // Ausschnitt nicht ändert, bleiben die Kacheln stehen – sonst flackert
    // die Karte und liest bei jedem Fix die halbe Datenbank neu.
    const key = `${z}|${Math.round(originX)}|${Math.round(originY)}|${width}x${height}`;
    const existing = el.querySelector('.chart-tiles');
    const reuse = existing && key === lastKey;

    el.querySelector('.chart-plot')?.remove();
    if (!reuse) {
      existing?.remove();
      releaseUrls();
      generation += 1;
    }
    lastKey = key;

    if (!reuse) {
      // Erst zeichnen, dann nachreichen: Die Punkte stehen sofort, die Bilder
      // kommen aus der Datenbank hinterher.
      tileLayer(z, originX, originY, width, height, generation);
    }

    // Was gerade gezeigt wird – das Ziehen rechnet damit weiter.
    shown = { z, center };

    el.appendChild(overlay({ marks, track, leg, toXY, width, height, z, center }));
  }

  // ----------------------------------------------------------------- Kacheln

  async function tileLayer(z, originX, originY, width, height, token) {
    const wrap = h('div.chart-tiles');
    el.prepend(wrap);

    const x0 = Math.floor(originX / TILE);
    const x1 = Math.floor((originX + width) / TILE);
    const y0 = Math.floor(originY / TILE);
    const y1 = Math.floor((originY + height) / TILE);
    const max = 2 ** z;

    const wanted = [];
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        if (x < 0 || y < 0 || x >= max || y >= max) continue;
        wanted.push({ x, y });
      }
    }

    const sources = layers(settings.all());
    // Fertige Kartenpakete liegen als einzelne Datei im Gerät und werden
    // seitenweise gelesen. Sie kommen zuunterst, einzeln geladene Kacheln
    // darüber – die sind gezielt für diese Stelle geholt worden.
    const packs = await openAll().catch(() => []);
    if (token !== generation) return;

    const place = (blob, tile, type) => {
      const url = URL.createObjectURL(
        blob instanceof Blob ? blob : new Blob([blob], { type }),
      );
      objectUrls.push(url);
      wrap.appendChild(h('img.chart-tile', {
        src: url,
        alt: '',
        style: {
          left: `${tile.x * TILE - originX}px`,
          top: `${tile.y * TILE - originY}px`,
        },
      }));
    };

    let found = 0;
    const missing = [];

    for (const tile of wanted) {
      if (token !== generation) return;
      let hit = false;

      for (const { pack } of packs) {
        if (z < pack.minzoom || z > pack.maxzoom) continue;
        // eslint-disable-next-line no-await-in-loop
        const bytes = await pack.getTile(z, tile.x, tile.y);
        if (!bytes) continue;
        place(bytes, tile, mediaType(pack.format));
        hit = true;
        break;
      }

      for (const layer of sources) {
        // eslint-disable-next-line no-await-in-loop
        const blob = await tileStore.get(layer.id, z, tile.x, tile.y);
        if (!blob) continue;
        if (layer.id === 'base') hit = true;
        place(blob, tile);
      }

      if (hit) found += 1;
      else missing.push(tile);
    }

    const online = navigator.onLine !== false;
    const allowed = settings.get('autoTiles') !== false;

    const sayState = (have) => {
      if (token !== generation) return;
      if (have === 0) {
        // Warum nichts da ist, hängt davon ab, woran es liegt – und das ist
        // der einzige Satz, den man in dem Moment wirklich braucht.
        const grund = !online ? t('map.noTiles.offline')
          : !allowed ? t('map.noTiles.switchedOff')
            : t('map.noTiles.unreachable');
        render(note, h('div.notice.warn', { style: { 'margin-top': '10px' } },
          h('strong', t('map.noTiles.title')), grund));
      } else if (have < wanted.length) {
        render(note, h('p.small.muted', { style: { margin: '9px 0 0' } },
          t('map.partial', { have, want: wanted.length })));
      } else {
        render(note);
      }
    };

    if (missing.length === 0 || !online || !allowed) {
      sayState(found);
      return;
    }

    render(note, h('p.small.muted', { style: { margin: '9px 0 0' } },
      t('map.fetching', { n: missing.length })));

    found += await fetchMissing(missing, { z, sources, place, token });
    sayState(found);
  }

  /**
   * Holt fehlende Kacheln aus dem Netz und legt sie gleich ab.
   *
   * Einzeln und mit Pause, damit es ein Abruf nach Bedarf bleibt und kein
   * Sturm. Wird zwischendurch weitergeschoben, bricht es ab.
   */
  async function fetchMissing(missing, { z, sources, place, token }) {
    let geholt = 0;

    for (const tile of missing) {
      if (token !== generation) break;
      let hit = false;

      for (const layer of sources) {
        if (token !== generation) break;
        try {
          // eslint-disable-next-line no-await-in-loop
          const response = await fetch(tileUrl(layer.url, z, tile.x, tile.y));
          if (!response.ok) continue;
          // eslint-disable-next-line no-await-in-loop
          const blob = await response.blob();
          if (token !== generation) break;
          // Abgelegt wird immer: Beim nächsten Mal ist die Stelle auch ohne
          // Netz da – und genau darum geht es unterwegs.
          // eslint-disable-next-line no-await-in-loop
          await tileStore.put(layer.id, z, tile.x, tile.y, blob).catch(() => {});
          place(blob, tile);
          if (layer.id === 'base') hit = true;
        } catch {
          // Eine Kachel, die nicht kommt, ist kein Grund aufzuhören.
        }
      }

      if (hit) geholt += 1;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, FETCH_DELAY); });
    }

    return geholt;
  }

  // --------------------------------------------------------------- Zeichnung

  function overlay({ marks, track, leg = [], toXY, width, height, z, center }) {
    const plot = svg('svg.chart-plot', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': t('map.title'),
    });

    // Der Strich von hier zum Ziel. Er liegt unter allem anderen, damit er die
    // Punkte nicht überdeckt – zeigen soll er, was zusammengehört, nicht die
    // Stellen selbst.
    if (leg.length > 1) {
      plot.appendChild(svg('polyline', {
        class: 'plot-leg',
        points: leg.map((p) => {
          const q = toXY(p);
          return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
        }).join(' '),
      }));
    }

    if (track.length > 1) {
      plot.appendChild(svg('polyline', {
        class: 'plot-line',
        points: track.map((p) => {
          const q = toXY(p);
          return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
        }).join(' '),
      }));
    }

    // Ereignisse an der Stelle, an der sie passiert sind.
    //
    // Das ist der Unterschied zwischen einer Spur und einem Logbuch: Man sieht,
    // wo gewendet und wo geankert wurde. Nur Ereignisse, nicht jeder Punkt –
    // eine Saison hat Tausende Punkte und ein paar Dutzend Ereignisse.
    track.forEach((p) => {
      if (!p.event) return;
      const q = toXY(p);
      if (q.x < -20 || q.y < -20 || q.x > width + 20 || q.y > height + 20) return;
      plot.appendChild(svg('circle', { class: 'plot-dot manual', cx: q.x, cy: q.y, r: 4 }));
      const sym = EVENT_SYMBOL.get(p.event);
      if (sym) {
        plot.appendChild(svg('text', {
          class: 'plot-event', x: q.x, y: q.y - 8, 'text-anchor': 'middle', 'font-size': '12',
        }, sym));
      }
    });

    // Die eigene Position zuletzt: Liegt sie auf einem Wegpunkt – etwa direkt
    // nach dem MOB-Knopf –, darf sie nicht darunter verschwinden.
    const ordered = [...marks]
      .sort((a, b) => (a.kind === 'own' ? 1 : 0) - (b.kind === 'own' ? 1 : 0));

    ordered.forEach((mark) => {
      const p = toXY(mark);
      if (p.x < -40 || p.y < -40 || p.x > width + 40 || p.y > height + 40) return;
      const g = svg('g', { class: `chart-mark ${mark.kind}` });

      if (mark.kind === 'own') {
        // Eigene Position als Bugsymbol, wenn ein Kurs anliegt.
        const turn = mark.heading === null || mark.heading === undefined ? null : mark.heading;
        g.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 9, class: 'halo' }));
        g.appendChild(turn === null
          ? svg('circle', { cx: p.x, cy: p.y, r: 5, class: 'dot' })
          : svg('polygon', {
            class: 'dot',
            points: `${p.x},${p.y - 9} ${p.x - 6},${p.y + 7} ${p.x + 6},${p.y + 7}`,
            transform: `rotate(${turn} ${p.x} ${p.y})`,
          }));
      } else {
        // Das Ziel und die MOB-Stelle bekommen einen Ring: Zwischen einem
        // Dutzend gemerkter Punkte muss auf einen Blick zu sehen sein, welcher
        // gerade gemeint ist.
        const wichtig = mark.kind === 'target' || mark.kind === 'mob';
        if (wichtig) g.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 11, class: 'ring' }));
        g.appendChild(svg('circle', { cx: p.x, cy: p.y, r: wichtig ? 6.5 : 5.5, class: 'dot' }));
        g.appendChild(svg('text', {
          class: 'chart-label', x: p.x + (wichtig ? 15 : 9), y: p.y + 4,
        }, mark.kind === 'mob' ? `⚑ ${mark.name}` : mark.name));
      }
      plot.appendChild(g);
    });

    // Nordpfeil links oben – rechts liegen die Knöpfe, und die Karte ist
    // immer nordorientiert.
    plot.appendChild(svg('path', {
      class: 'plot-north',
      d: 'M20 30 L20 10 M15 16 L20 10 L25 16',
    }));
    plot.appendChild(svg('text', {
      class: 'plot-label', x: 20, y: 44, 'text-anchor': 'middle',
    }, 'N'));

    scaleBar(plot, z, center, width, height);
    return plot;
  }

  /** Maßstabsbalken: eine runde Seemeilenzahl, so breit wie sie eben ist. */
  function scaleBar(plot, z, center, width, height) {
    // Wie viele Bildpunkte misst eine Seemeile an dieser Stelle?
    const north = { lat: center.lat + 1 / 60, lon: center.lon };
    const pxPerNm = Math.abs((latToTileY(north.lat, z) - latToTileY(center.lat, z)) * TILE);
    if (!Number.isFinite(pxPerNm) || pxPerNm <= 0) return;

    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    const step = nice.find((v) => v * pxPerNm >= width * 0.3) ?? nice[nice.length - 1];
    const bar = step * pxPerNm;
    if (bar < 20 || bar > width - 40) return;

    const y = height - 16;
    plot.appendChild(svg('path', {
      class: 'plot-scale', d: `M14 ${y - 5} V${y} H${14 + bar} V${y - 5}`,
    }));
    plot.appendChild(svg('text', { class: 'plot-label', x: 14, y: y - 9 },
      `${step < 1 ? num(step, 1) : num(step, 0)} sm`));
  }

  // ------------------------------------------------------------ Verschieben

  /**
   * Ziehen mit einem Finger, Kneifen mit zweien.
   *
   * Einmal angehängt und nicht bei jeder Neuzeichnung neu: Der erste
   * Fingerbreit Bewegung löst ein Neuzeichnen aus, und hinge das Ziehen an
   * dieser Zeichnung, wäre danach ein frischer Satz Handler mit leerer
   * Zeigerliste da – jede weitere Bewegung liefe ins Leere und die Karte
   * klebte am Ausgangspunkt fest. Genau das war der Fall.
   *
   * Der Bezugspunkt kommt deshalb aus `shown`, das jede Zeichnung
   * nachführt, statt aus geschlossenen Werten.
   */
  function attachDrag() {
    el.onpointerdown = (e) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) dragStart = { x: e.clientX, y: e.clientY };
      if (pointers.size === 2) dragStart = { spread: spreadOf(pointers) };
    };

    el.onpointermove = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const { z, center } = shown;

      if (pointers.size === 1 && dragStart && dragStart.x !== undefined) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        state.center = {
          lat: tileYToLat(latToTileY(center.lat, z) - dy / TILE, z),
          lon: tileXToLon(lonToTileX(center.lon, z) - dx / TILE, z),
        };
        state.zoom = z;
        dragStart = { x: e.clientX, y: e.clientY };
        paint();
      }

      if (pointers.size === 2 && dragStart?.spread) {
        const now = spreadOf(pointers);
        if (now / dragStart.spread > 1.6) {
          dragStart = { spread: now };
          zoomBy(1);
        } else if (now / dragStart.spread < 0.62) {
          dragStart = { spread: now };
          zoomBy(-1);
        }
      }
    };

    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) dragStart = null;
    };
    el.onpointerup = end;
    el.onpointercancel = end;
  }

  function spreadOf(pointers) {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ------------------------------------------------------------- Bedienung

  function zoomBy(step) {
    const view = viewport();
    state.zoom = Math.max(MIN_Z, Math.min(MAX_Z, (state.zoom ?? view.z) + step));
    if (!state.center) state.center = view.center;
    paint();
  }

  /** Ausschnitt wieder an alle Punkte anpassen. */
  function fit() {
    state.zoom = null;
    state.center = null;
    paint();
  }

  /** Auf eine Stelle mittig, mit mindestens dieser Zoomstufe. */
  function centerOn(pos, minZoom = null) {
    state.center = { lat: pos.lat, lon: pos.lon };
    if (minZoom !== null) state.zoom = Math.max(state.zoom ?? minZoom, minZoom);
    paint();
  }

  function destroy() {
    alive = false;
    generation += 1;
    releaseUrls();
    pointers.clear();
    dragStart = null;
    el.onpointerdown = null;
    el.onpointermove = null;
    el.onpointerup = null;
    el.onpointercancel = null;
  }

  attachDrag();

  return { el, note, paint, fit, zoomBy, centerOn, destroy };
}

/**
 * Ein Knopf, der die Karte über den ganzen Bildschirm legt.
 *
 * Bewusst über eine Klasse und nicht über die Vollbild-Schnittstelle des
 * Browsers: Safari auf dem iPhone kennt `requestFullscreen` für einzelne
 * Elemente nicht. Eine feste Fläche über allem tut hier dasselbe, läuft
 * überall und lässt sich mit demselben Knopf wieder schließen.
 */
export function fullscreenButton(frame, chart) {
  const btn = h('button.chart-btn', {
    type: 'button',
    'aria-pressed': 'false',
    'aria-label': t('map.fullscreen'),
    title: t('map.fullscreen'),
  }, '⛶');

  const setzen = (an) => {
    frame.classList.toggle('chart-full', an);
    document.body.classList.toggle('chart-open', an);
    btn.textContent = an ? '✕' : '⛶';
    btn.setAttribute('aria-pressed', String(an));
    btn.setAttribute('aria-label', an ? t('map.fullscreenExit') : t('map.fullscreen'));
    // Erst nach dem Umbruch messen – vorher hat die Fläche die alte Größe.
    requestAnimationFrame(() => chart.paint());
  };

  btn.onclick = () => setzen(!frame.classList.contains('chart-full'));

  // Die Zurück-Taste des Geräts soll das Vollbild schließen und nicht die
  // Seite verlassen – dafür genügt die Escape-Taste auf dem Rechner.
  const onKey = (e) => {
    if (e.key === 'Escape' && frame.classList.contains('chart-full')) setzen(false);
  };
  document.addEventListener('keydown', onKey);
  btn._detach = () => document.removeEventListener('keydown', onKey);

  return btn;
}

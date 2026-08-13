/**
 * Modul „Karte“ – gemerkte Positionen und die eigene auf einen Blick.
 *
 * Zwei Ebenen, die unabhängig voneinander funktionieren:
 *
 *   1. Die Positionen selbst. Sie werden immer gezeichnet, überall auf der
 *      Welt, ohne Kartenmaterial und ohne Speicherbedarf.
 *   2. Das Kartenbild darunter. Das kostet Platz im Gerät und wird deshalb
 *      nur auf Knopfdruck eingeblendet. Es kommt aus den Kartenpaketen und
 *      den einzeln geladenen Kacheln, die schon im Gerät liegen.
 *
 * Fehlt eine Kachel im Gerät und besteht gerade eine Verbindung, wird sie
 * nachgeholt und gleich abgelegt – dann ist sie beim nächsten Mal auch ohne
 * Netz da. Nachgeholt wird ausschließlich der sichtbare Ausschnitt, einzeln
 * und mit Pause: ein Bildschirm voll Kacheln bei Bedarf ist genau das, wofür
 * ein Kachelserver da ist, im Gegensatz zum Herunterladen ganzer Seegebiete.
 *
 * Ohne Verbindung bleibt die Fläche leer und sagt das auch. Eine Karte, die
 * ohne Netz verschwindet, wäre schlimmer als gar keine.
 */

import { h, svg, render, toast } from '../lib/dom.js';
import { gps } from '../lib/gps.js';
import { settings, waypoints } from '../lib/storage.js';
import { t, num } from '../lib/i18n.js';
import { formatPosition, rhumbLine } from '../lib/geo.js';
import { logbook } from '../lib/logbook.js';
import {
  lonToTileX, latToTileY, tileXToLon, tileYToLat, tileStore, tileUrl,
} from '../lib/tiles.js';
import { layers, ATTRIBUTION } from '../data/tilesources.js';
import { openAll } from '../lib/packs.js';
import { mediaType } from '../lib/mbtiles.js';

const TILE = 256;
const MIN_Z = 3;
const MAX_Z = 16;
/** Pause zwischen zwei nachgeholten Kacheln, in Millisekunden. */
const FETCH_DELAY = 80;

const state = {
  showTiles: false,   // Kartenbild nur auf Knopfdruck
  showTrack: true,    // Spur aus dem Logbuch
  zoom: null,         // null = an die Punkte angepasst
  center: null,       // null = Mitte aller Punkte
};

let container = null;
let objectUrls = [];
let lastTiles = null;
/**
 * Zählt jede Neuzeichnung mit. Nachgeladene Kacheln aus einem alten
 * Ausschnitt dürfen nicht in einen neuen hineinfallen – bis eine Antwort da
 * ist, hat man vielleicht längst weitergeschoben.
 */
let generation = 0;

export function view(root) {
  container = h('div');
  render(root, container);
  draw();
  const offGps = gps.onUpdate(() => paint());
  return () => {
    offGps();
    releaseUrls();
    lastTiles = null;
    container = null;
  };
}

/** Blob-Adressen wieder freigeben – sonst wächst der Speicher mit jedem Bild. */
function releaseUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

// ---------------------------------------------------------------- Punkte

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
  const track = state.showTrack ? logbook.track() : [];
  return { marks, track, fix };
}

function draw() {
  if (!container) return;
  const { marks, track } = collect();

  render(container,
    h('div.card',
      h('div.row', { style: { 'margin-bottom': '10px' } },
        h('h2.grow', { style: { margin: 0 } }, t('map.title')),
        h('button.btn.small', {
          type: 'button',
          onclick: () => { state.center = null; state.zoom = null; paint(); },
        }, t('map.fitAll')),
      ),

      marks.length === 0
        ? h('div.empty', t('map.nothing'))
        : h('div.chart', { id: 'chart' }),

      marks.length > 0 && h('div.row.wrap', { style: { 'margin-top': '10px' } },
        h('button.btn.small', {
          type: 'button',
          onclick: () => zoomBy(1),
        }, '＋'),
        h('button.btn.small', {
          type: 'button',
          onclick: () => zoomBy(-1),
        }, '－'),
        h('button.btn.small.grow', {
          type: 'button',
          onclick: () => {
            const fix = gps.fix;
            if (!fix) { toast(t('map.noFix')); return; }
            state.center = { lat: fix.lat, lon: fix.lon };
            paint();
          },
        }, t('map.centerOwn')),
      ),

      // Das Kartenbild ist ausdrücklich zuschaltbar – ohne es ist die Karte
      // vollständig benutzbar, nur eben ohne Land und Untiefen.
      marks.length > 0 && h('button.btn.block', {
        type: 'button',
        style: { 'margin-top': '10px' },
        'aria-pressed': String(state.showTiles),
        onclick: () => { state.showTiles = !state.showTiles; draw(); },
      }, state.showTiles ? t('map.hideChart') : t('map.showChart')),

      h('div.filter-chips', { style: { 'margin-top': '10px' } },
        h('button.chip', {
          type: 'button',
          'aria-pressed': String(state.showTrack),
          onclick: () => { state.showTrack = !state.showTrack; draw(); },
        }, t('map.trackToggle')),
      ),

      h('div', { id: 'chart-note' }),

      state.showTiles && h('p.small.muted', { style: { margin: '9px 0 0' } }, ATTRIBUTION),
    ),

    legend(marks, track),
  );

  paint();
}

function zoomBy(step) {
  const view = viewport();
  state.zoom = Math.max(MIN_Z, Math.min(MAX_Z, (state.zoom ?? view.z) + step));
  if (!state.center) state.center = view.center;
  paint();
}

// -------------------------------------------------------------- Ausschnitt

/** Größe der Zeichenfläche – vor der ersten Messung eine sinnvolle Annahme. */
function chartSize() {
  const box = container?.querySelector('#chart');
  const width = Math.round(box?.getBoundingClientRect().width || 320);
  return { width, height: Math.round(Math.min(420, Math.max(260, width * 0.95))) };
}

/** Zoomstufe und Mittelpunkt für die aktuelle Auswahl. */
function viewport() {
  const { marks, track } = collect();
  const points = [...marks, ...track];
  const { width, height } = chartSize();

  if (points.length === 0) {
    return { z: state.zoom ?? 10, center: state.center ?? { lat: 54.5, lon: 10.2 }, width, height };
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
      // Etwas Rand lassen, damit die äußersten Punkte nicht am Kartenrand kleben.
      if (w <= width * 0.82 && hgt <= height * 0.82) { z = candidate; break; }
    }
    // Ein einzelner Punkt spannt kein Rechteck auf – dann ein fester Maßstab.
    if (bounds.north === bounds.south && bounds.east === bounds.west) z = Math.min(13, MAX_Z);
  }

  return { z, center, width, height };
}

// ---------------------------------------------------------------- Zeichnen

async function paint() {
  if (!container) return;
  const box = container.querySelector('#chart');
  if (!box) return;

  const { z, center, width, height } = viewport();
  const { marks, track } = collect();

  // Weltkoordinaten in Bildpunkten; der Ausschnitt liegt mittig darin.
  const originX = lonToTileX(center.lon, z) * TILE - width / 2;
  const originY = latToTileY(center.lat, z) * TILE - height / 2;
  const toXY = (p) => ({
    x: lonToTileX(p.lon, z) * TILE - originX,
    y: latToTileY(p.lat, z) * TILE - originY,
  });

  box.style.height = `${height}px`;

  // Der GPS-Empfänger meldet sich im Sekundentakt. Solange sich der
  // Ausschnitt nicht ändert, bleiben die Kacheln stehen – sonst flackert die
  // Karte und liest bei jedem Fix die halbe Datenbank neu.
  const key = `${z}|${Math.round(originX)}|${Math.round(originY)}|${state.showTiles}`;
  const existing = box.querySelector('.chart-tiles');
  const reuse = state.showTiles && existing && key === lastTiles;

  box.querySelector('.chart-plot')?.remove();
  if (!reuse) {
    existing?.remove();
    releaseUrls();
    // Ein neuer Ausschnitt: Was noch aus dem Netz unterwegs ist, gehört
    // nicht mehr hierher.
    generation += 1;
  }
  lastTiles = key;

  if (state.showTiles && !reuse) {
    // Absichtlich erst zeichnen, dann nachreichen: Die Punkte stehen sofort,
    // die Bilder kommen aus der Datenbank hinterher.
    tileLayer(box, z, originX, originY, width, height, generation);
  }

  box.appendChild(overlay({ marks, track, toXY, width, height, z, center }));
  attachDrag(box, z, center);
}

/** Legt die gespeicherten Kacheln hinter die Zeichnung. */
async function tileLayer(box, z, originX, originY, width, height, token) {
  const wrap = h('div.chart-tiles');
  box.prepend(wrap);

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

  let found = 0;
  const sources = layers(settings.all());
  // Fertige Kartenpakete liegen als einzelne Datei im Gerät und werden
  // seitenweise gelesen. Sie kommen zuunterst, einzeln geladene Kacheln
  // darüber – die sind gezielt für diese Stelle geholt worden.
  const packs = await openAll().catch(() => []);

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

  const missing = [];
  for (const tile of wanted) {
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

  // Was im Gerät fehlt, wird nachgeholt – aber nur mit Verbindung, nur der
  // sichtbare Ausschnitt und nur, wenn es eingeschaltet ist.
  const online = navigator.onLine !== false;
  const allowed = settings.get('autoTiles') !== false;

  const note = () => container?.querySelector('#chart-note');
  const sayState = (have) => {
    const el = note();
    if (!el) return;
    if (have === 0) {
      // Warum nichts da ist, hängt davon ab, woran es liegt – und das ist
      // der einzige Satz, den man in dem Moment wirklich braucht.
      const grund = !online ? t('map.noTiles.offline')
        : !allowed ? t('map.noTiles.switchedOff')
          : t('map.noTiles.unreachable');
      render(el, h('div.notice.warn', { style: { 'margin-top': '10px' } },
        h('strong', t('map.noTiles.title')), grund));
    } else if (have < wanted.length) {
      render(el, h('p.small.muted', { style: { margin: '9px 0 0' } },
        t('map.partial', { have, want: wanted.length })));
    } else {
      render(el);
    }
  };

  if (missing.length === 0 || !online || !allowed) {
    sayState(found);
    return;
  }

  const el = note();
  if (el) {
    render(el, h('p.small.muted', { style: { margin: '9px 0 0' } },
      t('map.fetching', { n: missing.length })));
  }

  found += await fetchMissing(missing, { z, sources, place, token });
  if (token !== generation) return;
  sayState(found);
}

/**
 * Holt fehlende Kacheln aus dem Netz und legt sie gleich ab.
 *
 * Einzeln und mit Pause, damit es ein Abruf nach Bedarf bleibt und kein
 * Sturm. Wird zwischendurch weitergeschoben, bricht es ab: Die Antworten
 * gehörten dann zu einem Ausschnitt, den niemand mehr ansieht.
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

/** Positionen, Spur, Nordpfeil und Maßstab. */
function overlay({ marks, track, toXY, width, height, z, center }) {
  const el = svg('svg.chart-plot', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': t('map.title'),
  });

  // Spur aus dem Logbuch
  if (track.length > 1) {
    el.appendChild(svg('polyline', {
      class: 'plot-line',
      points: track.map((p) => {
        const q = toXY(p);
        return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      }).join(' '),
    }));
  }

  // Die eigene Position zuletzt: Liegt sie auf einem Wegpunkt – etwa direkt
  // nach dem MOB-Knopf –, darf sie nicht darunter verschwinden.
  const ordered = [...marks].sort((a, b) => (a.kind === 'own' ? 1 : 0) - (b.kind === 'own' ? 1 : 0));

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
      g.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 5.5, class: 'dot' }));
      g.appendChild(svg('text', {
        class: 'chart-label', x: p.x + 9, y: p.y + 4,
      }, mark.kind === 'mob' ? `⚑ ${mark.name}` : mark.name));
    }
    el.appendChild(g);
  });

  // Nordpfeil – die Karte ist immer nordorientiert.
  el.appendChild(svg('path', {
    class: 'plot-north',
    d: `M${width - 20} 30 L${width - 20} 10 M${width - 25} 16 L${width - 20} 10 L${width - 15} 16`,
  }));
  el.appendChild(svg('text', {
    class: 'plot-label', x: width - 20, y: 44, 'text-anchor': 'middle',
  }, 'N'));

  scaleBar(el, z, center, width, height);
  return el;
}

/** Maßstabsbalken: eine runde Seemeilenzahl, so breit wie sie eben ist. */
function scaleBar(el, z, center, width, height) {
  // Wie viele Bildpunkte misst eine Seemeile an dieser Stelle?
  const north = { lat: center.lat + 1 / 60, lon: center.lon };
  const pxPerNm = Math.abs(
    (latToTileY(north.lat, z) - latToTileY(center.lat, z)) * TILE,
  );
  if (!Number.isFinite(pxPerNm) || pxPerNm <= 0) return;

  const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const target = width * 0.3;
  const step = nice.find((v) => v * pxPerNm >= target) ?? nice[nice.length - 1];
  const bar = step * pxPerNm;
  if (bar < 20 || bar > width - 40) return;

  const y = height - 16;
  el.appendChild(svg('path', {
    class: 'plot-scale', d: `M14 ${y - 5} V${y} H${14 + bar} V${y - 5}`,
  }));
  el.appendChild(svg('text', { class: 'plot-label', x: 14, y: y - 9 },
    `${step < 1 ? num(step, 1) : num(step, 0)} sm`));
}

// ------------------------------------------------------------- Verschieben

/** Ziehen mit einem Finger, Kneifen mit zweien. */
function attachDrag(box, z, center) {
  const pointers = new Map();
  let start = null;

  const latLonAt = (dx, dy) => ({
    lat: tileYToLat(latToTileY(center.lat, z) - dy / TILE, z),
    lon: tileXToLon(lonToTileX(center.lon, z) - dx / TILE, z),
  });

  box.onpointerdown = (e) => {
    box.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) start = { x: e.clientX, y: e.clientY };
    if (pointers.size === 2) start = { spread: spreadOf(pointers) };
  };

  box.onpointermove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && start && start.x !== undefined) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      state.center = latLonAt(dx, dy);
      state.zoom = z;
      start = { x: e.clientX, y: e.clientY };
      paint();
    }

    if (pointers.size === 2 && start?.spread) {
      const now = spreadOf(pointers);
      if (now / start.spread > 1.6) { start = { spread: now }; zoomBy(1); }
      else if (now / start.spread < 0.62) { start = { spread: now }; zoomBy(-1); }
    }
  };

  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) start = null;
  };
  box.onpointerup = end;
  box.onpointercancel = end;
}

function spreadOf(pointers) {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ------------------------------------------------------------------ Legende

function legend(marks, track) {
  const fix = gps.fix;
  const others = marks.filter((m) => m.kind !== 'own');
  if (others.length === 0 && !fix) return null;

  return h('div.card',
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
            state.center = { lat: mark.lat, lon: mark.lon };
            state.zoom = Math.max(state.zoom ?? 12, 12);
            paint();
            container?.querySelector('#chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          },
        }, t('map.show')),
      );
    }),
    track.length > 1 && h('p.small.muted', { style: { margin: '10px 0 0' } },
      t('map.trackHint', { v: track.length })),
  );
}

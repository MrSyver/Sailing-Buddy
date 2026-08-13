/**
 * Einstellungen, Reiter „Karten“ – Seegebiete ins Gerät holen.
 *
 * Zur Nutzung des Kachelservers, in aller Deutlichkeit: Der Server von
 * OpenStreetMap wird von Spenden getragen und ist nicht für Massenabrufe
 * gedacht. Deshalb ist die Menge je Bereich hart begrenzt, die Abrufe laufen
 * einzeln mit Pause, und die Adresse der Grundkarte lässt sich unten
 * austauschen – gegen einen eigenen Server oder einen Anbieter mit Konto.
 *
 * Ganze Seegebiete werden nur geladen, wenn jemand sie ausdrücklich
 * anfordert. Nichts davon läuft im Hintergrund, nichts erneuert sich von
 * selbst.
 *
 * Davon getrennt steht der Schalter „Fehlende Kacheln unterwegs nachholen“:
 * Der holt bei bestehender Verbindung den sichtbaren Ausschnitt nach, wenn er
 * nicht im Gerät ist – einen Bildschirm voll, nicht ein Seegebiet. Das ist
 * gewöhnliche Kartennutzung und nicht das, wogegen sich die
 * Nutzungsbedingungen richten.
 */

import { h, render, toast } from '../lib/dom.js';
import { settings, waypoints } from '../lib/storage.js';
import { gps } from '../lib/gps.js';
import { t, num, locale } from '../lib/i18n.js';
import { formatPosition } from '../lib/geo.js';
import {
  areaStore, tileStore, tilesForArea, downloadTiles, areaCovers,
  formatBytes, MAX_TILES_PER_AREA, BYTES_PER_TILE,
} from '../lib/tiles.js';
import {
  layers, ZOOM_PRESETS, REGION_ZOOM_PRESETS, RADIUS_OPTIONS, CORRIDOR_OPTIONS,
  DEFAULT_BASE_URL, DEFAULT_SEAMARK_URL, ATTRIBUTION,
} from '../data/tilesources.js';
import {
  SEA_REGIONS, REGION_GROUPS, regionArea, regionContains,
} from '../data/searegions.js';
import {
  CHART_PACKS, PACK_GROUPS, packUrl, DEFAULT_PACK_BASE, PACK_ATTRIBUTION,
} from '../data/chartpacks.js';
import {
  packsAvailable, listPacks, downloadPack, removePack, forgetOpen, storageEstimate,
} from '../lib/packs.js';

const state = {
  kind: 'region',        // 'region' | 'radius' | 'route'
  regionId: null,
  regionPreset: 1,       // Zeigerstelle in REGION_ZOOM_PRESETS
  radiusNm: RADIUS_OPTIONS[1],
  corridorNm: CORRIDOR_OPTIONS[1],
  preset: 1,             // Zeigerstelle in ZOOM_PRESETS
  route: [],             // [{ lat, lon, name }]
  areas: [],
  loaded: false,
  busy: null,            // { done, total, stored, bytes, name }
  abort: null,
  // Fertige Kartenpakete
  packs: [],
  space: null,
  packBusy: null,        // { id, name, done, total }
  packAbort: null,
};

const en = () => locale().startsWith('en');
const regionName = (r) => (en() ? r.nameEn : r.name);
const regionHint = (r) => (en() ? r.hintEn : r.hint);
const region = (id) => SEA_REGIONS.find((r) => r.id === id) ?? null;

let host = null;

/** Wird vom Einstellungsmodul in seinen Reiter gehängt. */
export function chartsTab() {
  host = h('div');
  refresh();
  return host;
}

async function refresh() {
  state.areas = await areaStore.list();
  state.packs = packsAvailable() ? await listPacks().catch(() => []) : [];
  state.space = await storageEstimate();
  state.loaded = true;
  paint();
}

function paint() {
  if (!host) return;
  render(host,
    packCard(),
    state.packBusy ? packProgressCard() : null,
    autoCard(),
    downloadCard(),
    state.busy ? progressCard() : null,
    areasCard(),
    sourceCard(),
    h('p.disclaimer', t('charts.disclaimer')),
  );
}

// ------------------------------------------------------- Fertige Kartenpakete

/**
 * Der Hauptweg: ein Paket je Seegebiet, als eine Datei.
 *
 * Das ist der Weg, den OpenSeaMap selbst dafür vorsieht – ein Download von
 * einem Dateispiegel statt zehntausender Einzelabrufe auf dem Kachelserver,
 * und dabei Zoomstufe 14 an der Küste statt 11.
 */
function packCard() {
  if (!packsAvailable()) {
    return h('div.card',
      h('h2', t('packs.title')),
      h('div.notice.warn', t('packs.unsupported')),
    );
  }

  const s = settings.all();
  const have = new Map(state.packs.map((p) => [p.id, p]));
  const online = navigator.onLine !== false;

  const row = (pack) => {
    const mine = have.get(pack.id);
    const busy = state.packBusy?.id === pack.id;
    return h('div.wp-item',
      h('div.grow',
        h('div.wp-name', mine?.complete ? `✓ ${packName(pack)}` : packName(pack)),
        h('div.small.muted', packHint(pack)),
        h('div.small.muted',
          mine
            ? t('packs.have', {
              size: formatBytes(mine.bytes),
              state: mine.complete ? t('packs.stateDone') : t('packs.statePart'),
            })
            : t('packs.about', { size: formatBytes(pack.bytes) })),
      ),
      !mine?.complete && h('button.btn.small', {
        type: 'button',
        disabled: Boolean(state.packBusy) || !online,
        onclick: () => startPack(pack),
      }, busy ? t('packs.running') : (mine ? t('packs.resume') : t('packs.get'))),
      mine && h('button.btn.small', {
        type: 'button',
        'aria-label': `${packName(pack)} – ${t('common.delete')}`,
        disabled: Boolean(state.packBusy),
        onclick: async () => {
          if (!confirm(t('packs.confirmDelete'))) return;
          forgetOpen(pack.id);
          await removePack(pack.id);
          toast(t('packs.deleted'));
          await refresh();
        },
      }, '✕'),
    );
  };

  // Pakete, die es im Katalog nicht gibt – etwa selbst eingetragene.
  const known = new Set(CHART_PACKS.map((p) => p.id));
  const strangers = state.packs.filter((p) => !known.has(p.id));

  return h('div.card',
    h('h2', t('packs.title')),
    h('p.small.muted', { style: { margin: '0 0 12px' } }, t('packs.intro')),

    state.space && h('p.small.muted', { style: { margin: '0 0 12px' } },
      t('packs.space', {
        free: formatBytes(state.space.free),
        used: formatBytes(state.space.usage),
      })),

    !online && h('div.notice.warn', { style: { 'margin-bottom': '10px' } }, t('charts.offline')),

    ...PACK_GROUPS.map((group) => {
      const items = CHART_PACKS.filter((p) => p.group === group.key);
      if (!items.length) return null;
      const anyHere = items.some((p) => have.has(p.id));
      return h('details.foldout.region-fold', { open: anyHere || group.key === 'nordost' },
        h('summary', en() ? group.labelEn : group.label),
        h('div', ...items.map(row)),
      );
    }).filter(Boolean),

    strangers.length > 0 && h('div', { style: { 'margin-top': '10px' } },
      h('h4', { style: { margin: '0 0 6px', 'font-size': '.74rem', 'text-transform': 'uppercase', color: 'var(--text-dim)' } },
        t('packs.own')),
      ...strangers.map((p) => h('div.wp-item',
        h('div.grow',
          h('div.wp-name', p.complete ? `✓ ${p.name}` : p.name),
          h('div.small.muted', t('packs.have', {
            size: formatBytes(p.bytes),
            state: p.complete ? t('packs.stateDone') : t('packs.statePart'),
          })),
        ),
        // Auch ein selbst eingetragener Download muss fortsetzbar sein –
        // gerade der, denn er wird genommen, wenn eine Adresse oben nicht
        // stimmt, und reißt genauso ab wie jeder andere.
        !p.complete && p.url && h('button.btn.small', {
          type: 'button',
          disabled: Boolean(state.packBusy) || !online,
          onclick: () => startPack({
            id: p.id, name: p.name, url: p.url, bytes: p.total,
          }),
        }, t('packs.resume')),
        h('button.btn.small', {
          type: 'button',
          disabled: Boolean(state.packBusy),
          onclick: async () => {
            if (!confirm(t('packs.confirmDelete'))) return;
            forgetOpen(p.id);
            await removePack(p.id);
            await refresh();
          },
        }, '✕'),
      )),
    ),

    // Eine eigene Adresse – die Rettung, falls oben etwas nicht stimmt.
    h('details.foldout', { style: { 'margin-top': '10px', 'margin-bottom': 0 } },
      h('summary', t('packs.ownTitle')),
      h('div',
        h('p.small.muted', { style: { 'margin-top': 0 } }, t('packs.ownHint')),
        ownPackForm(s),
      ),
    ),

    h('p.small.muted', { style: { margin: '12px 0 0' } }, PACK_ATTRIBUTION),
  );
}

/**
 * Nachholen unterwegs.
 *
 * Steht bewusst neben den Paketen und nicht darin: Es ist der Weg für alle,
 * die kein Paket geladen haben oder über dessen Rand hinausfahren.
 */
function autoCard() {
  const on = settings.get('autoTiles') !== false;
  return h('div.card',
    h('h2', t('charts.autoTiles')),
    h('div.seg',
      h('button', {
        type: 'button',
        'aria-pressed': String(on),
        onclick: () => { settings.set('autoTiles', true); paint(); },
      }, t('common.on')),
      h('button', {
        type: 'button',
        'aria-pressed': String(!on),
        onclick: () => { settings.set('autoTiles', false); paint(); },
      }, t('common.off')),
    ),
    h('p.small.muted', { style: { margin: '10px 0 0' } }, t('charts.autoTilesHint')),
  );
}

const packName = (p) => (en() ? p.nameEn : p.name);
const packHint = (p) => (en() ? p.hintEn : p.hint);

function ownPackForm(s) {
  let url = '';
  let name = '';
  return h('div',
    h('label.field',
      h('span', t('packs.ownUrl')),
      h('input.mono', {
        inputmode: 'url',
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: false,
        placeholder: `${DEFAULT_PACK_BASE}Baltic_Sea.mbtiles`,
        oninput: (e) => { url = e.target.value.trim(); },
      }),
    ),
    h('label.field',
      h('span', t('packs.ownName')),
      h('input', {
        placeholder: t('packs.ownNamePlaceholder'),
        oninput: (e) => { name = e.target.value.trim(); },
      }),
    ),
    h('button.btn.small', {
      type: 'button',
      onclick: () => {
        if (!url) { toast(t('packs.ownNeedsUrl')); return; }
        const id = `eigen-${Date.now().toString(36)}`;
        startPack({ id, name: name || t('packs.ownDefault'), url, bytes: null });
      },
    }, t('packs.get')),
    h('label.field', { style: { 'margin-top': '14px' } },
      h('span', t('packs.baseUrl')),
      h('input.mono', {
        value: s.packBaseUrl ?? '',
        inputmode: 'url',
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: false,
        placeholder: DEFAULT_PACK_BASE,
        onchange: (e) => { settings.set('packBaseUrl', e.target.value.trim()); paint(); },
      }),
      h('span.hint', t('packs.baseHint')),
    ),
  );
}

async function startPack(pack) {
  const controller = new AbortController();
  state.packAbort = controller;
  state.packBusy = {
    id: pack.id, name: pack.name ?? packName(pack), done: 0, total: pack.bytes ?? 0,
  };
  paint();

  try {
    await downloadPack({
      id: pack.id,
      name: pack.name ?? packName(pack),
      url: pack.url ?? packUrl(pack, settings.all()),
      expectedBytes: pack.bytes ?? null,
    }, {
      signal: controller.signal,
      onProgress: (p) => {
        state.packBusy = { ...state.packBusy, ...p };
        const bar = host?.querySelector('#pack-progress');
        if (bar) render(bar, ...packProgressContent());
      },
    });
    toast(t('packs.done'));
  } catch (err) {
    if (err.name === 'AbortError') toast(t('packs.stopped'));
    else toast(t('packs.failed', { v: err.message }));
  } finally {
    state.packBusy = null;
    state.packAbort = null;
    await refresh();
  }
}

function packProgressCard() {
  return h('div.card', h('div', { id: 'pack-progress' }, ...packProgressContent()));
}

function packProgressContent() {
  const b = state.packBusy;
  if (!b) return [];
  const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
  return [
    h('h2', { style: { margin: '0 0 8px' } }, t('packs.loading')),
    h('p.small.muted', { style: { margin: '0 0 10px' } }, b.name),
    h('div.progress', h('div.bar', { style: { width: `${pct}%` } })),
    h('p.small', { style: { margin: '8px 0 0' } },
      b.total
        ? t('packs.progress', { done: formatBytes(b.done), total: formatBytes(b.total), pct })
        : t('packs.progressUnknown', { done: formatBytes(b.done) })),
    h('p.small.muted', { style: { margin: '4px 0 0' } }, t('packs.resumeHint')),
    h('button.btn.small.block', {
      type: 'button',
      style: { 'margin-top': '10px' },
      onclick: () => { state.packAbort?.abort(); },
    }, t('charts.stop')),
  ];
}

// ------------------------------------------------------------- Neuer Bereich

function selection() {
  const preset = ZOOM_PRESETS[state.preset];
  const fix = gps.fix;
  if (state.kind === 'region') {
    const chosen = region(state.regionId);
    if (!chosen) return null;
    const rp = REGION_ZOOM_PRESETS[state.regionPreset];
    return { ...regionArea(chosen, rp.zMin, rp.zMax), regionId: chosen.id };
  }
  if (state.kind === 'route') {
    if (state.route.length === 0) return null;
    return {
      kind: 'route',
      points: state.route.map((p) => ({ lat: p.lat, lon: p.lon })),
      corridorNm: state.corridorNm,
      zMin: preset.zMin,
      zMax: preset.zMax,
    };
  }
  if (!fix) return null;
  return {
    kind: 'radius',
    center: { lat: fix.lat, lon: fix.lon },
    radiusNm: state.radiusNm,
    zMin: preset.zMin,
    zMax: preset.zMax,
  };
}

function downloadCard() {
  const area = selection();
  const tiles = area ? tilesForArea(area) : [];
  // Gezählt wird, was wirklich beim Server angefragt wird: jede Kachel einmal
  // je Ebene. Die Grenze gilt auf dieselbe Zahl – sonst schützt sie nichts.
  const count = tiles.length * layers(settings.all()).length;
  const tooMany = count > MAX_TILES_PER_AREA;
  const online = navigator.onLine !== false;

  return h('div.card',
    h('h2', t('charts.newArea')),

    h('div.seg', { style: { 'margin-bottom': '12px' } },
      h('button', {
        type: 'button',
        'aria-pressed': String(state.kind === 'region'),
        onclick: () => { state.kind = 'region'; paint(); },
      }, t('charts.kind.region')),
      h('button', {
        type: 'button',
        'aria-pressed': String(state.kind === 'radius'),
        onclick: () => { state.kind = 'radius'; paint(); },
      }, t('charts.kind.radius')),
      h('button', {
        type: 'button',
        'aria-pressed': String(state.kind === 'route'),
        onclick: () => { state.kind = 'route'; paint(); },
      }, t('charts.kind.route')),
    ),

    state.kind === 'region' ? regionPart()
      : state.kind === 'radius' ? radiusPart() : routePart(),

    // Zoomstufen
    detailPart(),

    // Vorschau der Menge – vor dem Herunterladen, nicht hinterher.
    h('div.readout', { style: { 'margin-bottom': '12px' } },
      h('div.cell',
        h('div.label', t('charts.tiles')),
        h('div.value.mid', area ? num(count, 0) : '–'),
      ),
      h('div.cell',
        h('div.label', t('charts.size')),
        h('div.value.mid', area ? `≈ ${formatBytes(count * BYTES_PER_TILE)}` : '–'),
      ),
    ),

    tooMany && h('div.notice.warn', { style: { 'margin-bottom': '10px' } },
      t('charts.tooMany', { max: num(MAX_TILES_PER_AREA, 0) })),

    !online && h('div.notice.warn', { style: { 'margin-bottom': '10px' } },
      t('charts.offline')),

    h('button.btn.primary.block', {
      type: 'button',
      disabled: !area || tooMany || Boolean(state.busy),
      style: { 'min-height': '54px' },
      onclick: () => start(area),
    }, t('charts.download')),

    !area && h('p.small.muted', { style: { margin: '9px 0 0' } },
      state.kind === 'region' ? t('charts.needRegion')
        : state.kind === 'route' ? t('charts.needRoute') : t('charts.needFix')),
  );
}

/** Die Stufen der Feinheit – für Reviere gröber als für einen Umkreis. */
function detailPart() {
  const forRegion = state.kind === 'region';
  const presets = forRegion ? REGION_ZOOM_PRESETS : ZOOM_PRESETS;
  const chosen = forRegion ? state.regionPreset : state.preset;
  const prefix = forRegion ? 'charts.rpreset' : 'charts.preset';
  const chosenRegion = forRegion ? region(state.regionId) : null;
  const perLayer = layers(settings.all()).length;

  return h('div.field', { style: { 'margin-bottom': '10px' } },
    h('span', t('charts.detail')),
    h('div.filter-chips', { role: 'group', 'aria-label': t('charts.detail') },
      ...presets.map((preset, i) => {
        // Bei einem gewählten Revier steht schon an der Schaltfläche, welche
        // Stufe überhaupt in einem Rutsch geht.
        const over = chosenRegion
          && tilesForArea(regionArea(chosenRegion, preset.zMin, preset.zMax)).length
            * perLayer > MAX_TILES_PER_AREA;
        return h('button.chip', {
          type: 'button',
          'aria-pressed': String(chosen === i),
          onclick: () => {
            if (forRegion) state.regionPreset = i; else state.preset = i;
            paint();
          },
        }, t(`${prefix}.${i}`), over && h('span.count', '!'));
      }),
    ),
    h('span.hint', forRegion ? t('charts.regionDetailHint') : t('charts.detailHint')),
  );
}

/** Fertige Reviere – zuerst die, in denen man gerade ist. */
function regionPart() {
  const fix = gps.fix;
  const here = fix ? SEA_REGIONS.filter((r) => regionContains(r, fix)) : [];
  const hereIds = new Set(here.map((r) => r.id));

  const row = (r, isHere) => h('button.region-row', {
    type: 'button',
    'data-region': r.id,
    'aria-pressed': String(state.regionId === r.id),
    onclick: () => { state.regionId = state.regionId === r.id ? null : r.id; paint(); },
  },
  h('span.name', isHere ? `◎ ${regionName(r)}` : regionName(r)),
  h('span.hint', regionHint(r)),
  );

  return h('div',
    h('p.small.muted', { style: { margin: '0 0 10px' } }, t('charts.regionHint')),

    here.length > 0 && h('div.region-group',
      h('h4', t('charts.regionHere')),
      ...here.map((r) => row(r, true)),
    ),

    ...REGION_GROUPS.map((group) => {
      const items = SEA_REGIONS.filter((r) => r.group === group.key && !hereIds.has(r.id));
      if (!items.length) return null;
      // Die Gruppe des gewählten Reviers bleibt offen, damit die Auswahl
      // sichtbar bleibt; die übrigen sind zugeklappt.
      const open = items.some((r) => r.id === state.regionId) || (here.length === 0 && !state.regionId && group.key === 'nordost');
      return h('details.foldout.region-fold', { open },
        h('summary', en() ? group.labelEn : group.label),
        h('div.region-group', ...items.map((r) => row(r, false))),
      );
    }).filter(Boolean),
  );
}

function radiusPart() {
  const fix = gps.fix;
  return h('div',
    h('div.field',
      h('span', t('charts.radius')),
      h('div.filter-chips', { role: 'group', 'aria-label': t('charts.radius') },
        ...RADIUS_OPTIONS.map((nm) => h('button.chip', {
          type: 'button',
          'aria-pressed': String(state.radiusNm === nm),
          onclick: () => { state.radiusNm = nm; paint(); },
        }, `${nm} sm`)),
      ),
      h('span.hint', fix
        ? t('charts.aroundHere', { v: formatPosition(fix, 2) })
        : t('charts.needFix')),
    ),
  );
}

function routePart() {
  const fix = gps.fix;
  const list = waypoints.list();

  return h('div',
    h('p.small.muted', { style: { margin: '0 0 10px' } }, t('charts.routeHint')),

    state.route.length > 0 && h('div', { style: { 'margin-bottom': '10px' } },
      ...state.route.map((point, i) => h('div.wp-item',
        h('div.grow',
          h('div.wp-name', `${i + 1}. ${point.name}`),
          h('div.wp-pos', formatPosition(point, 2)),
        ),
        h('button.btn.small', {
          type: 'button',
          'aria-label': t('charts.routeRemove'),
          onclick: () => { state.route.splice(i, 1); paint(); },
        }, '✕'),
      )),
    ),

    h('div.row.wrap', { style: { 'margin-bottom': '12px' } },
      fix && h('button.btn.small', {
        type: 'button',
        onclick: () => {
          state.route.push({ lat: fix.lat, lon: fix.lon, name: t('charts.routeHere') });
          paint();
        },
      }, t('charts.routeAddHere')),
      ...list.map((wp) => h('button.btn.small', {
        type: 'button',
        onclick: () => {
          state.route.push({ lat: wp.lat, lon: wp.lon, name: wp.name });
          paint();
        },
      }, `+ ${wp.name}`)),
      state.route.length > 0 && h('button.btn.small', {
        type: 'button',
        onclick: () => { state.route = []; paint(); },
      }, t('common.reset')),
    ),

    h('div.field',
      h('span', t('charts.corridor')),
      h('div.filter-chips', { role: 'group', 'aria-label': t('charts.corridor') },
        ...CORRIDOR_OPTIONS.map((nm) => h('button.chip', {
          type: 'button',
          'aria-pressed': String(state.corridorNm === nm),
          onclick: () => { state.corridorNm = nm; paint(); },
        }, `± ${nm} sm`)),
      ),
      h('span.hint', t('charts.corridorHint')),
    ),
  );
}

// ------------------------------------------------------------- Herunterladen

async function start(area, existing = null) {
  const tiles = tilesForArea(area);
  const controller = new AbortController();
  const name = existing?.name ?? defaultName(area);

  state.abort = controller;
  state.busy = { done: 0, total: tiles.length * layers(settings.all()).length, stored: 0, bytes: 0, name };
  paint();

  const result = await downloadTiles(tiles, layers(settings.all()), {
    signal: controller.signal,
    refresh: Boolean(existing),
    onProgress: (p) => {
      state.busy = { ...p, name };
      // Nur den Fortschrittsbalken auffrischen – nicht die ganze Seite.
      const bar = host?.querySelector('#chart-progress');
      if (bar) render(bar, ...progressContent());
    },
  });

  await areaStore.put({
    id: existing?.id ?? `ar${Date.now().toString(36)}`,
    name,
    ...area,
    tiles: tiles.length,
    bytes: (existing?.bytes ?? 0) + result.bytes,
    ts: existing?.ts ?? Date.now(),
    updated: Date.now(),
  });

  state.busy = null;
  state.abort = null;
  if (result.failed.length) {
    toast(t('charts.partly', { v: num(result.failed.length, 0) }));
  } else {
    toast(t('charts.done'));
  }
  await refresh();
}

function defaultName(area) {
  const when = new Date().toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
  if (area.kind === 'bounds') {
    const r = region(area.regionId);
    return r ? regionName(r) : t('charts.nameArea', { v: when });
  }
  if (area.kind === 'route') {
    return t('charts.nameRoute', { n: area.points.length, v: when });
  }
  return t('charts.nameRadius', { v: num(area.radiusNm, 0), d: when });
}

function progressCard() {
  return h('div.card', h('div', { id: 'chart-progress' }, ...progressContent()));
}

function progressContent() {
  const b = state.busy;
  if (!b) return [];
  const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
  return [
    h('h2', { style: { margin: '0 0 8px' } }, t('charts.loading')),
    h('p.small.muted', { style: { margin: '0 0 10px' } }, b.name),
    h('div.progress', h('div.bar', { style: { width: `${pct}%` } })),
    h('p.small', { style: { margin: '8px 0 0' } },
      t('charts.progress', { done: num(b.done, 0), total: num(b.total, 0), size: formatBytes(b.bytes) })),
    h('button.btn.small.block', {
      type: 'button',
      style: { 'margin-top': '10px' },
      onclick: () => { state.abort?.abort(); },
    }, t('charts.stop')),
  ];
}

// -------------------------------------------------------- Vorhandene Bereiche

function areasCard() {
  if (!state.loaded) return null;
  const fix = gps.fix;
  // Was hier unter dem Kiel liegt, steht oben.
  const sorted = [...state.areas].sort((a, b) => {
    const ka = fix && areaCovers(a, fix) ? 0 : 1;
    const kb = fix && areaCovers(b, fix) ? 0 : 1;
    return ka - kb || b.updated - a.updated;
  });

  return h('div.card',
    h('div.row', { style: { 'margin-bottom': '8px' } },
      h('h2.grow', { style: { margin: 0 } }, t('charts.stored')),
      state.areas.length > 0 && h('button.btn.small', {
        type: 'button',
        onclick: async () => {
          if (!confirm(t('charts.confirmClearAll'))) return;
          await tileStore.clear();
          await Promise.all(state.areas.map((a) => areaStore.remove(a.id)));
          toast(t('charts.clearedAll'));
          await refresh();
        },
      }, t('common.deleteAll')),
    ),

    sorted.length === 0
      ? h('div.empty', t('charts.none'))
      : h('div', ...sorted.map((area) => areaRow(area, fix && areaCovers(area, fix)))),
  );
}

function areaRow(area, here) {
  const preset = area.kind === 'bounds'
    ? t('charts.rowRegion')
    : area.kind === 'route'
      ? t('charts.rowRoute', { n: num((area.points ?? []).length, 0), v: num(area.corridorNm, 0) })
      : t('charts.rowRadius', { v: num(area.radiusNm, 0) });

  return h('div.wp-item',
    h('div.grow',
      h('div.wp-name', here ? `◎ ${area.name}` : area.name),
      h('div.wp-pos', preset, ' · z', String(area.zMin), '–', String(area.zMax)),
      h('div.small.muted',
        t('charts.rowMeta', {
          n: num(area.tiles, 0),
          size: formatBytes(area.bytes),
          when: new Date(area.updated).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: '2-digit' }),
        })),
      here && h('div.small', { style: { color: 'var(--ok)' } }, t('charts.rowHere')),
    ),
    h('button.btn.small', {
      type: 'button',
      disabled: Boolean(state.busy),
      title: t('charts.update'),
      onclick: () => start({
        kind: area.kind,
        center: area.center,
        radiusNm: area.radiusNm,
        points: area.points,
        corridorNm: area.corridorNm,
        bounds: area.bounds,
        regionId: area.regionId,
        zMin: area.zMin,
        zMax: area.zMax,
      }, area),
    }, t('charts.update')),
    h('button.btn.small', {
      type: 'button',
      'aria-label': `${area.name} – ${t('common.delete')}`,
      onclick: async () => {
        if (!confirm(t('charts.confirmDelete'))) return;
        // Die Kacheln selbst bleiben liegen: Bereiche überlappen sich, und
        // was ein anderer Bereich noch braucht, darf nicht mitgelöscht werden.
        await areaStore.remove(area.id);
        toast(t('charts.deleted'));
        await refresh();
      },
    }, '✕'),
  );
}

// ------------------------------------------------------------- Kachelquelle

function sourceCard() {
  const s = settings.all();
  const field = (key, label, hint, placeholder) => h('label.field',
    h('span', label),
    h('input.mono', {
      value: s[key] ?? '',
      inputmode: 'url',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: false,
      placeholder,
      onchange: (e) => { settings.set(key, e.target.value.trim()); paint(); },
    }),
    h('span.hint', hint),
  );

  return h('details.foldout',
    h('summary', t('charts.source')),
    h('div',
      h('div.notice', t('charts.sourceNotice')),
      field('tileBaseUrl', t('charts.baseUrl'), t('charts.baseHint'), DEFAULT_BASE_URL),
      field('tileSeamarkUrl', t('charts.seamarkUrl'), t('charts.seamarkHint'), DEFAULT_SEAMARK_URL),
      h('button.btn.small', {
        type: 'button',
        onclick: () => {
          settings.update({ tileBaseUrl: '', tileSeamarkUrl: '' });
          paint();
        },
      }, t('charts.sourceReset')),
      h('p.small.muted', { style: { margin: '12px 0 0' } }, ATTRIBUTION),
    ),
  );
}

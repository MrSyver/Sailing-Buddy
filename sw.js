/**
 * Service Worker – macht die App dauerhaft offline lauffähig.
 *
 * Grundsatz: Die App startet **immer** aus dem Cache, niemals aus dem Netz.
 * Es gibt keinen Ablauf, keine Gültigkeitsdauer und keinen Netzversuch beim
 * Start. Ist eine Verbindung da, wird im Hintergrund aufgefrischt; ist keine
 * da, merkt die App das gar nicht.
 *
 * Die Installation ist bewusst „ganz oder gar nicht“: Schlägt auch nur eine
 * Datei fehl, gilt die Installation als gescheitert und der bisherige Stand
 * bleibt erhalten. Ein halb gefüllter Cache wäre schlimmer als keiner – er
 * fällt erst auf See auf.
 *
 * Alle Pfade sind relativ, damit die App auch in einem Unterverzeichnis
 * funktioniert (etwa unter …github.io/Sailing-Buddy/).
 */

const VERSION = 'v34';
const CACHE = `sailing-buddy-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/lib/dom.js',
  './js/lib/geo.js',
  './js/lib/gps.js',
  './js/lib/audio.js',
  './js/lib/chartview.js',
  './js/lib/i18n.js',
  './js/lib/logbook.js',
  './js/lib/mbtiles.js',
  './js/lib/modules.js',
  './js/lib/knotdraw.js',
  './js/lib/offline.js',
  './js/lib/packs.js',
  './js/lib/pdf.js',
  './js/lib/miles.js',
  './js/lib/recorder.js',
  './js/lib/share.js',
  './js/lib/sqlite.js',
  './js/lib/sun.js',
  './js/lib/storage.js',
  './js/lib/tiles.js',
  './js/lib/theme.js',
  './js/views/radio.js',
  './js/views/position.js',
  './js/views/night.js',
  './js/views/map.js',
  './js/views/logbook.js',
  './js/views/knots.js',
  './js/views/rules.js',
  './js/views/more.js',
  './js/views/settings.js',
  './js/views/charts.js',
  './js/views/setup.js',
  './js/data/phrases.js',
  './js/data/lights.js',
  './js/data/sounds.js',
  './js/data/buoys.js',
  './js/data/tilesources.js',
  './js/data/searegions.js',
  './js/data/chartpacks.js',
  './js/data/dayshapes.js',
  './js/data/knots.js',
  './js/data/watersigns.js',
  './js/data/milesfields.js',
  './js/data/knotpaths.js',
  './js/data/searules.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

/** Holt alle Dateien frisch vom Server und legt sie ab. Wirft bei Lücken. */
async function precache() {
  const cache = await caches.open(CACHE);
  const failed = [];

  await Promise.all(ASSETS.map(async (url) => {
    try {
      // cache: 'reload' umgeht den HTTP-Cache des Browsers, damit wirklich
      // die aktuelle Fassung abgelegt wird und keine alte aus dem Speicher.
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok) throw new Error(String(response.status));
      await cache.put(url, response);
    } catch (err) {
      failed.push(`${url} (${err.message})`);
    }
  }));

  if (failed.length) {
    throw new Error(`Nicht ablegbar: ${failed.join(', ')}`);
  }
}

/** Welche Dateien fehlen im Cache? Leeres Feld bedeutet: vollständig offline. */
async function missingAssets() {
  const cache = await caches.open(CACHE);
  const missing = [];
  for (const url of ASSETS) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await cache.match(url, { ignoreSearch: true }))) missing.push(url);
  }
  return missing;
}

self.addEventListener('install', (event) => {
  // Kein skipWaiting: Eine neue Fassung übernimmt erst, wenn sie vollständig
  // abgelegt ist. Bis dahin läuft die alte unverändert weiter.
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('sailing-buddy-') && k !== CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Seitenaufruf: immer sofort aus dem Cache. Kein Netzversuch, keine
  // Wartezeit, kein Unterschied zwischen Hafen und offener See.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('./index.html', { ignoreSearch: true });
      if (cached) {
        // Im Hintergrund auffrischen, ohne den Start aufzuhalten.
        event.waitUntil(refreshInBackground('./index.html'));
        return cached;
      }
      try {
        return await fetch(request);
      } catch {
        return new Response(
          '<!DOCTYPE html><meta charset="utf-8"><h1>Offline</h1>'
          + '<p>Diese Seite wurde noch nicht gespeichert. Einmal mit Verbindung öffnen.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }
    })());
    return;
  }

  // Alles Übrige ebenso: erst Cache, Auffrischen läuft nebenher.
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) {
      event.waitUntil(refreshInBackground(request));
      return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

/** Stilles Auffrischen. Ohne Verbindung passiert schlicht nichts. */
async function refreshInBackground(request) {
  try {
    const response = await fetch(request);
    if (!response.ok) return;
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  } catch {
    // Offline ist der Normalfall, kein Fehler.
  }
}

/**
 * Auskunft an die App: Ist alles abgelegt? Notfalls nachladen.
 * Antwort geht über den mitgeschickten Kanal zurück.
 */
self.addEventListener('message', (event) => {
  const type = event.data?.type;
  const reply = (payload) => event.ports?.[0]?.postMessage(payload);

  if (type === 'CHECK') {
    event.waitUntil((async () => {
      const missing = await missingAssets();
      reply({ version: VERSION, total: ASSETS.length, missing });
    })());
  }

  if (type === 'PRECACHE') {
    event.waitUntil((async () => {
      try {
        await precache();
        reply({ ok: true, version: VERSION, total: ASSETS.length, missing: [] });
      } catch (err) {
        reply({ ok: false, error: err.message, missing: await missingAssets() });
      }
    })());
  }

  if (type === 'ACTIVATE_UPDATE') self.skipWaiting();
});

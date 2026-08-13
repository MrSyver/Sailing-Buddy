/**
 * Service Worker – macht die App offline lauffähig.
 *
 * Strategie: alles beim ersten Aufruf in den Cache legen und danach zuerst
 * aus dem Cache bedienen. An Bord zählt Verlässlichkeit, nicht Aktualität –
 * eine neue Fassung wird im Hintergrund geholt und beim nächsten Start aktiv.
 *
 * Alle Pfade sind relativ, damit die App auch in einem Unterverzeichnis
 * funktioniert (etwa unter …github.io/Sailing-Buddy/).
 */

const VERSION = 'v1';
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
  './js/lib/i18n.js',
  './js/lib/storage.js',
  './js/lib/theme.js',
  './js/views/radio.js',
  './js/views/position.js',
  './js/views/night.js',
  './js/views/settings.js',
  './js/views/setup.js',
  './js/data/phrases.js',
  './js/data/lights.js',
  './js/data/sounds.js',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Einzeln hinzufügen: Eine fehlende Datei soll nicht die ganze
    // Installation scheitern lassen.
    await Promise.all(ASSETS.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
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

  // Seitenaufrufe: erst Netz versuchen, sonst die gespeicherte Startseite.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match('./index.html', { ignoreSearch: true });
        return cached ?? new Response(
          '<h1>Offline</h1><p>Diese Seite wurde noch nicht gespeichert.</p>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }
    })());
    return;
  }

  // Alles Übrige: zuerst aus dem Cache, im Hintergrund auffrischen.
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    const network = fetch(request).then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(request, response.clone());
      }
      return response;
    }).catch(() => null);

    return cached ?? (await network) ?? new Response('', { status: 504 });
  })());
});

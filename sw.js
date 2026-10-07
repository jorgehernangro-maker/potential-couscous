// Mis Finanzas — service worker: la app funciona sin conexión.
// Al publicar una versión nueva, sube el número de VERSION para que los móviles la descarguen.
const VERSION = 'mf-v1.8.1';
const FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png',
  './montserrat-latin-400-normal.woff2',
  './montserrat-latin-500-normal.woff2',
  './montserrat-latin-600-normal.woff2',
  './montserrat-latin-700-normal.woff2'
];

self.addEventListener('install', (event) => {
  // cache: 'reload' obliga a descargar los archivos del servidor y no reutilizar copias viejas del navegador
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()) // la versión nueva entra sola; la app se recarga y los datos no se tocan
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : undefined);
    })
  );
});

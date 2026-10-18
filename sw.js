// Service worker: deja la app disponible sin internet.
// Sube VERSION cada vez que cambies archivos para que los teléfonos se actualicen.
const VERSION = 'gp-v13';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icons/icon-v2.svg',
  'icons/icon-v2-192.png',
  'icons/icon-v2-512.png',
  'icons/apple-touch-icon-v2.png',
  'icons/icon-v2-maskable-512.png',
  'js/app.js',
  'js/store.js',
  'js/util.js',
  'js/foods.js',
  'js/calc.js',
  'js/charts.js',
  'js/foodpicker.js',
  'js/backup.js',
  'js/modules.js',
  'js/theme.js',
  'js/views/today.js',
  'js/views/diet.js',
  'js/views/progress.js',
  'js/views/finance.js',
  'js/views/savings.js',
  'js/views/settings.js',
  'js/views/exercise.js',
  'js/views/habits.js',
  'js/views/shopping.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' evita copiar archivos viejos desde la caché HTTP del navegador.
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: responde rápido desde caché y actualiza en segundo plano.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

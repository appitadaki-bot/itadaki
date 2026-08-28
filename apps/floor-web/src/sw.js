/**
 * Keeps the floor screen openable without signal.
 *
 * A waiter's phone loses signal walking between the bar and the back tables,
 * and a reload during a dead spot would otherwise leave them with nothing.
 * Caching the shell means the screen opens, shows its last state and keeps
 * queueing taps in the outbox until the connection returns.
 *
 * Only the shell is cached. API reads pass through, so the screen is never
 * quietly wrong about what is ready; API writes belong to the outbox.
 */
const SHELL = 'itadaki-floor-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(['/', '/index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Sólo lo nuestro.
  //
  // El service worker vuelve a pedir con `fetch()` todo lo que intercepta, y
  // eso cambia con qué regla de la CSP se mide: una fuente de Google entra por
  // `font-src`, que la permite, pero al re-pedirla desde acá pasa a `connect-src`,
  // que no. El navegador la bloquea y la pantalla queda sin tipografía —o sin
  // cargar, si algo la espera.
  //
  // Cachear lo de otros dominios tampoco era el objetivo: lo que este worker
  // tiene que sostener sin señal es la aplicación, y eso sale todo de acá.
  if (url.origin !== self.location.origin) return;

  // Never get between the dev server and the browser: it recompiles chunks
  // under new hashes, and a cached index.html would point at files that no
  // longer exist — a blank screen that survives a reload.
  if (url.hostname === 'localhost' && url.port === '4500') return;

  // The board must show what the server says, or nothing at all.
  if (url.pathname.startsWith('/api/')) return;

  // Network-first: a stale index.html would point at chunks a new deploy has
  // already replaced. The cache is the offline fallback, not the default.
  event.respondWith(
    caches.open(SHELL).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch (error) {
        const hit = await cache.match(request);
        if (hit) return hit;
        throw error;
      }
    }),
  );
});

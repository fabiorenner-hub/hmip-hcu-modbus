// Minimal service worker: network-first for everything, with a tiny offline
// fallback to the app shell. Avoids caching /api responses so data stays fresh.
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open('mb-shell').then((c) => c.addAll([SHELL, '/styles.css', '/app.js'])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return; // let the network handle live data
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        if (event.request.method === 'GET') caches.open('mb-shell').then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((m) => m || caches.match(SHELL))),
  );
});

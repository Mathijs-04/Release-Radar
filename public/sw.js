// Release Radar service worker: makes the app load offline.
// Your data lives in IndexedDB and is never touched by this file.
const CACHE = 'release-radar-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html', './favicon.svg', './manifest.webmanifest'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** After a deploy, drop build files the new index.html no longer references. */
async function pruneAssets(cache, indexResponse) {
  const html = await indexResponse.text();
  const current = new Set([...html.matchAll(/assets\/[\w.-]+/g)].map((m) => m[0]));
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    const match = path.match(/assets\/[\w.-]+$/);
    if (match && !current.has(match[0])) await cache.delete(req);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  // Pages: network first, so a new deploy shows up right away; cache as fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy.clone()).then(() => pruneAssets(c, copy)));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Hashed build assets, icons and fonts never change: cache first.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});

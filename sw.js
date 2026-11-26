// ══════════════════════════════════════════════════════════════════
//  SERVICE WORKER — London Labour Pool
//  Keeps the latest copy of the app so it still opens with no signal
// ══════════════════════════════════════════════════════════════════

const CACHE_PREFIX = 'llp-app-';
const CACHE_NAME = CACHE_PREFIX + 'v3';
const OLD_OWN_CACHES = ['jobsystem-v2', 'jobsystem-v1'];
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(PRECACHE_URLS.map(u =>
        fetch(new Request(u, { cache: 'reload' })).then(r => r.ok ? cache.put(u, r) : null).catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

// Only this app's own old caches are removed, never another app's on the same site
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => (k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME) || OLD_OWN_CACHES.indexOf(k) > -1)
        .map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The page itself: always try the network first (skipping the browser's own cache),
  // keep that copy as the one offline copy, and fall back to it with no signal
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(INDEX_URL, copy));
          }
          return res;
        })
        .catch(() => caches.open(CACHE_NAME).then(c => c.match(INDEX_URL)).then(hit => hit || Response.error()))
    );
    return;
  }

  // Icons and the manifest: the saved copy straight away, refreshed in the background
  event.respondWith(
    caches.open(CACHE_NAME).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }))
  );
});

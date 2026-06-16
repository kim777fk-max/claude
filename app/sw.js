// Service worker: installable PWA + reliable updates.
// App assets use NETWORK-FIRST so the newest code reaches the device when online
// (cache-first previously could serve stale app.js). Falls back to cache offline.
const CACHE = 'video-uploader-v6';
const SHELL = [
  './',
  './index.html',
  './style.css?v=6',
  './app.js?v=6',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('api.cloudinary.com')) return; // never cache uploads
  if (url.origin !== self.location.origin) return;          // let cross-origin pass through

  // Network-first for our own assets; update cache; fall back to cache offline.
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});

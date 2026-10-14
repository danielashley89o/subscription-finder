/* Subscription Finder: keeps a copy of the app so it opens offline and installs to a home screen.
   It only ever fetches the app's own files. */
const VERSION = 'dev'; // build.sh stamps a new version on every build, which makes browsers update
const CACHE = 'subfinder-' + VERSION;
const FILES = [
  './',
  'styles.css',
  'config.js',
  'licence.js',
  'detector.js',
  'sample.js',
  'app.js',
  'theme.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('subfinder-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first, so updates show straight away; the saved copy when offline
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((hit) => hit || (request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});

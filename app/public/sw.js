const CACHE_NAME = 'flujo-de-caja-v7';
const PRECACHE_ASSETS = [
  '/cash-flow/',
  '/cash-flow/index.html',
  '/cash-flow/mobile.html',
  '/cash-flow/manifest.json'
];

// Install: precache key shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First falling back to Cache for local assets
self.addEventListener('fetch', (event) => {
  // Only handle GET requests and local/same-origin assets
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Do not intercept Supabase API requests or external OAuth
  if (!isSameOrigin || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Check if the response is valid and safe to cache
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline), try local cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If HTML request fails and not cached, return index shell
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/cash-flow/');
          }
        });
      })
  );
});

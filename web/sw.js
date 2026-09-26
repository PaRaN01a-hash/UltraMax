const CACHE = 'ultramax-v6-play-v2';
const OFFLINE = [
  '/app.html',
  '/setup.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/pwa-manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.map(async client => {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && clientUrl.pathname === '/app.html' && 'navigate' in client) {
          await client.navigate(client.url);
        }
      } catch (_) {
        // A failed refresh must never block service-worker activation.
      }
    }));
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isPage = event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';

  if (isPage) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response && response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(url.pathname === '/' ? '/app.html' : url.pathname, clone));
          }
          return response;
        })
        .catch(() => caches.match(url.pathname === '/' ? '/app.html' : url.pathname))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

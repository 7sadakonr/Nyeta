// Bump this whenever a URL in PRECACHE changes so installed clients receive the new shell.
const CACHE_VERSION = 'nyeta-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const NAVIGATION_CACHE = `${CACHE_VERSION}-navigation`;
const PRECACHE = ['/', '/offline.html', '/icons/nyeta-192.png', '/icons/nyeta-512.png', '/icons/nyeta-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('nyeta-') && !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

const isNetworkOnly = (request, url) => request.method !== 'GET'
  || url.origin !== self.location.origin
  || url.pathname.startsWith('/api/')
  || request.headers.has('RSC')
  || request.headers.has('Next-Router-State-Tree')
  || request.headers.get('accept')?.includes('text/x-component');

const isStaticAsset = (request, url) => url.pathname.startsWith('/_next/static/')
  || url.pathname.startsWith('/icons/')
  || ['script', 'style', 'font', 'image'].includes(request.destination);

const putIfOk = async (cacheName, request, response) => {
  if (response?.ok && response.type === 'basic') (await caches.open(cacheName)).put(request, response.clone());
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (isNetworkOnly(request, url)) {
    event.respondWith(fetch(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => putIfOk(NAVIGATION_CACHE, request, response)).catch(async () => (await caches.match(request)) || (await caches.match('/')) || (await caches.match('/offline.html'))));
    return;
  }
  if (isStaticAsset(request, url)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => putIfOk(STATIC_CACHE, request, response))));
  }
});

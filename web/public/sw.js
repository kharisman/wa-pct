const CACHE = 'wa-crm-shell-v2';

self.addEventListener('install', (e) => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// ponytail: HTML/navigasi selalu network-first (biar gak nyangkut ke index.html lama
// yang nunjuk ke file JS/CSS ber-hash yang udah gak ada). Asset ber-hash (/assets/*)
// cache-first karena immutable per build.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/media')) return;

  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }))
    );
  }
});

self.addEventListener('push', (e) => {
  const data = e.data?.json() || {};
  e.waitUntil(self.registration.showNotification(data.title || 'WA CRM', {
    body: data.body || '',
    icon: '/icon.svg',
    tag: data.wa_id || 'wa-crm',
    data: { wa_id: data.wa_id },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) => {
    const url = '/?wa_id=' + (e.notification.data?.wa_id || '');
    const existing = clients.find((c) => 'focus' in c);
    if (existing) { existing.navigate(url); return existing.focus(); }
    return self.clients.openWindow(url);
  }));
});

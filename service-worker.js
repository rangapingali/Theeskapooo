self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  event.respondWith(fetch(event.request));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const page = event.notification.data?.page === 'operator.html' ? 'operator.html' : 'dashboard.html';
  const url = new URL(page, self.registration.scope).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find(client => new URL(client.url).pathname === new URL(url).pathname);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  })());
});

/* EventStaff NG service worker: offline app shell, asset caching, and Web Push.
   Paths are relative to the registration scope so the app works both at "/"
   and under a sub-path such as GitHub Pages' "/EventStaffNG/". */
const VERSION = 'v2'
const SHELL = `shell-${VERSION}`
const ASSETS = `assets-${VERSION}`
const BASE = new URL(self.registration.scope).pathname // e.g. "/" or "/EventStaffNG/"
const OFFLINE_URLS = ['', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png'].map((path) => BASE + path)

// App routes (e.g. "/worker/jobs/123" from a notification) → full URL inside the scope.
const appUrl = (path = '/') => new URL(BASE + String(path).replace(/^\//, ''), self.location.origin).href

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(OFFLINE_URLS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL, ASSETS].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return // Supabase, fonts, other sites.

  // Pages: network first so deploys show up immediately; fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL).then((cache) => cache.put(BASE, copy))
          }
          return response
        })
        .catch(() => caches.match(BASE)),
    )
    return
  }

  // Hashed build assets never change: cache first.
  if (url.pathname.startsWith(`${BASE}assets/`) || url.pathname.startsWith(`${BASE}icons/`)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(ASSETS).then((cache) => cache.put(request, copy))
        }
        return response
      })),
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'EventStaff NG', body: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'EventStaff NG', {
    body: data.body || '',
    icon: `${BASE}icons/icon-192.png`,
    badge: `${BASE}icons/icon-192.png`,
    tag: data.tag,
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = appUrl(event.notification.data?.url)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).pathname.startsWith(BASE))
      if (open) return open.focus().then((client) => client.navigate(target))
      return self.clients.openWindow(target)
    }),
  )
})

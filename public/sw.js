/*
 * Hapag service worker. Keeps it simple on purpose:
 *  • never caches orders, menus, prices or logins (those must always be live)
 *  • caches the app icons and the offline page
 *  • if a page can't load because the internet is down, shows the offline page
 *    instead of the browser's error screen
 */
const CACHE = 'hapag-shell-v1'
const SHELL = ['/offline.html', '/icons/icon-192.png', '/brand/hapag-mark-mango.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  // Page loads: always from the network; the offline page only when that fails
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')))
    return
  }

  // Our own icons: cache first
  const url = new URL(req.url)
  if (url.origin === self.location.origin && SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)))
  }
  // Everything else (Next.js files, Firebase, APIs) goes straight to the network
})

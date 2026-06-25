/* QRHub landing Service Worker — intentionally minimal.
 *
 * Why this SW exists at all:
 *   Samsung Internet (the default browser on Samsung devices) refuses to
 *   generate a "modern" WebAPK install for a site that does NOT register a
 *   Service Worker. Without an SW it falls back to the legacy shortcut
 *   install path, which produces an APK signed with an old targetSdk that
 *   Play Protect on Android 14+ Samsung devices blocks with the
 *   "App non sicura · versione precedente di Android" banner.
 *
 *   Registering even an almost-empty SW is enough to flip the installer to
 *   the modern WebAPK template. That's the only reason this file is here.
 *
 * What it does:
 *   - Cache-first for navigations, with a network-first refresh in the
 *     background so a returning user sees something instantly even on a
 *     flaky train Wi-Fi. NO complex offline logic — the landing is mostly
 *     a contact card + analytics tracking, both require network for any
 *     value, so we don't try to be smart here.
 *   - Skip caching for /api/* (analytics + manifest) and for cloudinary
 *     CDN URLs — those are versioned and have their own cache headers.
 */

const CACHE_VERSION = 'qrhub-v1';
const SHELL_URLS = ['/'];

self.addEventListener('install', (event) => {
  // Pre-cache only the root document so the SW is "useful" from the very
  // first activation, which some installers also check for.
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never cache the dynamic backend: analytics POSTs, manifest, splashes,
  // icons all change with the org config and have their own cache headers.
  if (url.pathname.startsWith('/api/')) return;
  // Cloudinary URLs are versioned (v1779xxx) → already immutable. Let the
  // browser handle them normally.
  if (url.hostname.endsWith('cloudinary.com')) return;

  // Stale-while-revalidate for everything else (HTML, JS, CSS, fonts).
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const fetchPromise = fetch(req)
        .then((resp) => {
          if (resp && resp.ok && resp.type === 'basic') {
            cache.put(req, resp.clone()).catch(() => {});
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ── Web Push handler ──────────────────────────────────────────────────────
// Receives push payloads from `pywebpush` and displays a native notification.
// Payload shape (see backend `broadcast_push`):
//   { title: string, body: string, url: string, icon?: string }
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); }
  catch { payload = { title: 'QRHub', body: event.data.text(), url: '/' }; }
  const title = payload.title || 'QRHub';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: payload.url || '/' },
    // Group repeated pushes under one tag so the user doesn't see a stack.
    tag: 'qrhub-push',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    // Focus an existing tab on the same origin if we already have one open
    // — avoids spawning duplicate windows when the user taps a push twice.
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of allClients) {
      if (c.url.includes(self.location.origin) && 'focus' in c) {
        c.navigate(targetUrl).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});

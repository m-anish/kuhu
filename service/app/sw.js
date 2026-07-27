// kuhu service worker.
//
// Pushes arrive without a payload — the server only tickles us. We then ask
// what's new for this subscription and show exactly one notification. The
// upside of doing it this way: notice text is never encrypted-at-rest inside
// a third-party push service, and the payload cannot go stale between send
// and delivery.

const CACHE = 'kuhu-shell-v2';
// Canonical paths only — the asset server redirects /index.html and /post.html
// to these, and a cached redirect is worse than no cache at all.
const SHELL = ['/', '/post', '/join', '/app.css', '/i18n.js', '/subscribe.js', '/post.js', '/join.js', '/icon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Three strategies, because the three kinds of request want different things.
//
// A plain cache-first shell was a trap: with a fixed cache name, a deployed
// phone would serve its cached JS forever and never see a fix. Everything below
// self-heals instead — the worst case is that an update lands one load late.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: network-first. A stale notice is worse than no notice.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response('{"offline":true}', {
      status: 503, headers: { 'content-type': 'application/json' },
    })));
    return;
  }

  // Pages: network-first, falling back to cache so the app still opens on a
  // dead connection.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(request, { ignoreSearch: true }))
          || (await caches.match('/'))
          || Response.error();
      }
    })());
    return;
  }

  // Assets: stale-while-revalidate. Instant from cache, refreshed behind it.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request, { ignoreSearch: true });
    const network = fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await network) || Response.error();
  })());
});

const IST = 'Asia/Kolkata';

function formatWindow(fromIso, toIso, lang) {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: IST });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST });
  const word = lang === 'hi' ? 'से' : 'to';
  return `${day.format(from)}, ${time.format(from)} ${word} ${time.format(to)}`;
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) return;

    let data = null;
    try {
      const res = await fetch('/api/subscriptions/pending', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      if (res.ok) data = await res.json();
    } catch {
      // Offline at the moment of the push — fall through to the quiet default.
    }

    const lang = data?.lang === 'hi' ? 'hi' : 'en';
    const n = data?.notices?.[0];

    if (!n) {
      await self.registration.showNotification('kuhu', {
        body: lang === 'hi' ? 'आपके इलाके के लिए एक सूचना है।' : 'There is a notice for your area.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'kuhu-generic',
      });
      return;
    }

    const region = lang === 'hi' ? n.region.name_hi : n.region.name_en;
    const why = (lang === 'hi' ? n.reason.hi : n.reason.en) || n.reason.en || n.reason.hi || '';
    const heading = n.status === 'cancelled'
      ? (lang === 'hi' ? `${region} — सूचना रद्द` : `${region} — notice cancelled`)
      : (lang === 'hi' ? `${region} — बिजली कटौती` : `${region} — power cut`);
    const body = [formatWindow(n.from, n.to, lang), why].filter(Boolean).join(' · ');

    await self.registration.showNotification(heading, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `kuhu-${n.id}`,          // one notice, one notification, never a pile
      renotify: false,
      data: { url: '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (open) return open.focus();
    return self.clients.openWindow('/');
  })());
});

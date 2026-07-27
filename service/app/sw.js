// kuhu service worker.
//
// Pushes arrive without a payload — the server only tickles us. We then ask
// what's new for this subscription and show exactly one notification. The
// upside of doing it this way: notice text is never encrypted-at-rest inside
// a third-party push service, and the payload cannot go stale between send
// and delivery.

const CACHE = 'kuhu-shell-v1';
// Canonical paths only — the asset server redirects /index.html and /post.html
// to these, and a cached redirect is worse than no cache at all.
const SHELL = ['/', '/post', '/app.css', '/i18n.js', '/subscribe.js', '/post.js', '/icon.svg', '/icon-192.png'];

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

// Network-first for the API, cache-first for the shell. The shell should open
// on a dead connection; the notices should never be stale when there is one.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response('{"offline":true}', {
      status: 503, headers: { 'content-type': 'application/json' },
    })));
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request)),
  );
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

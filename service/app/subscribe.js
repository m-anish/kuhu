// The listening face. Pick what you want warned about, allow one quiet
// notification, see what's coming.
//
// kuhu carries several services. When only one is switched on — which is the
// case today — the service layer is hidden entirely and this looks exactly
// like a list of areas. Complexity appears only when it has earned its place.

import { STRINGS, pickLang, setLang, fmtWindow, initTheme, initVersion } from '/i18n.js';

let lang = pickLang();
let services = [];
/** Chosen topics as "service/area" strings — one flat set, easy to store. */
let chosen = new Set(loadChosen());

const $ = (sel) => document.querySelector(sel);
const flash = $('#flash');
const t = (key) => STRINGS[lang][key];
const key = (svc, area) => `${svc}/${area}`;

/** Read saved topics, migrating the pre-services shape (bare area slugs). */
function loadChosen() {
  const topics = JSON.parse(localStorage.getItem('kuhu.topics') || 'null');
  if (Array.isArray(topics)) return topics.map((x) => key(x.service, x.area));
  const legacy = JSON.parse(localStorage.getItem('kuhu.regions') || '[]');
  return legacy.map((slug) => key('electricity', slug));   // everything was electricity
}

function saveChosen() {
  const topics = [...chosen].map((k) => {
    const [service, area] = k.split('/');
    return { service, area };
  });
  localStorage.setItem('kuhu.topics', JSON.stringify(topics));
  localStorage.removeItem('kuhu.regions');
}

function name(o) { return lang === 'hi' ? o.name_hi : o.name_en; }

function paintStrings() {
  setLang(lang);
  for (const el of document.querySelectorAll('[data-s]')) {
    if (el.dataset.s === 'notify_me') continue;      // paintNotifyButton owns it
    el.textContent = t(el.dataset.s);
  }
  for (const b of document.querySelectorAll('.lang button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  }
}

function say(msg, kind = 'ok') {
  flash.textContent = msg;
  flash.className = `flash ${kind}`;
}

// ---------- what you can pick ----------

async function loadServices() {
  const res = await fetch('/api/services');
  services = (await res.json()).services || [];
  paintPicker();
  paintUpcoming();
  paintApiExample();
}

/**
 * One service: a plain list of areas, no mention of services anywhere.
 * Several: a labelled block per service. Same markup either way, so nothing
 * has to be re-learned when a second service arrives.
 */
function paintPicker() {
  const box = $('#regions');
  box.textContent = '';
  const single = services.length === 1;

  for (const svc of services) {
    if (!single) {
      const head = document.createElement('div');
      head.className = 'svc-head';
      head.innerHTML = `<span class="svc-icon" aria-hidden="true"></span><span class="svc-name"></span>`;
      head.querySelector('.svc-icon').textContent = svc.icon || '';
      head.querySelector('.svc-name').textContent = name(svc);
      head.style.setProperty('--svc-accent', svc.accent || 'var(--sage)');
      box.append(head);
    }
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const area of svc.regions) {
      const k = key(svc.slug, area.slug);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = name(area);
      b.setAttribute('aria-pressed', String(chosen.has(k)));
      if (!single) b.setAttribute('aria-label', `${name(area)} — ${name(svc)}`);
      b.addEventListener('click', () => {
        chosen.has(k) ? chosen.delete(k) : chosen.add(k);
        saveChosen();
        b.setAttribute('aria-pressed', String(chosen.has(k)));
        paintUpcoming();
        paintApiExample();
        if (currentSubscription) syncSubscription(currentSubscription);
      });
      chips.append(b);
    }
    box.append(chips);
  }
}

function paintApiExample() {
  const link = $('#api-example');
  if (!link) return;
  const first = [...chosen][0];
  const [svc, area] = first ? first.split('/') : [services[0]?.slug, services[0]?.regions?.[0]?.slug];
  link.href = svc && area ? `/api/services/${svc}/areas/${area}/notices` : '/api/services';
}

// ---------- what's coming ----------

async function paintUpcoming() {
  const box = $('#upcoming');
  box.textContent = '';
  if (chosen.size === 0) {
    box.innerHTML = `<p class="empty">${escapeHtml(t('pick_one'))}</p>`;
    return;
  }
  const lists = await Promise.all([...chosen].map(async (k) => {
    const [svc, area] = k.split('/');
    const res = await fetch(`/api/services/${svc}/areas/${area}/notices`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.notices || []).map((n) => ({ ...n, service: data.service, area: data.area }));
  }));

  // One posting act shows once, even when it covered several areas you follow.
  const seen = new Map();
  for (const n of lists.flat()) {
    const k = n.batch_id || n.id;
    if (!seen.has(k)) seen.set(k, { ...n, areas: [n.area] });
    else seen.get(k).areas.push(n.area);
  }
  const all = [...seen.values()].sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  if (all.length === 0) {
    box.innerHTML = `<p class="empty">${escapeHtml(t('none_upcoming'))}</p>`;
    return;
  }
  for (const n of all) box.append(noticeEl(n));
}

/** The service supplies its own word for what happened. */
function kindLabel(n) {
  const svc = services.find((s) => s.slug === n.service?.slug);
  const k = svc?.kinds.find((x) => x.key === n.kind);
  return k ? name(k) : n.kind;
}

function noticeEl(n) {
  const el = document.createElement('div');
  el.className = 'notice';
  const areas = n.areas.map(name).join(' · ');
  const why = (lang === 'hi' ? n.reason.hi : n.reason.en) || n.reason.en || n.reason.hi || '';
  const icon = n.service?.icon ? `${n.service.icon} ` : '';
  el.innerHTML = `
    <div class="meta"><span>${escapeHtml(areas)}</span><span class="kind">${escapeHtml(icon + kindLabel(n))}</span></div>
    <div class="when">${escapeHtml(fmtWindow(n.from, n.to, lang))}</div>
    ${why ? `<div class="why">${escapeHtml(why)}</div>` : ''}`;
  return el;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- push ----------

let currentSubscription = null;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function paintNotifyButton() {
  const btn = $('#notify');
  if (!pushSupported) {
    btn.disabled = true;
    btn.textContent = t('push_unsupported');
    return;
  }
  btn.disabled = false;
  btn.textContent = currentSubscription ? t('notify_off') : t('notify_me');
  btn.classList.toggle('ghost', Boolean(currentSubscription));
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function syncSubscription(sub) {
  await fetch('/api/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: sub.toJSON().keys,
      topics: [...chosen].map((k) => { const [service, area] = k.split('/'); return { service, area }; }),
      lang,
    }),
  });
}

async function enable() {
  if (chosen.size === 0) return say(t('pick_one'), 'bad');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return say(t('push_denied'), 'bad');
  const reg = await navigator.serviceWorker.ready;
  const { key: vapid } = await (await fetch('/api/vapid-key')).json();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  });
  await syncSubscription(sub);
  currentSubscription = sub;
  paintNotifyButton();
  say(t('notify_on_ok'), 'ok');
}

async function disable() {
  const sub = currentSubscription;
  if (!sub) return;
  await fetch('/api/subscriptions', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe().catch(() => {});
  currentSubscription = null;
  paintNotifyButton();
  say(t('notify_off_ok'), 'ok');
}

// ---------- wiring ----------

for (const b of document.querySelectorAll('.lang button')) {
  b.addEventListener('click', () => {
    lang = b.dataset.lang;
    paintStrings();
    paintPicker();
    paintUpcoming();
    paintNotifyButton();
    theme?.repaint();
    if (currentSubscription) syncSubscription(currentSubscription);
  });
}

$('#notify').addEventListener('click', () => (currentSubscription ? disable() : enable()));

const theme = initTheme(t);
initVersion();
paintStrings();
paintNotifyButton();
loadServices();

if (pushSupported) {
  navigator.serviceWorker.register('/sw.js').then(async () => {
    const reg = await navigator.serviceWorker.ready;
    currentSubscription = await reg.pushManager.getSubscription();
    paintNotifyButton();
  }).catch(() => paintNotifyButton());
}

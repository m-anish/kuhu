// The listening face. Pick areas, allow one quiet notification, see what's next.

import { STRINGS, pickLang, setLang, fmtWindow } from '/i18n.js';

let lang = pickLang();
let regions = [];
let chosen = new Set(JSON.parse(localStorage.getItem('kuhu.regions') || '[]'));

const $ = (sel) => document.querySelector(sel);
const flash = $('#flash');

function t(key) { return STRINGS[lang][key]; }

function paintStrings() {
  setLang(lang);
  for (const el of document.querySelectorAll('[data-s]')) {
    const key = el.dataset.s;
    if (key === 'notify_me') continue;      // handled by paintNotifyButton
    el.textContent = t(key);
  }
  for (const b of document.querySelectorAll('.lang button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  }
}

function say(msg, kind = 'ok') {
  flash.textContent = msg;
  flash.className = `flash ${kind}`;
}

// ---------- regions ----------

async function loadRegions() {
  const res = await fetch('/api/regions');
  regions = (await res.json()).regions || [];
  paintRegions();
  paintUpcoming();
}

function paintRegions() {
  const box = $('#regions');
  box.textContent = '';
  for (const r of regions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.slug = r.slug;
    b.setAttribute('aria-pressed', String(chosen.has(r.slug)));
    b.textContent = lang === 'hi' ? r.name_hi : r.name_en;
    b.addEventListener('click', () => {
      chosen.has(r.slug) ? chosen.delete(r.slug) : chosen.add(r.slug);
      localStorage.setItem('kuhu.regions', JSON.stringify([...chosen]));
      b.setAttribute('aria-pressed', String(chosen.has(r.slug)));
      paintUpcoming();
      if (currentSubscription) syncSubscription(currentSubscription);   // keep push in step
    });
    box.append(b);
  }
}

// ---------- what's coming ----------

async function paintUpcoming() {
  const box = $('#upcoming');
  box.textContent = '';
  if (chosen.size === 0) {
    box.innerHTML = `<p class="empty">${t('pick_one')}</p>`;
    return;
  }
  const lists = await Promise.all([...chosen].map(async (slug) => {
    const res = await fetch(`/api/regions/${slug}/next-cuts`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.notices || []).map((n) => ({ ...n, region: data.region }));
  }));
  const all = lists.flat().sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  if (all.length === 0) {
    box.innerHTML = `<p class="empty">${t('none_upcoming')}</p>`;
    return;
  }
  for (const n of all) box.append(noticeEl(n));
}

function noticeEl(n) {
  const el = document.createElement('div');
  el.className = 'notice';
  const region = lang === 'hi' ? n.region.name_hi : n.region.name_en;
  const kind = t(`kind_${n.kind}`) || n.kind;
  const why = (lang === 'hi' ? n.reason.hi : n.reason.en) || n.reason.en || n.reason.hi || '';
  el.innerHTML = `
    <div class="meta"><span>${escapeHtml(region)}</span><span class="kind">${escapeHtml(kind)}</span></div>
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
      regions: [...chosen],
      lang,
    }),
  });
}

async function enable() {
  if (chosen.size === 0) return say(t('pick_one'), 'bad');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return say(t('push_denied'), 'bad');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await (await fetch('/api/vapid-key')).json();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
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
    paintRegions();
    paintUpcoming();
    paintNotifyButton();
    if (currentSubscription) syncSubscription(currentSubscription);
  });
}

$('#notify').addEventListener('click', () => (currentSubscription ? disable() : enable()));

paintStrings();
paintNotifyButton();
loadRegions();

if (pushSupported) {
  navigator.serviceWorker.register('/sw.js').then(async () => {
    const reg = await navigator.serviceWorker.ready;
    currentSubscription = await reg.pushManager.getSubscription();
    paintNotifyButton();
  }).catch(() => paintNotifyButton());
}

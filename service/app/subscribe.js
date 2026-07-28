// The listening face. Pick what you want warned about, allow one quiet
// notification, see what's coming.
//
// kuhu carries several services. When only one is switched on — which is the
// case today — the service layer is hidden entirely and this looks exactly
// like a list of areas. Complexity appears only when it has earned its place.

import { STRINGS, pickLang, setLang, fmtWindow, initTheme, initVersion, regionTree, leavesOf } from '/i18n.js';

// Someone who posts should land on the posting screen when they open the app,
// not on the subscribe screen they will never use.
//
// The redirect fires only on an app *launch* — the manifest's start_url is
// "/?home=1", and nothing else carries that marker. A crew member who taps
// "Subscribe instead" from /post arrives at a plain "/" and stays there,
// because they may well want notices for their own household too. Redirecting
// on "signed in" alone would make that link bounce straight back.
if (new URLSearchParams(location.search).has('home') && localStorage.getItem('kuhu.token')) {
  location.replace('/post');
}

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
 * Always one card per service, even when there is only one.
 *
 * Hiding the service layer for a single service was a mistake: it made the app
 * look like a flat list of areas, so when a second service appeared nobody
 * could tell which areas belonged to which — and a service with no areas yet
 * vanished entirely. Naming the service costs one line and removes the whole
 * class of confusion.
 */
function paintPicker() {
  const box = $('#regions');
  // Picking an area repaints, because a whole-region pick changes what the
  // areas under it look like. Nobody's open card should shut underneath them
  // while that happens, so remember what was open and put it back.
  const wasOpen = new Set(
    [...box.querySelectorAll('details[data-svc]')].filter((d) => d.open).map((d) => d.dataset.svc),
  );
  const first = box.childElementCount === 0;
  box.textContent = '';

  for (const svc of services) {
    const picked = svc.regions.filter((a) => chosen.has(key(svc.slug, a.slug))).length;
    const card = document.createElement('details');
    card.className = 'acc svc-card';
    card.dataset.svc = svc.slug;
    card.style.setProperty('--svc-accent', svc.accent || 'var(--sage)');
    // On the first paint: open when they already follow something here, or
    // when it is the only service and there is nothing to choose between.
    // After that, whatever they had open stays open.
    card.open = first ? (picked > 0 || services.length === 1) : wasOpen.has(svc.slug);

    const sum = document.createElement('summary');
    sum.innerHTML = `
      <span class="svc-icon" aria-hidden="true"></span>
      <span class="acc-title"></span>
      <span class="acc-count"></span>`;
    sum.querySelector('.svc-icon').textContent = svc.icon || '';
    sum.querySelector('.acc-title').textContent = name(svc);
    sum.querySelector('.acc-count').textContent = picked ? String(picked) : '';
    card.append(sum);

    const body = document.createElement('div');
    body.className = 'acc-body';
    if (svc.regions.length === 0) {
      body.innerHTML = `<p class="empty">${escapeHtml(t('svc_no_areas'))}</p>`;
    } else {
      body.append(areaChips(svc));
    }
    card.append(body);
    box.append(card);
  }
}

/** The area chips for one service, nested by region. */
function areaChips(svc) {
  const box = document.createElement('div');
  paintPickGroup(box, regionTree(svc.regions), svc);
  return box;
}

function afterPick(svc) {
  saveChosen();
  paintPicker();
  paintUpcoming();
  paintApiExample();
  if (currentSubscription) syncSubscription(currentSubscription);
}

/**
 * Subscribing stores what you PICKED, not what it currently means.
 *
 * Choosing a whole region saves the region itself, and the expansion to areas
 * happens at notify time. Saving its areas instead would freeze the choice:
 * an area added under that region next year would reach nobody who had
 * already subscribed to it. This is the exact opposite of the posting picker,
 * and the difference is deliberate.
 */
function paintPickGroup(box, nodes, svc) {
  const flat = nodes.filter((n) => !n.children.length);
  if (flat.length) {
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const area of flat) chips.append(pickChip(area, svc));
    box.append(chips);
  }

  for (const node of nodes.filter((n) => n.children.length)) {
    const wholeKey = key(svc.slug, node.slug);
    const covered = chosen.has(wholeKey);

    const group = document.createElement('div');
    group.className = 'rgroup';

    const head = document.createElement('div');
    head.className = 'rgroup-head';
    const label = document.createElement('span');
    label.className = 'rgroup-name';
    label.textContent = name(node);
    head.append(label);

    const whole = document.createElement('button');
    whole.type = 'button';
    whole.className = 'chip whole';
    whole.textContent = t('whole_region');
    whole.setAttribute('aria-pressed', String(covered));
    whole.setAttribute('aria-label', `${t('whole_region')} — ${name(node)}`);
    whole.addEventListener('click', () => {
      if (covered) chosen.delete(wholeKey);
      else {
        chosen.add(wholeKey);
        // The areas inside are now implied. Leaving them individually ticked
        // would be a lie the moment a new one is added under this region.
        for (const l of leavesOf(node)) chosen.delete(key(svc.slug, l.slug));
      }
      afterPick(svc);
    });
    head.append(whole);
    group.append(head);

    const inner = document.createElement('div');
    paintPickGroup(inner, node.children, svc);
    if (covered) {
      // Locked rather than silently ignored: the whole-region pick is the only
      // thing that matters while it is on, and the way out is the same chip.
      inner.classList.add('covered');
      for (const b of inner.querySelectorAll('button')) {
        b.disabled = true;
        b.setAttribute('aria-pressed', 'true');
      }
      const note = document.createElement('p');
      note.className = 'hint-p';
      note.textContent = t('whole_region_note');
      group.append(note);
    }
    group.append(inner);
    box.append(group);
  }
}

function pickChip(area, svc) {
  const k = key(svc.slug, area.slug);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = name(area);
  b.setAttribute('aria-pressed', String(chosen.has(k)));
  b.setAttribute('aria-label', `${name(area)} — ${name(svc)}`);
  b.addEventListener('click', () => {
    chosen.has(k) ? chosen.delete(k) : chosen.add(k);
    afterPick(svc);
  });
  return b;
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

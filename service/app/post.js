// The posting face. Invite code once, then: area, kind, window, reason, send.
// Designed for one thumb, in the rain, in under a minute.

import { STRINGS, REASONS, pickLang, setLang, fmtWindow, localToIso, isoToLocalInput } from '/i18n.js';

let lang = pickLang();
let token = localStorage.getItem('kuhu.token') || '';
let team = localStorage.getItem('kuhu.team') || '';
let areas = [];
let sel = { region: null, kind: 'cut', reason: null };

const $ = (s) => document.querySelector(s);
const flash = $('#flash');
const t = (k) => STRINGS[lang][k];

function say(msg, kind = 'ok') {
  flash.textContent = msg;
  flash.className = `flash ${kind}`;
  flash.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function paintStrings() {
  setLang(lang);
  for (const el of document.querySelectorAll('[data-s]')) el.textContent = t(el.dataset.s);
  for (const b of document.querySelectorAll('.lang button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  }
  $('#who').textContent = team ? `${t('joined_as')} ${team}` : '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) { signOut(); throw new Error('unauthorized'); }
  return res;
}

// ---------- join ----------

async function join() {
  const code = $('#code').value.trim();
  const name = $('#name').value.trim();
  if (!code || !name) return say(t('bad_code'), 'bad');
  const res = await fetch('/api/auth/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) return say(t('bad_code'), 'bad');
  const data = await res.json();
  token = data.token;
  team = data.team;
  localStorage.setItem('kuhu.token', token);
  localStorage.setItem('kuhu.team', team);
  areas = data.regions || [];
  flash.className = 'flash hidden';
  showPostView();
}

function signOut() {
  localStorage.removeItem('kuhu.token');
  localStorage.removeItem('kuhu.team');
  token = ''; team = '';
  $('#post-view').classList.add('hidden');
  $('#join-view').classList.remove('hidden');
  paintStrings();
}

// ---------- post view ----------

async function showPostView() {
  $('#join-view').classList.add('hidden');
  $('#post-view').classList.remove('hidden');
  paintStrings();
  if (areas.length === 0) {
    const res = await api('/api/team/regions');
    if (!res.ok) return signOut();
    areas = (await res.json()).regions || [];
  }
  paintAreas();
  paintKinds();
  paintQuick();
  paintReasons();
  defaultWindow();
  loadMine();
}

function paintAreas() {
  const box = $('#areas');
  box.textContent = '';
  if (areas.length === 1) sel.region = areas[0].slug;
  for (const a of areas) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = lang === 'hi' ? a.name_hi : a.name_en;
    b.setAttribute('aria-pressed', String(sel.region === a.slug));
    b.addEventListener('click', () => { sel.region = a.slug; paintAreas(); });
    box.append(b);
  }
}

function paintKinds() {
  const box = $('#kinds');
  box.textContent = '';
  for (const k of ['cut', 'advisory', 'restored']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t(`kind_${k}`);
    b.setAttribute('aria-pressed', String(sel.kind === k));
    b.addEventListener('click', () => { sel.kind = k; paintKinds(); });
    box.append(b);
  }
}

function paintQuick() {
  const box = $('#quick');
  box.textContent = '';
  const presets = [
    ['in_2h',       () => { const a = new Date(); const b = new Date(a.getTime() + 2 * 3600e3); return [a, b]; }],
    ['tonight',     () => atHour(0, 18, 21)],
    ['tomorrow_am', () => atHour(1, 9, 12)],
  ];
  for (const [key, mk] of presets) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t(key);
    b.addEventListener('click', () => {
      const [from, to] = mk();
      $('#from').value = isoToLocalInput(from);
      $('#to').value = isoToLocalInput(to);
    });
    box.append(b);
  }
}

function atHour(dayOffset, startHour, endHour) {
  const from = new Date();
  from.setDate(from.getDate() + dayOffset);
  from.setHours(startHour, 0, 0, 0);
  const to = new Date(from);
  to.setHours(endHour, 0, 0, 0);
  return [from, to];
}

function defaultWindow() {
  const from = new Date(Math.ceil(Date.now() / (30 * 60e3)) * 30 * 60e3);   // next half hour
  const to = new Date(from.getTime() + 2 * 3600e3);
  $('#from').value = isoToLocalInput(from);
  $('#to').value = isoToLocalInput(to);
}

function paintReasons() {
  const box = $('#reasons');
  box.textContent = '';
  REASONS.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = lang === 'hi' ? r.hi : r.en;
    b.setAttribute('aria-pressed', String(sel.reason === i));
    b.addEventListener('click', () => {
      sel.reason = sel.reason === i ? null : i;
      $('#reason-free').value = '';
      paintReasons();
    });
    box.append(b);
  });
}

// ---------- publish ----------

async function publish() {
  const free = $('#reason-free').value.trim();
  const preset = sel.reason !== null ? REASONS[sel.reason] : null;
  if (!sel.region) return say(t('pick_one'), 'bad');
  if (!preset && !free) return say(t('need_reason'), 'bad');
  const from = localToIso($('#from').value);
  const to = localToIso($('#to').value);
  if (!from || !to || Date.parse(from) >= Date.parse(to)) return say(t('bad_window'), 'bad');

  // A preset carries both languages. Free text is only what was actually typed —
  // kuhu does not invent a translation it cannot vouch for.
  const body = {
    region: sel.region,
    kind: sel.kind,
    from,
    to,
    reason_en: preset ? preset.en : (lang === 'en' ? free : ''),
    reason_hi: preset ? preset.hi : (lang === 'hi' ? free : ''),
  };

  const btn = $('#publish');
  btn.disabled = true;
  try {
    const res = await api('/api/notices', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return say(err.error || 'error', 'bad');
    }
    say(t('published'), 'ok');
    $('#reason-free').value = '';
    sel.reason = null;
    paintReasons();
    defaultWindow();
    loadMine();
  } finally {
    btn.disabled = false;
  }
}

async function loadMine() {
  const box = $('#mine');
  const res = await api('/api/team/notices');
  if (!res.ok) return;
  const { notices } = await res.json();
  box.textContent = '';
  if (!notices || notices.length === 0) {
    box.innerHTML = `<p class="empty">${t('none_upcoming')}</p>`;
    return;
  }
  for (const n of notices) {
    const el = document.createElement('div');
    el.className = `notice${n.status === 'cancelled' ? ' cancelled' : ''}`;
    const region = lang === 'hi' ? n.region.name_hi : n.region.name_en;
    const why = (lang === 'hi' ? n.reason.hi : n.reason.en) || n.reason.en || n.reason.hi || '';
    el.innerHTML = `
      <div class="meta">
        <span>${escapeHtml(region)}</span>
        <span class="kind">${escapeHtml(n.status === 'cancelled' ? t('cancelled_label') : t(`kind_${n.kind}`))}</span>
      </div>
      <div class="when">${escapeHtml(fmtWindow(n.from, n.to, lang))}</div>
      ${why ? `<div class="why">${escapeHtml(why)}</div>` : ''}`;
    if (n.status === 'scheduled') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t('cancel_notice');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const r = await api(`/api/notices/${n.id}/cancel`, { method: 'POST' });
        if (r.ok) { say(t('cancelled_ok'), 'ok'); loadMine(); } else btn.disabled = false;
      });
      el.append(btn);
    }
    box.append(el);
  }
}

// ---------- wiring ----------

for (const b of document.querySelectorAll('.lang button')) {
  b.addEventListener('click', () => {
    lang = b.dataset.lang;
    paintStrings();
    if (token) { paintAreas(); paintKinds(); paintQuick(); paintReasons(); loadMine(); }
  });
}

$('#join').addEventListener('click', join);
$('#publish').addEventListener('click', publish);
$('#signout').addEventListener('click', signOut);

paintStrings();
if (token) {
  showPostView().catch(signOut);
} else {
  $('#join-view').classList.remove('hidden');
}

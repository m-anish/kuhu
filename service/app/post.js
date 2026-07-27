// The posting face. Invite code once, then: area, kind, window, reason, send.
// Designed for one thumb, in the rain, in under a minute.

import { STRINGS, REASONS, pickLang, setLang, fmtWindow, localToIso, isoToLocalInput } from '/i18n.js';

let lang = pickLang();
let token = localStorage.getItem('kuhu.token') || '';
let team = localStorage.getItem('kuhu.team') || '';
let role = localStorage.getItem('kuhu.role') || 'poster';
let areas = [];
let sel = { region: null, kind: 'cut', reason: null };
let inviteSel = { role: 'poster', hours: 48 };
let lastInviteUrl = '';

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

// ---------- session ----------

function signOut() {
  localStorage.removeItem('kuhu.token');
  localStorage.removeItem('kuhu.team');
  localStorage.removeItem('kuhu.role');
  token = ''; team = ''; role = 'poster';
  $('#post-view').classList.add('hidden');
  $('#admin-view').classList.add('hidden');
  $('#join-view').classList.remove('hidden');
  paintStrings();
}

// ---------- post view ----------

async function showPostView() {
  $('#join-view').classList.add('hidden');
  $('#post-view').classList.remove('hidden');

  const res = await api('/api/me');
  if (!res.ok) return signOut();
  const me = await res.json();
  areas = me.regions || [];
  role = me.role;
  team = team || '';
  localStorage.setItem('kuhu.role', role);

  paintStrings();
  paintAreas();
  paintKinds();
  paintQuick();
  paintReasons();
  defaultWindow();
  loadMine();

  $('#admin-view').classList.toggle('hidden', role !== 'admin');
  if (role === 'admin') {
    paintInviteControls();
    loadInvites();
    loadMembers();
    paintAreasAdmin();
  }
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

// ---------- admin: invites ----------

function paintInviteControls() {
  const roleBox = $('#invite-role');
  roleBox.textContent = '';
  for (const r of ['poster', 'admin']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t(r === 'admin' ? 'role_admin' : 'role_poster');
    b.setAttribute('aria-pressed', String(inviteSel.role === r));
    b.addEventListener('click', () => { inviteSel.role = r; paintInviteControls(); });
    roleBox.append(b);
  }
  const hoursBox = $('#invite-hours');
  hoursBox.textContent = '';
  for (const h of [24, 48, 168]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t(`hours_${h}`);
    b.setAttribute('aria-pressed', String(inviteSel.hours === h));
    b.addEventListener('click', () => { inviteSel.hours = h; paintInviteControls(); });
    hoursBox.append(b);
  }
}

async function makeInvite() {
  const btn = $('#make-invite');
  btn.disabled = true;
  try {
    const res = await api('/api/invites', {
      method: 'POST',
      body: JSON.stringify({ role: inviteSel.role, hours: inviteSel.hours, note: $('#invite-note').value.trim() }),
    });
    if (!res.ok) return say((await res.json().catch(() => ({}))).error || 'error', 'bad');
    const data = await res.json();
    lastInviteUrl = data.url;
    $('#invite-url').textContent = data.url;
    $('#invite-result').classList.remove('hidden');
    $('#invite-note').value = '';
    say(t('link_ready'), 'ok');
    loadInvites();
  } finally {
    btn.disabled = false;
  }
}

function waMessage() {
  return t('wa_message').replace('{team}', team).replace('{url}', lastInviteUrl);
}

async function shareInvite() {
  if (!lastInviteUrl) return;
  // The Web Share API gives the real WhatsApp share sheet on a phone; wa.me is
  // the desktop-and-everything-else fallback.
  if (navigator.share) {
    try { await navigator.share({ text: waMessage() }); return; } catch { /* cancelled */ }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(waMessage())}`, '_blank', 'noopener');
}

async function copyInvite() {
  if (!lastInviteUrl) return;
  try {
    await navigator.clipboard.writeText(lastInviteUrl);
    say(t('copied'), 'ok');
  } catch {
    say(lastInviteUrl, 'ok');
  }
}

async function loadInvites() {
  const box = $('#invites');
  const res = await api('/api/invites');
  if (!res.ok) return;
  const { invites } = await res.json();
  box.textContent = '';
  const live = invites.filter((i) => i.state !== 'expired');
  if (live.length === 0) { box.innerHTML = `<p class="empty">${escapeHtml(t('no_invites'))}</p>`; return; }
  for (const i of live) {
    const el = document.createElement('div');
    el.className = 'row';
    const who = i.state === 'used' && i.used_by_name ? ` · ${i.used_by_name}` : '';
    el.innerHTML = `
      <div>
        <strong>${escapeHtml(i.note || t(i.role === 'admin' ? 'role_admin' : 'role_poster'))}</strong>
        <div class="sub">${escapeHtml(t(`state_${i.state}`))}${escapeHtml(who)}</div>
      </div>`;
    if (i.state === 'open') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mini';
      btn.textContent = t('revoke');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const r = await api(`/api/invites/${i.id}/revoke`, { method: 'POST' });
        if (r.ok) loadInvites(); else btn.disabled = false;
      });
      el.append(btn);
    }
    box.append(el);
  }
}

// ---------- admin: members ----------

async function loadMembers() {
  const box = $('#members');
  const res = await api('/api/team/members');
  if (!res.ok) return;
  const { members } = await res.json();
  box.textContent = '';
  for (const m of members) {
    const el = document.createElement('div');
    el.className = `row${m.revoked_at ? ' dim' : ''}`;
    const bits = [t(m.role === 'admin' ? 'role_admin' : 'role_poster')];
    if (m.phone) bits.push(m.phone);
    if (m.revoked_at) bits.push(t('state_revoked'));
    el.innerHTML = `
      <div>
        <strong>${escapeHtml(m.name)}${m.is_you ? ' ·' : ''}</strong>
        <div class="sub">${escapeHtml(bits.join(' · '))}</div>
      </div>`;
    if (!m.revoked_at && !m.is_you) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mini';
      btn.textContent = t('remove_member');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const r = await api(`/api/team/members/${m.id}/revoke`, { method: 'POST' });
        if (r.ok) { say(t('removed_ok'), 'ok'); loadMembers(); }
        else {
          const err = await r.json().catch(() => ({}));
          say(err.error === 'that is the last admin' ? t('last_admin') : (err.error || 'error'), 'bad');
          btn.disabled = false;
        }
      });
      el.append(btn);
    }
    box.append(el);
  }
}

// ---------- admin: areas ----------

function paintAreasAdmin() {
  const box = $('#areas-admin');
  box.textContent = '';
  for (const a of areas) {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `
      <div>
        <strong>${escapeHtml(lang === 'hi' ? a.name_hi : a.name_en)}</strong>
        <div class="sub"><code>${escapeHtml(a.slug)}</code></div>
      </div>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini';
    btn.textContent = t('rename');
    btn.addEventListener('click', () => renameArea(a, el));
    el.append(btn);
    box.append(el);
  }
}

function renameArea(area, row) {
  if (row.querySelector('.rename-form')) return;
  const form = document.createElement('div');
  form.className = 'rename-form';
  form.innerHTML = `
    <label class="field"><span>${escapeHtml(t('area_en'))}</span>
      <input class="r-en" value="${escapeHtml(area.name_en)}"></label>
    <label class="field"><span>${escapeHtml(t('area_hi'))}</span>
      <input class="r-hi" value="${escapeHtml(area.name_hi)}"></label>
    <small class="hint">${escapeHtml(t('slug_fixed'))}</small>`;
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'big';
  save.style.marginTop = '0.6rem';
  save.textContent = t('rename');
  save.addEventListener('click', async () => {
    save.disabled = true;
    const res = await api(`/api/regions/${area.slug}/rename`, {
      method: 'POST',
      body: JSON.stringify({
        name_en: form.querySelector('.r-en').value.trim(),
        name_hi: form.querySelector('.r-hi').value.trim(),
      }),
    });
    if (!res.ok) { say((await res.json().catch(() => ({}))).error || 'error', 'bad'); save.disabled = false; return; }
    const updated = await res.json();
    Object.assign(area, updated);
    say(t('rename_saved'), 'ok');
    paintAreas();
    paintAreasAdmin();
  });
  form.append(save);
  row.append(form);
}

/** Suggest a slug from the English name, but let the admin overrule it. */
function suggestSlug() {
  const slugField = $('#new-slug');
  if (slugField.dataset.touched === '1') return;
  slugField.value = $('#new-en').value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 39);
}

async function addArea() {
  const btn = $('#add-area');
  btn.disabled = true;
  try {
    const res = await api('/api/regions', {
      method: 'POST',
      body: JSON.stringify({
        slug: $('#new-slug').value.trim().toLowerCase(),
        name_en: $('#new-en').value.trim(),
        name_hi: $('#new-hi').value.trim(),
      }),
    });
    if (!res.ok) return say((await res.json().catch(() => ({}))).error || 'error', 'bad');
    const added = await res.json();
    areas.push(added);
    areas.sort((a, b) => a.slug.localeCompare(b.slug));
    $('#new-en').value = ''; $('#new-hi').value = ''; $('#new-slug').value = '';
    $('#new-slug').dataset.touched = '';
    say(t('area_added'), 'ok');
    paintAreas();
    paintAreasAdmin();
  } finally {
    btn.disabled = false;
  }
}

// ---------- wiring ----------

for (const b of document.querySelectorAll('.lang button')) {
  b.addEventListener('click', () => {
    lang = b.dataset.lang;
    paintStrings();
    if (token) {
      paintAreas(); paintKinds(); paintQuick(); paintReasons(); loadMine();
      if (role === 'admin') { paintInviteControls(); loadInvites(); loadMembers(); paintAreasAdmin(); }
    }
  });
}

$('#publish').addEventListener('click', publish);
$('#signout').addEventListener('click', signOut);
$('#make-invite').addEventListener('click', makeInvite);
$('#share-wa').addEventListener('click', shareInvite);
$('#copy-link').addEventListener('click', copyInvite);
$('#add-area').addEventListener('click', addArea);
$('#new-en').addEventListener('input', suggestSlug);
$('#new-slug').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });

paintStrings();
if (token) {
  showPostView().catch(signOut);
} else {
  $('#join-view').classList.remove('hidden');
}

// The posting face. Pick areas, say what and when, send.
// Designed for one thumb, in the rain, in under a minute.
//
// A poster usually reaches exactly one service, and then the service layer is
// invisible. Someone who reaches several — a service admin, a site admin —
// gets a service switcher, and the kinds and reason presets change with it,
// because those belong to the service rather than to this file.

import { STRINGS, pickLang, setLang, fmtWindow, localToIso, isoToLocalInput, parseInviteToken, initTheme, initVersion, regionTree, leavesOf } from '/i18n.js';
import { qrSvg } from '/qr.js';
import { scanSupported, openScanner } from '/scan.js';

let lang = pickLang();
let token = localStorage.getItem('kuhu.token') || '';
let team = localStorage.getItem('kuhu.team') || '';
let me = null;                       // { name, role, team, services[], can{} }
let svc = null;                      // the service currently being posted to
let sel = { regions: new Set(), kind: null, reason: null };
let inviteSel = { role: 'poster', hours: 48, team: null };
let teams = [];
let lastInviteUrl = '';
let moveUrl = '';

const $ = (s) => document.querySelector(s);
const flash = $('#flash');
const t = (k) => STRINGS[lang][k];
const name = (o) => (lang === 'hi' ? o.name_hi : o.name_en);

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
  $('#who').textContent = me ? `${me.name} · ${me.team}` : (team || '');
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
  for (const k of ['kuhu.token', 'kuhu.team', 'kuhu.role']) localStorage.removeItem(k);
  token = ''; team = ''; me = null; svc = null;
  $('#post-view').classList.add('hidden');
  $('#admin-view').classList.add('hidden');
  $('#join-view').classList.remove('hidden');
  paintStrings();
}

async function showPostView() {
  $('#join-view').classList.add('hidden');
  $('#post-view').classList.remove('hidden');

  const res = await api('/api/me');
  if (!res.ok) return signOut();
  me = await res.json();
  team = me.team;
  localStorage.setItem('kuhu.team', team);
  localStorage.setItem('kuhu.role', me.role);

  svc = me.services[0] || null;
  if (!svc) { say(t('no_service'), 'bad'); return; }
  sel.kind = svc.kinds[0]?.key ?? null;

  paintStrings();
  paintServices();
  paintAreas();
  paintKinds();
  paintQuick();
  paintReasons();
  defaultWindow();
  loadMine();
  paintAdmin();
}

/** Only shown when this person reaches more than one service. */
function paintServices() {
  const wrap = $('#service-row');
  const box = $('#services');
  const many = me.services.length > 1;
  wrap.classList.toggle('hidden', !many);
  if (!many) return;
  box.textContent = '';
  for (const s of me.services) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${s.icon || ''} ${name(s)}`.trim();
    b.setAttribute('aria-pressed', String(s.slug === svc.slug));
    b.addEventListener('click', () => {
      if (s.slug === svc.slug) return;
      svc = s;
      // The vocabulary belongs to the service, so everything below resets.
      sel.regions.clear();
      sel.kind = svc.kinds[0]?.key ?? null;
      sel.reason = null;
      $('#reason-free').value = '';
      paintServices(); paintAreas(); paintKinds(); paintReasons();
      if (me.can?.manage_areas) loadAllAreas();
    });
    box.append(b);
  }
}

function paintAreas() {
  const box = $('#areas');
  box.textContent = '';
  const head = $('#area-head');
  if (head) {
    head.textContent = me.services.length > 1 && svc
      ? `${t('area')} · ${`${svc.icon || ''} ${name(svc)}`.trim()}`
      : t('area');
  }
  // A service that has just been created has none yet. Say what to do about it
  // rather than showing an empty row.
  if (svc.regions.length === 0) {
    box.innerHTML = `<p class="empty">${escapeHtml(t(me.can?.manage_areas ? 'no_areas_admin' : 'no_areas'))}</p>`;
    return;
  }
  if (svc.regions.length === 1) sel.regions.add(svc.regions[0].slug);

  // Posting always selects LEAVES, even when you tap "All of Kangra" — a
  // notice is about the places it is actually about, so the expansion happens
  // here and now. Subscribing does the opposite on purpose: see subscribe.js.
  paintRegionGroup(box, regionTree(svc.regions));
}

function areaChip(node) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = name(node);
  b.setAttribute('aria-pressed', String(sel.regions.has(node.slug)));
  b.addEventListener('click', () => {
    sel.regions.has(node.slug) ? sel.regions.delete(node.slug) : sel.regions.add(node.slug);
    paintAreas();
  });
  return b;
}

function paintRegionGroup(box, nodes) {
  // Plain areas at this level sit together in one row.
  const flat = nodes.filter((n) => !n.children.length);
  if (flat.length) {
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const n of flat) chips.append(areaChip(n));
    box.append(chips);
  }

  for (const node of nodes.filter((n) => n.children.length)) {
    const leaves = leavesOf(node);
    const all = leaves.every((l) => sel.regions.has(l.slug));

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
    whole.setAttribute('aria-pressed', String(all));
    whole.addEventListener('click', () => {
      for (const l of leaves) {
        if (all) sel.regions.delete(l.slug);
        else sel.regions.add(l.slug);
      }
      paintAreas();
    });
    head.append(whole);
    group.append(head);

    paintRegionGroup(group, node.children);
    box.append(group);
  }
}

/** Kinds come from the service: "power cut" for one, "tanker coming" for another. */
function paintKinds() {
  const box = $('#kinds');
  box.textContent = '';
  for (const k of svc.kinds) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = name(k);
    b.setAttribute('aria-pressed', String(sel.kind === k.key));
    b.addEventListener('click', () => { sel.kind = k.key; paintKinds(); });
    box.append(b);
  }
}

function paintQuick() {
  const box = $('#quick');
  box.textContent = '';
  const presets = [
    ['in_2h',       () => { const a = new Date(); return [a, new Date(a.getTime() + 2 * 3600e3)]; }],
    ['tonight',     () => atHour(0, 18, 21)],
    ['tomorrow_am', () => atHour(1, 9, 12)],
  ];
  for (const [k, mk] of presets) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t(k);
    b.addEventListener('click', () => {
      const [from, to] = mk();
      $('#from').value = isoToLocalInput(from);
      $('#to').value = isoToLocalInput(to);
      // The preset is a shortcut; these two fields are what actually gets
      // posted, so show that the shortcut landed in them.
      flashFields();
    });
    box.append(b);
  }
}

/** Briefly highlight the start/end inputs — they are the real answer. */
function flashFields() {
  for (const id of ['#from', '#to']) {
    const el = $(id);
    el.classList.remove('just-set');
    void el.offsetWidth;              // restart the animation
    el.classList.add('just-set');
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
  const from = new Date(Math.ceil(Date.now() / (30 * 60e3)) * 30 * 60e3);
  $('#from').value = isoToLocalInput(from);
  $('#to').value = isoToLocalInput(new Date(from.getTime() + 2 * 3600e3));
}

/** Reason presets also belong to the service. */
function paintReasons() {
  const box = $('#reasons');
  box.textContent = '';
  svc.reasons.forEach((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = name(r);
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
  const preset = sel.reason !== null ? svc.reasons[sel.reason] : null;
  if (sel.regions.size === 0) return say(t('pick_one'), 'bad');
  if (!preset && !free) return say(t('need_reason'), 'bad');
  const from = localToIso($('#from').value);
  const to = localToIso($('#to').value);
  if (!from || !to || Date.parse(from) >= Date.parse(to)) return say(t('bad_window'), 'bad');

  // A preset carries both languages. Free text is only what was actually typed —
  // kuhu does not invent a translation it cannot vouch for.
  const body = {
    service: svc.slug,
    regions: [...sel.regions],
    kind: sel.kind,
    from,
    to,
    reason_en: preset ? preset.name_en : (lang === 'en' ? free : ''),
    reason_hi: preset ? preset.name_hi : (lang === 'hi' ? free : ''),
  };

  const btn = $('#publish');
  btn.disabled = true;
  try {
    const res = await api('/api/notices', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) return say((await res.json().catch(() => ({}))).error || 'error', 'bad');
    const out = await res.json();
    say(out.areas > 1 ? t('published_many').replace('{n}', out.areas) : t('published'), 'ok');
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
  const live = notices?.filter((n) => n.status === 'scheduled').length ?? 0;
  $('#count-mine').textContent = live ? String(live) : '';
  if (!notices?.length) { box.innerHTML = `<p class="empty">${escapeHtml(t('none_upcoming'))}</p>`; return; }

  const groups = [];
  const byBatch = new Map();
  for (const n of notices) {
    const k = n.batch_id || n.id;
    if (!byBatch.has(k)) { const g = { head: n, items: [] }; byBatch.set(k, g); groups.push(g); }
    byBatch.get(k).items.push(n);
  }

  for (const g of groups) {
    const n = g.head;
    const el = document.createElement('div');
    el.className = `notice${n.status === 'cancelled' ? ' cancelled' : ''}`;
    const areas = g.items.map((i) => name(i.area)).join(' · ');
    const why = (lang === 'hi' ? n.reason.hi : n.reason.en) || n.reason.en || n.reason.hi || '';
    const svcOf = me.services.find((s) => s.slug === n.service.slug);
    const kindTxt = svcOf?.kinds.find((k) => k.key === n.kind);
    const label = n.status === 'cancelled' ? t('cancelled_label') : (kindTxt ? name(kindTxt) : n.kind);
    el.innerHTML = `
      <div class="meta">
        <span>${escapeHtml(areas)}</span>
        <span class="kind">${escapeHtml((n.service.icon ? n.service.icon + ' ' : '') + label)}</span>
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

// ---------- admin ----------

function paintAdmin() {
  const can = me.can || {};
  $('#admin-view').classList.toggle('hidden', !can.manage_people);
  $('#acc-areas').classList.toggle('hidden', !can.manage_coverage);
  $('#geography').classList.toggle('hidden', !can.manage_areas);
  if (!can.manage_people) return;
  loadTeams();
  loadInvites();
  loadMembers();
  paintCoverage();
  if (can.manage_areas) loadAllAreas();
  // Say plainly what this admin's reach is, so the sections below are read in
  // the right scope rather than assumed to be site-wide.
  $('#admin-scope').textContent = me.role === 'site_admin'
    ? t('scope_site')
    : t('scope_service').replace('{service}', me.services.map((x) => name(x)).join(', '));
  $('#acc-services').classList.toggle('hidden', !can.manage_services);
  if (can.manage_services) { paintServicesAdmin(); ensureVocabRows(); }
}

function paintInviteControls() {
  const roleBox = $('#invite-role');
  roleBox.textContent = '';
  // You may only hand out authority at or below your own.
  const offer = me.role === 'site_admin'
    ? ['poster', 'service_admin', 'site_admin']
    : ['poster', 'service_admin'];
  if (!offer.includes(inviteSel.role)) inviteSel.role = 'poster';
  for (const r of offer) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t(`pick_${r}`);
    b.setAttribute('aria-pressed', String(inviteSel.role === r));
    b.addEventListener('click', () => { inviteSel.role = r; paintInviteControls(); });
    roleBox.append(b);
  }
  paintInviteTarget();
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

async function loadTeams() {
  const res = await api('/api/teams');
  teams = res.ok ? ((await res.json()).teams || []) : [];
  paintInviteControls();
}

/**
 * Where a new person lands. A service admin has one obvious answer and never
 * sees this; a site admin has to say which service — otherwise there is no way
 * to recruit into one.
 */
function paintInviteTarget() {
  const row = $('#invite-target-row');
  const box = $('#invite-target');
  // A site admin lands on the global root; everyone else inherits their own.
  const options = inviteSel.role === 'site_admin'
    ? []
    : inviteSel.role === 'service_admin'
      ? teams.filter((t) => t.service_slug && t.parent_id === 900)   // service roots
      : teams.filter((t) => t.service_slug && t.parent_id !== 900);  // crews
  row.classList.toggle('hidden', options.length <= 1);
  $('#invite-target-label').textContent =
    t(inviteSel.role === 'service_admin' ? 'invite_which_service' : 'invite_which_crew');
  if (options.length && !options.some((o) => o.id === inviteSel.team)) inviteSel.team = options[0].id;
  if (!options.length) inviteSel.team = null;
  box.textContent = '';
  for (const o of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${o.icon || ''} ${o.name}`.trim();
    b.setAttribute('aria-pressed', String(inviteSel.team === o.id));
    b.addEventListener('click', () => { inviteSel.team = o.id; paintInviteTarget(); });
    box.append(b);
  }
}

/** Draw a link as a QR beside it. Encoding happens here in the page — sending
 *  the token to a QR service would put a live credential in someone's logs. */
function paintQr(sel, url, label) {
  const box = document.querySelector(sel);
  if (!box) return;
  box.innerHTML = qrSvg(url, { ecl: 'M', label });
}

async function makeInvite() {
  const btn = $('#make-invite');
  btn.disabled = true;
  try {
    const res = await api('/api/invites', {
      method: 'POST',
      body: JSON.stringify({
        role: inviteSel.role,
        hours: inviteSel.hours,
        note: $('#invite-note').value.trim(),
        ...(inviteSel.team ? { team: inviteSel.team } : {}),
      }),
    });
    if (!res.ok) return say((await res.json().catch(() => ({}))).error || 'error', 'bad');
    const data = await res.json();
    lastInviteUrl = data.url;
    $('#invite-url').textContent = data.url;
    paintQr('#invite-qr', data.url, t('qr_alt'));
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
  if (navigator.share) {
    try { await navigator.share({ text: waMessage() }); return; } catch { /* cancelled */ }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(waMessage())}`, '_blank', 'noopener');
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); say(t('copied'), 'ok'); }
  catch { say(text, 'ok'); }
}

async function loadInvites() {
  const box = $('#invites');
  const res = await api('/api/invites');
  if (!res.ok) return;
  const { invites } = await res.json();
  box.textContent = '';
  const live = invites.filter((i) => i.state !== 'expired');
  if (!live.length) { box.innerHTML = `<p class="empty">${escapeHtml(t('no_invites'))}</p>`; return; }
  for (const i of live) {
    const el = document.createElement('div');
    el.className = 'row';
    const who = i.state === 'used' && i.used_by_name ? ` · ${i.used_by_name}` : '';
    el.innerHTML = `
      <div>
        <strong>${escapeHtml(i.note || t(`role_${i.role}`))}</strong>
        <div class="sub">${escapeHtml(t(`state_${i.state}`) + who)}</div>
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

async function loadMembers() {
  const box = $('#members');
  const res = await api('/api/team/members');
  if (!res.ok) return;
  const { members } = await res.json();
  $('#count-people').textContent = String(members.filter((m) => !m.revoked_at).length);
  box.textContent = '';
  for (const m of members) {
    const el = document.createElement('div');
    el.className = `row${m.revoked_at ? ' dim' : ''}`;
    const bits = [t(`role_${m.role}`), m.team_name];
    if (m.phone) bits.push(m.phone);
    if (m.revoked_at) bits.push(t('state_revoked'));
    el.innerHTML = `
      <div>
        <strong>${escapeHtml(m.name)}${m.is_you ? ' ·' : ''}</strong>
        <div class="sub">${escapeHtml(bits.filter(Boolean).join(' · '))}</div>
      </div>`;
    if (m.can_remove) {
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
          say(err.error?.includes('last site admin') ? t('last_admin') : (err.error || 'error'), 'bad');
          btn.disabled = false;
        }
      });
      el.append(btn);
    }
    box.append(el);
  }
}

/** Which areas this admin's own crew covers, for the service being viewed. */
function paintCoverage() {
  const box = $('#coverage');
  box.textContent = '';
  // Which service these areas belong to, said plainly in three places. A list
  // of area names with no service attached is exactly as useful as no list.
  const label = svc ? `${svc.icon || ''} ${name(svc)}`.trim() : '';
  $('#areas-title').textContent = t('coverage_for').replace('{service}', label);
  $('#coverage-help').textContent = t('coverage_help').replace('{service}', label);
  $('#geography-title').textContent = t('geography_title').replace('{service}', label);
  $('#count-areas').textContent = String(svc?.regions.length ?? 0);
  const covered = new Set((svc?.regions ?? []).map((r) => r.slug));
  for (const a of allAreas.length ? allAreas : (svc?.regions ?? [])) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = name(a);
    b.setAttribute('aria-pressed', String(covered.has(a.slug)));
    b.addEventListener('click', async () => {
      const on = !covered.has(a.slug);
      b.disabled = true;
      const r = await api(`/api/services/${svc.slug}/coverage`, {
        method: 'POST', body: JSON.stringify({ area: a.slug, on }),
      });
      b.disabled = false;
      if (!r.ok) return say((await r.json().catch(() => ({}))).error || 'error', 'bad');
      const res = await api('/api/me');
      me = await res.json();
      svc = me.services.find((s) => s.slug === svc.slug) || me.services[0];
      sel.regions.clear();
      paintAreas(); paintCoverage();
    });
    box.append(b);
  }
}

let allAreas = [];

/** Every area THIS service defines — a superset of what one crew covers. */
async function loadAllAreas() {
  if (!svc) return;
  const res = await api(`/api/services/${svc.slug}/areas`);
  if (!res.ok) return;
  allAreas = (await res.json()).areas || [];
  paintCoverage();
  paintGeography();
}

function paintGeography() {
  const box = $('#areas-all');
  box.textContent = '';
  paintParentOptions();
  for (const a of allAreas) {
    const el = document.createElement('div');
    el.className = 'row';
    const inside = a.parent
      ? `<div class="sub">${escapeHtml(t('inside_of').replace('{region}', labelOfSlug(a.parent)))}</div>`
      : '';
    el.innerHTML = `<div><strong>${escapeHtml(name(a))}</strong>`
      + `<div class="sub"><code>${escapeHtml(a.slug)}</code></div>${inside}</div>`;
    const nest = document.createElement('button');
    nest.type = 'button';
    nest.className = 'mini';
    nest.textContent = t('nest');
    nest.addEventListener('click', () => nestArea(a, el));
    el.append(nest);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mini';
    btn.textContent = t('rename');
    btn.addEventListener('click', () => renameArea(a, el));
    el.append(btn);
    box.append(el);
  }
}

function labelOfSlug(slug) {
  const a = allAreas.find((x) => x.slug === slug);
  return a ? name(a) : slug;
}

/** Anything in this service can hold areas — except the one being placed. */
function parentChoices(exclude) {
  return allAreas.filter((a) => a.slug !== exclude);
}

function paintParentOptions() {
  const sel = $('#new-parent');
  if (!sel) return;
  const keep = sel.value;
  sel.innerHTML = `<option value="">${escapeHtml(t('inside_nothing'))}</option>`;
  for (const a of parentChoices(null)) {
    const o = document.createElement('option');
    o.value = a.slug;
    o.textContent = name(a);
    sel.append(o);
  }
  sel.value = keep;
}

/** Move an area under another, or back out to the top. */
function nestArea(area, row) {
  if (row.querySelector('.rename-form')) return;
  const form = document.createElement('div');
  form.className = 'rename-form';
  const label = document.createElement('label');
  label.className = 'field';
  label.innerHTML = `<span>${escapeHtml(t('area_inside'))}</span>`;
  // Not `sel` — that is the module-level posting selection, and shadowing it
  // here would have quietly cleared a <select> instead of the chosen areas.
  const pick = document.createElement('select');
  pick.innerHTML = `<option value="">${escapeHtml(t('inside_nothing'))}</option>`;
  for (const a of parentChoices(area.slug)) {
    const o = document.createElement('option');
    o.value = a.slug;
    o.textContent = name(a);
    pick.append(o);
  }
  pick.value = area.parent || '';
  label.append(pick);
  form.append(label);

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'big';
  save.style.marginTop = '0.6rem';
  save.textContent = t('save_nesting');
  save.addEventListener('click', async () => {
    save.disabled = true;
    const res = await api(`/api/services/${svc.slug}/areas/${area.slug}/nest`, {
      method: 'POST', body: JSON.stringify({ parent: pick.value || null }),
    });
    if (!res.ok) { say((await res.json().catch(() => ({}))).error || 'error', 'bad'); save.disabled = false; return; }
    say(t('nesting_saved'), 'ok');
    loadAllAreas();
    const fresh = await api('/api/me');
    me = await fresh.json();
    svc = me.services.find((s) => s.slug === svc.slug) || me.services[0];
    sel.regions.clear();
    paintAreas();
  });
  form.append(save);
  row.append(form);
}

function renameArea(area, row) {
  if (row.querySelector('.rename-form')) return;
  const form = document.createElement('div');
  form.className = 'rename-form';
  form.innerHTML = `
    <label class="field"><span>${escapeHtml(t('area_en'))}</span><input class="r-en" value="${escapeHtml(area.name_en)}"></label>
    <label class="field"><span>${escapeHtml(t('area_hi'))}</span><input class="r-hi" value="${escapeHtml(area.name_hi)}"></label>
    <small class="hint">${escapeHtml(t('slug_fixed'))}</small>`;
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'big';
  save.style.marginTop = '0.6rem';
  save.textContent = t('rename');
  save.addEventListener('click', async () => {
    save.disabled = true;
    const res = await api(`/api/services/${svc.slug}/areas/${area.slug}/rename`, {
      method: 'POST',
      body: JSON.stringify({
        name_en: form.querySelector('.r-en').value.trim(),
        name_hi: form.querySelector('.r-hi').value.trim(),
      }),
    });
    if (!res.ok) { say((await res.json().catch(() => ({}))).error || 'error', 'bad'); save.disabled = false; return; }
    Object.assign(area, await res.json());
    say(t('rename_saved'), 'ok');
    loadAllAreas();
    const fresh = await api('/api/me');
    me = await fresh.json();
    svc = me.services.find((s) => s.slug === svc.slug) || me.services[0];
    paintAreas();
  });
  form.append(save);
  row.append(form);
}

function suggestSlug() {
  const f = $('#new-slug');
  if (f.dataset.touched === '1') return;
  f.value = $('#new-en').value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 39);
}

async function addArea() {
  const btn = $('#add-area');
  btn.disabled = true;
  try {
    const res = await api(`/api/services/${svc.slug}/areas`, {
      method: 'POST',
      body: JSON.stringify({
        slug: $('#new-slug').value.trim().toLowerCase(),
        name_en: $('#new-en').value.trim(),
        name_hi: $('#new-hi').value.trim(),
        parent: $('#new-parent').value || null,
      }),
    });
    if (!res.ok) return say((await res.json().catch(() => ({}))).error || 'error', 'bad');
    $('#new-en').value = ''; $('#new-hi').value = ''; $('#new-slug').value = '';
    $('#new-slug').dataset.touched = '';
    say(t('area_added'), 'ok');
    loadAllAreas();
  } finally {
    btn.disabled = false;
  }
}

// ---------- admin: services (site admin only) ----------

function paintServicesAdmin() {
  const box = $('#services-all');
  $('#count-services').textContent = String(me.services.length);
  box.textContent = '';
  for (const sv of me.services) {
    const el = document.createElement('div');
    el.className = 'row';
    el.innerHTML = `
      <div>
        <strong>${escapeHtml(`${sv.icon || ''} ${name(sv)}`.trim())}</strong>
        <div class="sub"><code>${escapeHtml(sv.slug)}</code> · ${escapeHtml(
          sv.kinds.map((k) => name(k)).join(', '))}</div>
      </div>`;
    box.append(el);
  }
}

/** A pair of EN/HI inputs — the unit both kinds and reasons are built from. */
function vocabRow(box, phEn, phHi) {
  const row = document.createElement('div');
  row.className = 'vocab-row';
  row.innerHTML = `
    <input class="v-en" placeholder="${escapeHtml(phEn)}">
    <input class="v-hi" placeholder="${escapeHtml(phHi)}">`;
  box.append(row);
  return row;
}

function ensureVocabRows() {
  if (!$('#svc-kinds').children.length) {
    for (let i = 0; i < 2; i += 1) vocabRow($('#svc-kinds'), 'No supply', 'पानी नहीं आएगा');
  }
  if (!$('#svc-areas').children.length) {
    for (let i = 0; i < 2; i += 1) vocabRow($('#svc-areas'), 'Upper Zone', 'ऊपरी ज़ोन');
  }
  if (!$('#svc-reasons').children.length) {
    vocabRow($('#svc-reasons'), 'Pipeline repair', 'पाइपलाइन की मरम्मत');
  }
}

function readVocab(sel) {
  return [...document.querySelectorAll(`${sel} .vocab-row`)]
    .map((r) => ({ en: r.querySelector('.v-en').value.trim(), hi: r.querySelector('.v-hi').value.trim() }))
    .filter((x) => x.en && x.hi);
}

async function addService() {
  const btn = $('#add-service');
  const kinds = readVocab('#svc-kinds');
  if (!kinds.length) return say(t('need_kind'), 'bad');
  btn.disabled = true;
  try {
    const res = await api('/api/services', {
      method: 'POST',
      body: JSON.stringify({
        slug: $('#svc-slug').value.trim().toLowerCase(),
        name_en: $('#svc-en').value.trim(),
        name_hi: $('#svc-hi').value.trim(),
        icon: $('#svc-icon').value.trim(),
        kinds,
        areas: readVocab('#svc-areas'),
        reasons: readVocab('#svc-reasons'),
      }),
    });
    if (!res.ok) return say((await res.json().catch(() => ({}))).error || 'error', 'bad');
    for (const id of ['#svc-en', '#svc-hi', '#svc-icon', '#svc-slug']) $(id).value = '';
    $('#svc-kinds').textContent = ''; $('#svc-reasons').textContent = ''; $('#svc-areas').textContent = '';
    ensureVocabRows();
    say(t('service_added'), 'ok');
    // A new service changes what this admin reaches, so reload everything.
    await showPostView();
  } finally {
    btn.disabled = false;
  }
}

// ---------- moving to another phone ----------

async function makeMove() {
  const btn = $('#move');
  btn.disabled = true;
  try {
    const res = await api('/api/me/move', { method: 'POST' });
    if (!res.ok) return say((await res.json().catch(() => ({}))).error || 'error', 'bad');
    moveUrl = (await res.json()).url;
    $('#move-url').textContent = moveUrl;
    paintQr('#move-qr', moveUrl, t('qr_alt'));
    $('#move-result').classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

async function shareMove() {
  if (!moveUrl) return;
  if (navigator.share) {
    try { await navigator.share({ text: moveUrl }); return; } catch { /* cancelled */ }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(moveUrl)}`, '_blank', 'noopener');
}

// ---------- wiring ----------

for (const b of document.querySelectorAll('.lang button')) {
  b.addEventListener('click', () => {
    lang = b.dataset.lang;
    paintStrings();
    theme?.repaint();
    if (me) {
      paintServices(); paintAreas(); paintKinds(); paintQuick(); paintReasons(); loadMine();
      paintAdmin();
    }
  });
}

$('#paste-go').addEventListener('click', () => {
  const found = parseInviteToken($('#paste').value);
  if (!found) return say(t('paste_bad'), 'bad');
  location.href = `/join#t=${found}`;
});
$('#paste').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#paste-go').click(); });

// Only offered where it can actually work — no camera, or an insecure origin,
// and the button would be a dead end rather than a choice.
if (scanSupported()) $('#scan').classList.remove('hidden');
$('#scan').addEventListener('click', async () => {
  let text;
  try {
    text = await openScanner(t);
  } catch (err) {
    return say(t(err.message) || t('scan_failed'), 'bad');
  }
  if (text === null) return;                     // backed out
  // Never navigate to what was scanned: take a token from it or nothing.
  const found = parseInviteToken(text);
  if (!found) return say(t('scan_notlink'), 'bad');
  location.href = `/join#t=${found}`;
});
$('#publish').addEventListener('click', publish);
$('#signout').addEventListener('click', signOut);
$('#make-invite').addEventListener('click', makeInvite);
$('#share-wa').addEventListener('click', shareInvite);
$('#copy-link').addEventListener('click', () => copyText(lastInviteUrl));
$('#add-area').addEventListener('click', addArea);
$('#new-en').addEventListener('input', suggestSlug);
$('#new-slug').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
$('#add-service').addEventListener('click', addService);
$('#add-kind-row').addEventListener('click', () => vocabRow($('#svc-kinds'), 'Advisory', 'सूचना'));
$('#add-reason-row').addEventListener('click', () => vocabRow($('#svc-reasons'), 'Tank cleaning', 'टंकी की सफ़ाई'));
$('#add-area-row').addEventListener('click', () => vocabRow($('#svc-areas'), 'Lower Zone', 'निचला ज़ोन'));
$('#svc-en').addEventListener('input', () => {
  const f = $('#svc-slug');
  if (f.dataset.touched === '1') return;
  f.value = $('#svc-en').value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 39);
});
$('#svc-slug').addEventListener('input', (e) => { e.target.dataset.touched = '1'; });
$('#move').addEventListener('click', makeMove);
$('#move-share').addEventListener('click', shareMove);
$('#move-copy').addEventListener('click', () => copyText(moveUrl));

const theme = initTheme(t);
initVersion();
paintStrings();
if (token) showPostView().catch(signOut);
else $('#join-view').classList.remove('hidden');

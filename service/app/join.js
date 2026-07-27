// The join face. An invite link lands here, once.

import { STRINGS, pickLang, setLang } from '/i18n.js';

let lang = pickLang();
const $ = (s) => document.querySelector(s);
const t = (k) => STRINGS[lang][k];
const flash = $('#flash');

// The token rides in the fragment so it stays out of server logs and Referer
// headers. Some in-app browsers rewrite links, so a ?t= query is accepted too.
function readToken() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  return hash.get('t') || new URLSearchParams(location.search).get('t') || '';
}

const token = readToken();
let invite = null;

function paintStrings() {
  setLang(lang);
  for (const el of document.querySelectorAll('[data-s]')) el.textContent = t(el.dataset.s);
  for (const b of document.querySelectorAll('.lang button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  }
  if (invite) paintInvite();
}

function paintInvite() {
  if (invite.move) {
    // Moving an existing person: nothing to fill in, they are already known.
    $('#invite-head').textContent = t('move_head').replace('{name}', invite.name);
    $('#invite-lede').textContent = t('move_lede');
    $('#new-fields').classList.add('hidden');
    $('#join').textContent = t('move_confirm');
    return;
  }
  const role = invite.role === 'admin' ? t('role_admin') : t('role_poster');
  $('#invite-head').textContent = t('join_as').replace('{team}', invite.team).replace('{role}', role);
  $('#invite-lede').textContent = t('join_lede2');
  $('#new-fields').classList.remove('hidden');
  $('#join').textContent = t('join');
}

function say(msg, kind = 'bad') {
  flash.textContent = msg;
  flash.className = `flash ${kind}`;
}

function show(which) {
  for (const id of ['checking', 'dead', 'ok']) {
    $(`#${id}`).classList.toggle('hidden', id !== which);
  }
}

async function check() {
  if (!token) return show('dead');
  try {
    const res = await fetch(`/api/invites/preview?t=${encodeURIComponent(token)}`);
    if (!res.ok) return show('dead');
    const data = await res.json();
    if (!data.valid) return show('dead');
    invite = data;
    paintInvite();
    show('ok');
  } catch {
    show('dead');
  }
}

async function join() {
  const moving = Boolean(invite?.move);
  const name = moving ? '' : $('#name').value.trim();
  if (!moving && !name) return say(t('need_name'));
  const btn = $('#join');
  btn.disabled = true;
  try {
    const res = await fetch('/api/invites/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(moving ? { token } : { token, name, phone: $('#phone').value.trim() }),
    });
    if (!res.ok) { show('dead'); return; }
    const data = await res.json();
    localStorage.setItem('kuhu.token', data.token);
    localStorage.setItem('kuhu.team', data.team);
    localStorage.setItem('kuhu.role', data.role);
    // Drop the (now spent) token from the URL before leaving.
    history.replaceState(null, '', '/join');
    location.href = '/post';
  } catch {
    say(t('offline'));
    btn.disabled = false;
  }
}

for (const b of document.querySelectorAll('.lang button')) {
  b.addEventListener('click', () => { lang = b.dataset.lang; paintStrings(); });
}
$('#join').addEventListener('click', join);
$('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

paintStrings();
check();

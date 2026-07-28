// The join face. An invite link lands here, once.

import { STRINGS, pickLang, setLang, parseInviteToken, isStandalone, isIOS, isInAppBrowser, initTheme, initVersion } from '/i18n.js';

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

let token = readToken();
let invite = null;

// Which storage warning applies here, if any — kept so the language toggle can
// repaint it (its text is chosen at runtime, so it has no data-s attribute).
let warnVariant = null;

function paintWarn() {
  if (!warnVariant) return;
  const p = warnVariant === 'inapp' ? 'inapp' : 'ios';
  $('#ios-warn-title').textContent = t(`${p}_warn_title`);
  $('#ios-warn-body').textContent = t(`${p}_warn_body`);
  $('#ios-go').textContent = t(`${p}_dismiss`);
}

function paintStrings() {
  setLang(lang);
  for (const el of document.querySelectorAll('[data-s]')) el.textContent = t(el.dataset.s);
  for (const b of document.querySelectorAll('.lang button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  }
  if (invite) paintInvite();
  paintWarn();
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
  const role = t(`role_${invite.role}`) || t('role_poster');
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
  // The paste fallback is offered whenever there is nothing valid to act on,
  // and hidden once there is.
  $('#paste-box').classList.toggle('hidden', which === 'ok');
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

    // Warn before the link is spent in a container that can't share the result.
    // iOS: the Home Screen app always signs in separately from Safari.
    // Android: an app's built-in browser (WhatsApp) is its own WebView.
    if (!isStandalone() && (isIOS() || isInAppBrowser())) {
      warnVariant = !isIOS() && isInAppBrowser() ? 'inapp' : 'ios';
      paintWarn();
      $('#ios-warn').classList.remove('hidden');
    }
  } catch {
    show('dead');
  }
}

/** Someone pasted a link instead of tapping one. Same destination, no reload —
 *  a hash change alone would not reload the page anyway. */
function goPasted() {
  const found = parseInviteToken($('#paste').value);
  if (!found) return say(t('paste_bad'));
  token = found;
  history.replaceState(null, '', `/join#t=${found}`);
  flash.className = 'flash hidden';
  show('checking');
  check();
}

async function copyLink() {
  const link = `${location.origin}/join#t=${token}`;
  try { await navigator.clipboard.writeText(link); say(t('copied'), 'ok'); }
  catch { say(link, 'ok'); }
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
  b.addEventListener('click', () => { lang = b.dataset.lang; paintStrings(); theme?.repaint(); });
}
$('#join').addEventListener('click', join);
$('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
$('#paste-go').addEventListener('click', goPasted);
$('#paste').addEventListener('keydown', (e) => { if (e.key === 'Enter') goPasted(); });
$('#ios-copy').addEventListener('click', copyLink);
$('#ios-go').addEventListener('click', () => $('#ios-warn').classList.add('hidden'));

const theme = initTheme(t);
initVersion();
paintStrings();
check();

// The help face. One page, three guides, and you are shown the one you can use.
//
// Gating is by role, asked of the server: /api/me is the same answer the app
// itself trusts. Worth being plain about what this is and is not — the guides
// are prose about how to work the app, not secrets, so this hides what is
// irrelevant to you rather than defending anything. Every real permission is
// enforced server-side, on the endpoints, where it counts.
//
// Seniors can read their juniors' guides on purpose: a site admin fielding
// "where did the Cancel button go?" should be able to see what a poster sees.

import { STRINGS, pickLang, setLang, initTheme, initVersion } from '/i18n.js';

let lang = pickLang();
const $ = (s) => document.querySelector(s);
const t = (k) => STRINGS[lang][k];

// Lowest first: a role may read its own guide and everything below it.
const LADDER = ['poster', 'service_admin', 'site_admin'];

let role = null;      // null = signed out
let showing = null;   // which guide is on screen

function readable() {
  const i = LADDER.indexOf(role);
  return i < 0 ? [] : LADDER.slice(0, i + 1);
}

function paintPicker() {
  const box = $('#guide-picker');
  const list = readable();
  box.textContent = '';
  // One guide to read means nothing to choose between.
  box.classList.toggle('hidden', list.length < 2);
  if (list.length < 2) return;
  for (const r of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = t(`help_guide_${r}`);
    b.setAttribute('aria-pressed', String(showing === r));
    b.addEventListener('click', () => { showing = r; paint(); });
    box.append(b);
  }
}

function paint() {
  setLang(lang);
  for (const el of document.querySelectorAll('[data-s]')) el.textContent = t(el.dataset.s);
  for (const b of document.querySelectorAll('.lang button')) {
    b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  }

  const list = readable();
  $('#help-anon').classList.toggle('hidden', list.length > 0);
  for (const r of LADDER) {
    $(`#guide-${r.replace('_', '-')}`).classList.toggle('hidden', showing !== r);
  }
  $('#help-lede').textContent = t(showing ? `help_lede_${showing}` : 'help_lede_anon');
  paintPicker();
  theme?.repaint();
}

async function whoami() {
  const token = localStorage.getItem('kuhu.token');
  if (!token) return;
  try {
    const res = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return;               // revoked or expired: treated as signed out
    const me = await res.json();
    if (LADDER.includes(me.role)) role = me.role;
  } catch {
    // Offline. The guides are cached, but we cannot prove who you are, so the
    // signed-out face is the honest thing to show.
  }
}

for (const b of document.querySelectorAll('.lang button')) {
  b.addEventListener('click', () => { lang = b.dataset.lang; paint(); });
}

const theme = initTheme(t);
initVersion();

// A deep link (/help#poster) wins, as long as you are allowed to read it.
const asked = location.hash.replace(/^#/, '').replace('-', '_');

await whoami();
showing = readable().includes(asked) ? asked : (role || null);
paint();

// Self-test for the screens themselves.
//
//   npm run test:ui
//
// The app has no build step, which is a feature — but it means nothing ever
// type-checks it, and a painter that stops being called fails silently: the
// static labels still render and the chips underneath are simply absent. That
// has now shipped twice. This bundles the REAL post.js with esbuild, runs it in
// jsdom against a stubbed API, and asserts the controls actually appear.
//
// It is not a substitute for looking at the thing on a phone. It only claims
// that the screen populated at all, which is exactly the class of bug that
// keeps getting through.

import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../app/', import.meta.url));

let failures = 0;
const check = (ok, what, detail = '') => {
  if (ok) console.log(`  ok   ${what}`);
  else { console.log(`  FAIL ${what}${detail ? ` — ${detail}` : ''}`); failures++; }
};

// The app imports its siblings by absolute path ("/i18n.js") because that is
// what the browser sees. Map those back onto the directory for bundling.
const rootRelative = {
  name: 'root-relative',
  setup(b) {
    // Only rewrite real imports. Entry points arrive here too, with an empty
    // importer, and are already absolute paths on disk.
    b.onResolve({ filter: /^\// }, (args) => (
      args.importer ? { path: appDir + args.path.slice(1) } : undefined
    ));
  },
};

async function bundle(entry) {
  const out = await build({
    entryPoints: [appDir + entry],
    bundle: true,
    // ESM, because help.js uses top-level await and an IIFE cannot express it.
    // The entries export nothing, so wrapping the result in an async function
    // is enough to run it as a classic script — which is all jsdom will take.
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: [rootRelative],
    write: false,
  });
  return `(async () => {\n${out.outputFiles[0].text}\n})();`;
}

// ---- what the server would say ----
const ME = {
  name: 'Tester',
  team: 'kuhu',
  role: 'site_admin',
  services: [{
    slug: 'electricity',
    name_en: 'Electricity',
    name_hi: 'बिजली',
    icon: '⚡',
    accent: '#e0a458',
    kinds: [{ key: 'cut', name_en: 'Power cut', name_hi: 'बिजली कटौती' }],
    reasons: [{ name_en: 'Line work', name_hi: 'लाइन का काम' }],
    regions: [
      { slug: 'kangra', name_en: 'Kangra', name_hi: 'कांगड़ा', parent: null, leaf: false },
      { slug: 'naddi', name_en: 'Naddi', name_hi: 'नड्डी', parent: 'kangra', leaf: true },
      { slug: 'sidhpur', name_en: 'Sidhpur', name_hi: 'सिद्धपुर', parent: null, leaf: true },
    ],
  }],
  can: {
    invite: true, manage_people: true, manage_coverage: true,
    manage_areas: true, manage_services: true,
  },
};

const ROUTES = {
  '/api/me': ME,
  '/api/version': { version: 'test' },
  '/api/team/notices': { notices: [] },
  '/api/invites': { invites: [] },
  '/api/team/members': { members: [
    { id: 1, name: 'Anish', role: 'site_admin', team_name: 'kuhu', is_you: true, can_remove: false },
    { id: 2, name: 'Sohail', role: 'poster', team_name: 'Local line crew', service_slug: 'electricity', can_remove: true },
    { id: 3, name: 'Old', role: 'poster', team_name: 'Local line crew', revoked_at: '2026-01-01', can_remove: false },
  ] },
  '/api/services/electricity/areas': { areas: ME.services[0].regions },
  '/api/services': { services: ME.services },
};

async function runPage(page, entry) {
  const html = readFileSync(appDir + page, 'utf8');
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', (e) => errors.push(e.message));
  virtualConsole.on('error', (...a) => errors.push(a.join(' ')));

  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://kuhu.test/post', virtualConsole });
  const { window } = dom;

  window.fetch = async (url) => {
    const path = String(url).split('?')[0].replace('https://kuhu.test', '');
    const body = ROUTES[path];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      json: async () => body ?? {},
    };
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.localStorage.setItem('kuhu.token', 'test-token');
  window.navigator.serviceWorker = { register: async () => {}, getRegistrations: async () => [] };

  const script = window.document.createElement('script');
  script.textContent = await bundle(entry);
  window.document.body.append(script);

  // Let the module's own awaits settle.
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
  return { window, errors };
}

console.log('\n/post as a site admin');
const { window, errors } = await runPage('post.html', 'post.js');
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];

check(errors.length === 0, 'the page runs without throwing', errors[0]);
check(!$('#post-view').classList.contains('hidden'), 'the posting view is shown');
check(!$('#admin-view').classList.contains('hidden'), 'the admin section is shown');

console.log('\nthe invite form is actually populated');
// The regression: labels are static markup and rendered fine while every
// JS-built control underneath was missing.
check($$('#invite-role button').length === 3, 'all three roles are offered to a site admin',
  `${$$('#invite-role button').length} buttons`);
check($$('#invite-hours button').length === 3, 'the three durations are offered',
  `${$$('#invite-hours button').length} buttons`);
check($$('#invite-role button[aria-pressed="true"]').length === 1, 'exactly one role starts selected');
check($$('#invite-hours button[aria-pressed="true"]').length === 1, 'exactly one duration starts selected');
check($$('#invite-service button').length >= 1, 'a service can be chosen');
check(!$('#invite-service-row').classList.contains('hidden'),
  'the service picker is shown even with one service');

console.log('\npicking a role changes what is asked for');
{
  const areasRow = $('#invite-areas-row');
  check(!areasRow.classList.contains('hidden'), 'a poster invite asks which areas');
  check($$('#invite-areas button').length >= 2, 'and lists them', `${$$('#invite-areas button').length}`);

  const svcAdmin = $$('#invite-role button').find((b) => b.textContent.includes('Service'));
  svcAdmin.dispatchEvent(new window.Event('click'));
  check(areasRow.classList.contains('hidden'), 'a service admin invite does not ask for areas');
  check(!$('#invite-service-row').classList.contains('hidden'), 'but still asks which service');
  check(svcAdmin.getAttribute('aria-pressed') === 'true'
    || $$('#invite-role button').some((b) => b.textContent.includes('Service') && b.getAttribute('aria-pressed') === 'true'),
    'and the role actually sticks when clicked');

  const siteAdmin = $$('#invite-role button').find((b) => b.textContent.includes('Site'));
  siteAdmin.dispatchEvent(new window.Event('click'));
  check($('#invite-service-row').classList.contains('hidden'),
    'a site admin invite asks for neither — they span everything');
}

console.log('\npeople are grouped by the team they sit in');
{
  const heads = $$('#members .team-head').map((h) => h.textContent);
  check(heads.length === 2, 'each team gets its own heading', heads.join(' / '));
  check(heads.includes('kuhu') && heads.includes('Local line crew'),
    'and the headings are the team names', heads.join(' / '));
  check($$('#members .row').length === 3, 'everyone is still listed');
  check(!$$('#members .row')[0].textContent.includes('kuhu'),
    'the team is no longer repeated on every row');
  check($('#members-help').textContent.length > 0, 'and the list says what it is');
}

console.log('\nan admin can change one poster\u2019s areas');
{
  const rows = $$('#members .row');
  const sohail = rows.find((r) => r.textContent.includes('Sohail'));
  const you = rows.find((r) => r.textContent.includes('Anish'));
  const areasBtn = [...sohail.querySelectorAll('button')].find((b) => b.textContent === 'Areas');
  check(Boolean(areasBtn), 'a poster row offers an Areas button');
  check(![...you.querySelectorAll('button')].some((b) => b.textContent === 'Areas'),
    'a site admin row does not — they are not limited by area');
  areasBtn.dispatchEvent(new window.Event('click'));
  const form = sohail.querySelector('.rename-form');
  check(Boolean(form), 'it opens a picker');
  check(form.querySelectorAll('button.chip').length >= 2, 'listing that service\u2019s areas');
  check(form.querySelectorAll('.rgroup').length === 1, 'with the region shown as a group');
}

console.log('\ncoverage and the area list show the hierarchy');
{
  check($$('#coverage .rgroup').length === 1, 'coverage chips are grouped by region',
    `${$$('#coverage .rgroup').length}`);
  check($$('#coverage .chip.whole').length === 1, 'and the region itself is coverable');
  const nested = $$('#areas-all .row.nested');
  check(nested.length === 1, 'the area list indents what sits inside something',
    `${nested.length} nested`);
  check(nested[0].textContent.includes('Naddi'), 'and it is the right one');
}

console.log('\nthe posting picker groups areas under their region');
check($$('#areas .rgroup').length === 1, 'the region becomes a group', `${$$('#areas .rgroup').length}`);
check($$('#areas .chip.whole').length === 1, 'with an "all of it" chip');

console.log('\nother screens still bootstrap');
for (const [page, entry] of [['index.html', 'subscribe.js'], ['join.html', 'join.js'], ['help.html', 'help.js']]) {
  const r = await runPage(page, entry);
  check(r.errors.length === 0, `${page} runs without throwing`, r.errors[0]);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

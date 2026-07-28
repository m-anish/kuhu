// Self-test for the hand-rolled QR encoder in app/qr.js.
//
//   npm run test:qr
//
// Two independent checks, because they catch different things:
//
//   1. Round-trip through the vendored decoder. This is the one that matters —
//      not "does it agree with another encoder" but "does a scanner read back
//      what we put in". Runs always.
//   2. Module-for-module comparison against qrcode@1.5.4, mask choice included.
//      Catches subtler drift than round-tripping can, since a code with a
//      suboptimal mask still decodes fine. Skipped if the dev dep is absent.
//
// Note for (2): qrcode splits input into numeric/alphanumeric segments by
// default, which legitimately produces a different symbol. Byte mode is forced
// so the two encoders are actually being asked the same question.

import { createRequire } from 'node:module';
import jsQR from '../app/vendor/jsqr.js';
import { qrMatrix, qrSvg } from '../app/qr.js';

const require = createRequire(import.meta.url);
const LEVELS = ['L', 'M', 'Q', 'H'];

function corpus() {
  const out = ['a', 'kuhu', '⚡', 'नड्डी — बिजली कटौती', 'https://kuhu.starstucklab.com'];
  // The real shape: an invite URL with a 32-character token.
  for (let i = 0; i < 30; i++) {
    out.push(`https://kuhuapp.starstucklab.com/join#t=${Buffer.from(`tok${i}`).toString('base64url').padEnd(32, 'Zz')}`);
  }
  // Lengths straddling every structural boundary: version bumps, the v7
  // version-info block, and the v10 switch to a 16-bit character count.
  for (let n = 1; n <= 120; n++) out.push('x'.repeat(n));
  for (const n of [153, 154, 271, 272, 321, 322, 700, 1273, 1274, 2000]) out.push('y'.repeat(n));
  return out;
}

/** Render to RGBA exactly as a screen would, quiet zone included. */
function render(m, scale = 4, quiet = 4) {
  const size = m.length;
  const dim = (size + quiet * 2) * scale;
  const px = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!m[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const o = (((y + quiet) * scale + dy) * dim + (x + quiet) * scale + dx) * 4;
          px[o] = px[o + 1] = px[o + 2] = 0;
        }
      }
    }
  }
  return { data: px, width: dim, height: dim };
}

let failures = 0;
const fail = (msg) => { console.log(`  FAIL ${msg}`); failures++; };

// ---- 1. round-trip ----
{
  let n = 0;
  for (const ecl of LEVELS) {
    for (const text of corpus()) {
      let m;
      try { m = qrMatrix(text, ecl); } catch { continue; }   // beyond version 40
      const img = render(m);
      const got = jsQR(img.data, img.width, img.height);
      if (!got) fail(`ecl=${ecl} len=${text.length}: did not decode`);
      else if (got.data !== text) fail(`ecl=${ecl} len=${text.length}: decoded as ${JSON.stringify(got.data.slice(0, 40))}`);
      else n++;
    }
  }
  console.log(`round-trip: ${n} codes encoded and decoded`);
}

// ---- 2. reference comparison ----
let QRCode = null;
try { QRCode = require('qrcode'); } catch { /* dev dep not installed */ }

if (!QRCode) {
  console.log('reference: skipped (npm i -D qrcode to enable)');
} else {
  let n = 0;
  let rejected = 0;
  for (const ecl of LEVELS) {
    for (const text of corpus()) {
      let ref = null;
      let mine = null;
      let refErr = false;
      let myErr = false;
      try { ref = QRCode.create([{ data: text, mode: 'byte' }], { errorCorrectionLevel: ecl }); } catch { refErr = true; }
      try { mine = qrMatrix(text, ecl); } catch { myErr = true; }

      if (refErr && myErr) { rejected++; continue; }
      if (refErr !== myErr) { fail(`ecl=${ecl} len=${text.length}: disagree on whether it fits`); continue; }

      const size = ref.modules.size;
      if (mine.length !== size) {
        fail(`ecl=${ecl} len=${text.length}: version ${(mine.length - 17) / 4} vs ${(size - 17) / 4}`);
        continue;
      }
      let diff = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (Boolean(mine[y][x]) !== Boolean(ref.modules.get(y, x))) diff++;
        }
      }
      if (diff) fail(`ecl=${ecl} len=${text.length}: ${diff} modules differ`);
      else n++;
    }
  }
  console.log(`reference: ${n} matrices identical to qrcode@${require('qrcode/package.json').version}, ${rejected} rejected by both`);
}

// ---- 3. the SVG path itself ----
// The round-trip above exercises qrMatrix, not the run-length merging in
// qrSvg — a bug there would emit a wrong image from a correct matrix. Parse
// the emitted path back into a grid and require it to match exactly.
{
  let n = 0;
  for (const text of corpus().slice(0, 40)) {
    const m = qrMatrix(text, 'M');
    const svg = qrSvg(text, { ecl: 'M', margin: 4 });
    const grid = m.map((r) => r.map(() => false));
    const d = svg.match(/ d="([^"]*)"/)[1];
    for (const [, x, y, run] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let i = 0; i < Number(run); i++) grid[Number(y) - 4][Number(x) - 4 + i] = true;
    }
    const same = grid.every((row, y) => row.every((v, x) => v === m[y][x]));
    if (!same) fail(`svg path does not reproduce the matrix for len=${text.length}`);
    else n++;
  }
  console.log(`svg path: ${n} paths reproduce their matrix exactly`);
}

// ---- 4. the SVG wrapper ----
{
  const svg = qrSvg('https://kuhuapp.starstucklab.com/join#t=abc', { label: 'invite' });
  const stripped = svg.replace(/<title>.*?<\/title>/, '');
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) fail('svg is not well-formed');
  if (/https?:\/\/(?!www\.w3\.org)/.test(stripped)) fail('svg references something external');
  if (!svg.includes('fill="#fff"') || !svg.includes('fill="#000"')) fail('svg is not fixed dark-on-white');
  if (!svg.includes('<title>invite</title>')) fail('svg has no accessible title');
  console.log('svg wrapper: checked');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

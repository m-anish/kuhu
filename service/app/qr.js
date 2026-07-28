// A QR encoder, byte mode, versions 1–40.
//
// Hand-rolled for the same reason the MQTT client and the VAPID signer are:
// it is a closed, well-specified problem, and a dependency here would be a
// dependency on every phone that opens the app. Encoding is the easy half of
// QR — decoding is not, and that one is vendored.
//
// The structure follows Nayuki's derivation, which is the neat one: rather
// than carrying the full 160-row block table from the spec, everything falls
// out of two tables and the raw module count for a version.
//
// Deliberately not themed. A QR is always dark-on-white regardless of the
// app's palette — inverted codes scan unreliably on cheap cameras, and this
// is the one screen where "looks right in dark mode" loses to "scans".

const ECL = { L: 0, M: 1, Q: 2, H: 3 };
// Format-info bit patterns; not the same order as the table indices above.
const ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

// Per EC level, indexed by version (index 0 unused).
const ECC_PER_BLOCK = [
  // L
  [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // M
  [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // Q
  [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // H
  [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_BLOCKS = [
  [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

/** Total modules available to data+ecc for a version, before the 8-bit floor. */
function rawDataModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

function totalCodewords(ver) { return Math.floor(rawDataModules(ver) / 8); }

function dataCapacityBytes(ver, ecl) {
  const total = totalCodewords(ver);
  const ecc = ECC_PER_BLOCK[ECL[ecl]][ver] * NUM_BLOCKS[ECL[ecl]][ver];
  // Mode indicator (4 bits) + character count (8 or 16) rounded to whole bytes.
  const header = ver <= 9 ? 2 : 3;
  return total - ecc - header;
}

function alignPositions(ver) {
  if (ver === 1) return [];
  const size = ver * 4 + 17;
  const n = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// ---------- GF(256), primitive polynomial 0x11D ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) { return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]; }

/** Generator polynomial of the given degree. */
function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly.slice(1); // drop the leading 1; only remainder coefficients matter
}

function rsRemainder(data, degree) {
  const gen = rsGenerator(degree);
  const rem = new Uint8Array(degree);
  for (const b of data) {
    const factor = b ^ rem[0];
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(gen[i], factor);
  }
  return rem;
}

// ---------- bitstream → codewords ----------

function encodeData(bytes, ver, ecl) {
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };

  push(0b0100, 4);                       // byte mode
  push(bytes.length, ver <= 9 ? 8 : 16); // character count
  for (const b of bytes) push(b, 8);

  const total = totalCodewords(ver);
  const ecc = ECC_PER_BLOCK[ECL[ecl]][ver] * NUM_BLOCKS[ECL[ecl]][ver];
  const capacityBits = (total - ecc) * 8;

  push(0, Math.min(4, capacityBits - bits.length));   // terminator
  push(0, (8 - (bits.length % 8)) % 8);               // to a byte boundary
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

  const words = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bits.length; i++) words[i >>> 3] |= bits[i] << (7 - (i & 7));
  return words;
}

/** Split into blocks, add ECC to each, then interleave as the spec requires. */
function addEcc(data, ver, ecl) {
  const numBlocks = NUM_BLOCKS[ECL[ecl]][ver];
  const eccLen = ECC_PER_BLOCK[ECL[ecl]][ver];
  const total = totalCodewords(ver);
  const shortLen = Math.floor(total / numBlocks) - eccLen;
  const numShort = numBlocks - (total % numBlocks);

  const blocks = [];
  const eccs = [];
  for (let i = 0, off = 0; i < numBlocks; i++) {
    const len = shortLen + (i < numShort ? 0 : 1);
    const block = data.subarray(off, off + len);
    off += len;
    blocks.push(block);
    eccs.push(rsRemainder(block, eccLen));
  }

  const out = [];
  for (let i = 0; i < shortLen + 1; i++) {
    for (let b = 0; b < numBlocks; b++) if (i < blocks[b].length) out.push(blocks[b][i]);
  }
  for (let i = 0; i < eccLen; i++) for (let b = 0; b < numBlocks; b++) out.push(eccs[b][i]);
  return Uint8Array.from(out);
}

// ---------- module placement ----------

function newGrid(size, fill) {
  return Array.from({ length: size }, () => new Array(size).fill(fill));
}

function drawFunctionPatterns(mods, fn, ver) {
  const size = mods.length;
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    mods[y][x] = v;
    fn[y][x] = true;
  };

  // Timing patterns.
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

  // Finder patterns, with their separators.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  }

  // Alignment patterns, skipping the three that would sit on a finder.
  const pos = alignPositions(ver);
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(pos[j] + dx, pos[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve the format areas; real values are written after masking.
  drawFormat(mods, fn, 'M', 0, true);

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit);
      set(b, a, bit);
    }
  }
}

function drawFormat(mods, fn, ecl, mask, reserveOnly) {
  const size = mods.length;
  const data = (ECL_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const at = (i) => (reserveOnly ? false : ((bits >>> i) & 1) === 1);
  const set = (x, y, v) => { mods[y][x] = v; fn[y][x] = true; };

  for (let i = 0; i <= 5; i++) set(8, i, at(i));
  set(8, 7, at(6));
  set(8, 8, at(7));
  set(7, 8, at(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, at(i));

  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, at(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, at(i));
  set(8, size - 8, true); // the always-dark module
}

function drawCodewords(mods, fn, data) {
  const size = mods.length;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing column is skipped whole
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && i < data.length * 8) {
          mods[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(mods, fn, mask) {
  const size = mods.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!fn[y][x] && MASKS[mask](x, y)) mods[y][x] = !mods[y][x];
    }
  }
}

/** The four penalty rules from the spec. Lower is better. */
function penalty(mods) {
  const size = mods.length;
  let score = 0;

  const runScore = (line) => {
    let n = 0;
    let run = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) { run++; continue; }
      if (run >= 5) n += 3 + (run - 5);
      run = 1;
    }
    return n;
  };

  for (let y = 0; y < size; y++) score += runScore(mods[y]);
  for (let x = 0; x < size; x++) score += runScore(mods.map((r) => r[x]));

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const a = mods[y][x];
      if (a === mods[y][x + 1] && a === mods[y + 1][x] && a === mods[y + 1][x + 1]) score += 3;
    }
  }

  // Finder-lookalikes: the 11-module sequences 10111010000 and 00001011101,
  // scanned as a sliding window that must sit wholly inside the symbol. The
  // window has to be exact — an "or four light modules on either side" reading
  // of the rule scores differently at the edges and picks other masks.
  const scanLine = (get) => {
    let bits = 0;
    for (let i = 0; i < size; i++) {
      bits = ((bits << 1) & 0x7ff) | (get(i) ? 1 : 0);
      if (i >= 10 && (bits === 0x5d0 || bits === 0x05d)) score += 40;
    }
  };
  for (let y = 0; y < size; y++) scanLine((x) => mods[y][x]);
  for (let x = 0; x < size; x++) scanLine((y) => mods[y][x]);

  let dark = 0;
  for (const row of mods) for (const v of row) if (v) dark++;
  const pct = (dark * 100) / (size * size);
  score += Math.abs(Math.ceil(pct / 5) - 10) * 10;

  return score;
}

/**
 * Encode text as a QR matrix.
 * @returns {boolean[][]} true = dark module.
 */
export function qrMatrix(text, ecl = 'M') {
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  while (ver <= 40 && bytes.length > dataCapacityBytes(ver, ecl)) ver++;
  if (ver > 40) throw new Error('too much data for one QR code');

  const codewords = addEcc(encodeData(bytes, ver, ecl), ver, ecl);
  const size = ver * 4 + 17;
  const mods = newGrid(size, false);
  const fn = newGrid(size, false);

  drawFunctionPatterns(mods, fn, ver);
  drawCodewords(mods, fn, codewords);

  // Try all eight masks and keep the least ugly, as the spec asks.
  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mods, fn, mask);
    drawFormat(mods, fn, ecl, mask, false);
    const s = penalty(mods);
    if (s < bestScore) { bestScore = s; best = mods.map((r) => r.slice()); }
    applyMask(mods, fn, mask); // XOR again to undo
  }
  return best;
}

/**
 * Encode text as a standalone SVG string.
 * Always dark-on-white: see the note at the top of this file.
 */
export function qrSvg(text, { ecl = 'M', margin = 4, label = '' } = {}) {
  const m = qrMatrix(text, ecl);
  const size = m.length;
  const dim = size + margin * 2;

  // One path for every dark module, runs merged along each row so the markup
  // stays small enough to sit inline in the DOM.
  const parts = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!m[y][x]) { x++; continue; }
      let run = 1;
      while (x + run < size && m[y][x + run]) run++;
      parts.push(`M${x + margin} ${y + margin}h${run}v1h-${run}z`);
      x += run;
    }
  }

  const title = label ? `<title>${label.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" `
    + `width="100%" height="100%" shape-rendering="crispEdges" role="img">`
    + `${title}<rect width="${dim}" height="${dim}" fill="#fff"/>`
    + `<path d="${parts.join('')}" fill="#000"/></svg>`;
}

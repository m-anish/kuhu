// Re-vendor the QR *decoder* into app/vendor/jsqr.js.
//
// Encoding is ours (app/qr.js); decoding is not. A QR decoder means image
// binarisation, perspective correction and Reed-Solomon error correction over
// a camera frame, and hand-rolling that would be a bad trade.
//
// jsQR ships only a 257 KB unminified UMD bundle, which is both too big to
// send to a phone and not loadable as an ES module. This converts it once,
// and records exactly what went in, so the committed file can be audited
// against upstream rather than taken on trust.
//
//   npm run vendor:jsqr
//
// Re-run it when the pinned version in package.json changes, and commit the
// result together with the provenance line it prints.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('jsqr/package.json');
const entry = require.resolve('jsqr');

const upstream = await readFile(entry);
const sha = createHash('sha256').update(upstream).digest('hex');

const out = new URL('../app/vendor/', import.meta.url);
await mkdir(out, { recursive: true });

const result = await build({
  stdin: {
    contents: `export { default } from ${JSON.stringify(entry)};`,
    resolveDir: new URL('.', import.meta.url).pathname,
  },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  platform: 'browser',
  legalComments: 'none',
  write: false,
});

const banner = [
  '// VENDORED — do not edit by hand. Regenerate with: npm run vendor:jsqr',
  `// jsQR v${pkg.version} — ${pkg.license} — https://github.com/cozmo/jsQR`,
  `// built from ${pkg.name}/dist/jsQR.js, sha256 ${sha}`,
  '',
].join('\n');

const code = banner + result.outputFiles[0].text;
await writeFile(new URL('jsqr.js', out), code);

console.log(`app/vendor/jsqr.js  ${(code.length / 1024).toFixed(1)} KB`);
console.log(`jsQR v${pkg.version}  upstream sha256 ${sha}`);

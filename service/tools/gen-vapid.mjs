// Generate a VAPID keypair for web push.
//
//   node tools/gen-vapid.mjs
//
// Prints the public key (put it in wrangler.toml as VAPID_PUBLIC_KEY) and the
// private JWK (feed it to `wrangler secret put VAPID_PRIVATE_JWK`). Generate
// once per deployment and never rotate casually — changing the public key
// invalidates every existing push subscription, and every subscriber would
// have to tap "Notify me" again.

import { webcrypto as crypto } from 'node:crypto';

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

const rawPublic = await crypto.subtle.exportKey('raw', pair.publicKey);
const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);

const b64url = (buf) => Buffer.from(buf).toString('base64url');

console.log('\nVAPID_PUBLIC_KEY (wrangler.toml [vars]):\n');
console.log(b64url(rawPublic));
console.log('\nVAPID_PRIVATE_JWK (wrangler secret put VAPID_PRIVATE_JWK):\n');
console.log(JSON.stringify(privateJwk));
console.log();

// Web push, the quiet way.
//
// kuhu sends *payloadless* pushes ("tickles"): no RFC 8291 payload encryption,
// just a VAPID-signed POST to the subscription endpoint. The service worker
// wakes, asks /api/subscriptions/pending what's new for its regions, and shows
// one notification. Less cryptography, same silence between notices.

import { b64url } from './util.js';

let cachedKey = null;

async function privateKey(env) {
  if (!cachedKey) {
    cachedKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(env.VAPID_PRIVATE_JWK),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
  }
  return cachedKey;
}

/** RFC 8292 VAPID authorization header for one push endpoint's origin. */
async function vapidAuth(endpoint, env) {
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT,
  })));
  const unsigned = `${header}.${claims}`;
  // WebCrypto ECDSA emits raw r||s — exactly what JWS ES256 wants.
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await privateKey(env),
    enc.encode(unsigned),
  );
  return `vapid t=${unsigned}.${b64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/**
 * Tickle every subscription following ANY of these areas FOR THIS SERVICE —
 * each one once, however many of the areas they follow. A notice about four
 * areas is still one thing that happened, and one buzz is the whole promise of
 * this app. The service is part of the match: someone who wants water notices
 * for the village must not be woken by an electricity notice for it.
 *
 * Dead endpoints (404/410) are pruned. Runs in ctx.waitUntil, so the poster
 * never waits on fan-out.
 */
export async function notifyRegions(db, env, serviceId, regionIds) {
  const ids = [...new Set(regionIds)].filter((id) => id != null);
  if (ids.length === 0) return;
  const marks = ids.map((_, i) => `?${i + 2}`).join(',');
  const { results: subs } = await db.prepare(
    `SELECT DISTINCT s.id, s.endpoint FROM subscriptions s
     JOIN subscription_regions sr ON sr.subscription_id = s.id
     WHERE sr.service_id = ?1 AND sr.region_id IN (${marks})`,
  ).bind(serviceId, ...ids).all();

  for (const sub of subs) {
    try {
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapidAuth(sub.endpoint, env),
          TTL: '86400',
          Urgency: 'normal',
        },
      });
      if (res.status === 404 || res.status === 410) {
        await db.prepare('DELETE FROM subscriptions WHERE id = ?1').bind(sub.id).run();
      }
      // Drain the body so the subrequest completes cleanly.
      await res.arrayBuffer().catch(() => {});
    } catch {
      // One unreachable push service shouldn't silence the rest.
    }
  }
}

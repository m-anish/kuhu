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
 * Someone subscribed to a REGION hears about every area inside it. That
 * expansion happens here, at notify time, and not when they subscribed —
 * expanding at subscribe time would freeze the choice, so an area added under
 * Kangra next year would reach nobody who had already picked Kangra. So walk
 * UP from the notice's areas to their ancestors and match against that.
 *
 * The SELECT DISTINCT is doing real work now: somebody subscribed to both
 * Kangra and to Naddi inside it matches twice and must still be woken once.
 *
 * Dead endpoints (404/410) are pruned. Runs in ctx.waitUntil, so the poster
 * never waits on fan-out.
 */
export async function subscribersForRegions(db, serviceId, regionIds) {
  const ids = [...new Set(regionIds)].filter((id) => id != null);
  if (ids.length === 0) return [];
  const marks = ids.map((_, i) => `?${i + 2}`).join(',');
  const { results } = await db.prepare(
    `WITH RECURSIVE above(id, parent_id) AS (
       SELECT id, parent_id FROM regions WHERE id IN (${marks})
       UNION
       SELECT r.id, r.parent_id FROM regions r JOIN above ON r.id = above.parent_id
     )
     SELECT DISTINCT s.id, s.endpoint FROM subscriptions s
     JOIN subscription_regions sr ON sr.subscription_id = s.id
     WHERE sr.service_id = ?1 AND sr.region_id IN (SELECT id FROM above)`,
  ).bind(serviceId, ...ids).all();
  return results;
}

export async function notifyRegions(db, env, serviceId, regionIds) {
  const subs = await subscribersForRegions(db, serviceId, regionIds);

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

// kuhu — the service. Cloudflare Worker + D1.
// API surface (all JSON, CORS-open on GET):
//
//   GET  /api/regions                      list regions
//   GET  /api/regions/:slug/next-cuts      upcoming notices for one region (cacheable)
//   GET  /api/vapid-key                    the push public key
//   POST /api/auth/claim                   invite code + name → poster token
//   POST /api/notices                      publish a notice           (Bearer)
//   POST /api/notices/:id/cancel           cancel a notice            (Bearer)
//   GET  /api/team/regions                 regions this poster may post to (Bearer)
//   GET  /api/team/notices                 team's upcoming notices    (Bearer)
//   POST /api/subscriptions                create/replace a push subscription
//   DELETE /api/subscriptions              remove one (by endpoint)
//   POST /api/subscriptions/pending        what the service worker asks on push

import { json, badRequest, unauthorized, notFound, corsPreflight, randomId, randomToken, sha256hex, isIsoDate } from './util.js';
import { notifyRegion } from './push.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return corsPreflight();
    try {
      return await route(request, env, ctx, url);
    } catch (err) {
      console.error(err.stack || err);
      return json({ error: 'server_error' }, 500);
    }
  },
};

async function route(request, env, ctx, url) {
  const db = env.DB;
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  // ---------- public: regions ----------
  if (method === 'GET' && path === '/api/regions') {
    const { results } = await db.prepare(
      'SELECT slug, name_en, name_hi FROM regions ORDER BY slug',
    ).all();
    return json({ regions: results }, 200, { 'cache-control': 'public, max-age=300' });
  }

  const nextCuts = path.match(/^\/api\/regions\/([a-z0-9-]+)\/next-cuts$/);
  if (method === 'GET' && nextCuts) {
    const region = await db.prepare(
      'SELECT id, slug, name_en, name_hi FROM regions WHERE slug = ?1',
    ).bind(nextCuts[1]).first();
    if (!region) return notFound();
    const { results } = await db.prepare(
      `SELECT id, kind, win_from, win_to, reason_en, reason_hi, status, posted_at
       FROM notices
       WHERE region_id = ?1 AND status = 'scheduled' AND datetime(win_to) > datetime('now')
       ORDER BY datetime(win_from) LIMIT 20`,
    ).bind(region.id).all();
    return json({
      region: { slug: region.slug, name_en: region.name_en, name_hi: region.name_hi },
      notices: results.map(publicNotice),
    }, 200, { 'cache-control': 'public, max-age=60' });
  }

  if (method === 'GET' && path === '/api/vapid-key') {
    return json({ key: env.VAPID_PUBLIC_KEY }, 200, { 'cache-control': 'public, max-age=86400' });
  }

  // ---------- posters: claim + publish ----------
  if (method === 'POST' && path === '/api/auth/claim') {
    const body = await request.json().catch(() => null);
    const code = (body?.code || '').trim();
    const name = (body?.name || '').trim().slice(0, 60);
    if (!code || !name) return badRequest('code and name are required');
    const team = await db.prepare(
      'SELECT id, name FROM teams WHERE invite_code = ?1',
    ).bind(code).first();
    if (!team) return unauthorized();
    const token = randomToken();
    await db.prepare(
      'INSERT INTO posters (team_id, name, token_hash) VALUES (?1, ?2, ?3)',
    ).bind(team.id, name, await sha256hex(token)).run();
    const regions = (await teamRegions(db, team.id)).map(({ slug, name_en, name_hi }) => ({ slug, name_en, name_hi }));
    return json({ token, team: team.name, regions });
  }

  // Everything below on the poster side needs a token.
  if (method === 'POST' && path === '/api/notices') {
    const poster = await authPoster(db, request);
    if (!poster) return unauthorized();
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('invalid json');
    const { region: slug, from, to, kind = 'cut' } = body;
    let { reason_en = '', reason_hi = '' } = body;
    reason_en = String(reason_en).trim().slice(0, 200);
    reason_hi = String(reason_hi).trim().slice(0, 200);
    if (!['cut', 'advisory', 'restored'].includes(kind)) return badRequest('bad kind');
    if (!isIsoDate(from) || !isIsoDate(to) || Date.parse(from) >= Date.parse(to)) {
      return badRequest('bad window');
    }
    if (!reason_en && !reason_hi) return badRequest('a reason, in either language');
    const region = (await teamRegions(db, poster.team_id)).find((r) => r.slug === slug);
    if (!region) return unauthorized();
    const id = randomId('ntc');
    await db.prepare(
      `INSERT INTO notices (id, region_id, kind, win_from, win_to, reason_en, reason_hi, posted_by)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(id, region.id, kind, from, to, reason_en, reason_hi, poster.id).run();
    ctx.waitUntil(notifyRegion(db, env, region.id));
    return json({ id, status: 'scheduled' }, 201);
  }

  const cancel = path.match(/^\/api\/notices\/(ntc_[a-z0-9]+)\/cancel$/);
  if (method === 'POST' && cancel) {
    const poster = await authPoster(db, request);
    if (!poster) return unauthorized();
    const notice = await db.prepare(
      'SELECT id, region_id FROM notices WHERE id = ?1 AND status = ?2',
    ).bind(cancel[1], 'scheduled').first();
    if (!notice) return notFound();
    const allowed = (await teamRegions(db, poster.team_id)).some((r) => r.id === notice.region_id);
    if (!allowed) return unauthorized();
    await db.prepare("UPDATE notices SET status = 'cancelled' WHERE id = ?1").bind(notice.id).run();
    ctx.waitUntil(notifyRegion(db, env, notice.region_id));
    return json({ id: notice.id, status: 'cancelled' });
  }

  if (method === 'GET' && path === '/api/team/regions') {
    const poster = await authPoster(db, request);
    if (!poster) return unauthorized();
    const regions = (await teamRegions(db, poster.team_id)).map(({ slug, name_en, name_hi }) => ({ slug, name_en, name_hi }));
    return json({ team_id: poster.team_id, poster: poster.name, regions });
  }

  if (method === 'GET' && path === '/api/team/notices') {
    const poster = await authPoster(db, request);
    if (!poster) return unauthorized();
    const regions = await teamRegions(db, poster.team_id);
    if (regions.length === 0) return json({ notices: [] });
    const marks = regions.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await db.prepare(
      `SELECT n.id, n.kind, n.win_from, n.win_to, n.reason_en, n.reason_hi, n.status, n.posted_at,
              r.slug AS region_slug, r.name_en AS region_en, r.name_hi AS region_hi
       FROM notices n JOIN regions r ON r.id = n.region_id
       WHERE n.region_id IN (${marks}) AND datetime(n.win_to) > datetime('now', '-1 day')
       ORDER BY datetime(n.win_from) DESC LIMIT 50`,
    ).bind(...regions.map((r) => r.id)).all();
    return json({ notices: results.map((n) => ({ ...publicNotice(n), region: { slug: n.region_slug, name_en: n.region_en, name_hi: n.region_hi } })) });
  }

  // ---------- subscribers ----------
  if (method === 'POST' && path === '/api/subscriptions') {
    const body = await request.json().catch(() => null);
    const endpoint = body?.endpoint;
    const regions = Array.isArray(body?.regions) ? body.regions.slice(0, 20) : [];
    const lang = body?.lang === 'hi' ? 'hi' : 'en';
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return badRequest('bad endpoint');
    if (regions.length === 0) return badRequest('pick at least one region');
    await db.prepare(
      `INSERT INTO subscriptions (endpoint, p256dh, auth, lang) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, lang = ?4`,
    ).bind(endpoint, body?.keys?.p256dh ?? null, body?.keys?.auth ?? null, lang).run();
    const sub = await db.prepare('SELECT id FROM subscriptions WHERE endpoint = ?1').bind(endpoint).first();
    await db.prepare('DELETE FROM subscription_regions WHERE subscription_id = ?1').bind(sub.id).run();
    for (const slug of regions) {
      await db.prepare(
        `INSERT OR IGNORE INTO subscription_regions (subscription_id, region_id)
         SELECT ?1, id FROM regions WHERE slug = ?2`,
      ).bind(sub.id, String(slug)).run();
    }
    return json({ ok: true });
  }

  if (method === 'DELETE' && path === '/api/subscriptions') {
    const body = await request.json().catch(() => null);
    if (typeof body?.endpoint !== 'string') return badRequest('bad endpoint');
    await db.prepare('DELETE FROM subscriptions WHERE endpoint = ?1').bind(body.endpoint).run();
    return json({ ok: true });
  }

  if (method === 'POST' && path === '/api/subscriptions/pending') {
    const body = await request.json().catch(() => null);
    if (typeof body?.endpoint !== 'string') return badRequest('bad endpoint');
    const sub = await db.prepare(
      'SELECT id, lang FROM subscriptions WHERE endpoint = ?1',
    ).bind(body.endpoint).first();
    if (!sub) return notFound();
    const { results } = await db.prepare(
      `SELECT n.id, n.kind, n.win_from, n.win_to, n.reason_en, n.reason_hi, n.status, n.posted_at,
              r.name_en AS region_en, r.name_hi AS region_hi
       FROM notices n
       JOIN regions r ON r.id = n.region_id
       JOIN subscription_regions sr ON sr.region_id = n.region_id
       WHERE sr.subscription_id = ?1
         AND datetime(n.posted_at) > datetime('now', '-2 days')
         AND datetime(n.win_to) > datetime('now')
       ORDER BY datetime(n.posted_at) DESC LIMIT 5`,
    ).bind(sub.id).all();
    return json({
      lang: sub.lang,
      notices: results.map((n) => ({ ...publicNotice(n), region: { name_en: n.region_en, name_hi: n.region_hi } })),
    });
  }

  return notFound();
}

// ---------- helpers ----------

function publicNotice(n) {
  return {
    id: n.id,
    kind: n.kind,
    from: n.win_from,
    to: n.win_to,
    reason: { en: n.reason_en, hi: n.reason_hi },
    status: n.status,
    posted_at: n.posted_at,
  };
}

async function authPoster(db, request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  return db.prepare(
    'SELECT id, team_id, name FROM posters WHERE token_hash = ?1',
  ).bind(await sha256hex(token)).first();
}

/** A team can post to its own regions and those of every descendant team. */
async function teamRegions(db, teamId) {
  const { results } = await db.prepare(
    `WITH RECURSIVE tree(id) AS (
       SELECT ?1
       UNION ALL
       SELECT t.id FROM teams t JOIN tree ON t.parent_id = tree.id
     )
     SELECT r.id, r.slug, r.name_en, r.name_hi
     FROM regions r WHERE r.team_id IN (SELECT id FROM tree)
     ORDER BY r.slug`,
  ).bind(teamId).all();
  return results;
}

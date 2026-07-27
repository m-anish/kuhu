// kuhu — the service. Cloudflare Worker + D1.
//
// Public:
//   GET  /api/regions                      list regions
//   GET  /api/regions/:slug/next-cuts      upcoming notices for one region (cacheable)
//   GET  /api/vapid-key                    the push public key
//   GET  /api/invites/preview?t=…          who is inviting me, and as what
//   POST /api/invites/redeem               {token, name, phone} → poster token
//
// Poster (Bearer):
//   POST /api/notices                      publish
//   POST /api/notices/:id/cancel
//   GET  /api/team/regions                 regions this poster may post to
//   GET  /api/team/notices                 the team's recent notices
//   GET  /api/me                           who am I, and what may I do
//
// Admin (Bearer, role=admin):
//   POST /api/invites                      mint a single-use link
//   GET  /api/invites                      outstanding + recently used
//   POST /api/invites/:id/revoke
//   GET  /api/team/members
//   POST /api/team/members/:id/revoke
//   POST /api/regions                      add an area
//   POST /api/regions/:slug/rename         rename an area (display names only)
//
// Subscriber:
//   POST   /api/subscriptions
//   DELETE /api/subscriptions
//   POST   /api/subscriptions/pending

import { json, badRequest, unauthorized, forbidden, notFound, corsPreflight, randomId, randomToken, sha256hex, isIsoDate } from './util.js';
import { notifyRegions } from './push.js';

const ROLES = ['poster', 'admin'];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}$/;

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

  // ───────────────────────── public ─────────────────────────

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

  // ───────────────────────── invites ─────────────────────────

  // What a tapped link shows before anyone commits to anything.
  if (method === 'GET' && path === '/api/invites/preview') {
    const invite = await liveInvite(db, url.searchParams.get('t') || '');
    if (!invite) return json({ valid: false }, 404);
    const team = await db.prepare('SELECT name FROM teams WHERE id = ?1').bind(invite.team_id).first();
    const out = { valid: true, team: team?.name ?? '', role: invite.role, expires_at: invite.expires_at };
    if (invite.move_poster_id) {
      const who = await activePoster(db, invite.move_poster_id);
      if (!who) return json({ valid: false }, 404);   // they were removed after minting
      out.move = true;
      out.name = who.name;
    }
    return json(out);
  }

  if (method === 'POST' && path === '/api/invites/redeem') {
    const body = await request.json().catch(() => null);
    const invite = await liveInvite(db, body?.token || '');
    if (!invite) return json({ error: 'invite_invalid' }, 401);

    // A move: re-issue an existing person's token onto this phone. The old
    // phone's token stops working the moment this row is updated.
    if (invite.move_poster_id) {
      const who = await activePoster(db, invite.move_poster_id);
      if (!who) return json({ error: 'invite_invalid' }, 401);
      const moved = randomToken();
      await db.prepare('UPDATE posters SET token_hash = ?2 WHERE id = ?1')
        .bind(who.id, await sha256hex(moved)).run();
      await db.prepare(
        "UPDATE invites SET used_at = datetime('now'), used_by = ?2 WHERE id = ?1",
      ).bind(invite.id, who.id).run();
      const t = await db.prepare('SELECT name FROM teams WHERE id = ?1').bind(who.team_id).first();
      return json({ token: moved, team: t?.name ?? '', role: who.role, name: who.name, moved: true });
    }

    const name = (body?.name || '').trim().slice(0, 60);
    const phone = (body?.phone || '').trim().slice(0, 20) || null;
    if (!name) return badRequest('a name is required');

    const token = randomToken();
    await db.prepare(
      'INSERT INTO posters (team_id, name, phone, role, token_hash) VALUES (?1, ?2, ?3, ?4, ?5)',
    ).bind(invite.team_id, name, phone, invite.role, await sha256hex(token)).run();
    const poster = await db.prepare('SELECT id FROM posters WHERE token_hash = ?1')
      .bind(await sha256hex(token)).first();

    // Burn it. An invite dies on use, not merely on expiry.
    await db.prepare(
      "UPDATE invites SET used_at = datetime('now'), used_by = ?2 WHERE id = ?1",
    ).bind(invite.id, poster.id).run();

    const team = await db.prepare('SELECT name FROM teams WHERE id = ?1').bind(invite.team_id).first();
    return json({ token, team: team?.name ?? '', role: invite.role, name });
  }

  // ───────────────────────── poster ─────────────────────────

  const me = await authPoster(db, request);

  if (method === 'GET' && path === '/api/me') {
    if (!me) return unauthorized();
    return json({
      name: me.name,
      role: me.role,
      team_id: me.team_id,
      regions: publicRegions(await scopedRegions(db, me.team_id)),
    });
  }

  if (method === 'GET' && path === '/api/team/regions') {
    if (!me) return unauthorized();
    return json({ poster: me.name, role: me.role, regions: publicRegions(await scopedRegions(db, me.team_id)) });
  }

  // "I have a new phone." Anyone may move themselves — no admin errand, and no
  // password to recover, because there was never a password. Deliberately
  // short-lived: you are doing this with both phones in front of you.
  if (method === 'POST' && path === '/api/me/move') {
    if (!me) return unauthorized();
    // Only one move link alive at a time, so an abandoned one can't linger.
    await db.prepare(
      `UPDATE invites SET revoked_at = datetime('now')
       WHERE move_poster_id = ?1 AND used_at IS NULL AND revoked_at IS NULL`,
    ).bind(me.id).run();
    const token = randomToken();
    await db.prepare(
      `INSERT INTO invites (token_hash, team_id, role, note, created_by, expires_at, move_poster_id)
       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now', '+30 minutes'), ?5)`,
    ).bind(await sha256hex(token), me.team_id, me.role, `move: ${me.name}`, me.id).run();
    const row = await db.prepare('SELECT expires_at FROM invites WHERE token_hash = ?1')
      .bind(await sha256hex(token)).first();
    return json({ url: `${publicOrigin(url)}/join#t=${token}`, expires_at: row.expires_at }, 201);
  }

  if (method === 'POST' && path === '/api/notices') {
    if (!me) return unauthorized();
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('invalid json');
    const { from, to, kind = 'cut' } = body;
    const reason_en = String(body.reason_en ?? '').trim().slice(0, 200);
    const reason_hi = String(body.reason_hi ?? '').trim().slice(0, 200);
    if (!['cut', 'advisory', 'restored'].includes(kind)) return badRequest('bad kind');
    if (!isIsoDate(from) || !isIsoDate(to) || Date.parse(from) >= Date.parse(to)) {
      return badRequest('bad window');
    }
    if (!reason_en && !reason_hi) return badRequest('a reason, in either language');

    // One area or several. `region` (singular) still works for anything older.
    const wanted = Array.isArray(body.regions) && body.regions.length
      ? [...new Set(body.regions.map(String))]
      : (body.region ? [String(body.region)] : []);
    if (wanted.length === 0) return badRequest('pick at least one area');
    if (wanted.length > 25) return badRequest('too many areas at once');

    const mine = await scopedRegions(db, me.team_id);
    const targets = wanted.map((slug) => mine.find((r) => r.slug === slug));
    if (targets.some((r) => !r)) return forbidden('not your area');

    // One row per area, tied together so they can be cancelled as one act.
    const batch = randomId('bat');
    const ids = [];
    for (const region of targets) {
      const id = randomId('ntc');
      ids.push(id);
      await db.prepare(
        `INSERT INTO notices (id, region_id, kind, win_from, win_to, reason_en, reason_hi, posted_by, batch_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      ).bind(id, region.id, kind, from, to, reason_en, reason_hi, me.id, batch).run();
    }
    // Notify across all of them at once: somebody subscribed to two of these
    // areas is still one person, and still gets one buzz.
    ctx.waitUntil(notifyRegions(db, env, targets.map((r) => r.id)));
    return json({ ids, batch_id: batch, areas: targets.length, status: 'scheduled' }, 201);
  }

  const cancel = path.match(/^\/api\/notices\/(ntc_[a-z0-9]+)\/cancel$/);
  if (method === 'POST' && cancel) {
    if (!me) return unauthorized();
    const notice = await db.prepare(
      "SELECT id, region_id, batch_id FROM notices WHERE id = ?1 AND status = 'scheduled'",
    ).bind(cancel[1]).first();
    if (!notice) return notFound();
    const mine = await scopedRegions(db, me.team_id);
    if (!mine.some((r) => r.id === notice.region_id)) return forbidden('not your area');

    // Cancelling one area of a multi-area notice cancels the whole thing —
    // it was posted as one act, so it is untrue to un-post only part of it.
    const siblings = notice.batch_id
      ? (await db.prepare(
          "SELECT id, region_id FROM notices WHERE batch_id = ?1 AND status = 'scheduled'",
        ).bind(notice.batch_id).all()).results
      : [notice];
    const reachable = siblings.filter((n) => mine.some((r) => r.id === n.region_id));
    for (const n of reachable) {
      await db.prepare("UPDATE notices SET status = 'cancelled' WHERE id = ?1").bind(n.id).run();
    }
    ctx.waitUntil(notifyRegions(db, env, reachable.map((n) => n.region_id)));
    return json({ ids: reachable.map((n) => n.id), status: 'cancelled' });
  }

  if (method === 'GET' && path === '/api/team/notices') {
    if (!me) return unauthorized();
    const regions = await scopedRegions(db, me.team_id);
    if (regions.length === 0) return json({ notices: [] });
    const marks = regions.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await db.prepare(
      `SELECT n.id, n.kind, n.win_from, n.win_to, n.reason_en, n.reason_hi, n.status, n.posted_at,
              n.batch_id,
              r.slug AS region_slug, r.name_en AS region_en, r.name_hi AS region_hi,
              p.name AS poster_name
       FROM notices n
       JOIN regions r ON r.id = n.region_id
       LEFT JOIN posters p ON p.id = n.posted_by
       WHERE n.region_id IN (${marks}) AND datetime(n.win_to) > datetime('now', '-1 day')
       ORDER BY datetime(n.win_from) DESC LIMIT 50`,
    ).bind(...regions.map((r) => r.id)).all();
    return json({
      notices: results.map((n) => ({
        ...publicNotice(n),
        batch_id: n.batch_id,
        by: n.poster_name,
        region: { slug: n.region_slug, name_en: n.region_en, name_hi: n.region_hi },
      })),
    });
  }

  // ───────────────────────── admin ─────────────────────────

  if (method === 'POST' && path === '/api/invites') {
    if (!me) return unauthorized();
    if (me.role !== 'admin') return forbidden('admin only');
    const body = await request.json().catch(() => null);
    const role = ROLES.includes(body?.role) ? body.role : 'poster';
    const note = (body?.note || '').trim().slice(0, 80) || null;
    const hours = Math.min(Math.max(parseInt(body?.hours, 10) || 48, 1), 336);   // 1h … 14d
    const token = randomToken();
    await db.prepare(
      `INSERT INTO invites (token_hash, team_id, role, note, created_by, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now', ?6))`,
    ).bind(await sha256hex(token), me.team_id, role, note, me.id, `+${hours} hours`).run();
    const row = await db.prepare('SELECT id, expires_at FROM invites WHERE token_hash = ?1')
      .bind(await sha256hex(token)).first();
    return json({
      id: row.id,
      url: `${publicOrigin(url)}/join#t=${token}`,
      role,
      note,
      expires_at: row.expires_at,
    }, 201);
  }

  if (method === 'GET' && path === '/api/invites') {
    if (!me) return unauthorized();
    if (me.role !== 'admin') return forbidden('admin only');
    const { results } = await db.prepare(
      `SELECT i.id, i.role, i.note, i.created_at, i.expires_at, i.used_at, i.revoked_at,
              p.name AS used_by_name
       FROM invites i
       LEFT JOIN posters p ON p.id = i.used_by
       WHERE i.team_id = ?1 AND datetime(i.created_at) > datetime('now', '-30 days')
       ORDER BY i.created_at DESC LIMIT 40`,
    ).bind(me.team_id).all();
    const now = Date.now();
    return json({
      invites: results.map((i) => ({
        ...i,
        state: i.revoked_at ? 'revoked'
          : i.used_at ? 'used'
          : Date.parse(i.expires_at.replace(' ', 'T') + 'Z') < now ? 'expired'
          : 'open',
      })),
    });
  }

  const revokeInvite = path.match(/^\/api\/invites\/(\d+)\/revoke$/);
  if (method === 'POST' && revokeInvite) {
    if (!me) return unauthorized();
    if (me.role !== 'admin') return forbidden('admin only');
    const res = await db.prepare(
      `UPDATE invites SET revoked_at = datetime('now')
       WHERE id = ?1 AND team_id = ?2 AND used_at IS NULL AND revoked_at IS NULL`,
    ).bind(revokeInvite[1], me.team_id).run();
    if (!res.meta.changes) return notFound();
    return json({ id: Number(revokeInvite[1]), state: 'revoked' });
  }

  if (method === 'GET' && path === '/api/team/members') {
    if (!me) return unauthorized();
    if (me.role !== 'admin') return forbidden('admin only');
    const { results } = await db.prepare(
      `SELECT id, name, phone, role, created_at, revoked_at
       FROM posters WHERE team_id = ?1 ORDER BY revoked_at IS NOT NULL, created_at`,
    ).bind(me.team_id).all();
    return json({ members: results.map((m) => ({ ...m, is_you: m.id === me.id })) });
  }

  const revokeMember = path.match(/^\/api\/team\/members\/(\d+)\/revoke$/);
  if (method === 'POST' && revokeMember) {
    if (!me) return unauthorized();
    if (me.role !== 'admin') return forbidden('admin only');
    const id = Number(revokeMember[1]);
    if (id === me.id) return badRequest('you cannot revoke yourself');
    // Don't strand the team: refuse to remove the last working admin.
    const target = await db.prepare(
      'SELECT id, role FROM posters WHERE id = ?1 AND team_id = ?2 AND revoked_at IS NULL',
    ).bind(id, me.team_id).first();
    if (!target) return notFound();
    if (target.role === 'admin') {
      const { count } = await db.prepare(
        "SELECT COUNT(*) AS count FROM posters WHERE team_id = ?1 AND role = 'admin' AND revoked_at IS NULL",
      ).bind(me.team_id).first();
      if (count <= 1) return badRequest('that is the last admin');
    }
    await db.prepare("UPDATE posters SET revoked_at = datetime('now') WHERE id = ?1").bind(id).run();
    return json({ id, state: 'revoked' });
  }

  if (method === 'POST' && path === '/api/regions') {
    if (!me) return unauthorized();
    if (me.role !== 'admin') return forbidden('admin only');
    const body = await request.json().catch(() => null);
    const slug = (body?.slug || '').trim().toLowerCase();
    const name_en = (body?.name_en || '').trim().slice(0, 60);
    const name_hi = (body?.name_hi || '').trim().slice(0, 60);
    if (!SLUG_RE.test(slug)) return badRequest('slug: a-z, 0-9 and hyphens');
    if (!name_en || !name_hi) return badRequest('both names are required');
    const clash = await db.prepare('SELECT id FROM regions WHERE slug = ?1').bind(slug).first();
    if (clash) return badRequest('that slug already exists');
    await db.prepare(
      'INSERT INTO regions (slug, name_en, name_hi, team_id) VALUES (?1, ?2, ?3, ?4)',
    ).bind(slug, name_en, name_hi, me.team_id).run();
    return json({ slug, name_en, name_hi }, 201);
  }

  // Display names only. The slug is load-bearing — it is in the public API URL
  // and in every subscriber's saved selection — so it is deliberately immutable.
  const rename = path.match(/^\/api\/regions\/([a-z0-9-]+)\/rename$/);
  if (method === 'POST' && rename) {
    if (!me) return unauthorized();
    if (me.role !== 'admin') return forbidden('admin only');
    const body = await request.json().catch(() => null);
    const name_en = (body?.name_en || '').trim().slice(0, 60);
    const name_hi = (body?.name_hi || '').trim().slice(0, 60);
    if (!name_en || !name_hi) return badRequest('both names are required');
    const region = (await scopedRegions(db, me.team_id)).find((r) => r.slug === rename[1]);
    if (!region) return forbidden('not your area');
    await db.prepare('UPDATE regions SET name_en = ?2, name_hi = ?3 WHERE id = ?1')
      .bind(region.id, name_en, name_hi).run();
    return json({ slug: region.slug, name_en, name_hi });
  }

  // ───────────────────────── subscribers ─────────────────────────

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
              n.batch_id, r.name_en AS region_en, r.name_hi AS region_hi
       FROM notices n
       JOIN regions r ON r.id = n.region_id
       JOIN subscription_regions sr ON sr.region_id = n.region_id
       WHERE sr.subscription_id = ?1
         AND datetime(n.posted_at) > datetime('now', '-2 days')
         AND datetime(n.win_to) > datetime('now')
       ORDER BY datetime(n.posted_at) DESC LIMIT 12`,
    ).bind(sub.id).all();
    // One posting act = one notification, even when it covered several of the
    // areas this person follows. Collapse the batch and name all of them.
    const seen = new Map();
    for (const n of results) {
      const key = n.batch_id || n.id;
      if (!seen.has(key)) {
        seen.set(key, { ...publicNotice(n), en: [n.region_en], hi: [n.region_hi] });
      } else {
        const g = seen.get(key);
        g.en.push(n.region_en);
        g.hi.push(n.region_hi);
      }
    }
    return json({
      lang: sub.lang,
      notices: [...seen.values()].map(({ en, hi, ...n }) => ({
        ...n,
        region: { name_en: en.join(' · '), name_hi: hi.join(' · ') },
      })),
    });
  }

  return notFound();
}

// ───────────────────────── helpers ─────────────────────────

/**
 * The origin to put inside an invite link. Never emit http:// for a real host —
 * the link gets pasted into WhatsApp, and a scheme downgrade there is a
 * downgrade for everyone who taps it. Localhost stays http for dev.
 */
function publicOrigin(url) {
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return local ? url.origin : `https://${url.host}`;
}

/** Regions as the client needs them — internal ids stay server-side. */
function publicRegions(regions) {
  return regions.map(({ slug, name_en, name_hi }) => ({ slug, name_en, name_hi }));
}

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
    'SELECT id, team_id, name, role FROM posters WHERE token_hash = ?1 AND revoked_at IS NULL',
  ).bind(await sha256hex(token)).first();
}

/** An invite that is unused, unrevoked, and not yet expired. Anything else is nothing. */
async function liveInvite(db, token) {
  if (!token || typeof token !== 'string') return null;
  return db.prepare(
    `SELECT id, team_id, role, expires_at, move_poster_id FROM invites
     WHERE token_hash = ?1
       AND used_at IS NULL AND revoked_at IS NULL
       AND datetime(expires_at) > datetime('now')`,
  ).bind(await sha256hex(token)).first();
}

/** A poster who still exists and has not been removed. */
async function activePoster(db, id) {
  return db.prepare(
    'SELECT id, team_id, name, role FROM posters WHERE id = ?1 AND revoked_at IS NULL',
  ).bind(id).first();
}

/** A team's own regions plus every descendant team's. */
async function scopedRegions(db, teamId) {
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

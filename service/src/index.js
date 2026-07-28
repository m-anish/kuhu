// kuhu — community notices. Cloudflare Worker + D1.
//
// Electricity is the first service, not the only possible one. A notice
// belongs to a (service, area) pair; who may post it comes from the team tree
// (see scope.js), and what a notice may *say* comes from the service's own
// kinds and reasons, which are data rather than code.
//
// Public:
//   GET  /api/services                              enabled services + their areas
//   GET  /api/services/:svc/areas/:area/notices     what's coming, cacheable
//   GET  /api/vapid-key
//   GET  /api/invites/preview?t=…
//   POST /api/invites/redeem
//
// Poster (Bearer):
//   GET  /api/me                                    who am I, what may I reach
//   POST /api/notices                               {service, regions[], …}
//   POST /api/notices/:id/cancel
//   GET  /api/team/notices
//   POST /api/me/move
//
// Admin (service_admin within its service; site_admin everywhere):
//   POST /api/invites            GET /api/invites            POST /api/invites/:id/revoke
//   GET  /api/team/members       POST /api/team/members/:id/revoke
//   GET/POST /api/services/:svc/areas              this service's own areas
//   POST /api/services/:svc/areas/:area/rename
//   POST /api/services/:svc/coverage               which areas a crew covers
//
// Subscriber:
//   POST /api/subscriptions   DELETE /api/subscriptions   POST /api/subscriptions/pending

import { json, badRequest, unauthorized, forbidden, notFound, corsPreflight, randomId, randomToken, sha256hex, isIsoDate } from './util.js';
import { notifyRegions } from './push.js';
import { mirrorToTelegram } from './telegram.js';
import { publishMqtt, topicFor } from './mqtt.js';
import { ROLES, rank, isAdmin, isSiteAdmin, teamTree, scopedCoverage, scopedServices, publicService, coverageByService, regionSubtree, regionLeaves, regionDepth, deepestBelow, topmostRegions, globalRootTeam, serviceRootTeam, crewForCoverage, newTeam } from './scope.js';
// Bundled into the Worker at deploy time; the browser reads its own cached
// copy of the same file, so the two disagreeing proves a stale install.
import { APP_VERSION } from '../app/version.js';

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

  /** Hourly: forget retained MQTT state whose window has passed. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(clearExpiredRetained(env));
  },
};

async function route(request, env, ctx, url) {
  const db = env.DB;
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  // ───────────────────────── public ─────────────────────────

  // One discovery call: every service that is switched on, with the areas that
  // have a crew behind them.
  //
  // LEFT JOIN, not JOIN: a service with no areas yet must still be listed.
  // Dropping it made a newly created service invisible everywhere — including
  // to the admin who had just made it — and, because the client hides the
  // service layer when only one comes back, it silently reverted the whole app
  // to looking single-service.
  if (method === 'GET' && path === '/api/services') {
    const { results } = await db.prepare(
      `WITH RECURSIVE covered(id, service_id) AS (
         SELECT tr.region_id, t.service_id
         FROM team_regions tr
         JOIN teams t ON t.id = tr.team_id
         WHERE t.service_id IS NOT NULL
         UNION
         SELECT r.id, r.service_id FROM regions r JOIN covered ON r.parent_id = covered.id
       )
       SELECT DISTINCT s.id, s.slug, s.name_en, s.name_hi, s.icon, s.accent,
              s.kinds, s.reasons, s.sort,
              r.slug AS region_slug, r.name_en AS region_en, r.name_hi AS region_hi,
              p.slug AS parent_slug,
              NOT EXISTS (SELECT 1 FROM regions c WHERE c.parent_id = r.id) AS is_leaf
       FROM services s
       LEFT JOIN covered cv      ON cv.service_id = s.id
       LEFT JOIN regions r       ON r.id = cv.id AND r.service_id = s.id
       LEFT JOIN regions p       ON p.id = r.parent_id
       WHERE s.enabled = 1
       ORDER BY s.sort, s.slug, COALESCE(p.slug, r.slug), r.parent_id IS NOT NULL, r.slug`,
    ).all();
    const byService = new Map();
    for (const row of results) {
      if (!byService.has(row.slug)) byService.set(row.slug, { ...publicService(row), regions: [] });
      if (row.region_slug) {
        byService.get(row.slug).regions.push({
          slug: row.region_slug,
          name_en: row.region_en,
          name_hi: row.region_hi,
          parent: row.parent_slug ?? null,
          leaf: Boolean(row.is_leaf),
        });
      }
    }
    return json({ services: [...byService.values()] }, 200, { 'cache-control': 'public, max-age=300' });
  }

  const upcoming = path.match(/^\/api\/services\/([a-z0-9-]+)\/areas\/([a-z0-9-]+)\/notices$/);
  if (method === 'GET' && upcoming) {
    const svc = await db.prepare('SELECT id, slug, name_en, name_hi, icon FROM services WHERE slug = ?1 AND enabled = 1')
      .bind(upcoming[1]).first();
    if (!svc) return notFound();
    // Slugs repeat across services, so the area must be looked up within one.
    const region = await db.prepare(
      'SELECT id, slug, name_en, name_hi FROM regions WHERE service_id = ?1 AND slug = ?2',
    ).bind(svc.id, upcoming[2]).first();
    if (!region) return notFound();
    // Asking about a region means asking about everything inside it, so this
    // walks DOWN — the mirror of delivery, which walks up. For a plain area
    // with no children the subtree is just itself and nothing changes.
    const inside = await regionSubtree(db, [region.id]);
    const marks = inside.map((_, i) => `?${i + 2}`).join(',');
    const { results } = await db.prepare(
      `SELECT id, kind, win_from, win_to, reason_en, reason_hi, status, posted_at, batch_id
       FROM notices
       WHERE service_id = ?1 AND region_id IN (${marks}) AND status = 'scheduled'
         AND datetime(win_to) > datetime('now')
       ORDER BY datetime(win_from) LIMIT 20`,
    ).bind(svc.id, ...inside).all();
    return json({
      service: { slug: svc.slug, name_en: svc.name_en, name_hi: svc.name_hi, icon: svc.icon },
      area: { slug: region.slug, name_en: region.name_en, name_hi: region.name_hi },
      notices: results.map(publicNotice),
    }, 200, { 'cache-control': 'public, max-age=60' });
  }

  // What the server is running. Never cached — the whole point is to catch a
  // client that is.
  if (method === 'GET' && path === '/api/version') {
    return json({ version: APP_VERSION }, 200, { 'cache-control': 'no-store' });
  }

  if (method === 'GET' && path === '/api/vapid-key') {
    return json({ key: env.VAPID_PUBLIC_KEY }, 200, { 'cache-control': 'public, max-age=86400' });
  }

  // ───────────────────────── invites ─────────────────────────

  if (method === 'GET' && path === '/api/invites/preview') {
    const invite = await liveInvite(db, url.searchParams.get('t') || '');
    if (!invite) return json({ valid: false }, 404);
    const team = await db.prepare('SELECT name FROM teams WHERE id = ?1').bind(invite.team_id).first();
    const svc = invite.service_id
      ? await db.prepare('SELECT name_en, name_hi, icon FROM services WHERE id = ?1').bind(invite.service_id).first()
      : null;
    const out = {
      valid: true, team: team?.name ?? '', role: invite.role, expires_at: invite.expires_at,
      service: svc ? { name_en: svc.name_en, name_hi: svc.name_hi, icon: svc.icon } : null,
    };
    if (invite.move_poster_id) {
      const who = await activePoster(db, invite.move_poster_id);
      if (!who) return json({ valid: false }, 404);
      out.move = true;
      out.name = who.name;
    }
    return json(out);
  }

  if (method === 'POST' && path === '/api/invites/redeem') {
    const body = await request.json().catch(() => null);
    const invite = await liveInvite(db, body?.token || '');
    if (!invite) return json({ error: 'invite_invalid' }, 401);

    if (invite.move_poster_id) {
      const who = await activePoster(db, invite.move_poster_id);
      if (!who) return json({ error: 'invite_invalid' }, 401);
      const moved = randomToken();
      await db.prepare('UPDATE posters SET token_hash = ?2 WHERE id = ?1')
        .bind(who.id, await sha256hex(moved)).run();
      await db.prepare("UPDATE invites SET used_at = datetime('now'), used_by = ?2 WHERE id = ?1")
        .bind(invite.id, who.id).run();
      const t = await db.prepare('SELECT name FROM teams WHERE id = ?1').bind(who.team_id).first();
      return json({ token: moved, team: t?.name ?? '', role: who.role, name: who.name, moved: true });
    }

    const name = (body?.name || '').trim().slice(0, 60);
    const phone = (body?.phone || '').trim().slice(0, 20) || null;
    if (!name) return badRequest('a name is required');

    const token = randomToken();
    await db.prepare(
      'INSERT INTO posters (team_id, service_id, name, phone, role, token_hash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    ).bind(invite.team_id, invite.service_id, name, phone, invite.role, await sha256hex(token)).run();
    const poster = await db.prepare('SELECT id FROM posters WHERE token_hash = ?1')
      .bind(await sha256hex(token)).first();
    await db.prepare("UPDATE invites SET used_at = datetime('now'), used_by = ?2 WHERE id = ?1")
      .bind(invite.id, poster.id).run();

    const team = await db.prepare('SELECT name FROM teams WHERE id = ?1').bind(invite.team_id).first();
    return json({ token, team: team?.name ?? '', role: invite.role, name });
  }

  // ───────────────────────── identity ─────────────────────────

  const me = await authPoster(db, request);

  if (method === 'GET' && path === '/api/me') {
    if (!me) return unauthorized();
    // Services come from the team tree; areas come from coverage. Deriving the
    // services *through* coverage would hide a service that has no areas yet —
    // which is exactly the state every service is in the moment it is created,
    // leaving whoever was just invited into it staring at nothing.
    const covered = coverageByService(await scopedCoverage(db, me.team_id));
    const coverage = (await scopedServices(db, me.team_id)).map((svc) => ({
      ...svc,
      regions: covered.find((c) => c.slug === svc.slug)?.regions ?? [],
    }));
    return json({
      name: me.name,
      role: me.role,
      team: me.team_name,
      // Contextual visibility: a lineman is handed one service and their own
      // areas; a site admin gets everything. Same query, different position.
      services: coverage,
      can: {
        invite: isAdmin(me),
        manage_people: isAdmin(me),
        manage_coverage: isAdmin(me),
        manage_areas: isAdmin(me),          // within the services they reach
        manage_services: isSiteAdmin(me),
      },
    });
  }

  // ───────────────────────── posting ─────────────────────────

  if (method === 'POST' && path === '/api/notices') {
    if (!me) return unauthorized();
    const body = await request.json().catch(() => null);
    if (!body) return badRequest('invalid json');

    const coverage = coverageByService(await scopedCoverage(db, me.team_id));
    // The single-service convenience default applies only when the client did
    // not name one. Naming a service you cannot reach must be refused, never
    // quietly redirected to the one you can — that would file a notice against
    // the wrong utility.
    const wantSlug = String(body.service || '').trim();
    const svc = wantSlug
      ? coverage.find((s) => s.slug === wantSlug)
      : (coverage.length === 1 ? coverage[0] : null);
    if (!svc) return wantSlug ? forbidden('not your service') : badRequest('pick a service');

    const kinds = svc.kinds.map((k) => k.key);
    const kind = String(body.kind || kinds[0] || 'cut');
    if (!kinds.includes(kind)) return badRequest('bad kind for this service');

    const { from, to } = body;
    const reason_en = String(body.reason_en ?? '').trim().slice(0, 200);
    const reason_hi = String(body.reason_hi ?? '').trim().slice(0, 200);
    if (!isIsoDate(from) || !isIsoDate(to) || Date.parse(from) >= Date.parse(to)) {
      return badRequest('bad window');
    }
    if (!reason_en && !reason_hi) return badRequest('a reason, in either language');

    const wanted = Array.isArray(body.regions) && body.regions.length
      ? [...new Set(body.regions.map(String))]
      : (body.region ? [String(body.region)] : []);
    if (wanted.length === 0) return badRequest('pick at least one area');
    if (wanted.length > 25) return badRequest('too many areas at once');

    const asked = wanted.map((slug) => svc.regions.find((r) => r.slug === slug));
    if (asked.some((r) => !r)) return forbidden('not your area');

    const svcRow = await db.prepare('SELECT id FROM services WHERE slug = ?1').bind(svc.slug).first();
    const askedIds = await slugsToRegionIds(db, svcRow.id, asked.map((r) => r.slug));

    // Notices live on LEAVES. Naming a region here means naming everything
    // inside it, expanded now rather than at delivery: that keeps one notice
    // per real place, so per-area MQTT topics and the public feed stay exactly
    // as they were, and a device never has to understand the tree.
    //
    // Picking a region AND an area inside it is not an error, just the same
    // place said twice — regionLeaves dedupes it.
    const leafIds = await regionLeaves(db, [...askedIds.values()]);
    if (leafIds.length === 0) return badRequest('pick at least one area');
    if (leafIds.length > 25) return badRequest('too many areas at once');

    const marks = leafIds.map((_, i) => `?${i + 1}`).join(',');
    const { results: leaves } = await db.prepare(
      `SELECT id, slug, name_en, name_hi FROM regions WHERE id IN (${marks}) ORDER BY slug`,
    ).bind(...leafIds).all();

    const batch = randomId('bat');
    const ids = [];
    for (const region of leaves) {
      const id = randomId('ntc');
      ids.push(id);
      await db.prepare(
        `INSERT INTO notices (id, service_id, region_id, kind, win_from, win_to, reason_en, reason_hi, posted_by, batch_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      ).bind(id, svcRow.id, region.id, kind, from, to, reason_en, reason_hi, me.id, batch).run();
    }

    ctx.waitUntil(fanOut(db, env, svc, svcRow.id, leaves, {
      kind, status: 'scheduled', from, to, reason_en, reason_hi,
    }));
    return json({ ids, batch_id: batch, areas: leaves.length, status: 'scheduled' }, 201);
  }

  const cancel = path.match(/^\/api\/notices\/(ntc_[a-z0-9]+)\/cancel$/);
  if (method === 'POST' && cancel) {
    if (!me) return unauthorized();
    const notice = await db.prepare(
      `SELECT n.id, n.service_id, n.region_id, n.batch_id, n.kind, n.win_from, n.win_to,
              n.reason_en, n.reason_hi, s.slug AS service_slug
       FROM notices n JOIN services s ON s.id = n.service_id
       WHERE n.id = ?1 AND n.status = 'scheduled'`,
    ).bind(cancel[1]).first();
    if (!notice) return notFound();

    const coverage = coverageByService(await scopedCoverage(db, me.team_id));
    const svc = coverage.find((s) => s.slug === notice.service_slug);
    if (!svc) return forbidden('not your service');
    const mineIds = await slugsToRegionIds(db, notice.service_id, svc.regions.map((r) => r.slug));
    const mineSet = new Set([...mineIds.values()]);
    if (!mineSet.has(notice.region_id)) return forbidden('not your area');

    const siblings = notice.batch_id
      ? (await db.prepare("SELECT id, region_id FROM notices WHERE batch_id = ?1 AND status = 'scheduled'")
          .bind(notice.batch_id).all()).results
      : [{ id: notice.id, region_id: notice.region_id }];
    const reachable = siblings.filter((n) => mineSet.has(n.region_id));
    for (const n of reachable) {
      await db.prepare("UPDATE notices SET status = 'cancelled' WHERE id = ?1").bind(n.id).run();
    }

    const bySlug = new Map(svc.regions.map((r) => [mineIds.get(r.slug), r]));
    ctx.waitUntil(fanOut(db, env, svc, notice.service_id,
      reachable.map((n) => ({ ...bySlug.get(n.region_id), id: n.region_id })), {
        kind: notice.kind, status: 'cancelled',
        from: notice.win_from, to: notice.win_to,
        reason_en: notice.reason_en, reason_hi: notice.reason_hi,
      }));
    return json({ ids: reachable.map((n) => n.id), status: 'cancelled' });
  }

  if (method === 'GET' && path === '/api/team/notices') {
    if (!me) return unauthorized();
    const teams = await teamTree(db, me.team_id);
    const marks = teams.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await db.prepare(
      `SELECT n.id, n.kind, n.win_from, n.win_to, n.reason_en, n.reason_hi, n.status,
              n.posted_at, n.batch_id,
              s.slug AS service_slug, s.name_en AS service_en, s.name_hi AS service_hi, s.icon,
              r.slug AS region_slug, r.name_en AS region_en, r.name_hi AS region_hi,
              p.name AS poster_name
       FROM notices n
       JOIN services s ON s.id = n.service_id
       JOIN regions r  ON r.id = n.region_id
       LEFT JOIN posters p ON p.id = n.posted_by
       WHERE n.region_id IN (
               SELECT tr.region_id FROM team_regions tr WHERE tr.team_id IN (${marks})
             )
         AND n.service_id IN (
               SELECT t.service_id FROM teams t WHERE t.id IN (${marks}) AND t.service_id IS NOT NULL
             )
         AND datetime(n.win_to) > datetime('now', '-1 day')
       ORDER BY datetime(n.win_from) DESC LIMIT 60`,
    ).bind(...teams, ...teams).all();
    return json({
      notices: results.map((n) => ({
        ...publicNotice(n),
        by: n.poster_name,
        service: { slug: n.service_slug, name_en: n.service_en, name_hi: n.service_hi, icon: n.icon },
        area: { slug: n.region_slug, name_en: n.region_en, name_hi: n.region_hi },
      })),
    });
  }

  if (method === 'POST' && path === '/api/me/move') {
    if (!me) return unauthorized();
    await db.prepare(
      `UPDATE invites SET revoked_at = datetime('now')
       WHERE move_poster_id = ?1 AND used_at IS NULL AND revoked_at IS NULL`,
    ).bind(me.id).run();
    const token = randomToken();
    await db.prepare(
      `INSERT INTO invites (token_hash, team_id, service_id, role, note, created_by, expires_at, move_poster_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now', '+30 minutes'), ?6)`,
    ).bind(await sha256hex(token), me.team_id, me.service_id, me.role, `move: ${me.name}`, me.id).run();
    const row = await db.prepare('SELECT expires_at FROM invites WHERE token_hash = ?1')
      .bind(await sha256hex(token)).first();
    return json({ url: `${publicOrigin(url)}/join#t=${token}`, expires_at: row.expires_at }, 201);
  }

  // ───────────────────────── admin ─────────────────────────

  if (method === 'POST' && path === '/api/invites') {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const body = await request.json().catch(() => null);
    const role = ROLES.includes(body?.role) ? body.role : 'poster';
    // Nobody may mint authority above their own.
    if (rank(role) > rank(me.role)) return forbidden('above your own role');
    const note = (body?.note || '').trim().slice(0, 80) || null;
    const hours = Math.min(Math.max(parseInt(body?.hours, 10) || 48, 1), 336);

    // Where the invitee lands is derived from their ROLE, never inherited from
    // the inviter. It used to default to me.team_id, and a site admin sits on
    // the global root — which belongs to no service — so a service admin minted
    // that way landed on the root and their team-tree walk spanned every
    // service. A service admin is one service by definition, and that has to be
    // true of the row, not merely of the screen that created it.
    let teamId = null;
    let serviceId = null;

    if (role === 'site_admin') {
      teamId = (await globalRootTeam(db))?.id ?? null;
      if (!teamId) return badRequest('no root team');
    } else {
      // Everyone else belongs to exactly one service, and the inviter has to
      // reach it themselves.
      const svc = body?.service ? await myService(db, me, String(body.service)) : null;
      if (!svc) return badRequest('pick a service for this person');
      const root = await serviceRootTeam(db, svc.id);
      if (!root) return badRequest('that service has no root team');
      serviceId = svc.id;

      if (role === 'service_admin') {
        teamId = root.id;
      } else {
        // A poster is limited to areas, not just to a service. Selecting a
        // region means everything inside it, now and later — only the topmost
        // choices are stored, and scopedCoverage expands downward, so an area
        // added under that region tomorrow is covered without touching this.
        const picked = Array.isArray(body?.areas) ? body.areas.map(String) : [];
        if (picked.length) {
          const reach = coverageByService(await scopedCoverage(db, me.team_id))
            .find((c) => c.slug === svc.slug);
          const mine = new Set((reach?.regions ?? []).map((r) => r.slug));
          if (picked.some((slug) => !mine.has(slug))) return forbidden('not your area');

          const marks = picked.map((_, i) => `?${i + 2}`).join(',');
          const { results: rows } = await db.prepare(
            `SELECT id, slug, name_en, parent_id FROM regions WHERE service_id = ?1 AND slug IN (${marks})`,
          ).bind(svc.id, ...picked).all();
          if (rows.length !== new Set(picked).size) return badRequest('no such area');

          const top = await topmostRegions(db, rows);
          teamId = await crewForCoverage(db, root.id, svc.id, top.map((r) => r.id),
            top.map((r) => r.name_en).join(' · ').slice(0, 60) || 'Crew');
        } else {
          // No areas named: the service's existing crew, as before.
          teamId = await coveringTeam(db, me, svc.id);
          if (!teamId) return badRequest('this service has no crew yet');
        }
      }
    }

    // Whatever the role decided, it still has to sit inside the inviter's own
    // branch of the tree.
    const allowed = await teamTree(db, me.team_id);
    if (!allowed.includes(teamId)) return forbidden('not your team');

    const token = randomToken();
    await db.prepare(
      `INSERT INTO invites (token_hash, team_id, service_id, role, note, created_by, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now', ?7))`,
    ).bind(await sha256hex(token), teamId, serviceId, role, note, me.id, `+${hours} hours`).run();
    const row = await db.prepare('SELECT id, expires_at FROM invites WHERE token_hash = ?1')
      .bind(await sha256hex(token)).first();
    return json({ id: row.id, url: `${publicOrigin(url)}/join#t=${token}`, role, note, expires_at: row.expires_at }, 201);
  }

  if (method === 'GET' && path === '/api/invites') {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const teams = await teamTree(db, me.team_id);
    const marks = teams.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await db.prepare(
      `SELECT i.id, i.role, i.note, i.created_at, i.expires_at, i.used_at, i.revoked_at,
              p.name AS used_by_name
       FROM invites i
       LEFT JOIN posters p ON p.id = i.used_by
       WHERE i.team_id IN (${marks}) AND i.move_poster_id IS NULL
         AND datetime(i.created_at) > datetime('now', '-30 days')
       ORDER BY i.created_at DESC LIMIT 40`,
    ).bind(...teams).all();
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
    if (!isAdmin(me)) return forbidden('admin only');
    const teams = await teamTree(db, me.team_id);
    const marks = teams.map((_, i) => `?${i + 2}`).join(',');
    const res = await db.prepare(
      `UPDATE invites SET revoked_at = datetime('now')
       WHERE id = ?1 AND team_id IN (${marks}) AND used_at IS NULL AND revoked_at IS NULL`,
    ).bind(revokeInvite[1], ...teams).run();
    if (!res.meta.changes) return notFound();
    return json({ id: Number(revokeInvite[1]), state: 'revoked' });
  }

  if (method === 'GET' && path === '/api/team/members') {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const teams = await teamTree(db, me.team_id);
    const marks = teams.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await db.prepare(
      `SELECT p.id, p.name, p.phone, p.role, p.created_at, p.revoked_at,
              t.name AS team_name, s.name_en AS service_en, s.name_hi AS service_hi, s.icon
       FROM posters p
       JOIN teams t ON t.id = p.team_id
       LEFT JOIN services s ON s.id = p.service_id
       WHERE p.team_id IN (${marks})
       ORDER BY p.revoked_at IS NOT NULL, p.created_at`,
    ).bind(...teams).all();
    return json({
      members: results.map((m) => ({
        ...m,
        is_you: m.id === me.id,
        can_remove: m.id !== me.id && !m.revoked_at && rank(m.role) <= rank(me.role),
      })),
    });
  }

  const revokeMember = path.match(/^\/api\/team\/members\/(\d+)\/revoke$/);
  if (method === 'POST' && revokeMember) {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const id = Number(revokeMember[1]);
    if (id === me.id) return badRequest('you cannot revoke yourself');
    const teams = await teamTree(db, me.team_id);
    const target = await db.prepare(
      'SELECT id, role, team_id FROM posters WHERE id = ?1 AND revoked_at IS NULL',
    ).bind(id).first();
    if (!target || !teams.includes(target.team_id)) return notFound();
    if (rank(target.role) > rank(me.role)) return forbidden('above your own role');
    if (target.role === 'site_admin') {
      const { count } = await db.prepare(
        "SELECT COUNT(*) AS count FROM posters WHERE role = 'site_admin' AND revoked_at IS NULL",
      ).first();
      if (count <= 1) return badRequest('that is the last site admin');
    }
    await db.prepare("UPDATE posters SET revoked_at = datetime('now') WHERE id = ?1").bind(id).run();
    return json({ id, state: 'revoked' });
  }

  // Areas belong to a service, so a service admin owns their own. A site admin
  // reaches every service by sitting above them in the tree, not by a special
  // case here.
  const addArea = path.match(/^\/api\/services\/([a-z0-9-]+)\/areas$/);
  if (method === 'POST' && addArea) {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const svcRow = await myService(db, me, addArea[1]);
    if (!svcRow) return forbidden('not your service');
    const body = await request.json().catch(() => null);
    const slug = (body?.slug || '').trim().toLowerCase();
    const name_en = (body?.name_en || '').trim().slice(0, 60);
    const name_hi = (body?.name_hi || '').trim().slice(0, 60);
    if (!SLUG_RE.test(slug)) return badRequest('slug: a-z, 0-9 and hyphens');
    if (!name_en || !name_hi) return badRequest('both names are required');
    // Slugs are unique across the whole site so a public URL never needs the
    // service to disambiguate. Say so plainly rather than failing cryptically.
    if (await db.prepare('SELECT id FROM regions WHERE slug = ?1').bind(slug).first()) {
      return badRequest('that short id is already taken — try another');
    }
    // Coverage must attach to a team *inside this service*. A site admin sits
    // on the global root, which belongs to no service — hanging the area there
    // would leave it real but invisible, because the public listing joins
    // areas to services through the covering team. Prefer the admin's own team
    // when it fits, otherwise the service's deepest crew.
    const owner = await coveringTeam(db, me, svcRow.id);
    if (!owner) return badRequest('this service has no crew to cover the area');

    // Optionally nested under an existing area of the same service, which is
    // what turns that one into a "region" — there is no separate kind of thing.
    let parentId = null;
    if (body?.parent) {
      const parent = await db.prepare(
        'SELECT id FROM regions WHERE service_id = ?1 AND slug = ?2',
      ).bind(svcRow.id, String(body.parent)).first();
      if (!parent) return badRequest('no such area to nest under');
      parentId = parent.id;
    }

    // regions.team_id survives the pre-services schema as NOT NULL and cannot
    // be dropped without a rebuild, so it is still written.
    await db.prepare(
      'INSERT INTO regions (service_id, team_id, slug, name_en, name_hi, parent_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    ).bind(svcRow.id, owner, slug, name_en, name_hi, parentId).run();
    const added = await db.prepare('SELECT id FROM regions WHERE slug = ?1').bind(slug).first();
    await db.prepare('INSERT OR IGNORE INTO team_regions (team_id, region_id) VALUES (?1, ?2)')
      .bind(owner, added.id).run();
    return json({ slug, name_en, name_hi, parent: body?.parent ?? null }, 201);
  }

  // Move an area under another, or out to the top. Separate from rename
  // because it is the one area edit that can corrupt the shape of the tree.
  const nestArea = path.match(/^\/api\/services\/([a-z0-9-]+)\/areas\/([a-z0-9-]+)\/nest$/);
  if (method === 'POST' && nestArea) {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const svcRow = await myService(db, me, nestArea[1]);
    if (!svcRow) return forbidden('not your service');
    const body = await request.json().catch(() => null);
    const child = await db.prepare(
      'SELECT id, slug FROM regions WHERE service_id = ?1 AND slug = ?2',
    ).bind(svcRow.id, nestArea[2]).first();
    if (!child) return notFound();

    if (!body?.parent) {
      await db.prepare('UPDATE regions SET parent_id = NULL WHERE id = ?1').bind(child.id).run();
      return json({ slug: child.slug, parent: null });
    }

    const parent = await db.prepare(
      'SELECT id FROM regions WHERE service_id = ?1 AND slug = ?2',
    ).bind(svcRow.id, String(body.parent)).first();
    if (!parent) return badRequest('no such area to nest under');
    if (parent.id === child.id) return badRequest('an area cannot contain itself');

    // The guard that matters: nesting an area under its own descendant would
    // cut that whole branch loose into a cycle, invisible to every query that
    // starts from a root.
    const below = await regionSubtree(db, [child.id]);
    if (below.includes(parent.id)) return badRequest('that would put the area inside itself');

    await db.prepare('UPDATE regions SET parent_id = ?2 WHERE id = ?1').bind(child.id, parent.id).run();
    return json({ slug: child.slug, parent: String(body.parent) });
  }

  const renameArea = path.match(/^\/api\/services\/([a-z0-9-]+)\/areas\/([a-z0-9-]+)\/rename$/);
  if (method === 'POST' && renameArea) {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const svcRow = await myService(db, me, renameArea[1]);
    if (!svcRow) return forbidden('not your service');
    const body = await request.json().catch(() => null);
    const name_en = (body?.name_en || '').trim().slice(0, 60);
    const name_hi = (body?.name_hi || '').trim().slice(0, 60);
    if (!name_en || !name_hi) return badRequest('both names are required');
    const res = await db.prepare(
      'UPDATE regions SET name_en = ?3, name_hi = ?4 WHERE service_id = ?1 AND slug = ?2',
    ).bind(svcRow.id, renameArea[2], name_en, name_hi).run();
    if (!res.meta.changes) return notFound();
    return json({ slug: renameArea[2], name_en, name_hi });
  }

  // Which areas this admin's crew covers. Service-scoped, so a water admin
  // cannot quietly claim an area on the electricity service's behalf.
  const coverage = path.match(/^\/api\/services\/([a-z0-9-]+)\/coverage$/);
  if (method === 'POST' && coverage) {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const body = await request.json().catch(() => null);
    const on = Boolean(body?.on);
    const svcRowCov = await myService(db, me, coverage[1]);
    if (!svcRowCov) return forbidden('not your service');
    const region = await db.prepare('SELECT id FROM regions WHERE service_id = ?1 AND slug = ?2')
      .bind(svcRowCov.id, String(body?.area || '')).first();
    if (!region) return notFound();
    // Same rule as adding an area: coverage belongs to a team inside the
    // service, never to a root that spans several of them.
    const teams = await teamTree(db, me.team_id);
    const teamId = body?.team && teams.includes(Number(body.team))
      ? Number(body.team)
      : await coveringTeam(db, me, svcRowCov.id);
    if (!teamId) return badRequest('this service has no crew to cover the area');
    if (on) {
      await db.prepare('INSERT OR IGNORE INTO team_regions (team_id, region_id) VALUES (?1, ?2)')
        .bind(teamId, region.id).run();
    } else {
      await db.prepare('DELETE FROM team_regions WHERE team_id = ?1 AND region_id = ?2')
        .bind(teamId, region.id).run();
    }
    return json({ area: body.area, on });
  }

  // Every area this service defines — the admin's list, which is a superset of
  // what any one crew covers.
  const listAreas = path.match(/^\/api\/services\/([a-z0-9-]+)\/areas$/);
  if (method === 'GET' && listAreas) {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const svcRow = await myService(db, me, listAreas[1]);
    if (!svcRow) return forbidden('not your service');
    const { results } = await db.prepare(
      `SELECT r.slug, r.name_en, r.name_hi, p.slug AS parent,
              NOT EXISTS (SELECT 1 FROM regions c WHERE c.parent_id = r.id) AS is_leaf
       FROM regions r
       LEFT JOIN regions p ON p.id = r.parent_id
       WHERE r.service_id = ?1
       ORDER BY COALESCE(p.slug, r.slug), r.parent_id IS NOT NULL, r.slug`,
    ).bind(svcRow.id).all();
    return json({ areas: results.map((a) => ({
      slug: a.slug, name_en: a.name_en, name_hi: a.name_hi,
      parent: a.parent ?? null, leaf: Boolean(a.is_leaf),
    })) });
  }


  // ── services: only a site admin may create one ────────────────────────────
  // Creating a service also creates its root team (where its admins live) and
  // a first crew (where its posters live), so it is usable the moment it
  // exists rather than needing two more invisible steps.
  if (method === 'POST' && path === '/api/services') {
    if (!me) return unauthorized();
    if (!isSiteAdmin(me)) return forbidden('site admin only');
    const body = await request.json().catch(() => null);
    const slug = (body?.slug || '').trim().toLowerCase();
    const name_en = (body?.name_en || '').trim().slice(0, 60);
    const name_hi = (body?.name_hi || '').trim().slice(0, 60);
    const icon = (body?.icon || '').trim().slice(0, 8) || null;
    const accent = /^#[0-9a-fA-F]{6}$/.test(body?.accent || '') ? body.accent : '#8fb573';
    if (!SLUG_RE.test(slug)) return badRequest('slug: a-z, 0-9 and hyphens');
    if (!name_en || !name_hi) return badRequest('both names are required');
    if (await db.prepare('SELECT id FROM services WHERE slug = ?1').bind(slug).first()) {
      return badRequest('that service already exists');
    }

    const clean = (arr, withKey) => (Array.isArray(arr) ? arr : [])
      .map((x) => ({
        ...(withKey ? { key: String(x?.key || x?.en || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30) } : {}),
        en: String(x?.en || '').trim().slice(0, 60),
        hi: String(x?.hi || '').trim().slice(0, 60),
      }))
      .filter((x) => x.en && x.hi && (!withKey || x.key));
    const kinds = clean(body?.kinds, true);
    const reasons = clean(body?.reasons, false);
    if (kinds.length === 0) return badRequest('a service needs at least one kind of notice');

    const { max } = await db.prepare('SELECT COALESCE(MAX(sort), 0) AS max FROM services').first();
    await db.prepare(
      `INSERT INTO services (slug, name_en, name_hi, icon, accent, kinds, reasons, sort)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    ).bind(slug, name_en, name_hi, icon, accent, JSON.stringify(kinds), JSON.stringify(reasons), max + 1).run();
    const svcRow = await db.prepare('SELECT id FROM services WHERE slug = ?1').bind(slug).first();

    // teams.invite_code is NOT NULL from Season 0 and cannot be dropped without
    // a rebuild, so every new team still has to carry one. It is never read.
    // A service without its teams is unusable and invisible, so don't leave
    // one behind if the second half fails.
    try {
      // Looked up, not hardcoded to 900: assuming that id is what left every
      // site admin pointing at a team that did not exist, and needed 0008.
      const kuhu = await globalRootTeam(db);
      if (!kuhu) return badRequest('no root team');
      const root = await newTeam(db, name_en, kuhu.id, svcRow.id);
      const crew = await newTeam(db, `${name_en} crew`, root, svcRow.id);

      // Areas given at creation time. A service with none is a service nobody
      // can subscribe to or post about, so letting them be named here removes
      // the most obvious way to end up with a half-made one.
      for (const a of (Array.isArray(body?.areas) ? body.areas : []).slice(0, 40)) {
        const aEn = String(a?.en || '').trim().slice(0, 60);
        const aHi = String(a?.hi || '').trim().slice(0, 60);
        if (!aEn || !aHi) continue;
        const base = String(a?.slug || aEn).trim().toLowerCase()
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 39);
        if (!SLUG_RE.test(base)) continue;
        // Slugs are unique across the site, so fall back to a service prefix
        // rather than refusing the whole creation over a name collision.
        const taken = await db.prepare('SELECT id FROM regions WHERE slug = ?1').bind(base).first();
        const aSlug = taken ? `${slug}-${base}`.slice(0, 39) : base;
        if (await db.prepare('SELECT id FROM regions WHERE slug = ?1').bind(aSlug).first()) continue;
        await db.prepare(
          'INSERT INTO regions (service_id, team_id, slug, name_en, name_hi) VALUES (?1, ?2, ?3, ?4, ?5)',
        ).bind(svcRow.id, crew, aSlug, aEn, aHi).run();
        const row = await db.prepare('SELECT id FROM regions WHERE slug = ?1').bind(aSlug).first();
        await db.prepare('INSERT OR IGNORE INTO team_regions (team_id, region_id) VALUES (?1, ?2)')
          .bind(crew, row.id).run();
      }
    } catch (err) {
      await db.prepare('DELETE FROM team_regions WHERE region_id IN (SELECT id FROM regions WHERE service_id = ?1)').bind(svcRow.id).run();
      await db.prepare('DELETE FROM regions WHERE service_id = ?1').bind(svcRow.id).run();
      await db.prepare('DELETE FROM teams WHERE service_id = ?1').bind(svcRow.id).run();
      await db.prepare('DELETE FROM services WHERE id = ?1').bind(svcRow.id).run();
      throw err;
    }

    return json({ slug, name_en, name_hi, icon, accent, kinds, reasons }, 201);
  }

  // Teams a person may target when inviting — their own subtree, labelled with
  // the service each belongs to.
  if (method === 'GET' && path === '/api/teams') {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const ids = await teamTree(db, me.team_id);
    const marks = ids.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await db.prepare(
      `SELECT t.id, t.name, t.parent_id, s.slug AS service_slug,
              s.name_en AS service_en, s.name_hi AS service_hi, s.icon
       FROM teams t LEFT JOIN services s ON s.id = t.service_id
       WHERE t.id IN (${marks})
       ORDER BY s.sort, t.id`,
    ).bind(...ids).all();
    return json({ teams: results });
  }

  // A crew inside a service, for when one is not enough.
  const addTeam = path.match(/^\/api\/services\/([a-z0-9-]+)\/teams$/);
  if (method === 'POST' && addTeam) {
    if (!me) return unauthorized();
    if (!isAdmin(me)) return forbidden('admin only');
    const svcRow = await myService(db, me, addTeam[1]);
    if (!svcRow) return forbidden('not your service');
    const body = await request.json().catch(() => null);
    const name = (body?.name || '').trim().slice(0, 60);
    if (!name) return badRequest('a name is required');
    const root = await db.prepare(
      'SELECT id FROM teams WHERE service_id = ?1 AND parent_id = 900',
    ).bind(svcRow.id).first();
    const id = await newTeam(db, name, root?.id ?? me.team_id, svcRow.id);
    return json({ id, name }, 201);
  }

  // ───────────────────────── subscribers ─────────────────────────

  if (method === 'POST' && path === '/api/subscriptions') {
    const body = await request.json().catch(() => null);
    const endpoint = body?.endpoint;
    const lang = body?.lang === 'hi' ? 'hi' : 'en';
    const topics = Array.isArray(body?.topics) ? body.topics.slice(0, 60) : [];
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return badRequest('bad endpoint');
    if (topics.length === 0) return badRequest('pick at least one area');
    await db.prepare(
      `INSERT INTO subscriptions (endpoint, p256dh, auth, lang) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, lang = ?4`,
    ).bind(endpoint, body?.keys?.p256dh ?? null, body?.keys?.auth ?? null, lang).run();
    const sub = await db.prepare('SELECT id FROM subscriptions WHERE endpoint = ?1').bind(endpoint).first();
    await db.prepare('DELETE FROM subscription_regions WHERE subscription_id = ?1').bind(sub.id).run();
    for (const tpc of topics) {
      await db.prepare(
        `INSERT OR IGNORE INTO subscription_regions (subscription_id, region_id, service_id)
         SELECT ?1, r.id, s.id FROM services s
         JOIN regions r ON r.service_id = s.id AND r.slug = ?2
         WHERE s.slug = ?3 AND s.enabled = 1`,
      ).bind(sub.id, String(tpc?.area ?? ''), String(tpc?.service ?? '')).run();
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
    const sub = await db.prepare('SELECT id, lang FROM subscriptions WHERE endpoint = ?1')
      .bind(body.endpoint).first();
    if (!sub) return notFound();
    // Must match notifyRegions exactly, or a region subscriber gets the buzz
    // and then no text to put in it. `anc` maps every area to itself plus all
    // its ancestors, so a subscription on Kangra matches a notice on Naddi.
    //
    // DISTINCT because somebody subscribed to both Kangra and Naddi matches the
    // same notice twice, and the region names below are aggregated — without it
    // the notification would read "Naddi · Naddi".
    const { results } = await db.prepare(
      `WITH RECURSIVE anc(region_id, ancestor_id) AS (
         SELECT id, id FROM regions
         UNION
         SELECT a.region_id, r.parent_id
         FROM anc a JOIN regions r ON r.id = a.ancestor_id
         WHERE r.parent_id IS NOT NULL
       )
       SELECT DISTINCT
              n.id, n.kind, n.win_from, n.win_to, n.reason_en, n.reason_hi, n.status,
              n.posted_at, n.batch_id,
              s.name_en AS service_en, s.name_hi AS service_hi, s.icon, s.kinds,
              r.name_en AS region_en, r.name_hi AS region_hi
       FROM notices n
       JOIN services s ON s.id = n.service_id
       JOIN regions r  ON r.id = n.region_id
       JOIN anc        ON anc.region_id = n.region_id
       JOIN subscription_regions sr
         ON sr.region_id = anc.ancestor_id AND sr.service_id = n.service_id
       WHERE sr.subscription_id = ?1
         AND datetime(n.posted_at) > datetime('now', '-2 days')
         AND datetime(n.win_to) > datetime('now')
       ORDER BY datetime(n.posted_at) DESC LIMIT 12`,
    ).bind(sub.id).all();

    const seen = new Map();
    for (const n of results) {
      const key = n.batch_id || n.id;
      if (!seen.has(key)) seen.set(key, { ...publicNotice(n), row: n, en: [n.region_en], hi: [n.region_hi] });
      else { seen.get(key).en.push(n.region_en); seen.get(key).hi.push(n.region_hi); }
    }
    return json({
      lang: sub.lang,
      notices: [...seen.values()].map(({ en, hi, row, ...n }) => {
        const kinds = (() => { try { return JSON.parse(row.kinds || '[]'); } catch { return []; } })();
        const k = kinds.find((x) => x.key === n.kind);
        return {
          ...n,
          service: { name_en: row.service_en, name_hi: row.service_hi, icon: row.icon },
          kind_label: { en: k?.en ?? n.kind, hi: k?.hi ?? n.kind },
          area: { name_en: en.join(' · '), name_hi: hi.join(' · ') },
        };
      }),
    });
  }

  return notFound();
}

// ───────────────────────── helpers ─────────────────────────

function publicOrigin(url) {
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return local ? url.origin : `https://${url.host}`;
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
    batch_id: n.batch_id ?? null,
  };
}

/** Area slugs are unique per service, so a lookup without one is ambiguous. */
async function slugsToRegionIds(db, serviceId, slugs) {
  if (slugs.length === 0) return new Map();
  const marks = slugs.map((_, i) => `?${i + 2}`).join(',');
  const { results } = await db.prepare(
    `SELECT id, slug FROM regions WHERE service_id = ?1 AND slug IN (${marks})`,
  ).bind(serviceId, ...slugs).all();
  return new Map(results.map((r) => [r.slug, r.id]));
}

/**
 * Which team should hold coverage for an area in this service: the acting
 * admin's own team if it belongs to the service, otherwise the service's
 * lowest crew. Never a root that spans services — an area hung there is
 * invisible to the public listing.
 */
async function coveringTeam(db, me, serviceId) {
  if (me.service_id === serviceId) return me.team_id;
  const inTree = await teamTree(db, me.team_id);
  if (inTree.length === 0) return null;
  const marks = inTree.map((_, i) => `?${i + 2}`).join(',');
  const row = await db.prepare(
    `SELECT id FROM teams
     WHERE service_id = ?1 AND id IN (${marks})
     ORDER BY (parent_id = 900) ASC, id DESC LIMIT 1`,
  ).bind(serviceId, ...inTree).first();
  return row?.id ?? null;
}

/** Create a team, satisfying the vestigial NOT NULL invite_code. */

/** The service row, if this person actually reaches it. */
async function myService(db, me, slug) {
  const mine = await scopedServices(db, me.team_id);
  if (!mine.some((x) => x.slug === slug)) return null;
  return db.prepare('SELECT id, slug FROM services WHERE slug = ?1').bind(slug).first();
}

async function authPoster(db, request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  return db.prepare(
    `SELECT p.id, p.team_id, p.service_id, p.name, p.role, t.name AS team_name
     FROM posters p JOIN teams t ON t.id = p.team_id
     WHERE p.token_hash = ?1 AND p.revoked_at IS NULL`,
  ).bind(await sha256hex(token)).first();
}

async function liveInvite(db, token) {
  if (!token || typeof token !== 'string') return null;
  return db.prepare(
    `SELECT id, team_id, service_id, role, expires_at, move_poster_id FROM invites
     WHERE token_hash = ?1 AND used_at IS NULL AND revoked_at IS NULL
       AND datetime(expires_at) > datetime('now')`,
  ).bind(await sha256hex(token)).first();
}

/**
 * Everything that happens after a notice changes: push to people, a line in
 * the Telegram channel, retained MQTT for the machines. Each swallows its own
 * failures — the notice is the thing that matters.
 */
async function fanOut(db, env, svc, serviceId, regions, notice) {
  const ids = regions.map((r) => r.id).filter(Boolean);
  const kindLabel = svc.kinds.find((k) => k.key === notice.kind);

  const payload = {
    ...notice,
    service_en: svc.name_en, service_hi: svc.name_hi, icon: svc.icon,
    kind_en: kindLabel?.en ?? notice.kind, kind_hi: kindLabel?.hi ?? notice.kind,
    areas_en: regions.map((r) => r.name_en).join(', '),
    areas_hi: regions.map((r) => r.name_hi).join(', '),
  };
  const state = JSON.stringify({
    service: svc.slug,
    status: notice.status,
    kind: notice.kind,
    from: notice.from,
    to: notice.to,
    reason: { en: notice.reason_en, hi: notice.reason_hi },
    areas: regions.map((r) => r.slug),
    updated_at: new Date().toISOString(),
  });

  await Promise.allSettled([
    notifyRegions(db, env, serviceId, ids),
    mirrorToTelegram(env, payload),
    publishMqtt(env, regions.map((r) => [topicFor(svc.slug, r.slug), state])),
  ]);

  if (env.MQTT_URL) {
    for (const id of ids) {
      await db.prepare(
        `INSERT INTO mqtt_retained (service_id, region_id, until) VALUES (?1, ?2, ?3)
         ON CONFLICT(service_id, region_id) DO UPDATE SET until = ?3`,
      ).bind(serviceId, id, notice.to).run();
    }
  }
}

async function clearExpiredRetained(env) {
  if (!env.MQTT_URL) return;
  const { results: stale } = await env.DB.prepare(
    `SELECT m.service_id, m.region_id, s.slug AS service_slug, r.slug AS region_slug
     FROM mqtt_retained m
     JOIN services s ON s.id = m.service_id
     JOIN regions r  ON r.id = m.region_id
     WHERE datetime(m.until) < datetime('now')`,
  ).all();
  if (stale.length === 0) return;

  const res = await publishMqtt(env, stale.map((r) => [topicFor(r.service_slug, r.region_slug), '']));
  if (!res.ok) return;                       // leave the marks; try again next hour

  for (const r of stale) {
    await env.DB.prepare('DELETE FROM mqtt_retained WHERE service_id = ?1 AND region_id = ?2')
      .bind(r.service_id, r.region_id).run();
  }
  console.log(`cleared retained state for ${stale.length} topic(s)`);
}

// Who may see and do what.
//
// Scope comes from the team tree; role comes from the poster row. Keeping the
// two separate is what lets one recursive query answer "what can this person
// see?" for a lineman, a service admin and a site admin alike:
//
//   kuhu                        ← site_admin   sees every service
//     └── Electricity           ← service_admin sees one service
//           └── Local line crew ← poster        sees their crew's areas
//
// A site admin is not a special case in the query — they simply sit higher up
// the same tree.

export const ROLES = ['poster', 'service_admin', 'site_admin'];

/** Higher wins. Used for "may I act on this person?" checks. */
export function rank(role) {
  return Math.max(0, ROLES.indexOf(role));
}

export function isAdmin(me) {
  return me.role === 'service_admin' || me.role === 'site_admin';
}

export function isSiteAdmin(me) {
  return me.role === 'site_admin';
}

/** Every team at or below this one. */
export async function teamTree(db, teamId) {
  const { results } = await db.prepare(
    `WITH RECURSIVE tree(id) AS (
       SELECT ?1
       UNION ALL
       SELECT t.id FROM teams t JOIN tree ON t.parent_id = tree.id
     )
     SELECT id FROM tree`,
  ).bind(teamId).all();
  return results.map((r) => r.id);
}

// ───────────────────── the area tree ─────────────────────
//
// Every recursive walk below uses UNION rather than UNION ALL. Dedup is not
// the point — termination is. A cycle in parent_id would spin forever under
// UNION ALL, and while the write path refuses to create one, a query that
// cannot hang whatever the data says is worth the rounding error.

export const MAX_REGION_DEPTH = 3;

/** A node and everything beneath it. */
export async function regionSubtree(db, regionIds) {
  const ids = [...new Set(regionIds)].filter((id) => id != null);
  if (!ids.length) return [];
  const marks = ids.map((_, i) => `?${i + 1}`).join(',');
  const { results } = await db.prepare(
    `WITH RECURSIVE below(id) AS (
       SELECT id FROM regions WHERE id IN (${marks})
       UNION
       SELECT r.id FROM regions r JOIN below ON r.parent_id = below.id
     )
     SELECT id FROM below`,
  ).bind(...ids).all();
  return results.map((r) => r.id);
}

/**
 * The leaves at or beneath these nodes — where notices are allowed to land.
 * A leaf is its own leaf, so a flat area passes straight through.
 */
export async function regionLeaves(db, regionIds) {
  const all = await regionSubtree(db, regionIds);
  if (!all.length) return [];
  const marks = all.map((_, i) => `?${i + 1}`).join(',');
  const { results } = await db.prepare(
    `SELECT r.id FROM regions r
     WHERE r.id IN (${marks})
       AND NOT EXISTS (SELECT 1 FROM regions c WHERE c.parent_id = r.id)`,
  ).bind(...all).all();
  return results.map((r) => r.id);
}

/** A node and everything above it, root-most last. */
export async function regionAncestors(db, regionIds) {
  const ids = [...new Set(regionIds)].filter((id) => id != null);
  if (!ids.length) return [];
  const marks = ids.map((_, i) => `?${i + 1}`).join(',');
  const { results } = await db.prepare(
    `WITH RECURSIVE above(id, parent_id) AS (
       SELECT id, parent_id FROM regions WHERE id IN (${marks})
       UNION
       SELECT r.id, r.parent_id FROM regions r JOIN above ON r.id = above.parent_id
     )
     SELECT id FROM above`,
  ).bind(...ids).all();
  return results.map((r) => r.id);
}

/** How deep a node sits, counting itself. A root is 1. */
export async function regionDepth(db, regionId) {
  if (regionId == null) return 0;
  return (await regionAncestors(db, [regionId])).length;
}

/**
 * How many levels the subtree under a node extends, counting the node as 1.
 * Needed before re-parenting: moving a two-level branch under a node that is
 * already at the limit would push its leaves past the cap.
 *
 * The depth < 10 guard is belt and braces — UNION ALL is used here because the
 * running depth makes rows distinct, so dedup would not stop a cycle.
 */
export async function deepestBelow(db, regionId) {
  const row = await db.prepare(
    `WITH RECURSIVE below(id, depth) AS (
       SELECT id, 1 FROM regions WHERE id = ?1
       UNION ALL
       SELECT r.id, below.depth + 1
       FROM regions r JOIN below ON r.parent_id = below.id
       WHERE below.depth < 10
     )
     SELECT MAX(depth) AS d FROM below`,
  ).bind(regionId).first();
  return row?.d ?? 1;
}

/**
 * The (service, region) pairs this person may post to — the areas their own
 * crew covers, plus every crew beneath them, plus everything beneath those
 * areas. Covering a region means covering what is in it; otherwise nesting an
 * area under a region a crew already answers for would silently take it away
 * from them.
 *
 * A site admin sitting at the root gets every service's coverage without the
 * query knowing anything about site admins.
 */
export async function scopedCoverage(db, teamId) {
  const { results } = await db.prepare(
    `WITH RECURSIVE tree(id) AS (
       SELECT ?1
       UNION ALL
       SELECT t.id FROM teams t JOIN tree ON t.parent_id = tree.id
     ),
     covered(id) AS (
       SELECT tr.region_id FROM team_regions tr JOIN tree ON tree.id = tr.team_id
     ),
     below(id) AS (
       SELECT id FROM covered
       UNION
       SELECT r.id FROM regions r JOIN below ON r.parent_id = below.id
     )
     SELECT DISTINCT
            s.id AS service_id, s.slug AS service_slug,
            s.name_en AS service_en, s.name_hi AS service_hi,
            s.icon AS icon, s.accent AS accent, s.kinds AS kinds, s.reasons AS reasons,
            r.id AS region_id, r.slug AS region_slug,
            r.name_en AS region_en, r.name_hi AS region_hi,
            p.slug AS parent_slug,
            NOT EXISTS (SELECT 1 FROM regions c WHERE c.parent_id = r.id) AS is_leaf
     FROM below
     JOIN regions r      ON r.id = below.id
     JOIN services s     ON s.id = r.service_id AND s.enabled = 1
     LEFT JOIN regions p ON p.id = r.parent_id
     ORDER BY s.sort, s.slug, COALESCE(p.slug, r.slug), r.parent_id IS NOT NULL, r.slug`,
  ).bind(teamId).all();
  return results;
}

/** The services this person has any reach into, in display order. */
export async function scopedServices(db, teamId) {
  const { results } = await db.prepare(
    `WITH RECURSIVE tree(id) AS (
       SELECT ?1
       UNION ALL
       SELECT t.id FROM teams t JOIN tree ON t.parent_id = tree.id
     )
     SELECT DISTINCT s.id, s.slug, s.name_en, s.name_hi, s.icon, s.accent,
                     s.kinds, s.reasons, s.sort
     FROM teams t
     JOIN tree       ON tree.id = t.id
     JOIN services s ON s.id = t.service_id AND s.enabled = 1
     ORDER BY s.sort, s.slug`,
  ).bind(teamId).all();
  return results.map(publicService);
}

/**
 * Shape a service row for the client, parsing its JSON columns once.
 *
 * Stored vocabulary is compact — {key,en,hi} — because a human edits it by
 * hand in SQL. The API normalises it to the same {name_en,name_hi} shape every
 * other named thing uses, so the client has exactly one way to read a label.
 */
export function publicService(s) {
  const parse = (v) => {
    try { const out = JSON.parse(v || '[]'); return Array.isArray(out) ? out : []; }
    catch { return []; }
  };
  const label = (o) => ({ name_en: o.en ?? o.name_en ?? '', name_hi: o.hi ?? o.name_hi ?? '' });
  return {
    slug: s.slug,
    name_en: s.name_en,
    name_hi: s.name_hi,
    icon: s.icon,
    accent: s.accent,
    kinds: parse(s.kinds).map((k) => ({ key: k.key, ...label(k) })),
    reasons: parse(s.reasons).map(label),
  };
}

/** Group a coverage list into one entry per service, each with its areas. */
export function coverageByService(rows) {
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.service_slug)) {
      out.set(r.service_slug, {
        ...publicService({
          slug: r.service_slug, name_en: r.service_en, name_hi: r.service_hi,
          icon: r.icon, accent: r.accent, kinds: r.kinds, reasons: r.reasons,
        }),
        regions: [],
      });
    }
    out.get(r.service_slug).regions.push({
      slug: r.region_slug,
      name_en: r.region_en,
      name_hi: r.region_hi,
      parent: r.parent_slug ?? null,
      leaf: Boolean(r.is_leaf),
    });
  }
  return [...out.values()];
}

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

/**
 * The (service, region) pairs this person may post to — the areas their own
 * crew covers, plus every crew beneath them. A site admin sitting at the root
 * therefore gets every service's coverage without the query knowing anything
 * about site admins.
 */
export async function scopedCoverage(db, teamId) {
  const { results } = await db.prepare(
    `WITH RECURSIVE tree(id) AS (
       SELECT ?1
       UNION ALL
       SELECT t.id FROM teams t JOIN tree ON t.parent_id = tree.id
     )
     SELECT DISTINCT
            s.id AS service_id, s.slug AS service_slug,
            s.name_en AS service_en, s.name_hi AS service_hi,
            s.icon AS icon, s.accent AS accent, s.kinds AS kinds, s.reasons AS reasons,
            r.id AS region_id, r.slug AS region_slug,
            r.name_en AS region_en, r.name_hi AS region_hi
     FROM team_regions tr
     JOIN tree           ON tree.id = tr.team_id
     JOIN teams t        ON t.id = tr.team_id
     JOIN services s     ON s.id = t.service_id AND s.enabled = 1
     JOIN regions r      ON r.id = tr.region_id
     ORDER BY s.sort, s.slug, r.slug`,
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
      slug: r.region_slug, name_en: r.region_en, name_hi: r.region_hi,
    });
  }
  return [...out.values()];
}

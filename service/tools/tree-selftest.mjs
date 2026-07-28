// Self-test for areas-as-a-tree (region > area).
//
//   npm run test:tree
//
// Runs the REAL shipped functions from src/scope.js and src/push.js against a
// real SQLite database built from schema.sql, through a thin D1 shim. Testing
// a copy of the SQL would prove nothing — the whole risk here is that the
// queries actually shipped say something subtly different from the design.
//
// The rule under test:
//
//   Notices live on leaves. Posting to a region expands NOW; subscribing to a
//   region stores the region and expands at NOTIFY time. Delivery walks up,
//   reads walk down.
//
// The one that would hurt most in production is the last case: someone
// subscribed to both a region and an area inside it must still be woken once.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  regionSubtree, regionLeaves, regionAncestors, regionDepth, deepestBelow,
  scopedCoverage, coverageByService, scopedServices, topmostRegions,
  globalRootTeam, serviceRootTeam, crewForCoverage,
} from '../src/scope.js';
import { subscribersForRegions } from '../src/push.js';

// ---- the smallest D1 shim that runs the real queries ----
function d1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind(...a) { args = a; return api; },
        async all() { return { results: stmt.all(...args) }; },
        async first() { return stmt.get(...args) ?? null; },
        async run() { return stmt.run(...args); },
      };
      return api;
    },
  };
}

const db = new DatabaseSync(':memory:');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
db.exec(schema);
const DB = d1(db);

let failures = 0;
const check = (ok, what, detail = '') => {
  if (ok) console.log(`  ok   ${what}`);
  else { console.log(`  FAIL ${what}${detail ? ` — ${detail}` : ''}`); failures++; }
};
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// ---- a service, a crew, and a two-level map ----
//
//   Kangra (region)
//     ├── Naddi
//     └── McLeodganj
//   Sidhpur            (a plain area, no region above it)
db.exec(`
  INSERT INTO services (id, slug, name_en, name_hi, kinds)
    VALUES (1, 'electricity', 'Electricity', 'बिजली', '[{"key":"cut","en":"Power cut","hi":"बिजली कटौती"}]');
  INSERT INTO teams (id, name, parent_id, service_id) VALUES (900, 'kuhu', NULL, NULL);
  INSERT INTO teams (id, name, parent_id, service_id) VALUES (901, 'Electricity', 900, 1);
  INSERT INTO teams (id, name, parent_id, service_id) VALUES (1, 'Line crew', 901, 1);

  INSERT INTO regions (id, service_id, slug, name_en, name_hi, parent_id) VALUES
    (10, 1, 'kangra',     'Kangra',     'कांगड़ा', NULL),
    (11, 1, 'naddi',      'Naddi',      'नड्डी',   10),
    (12, 1, 'mcleodganj', 'McLeodganj', 'मैक्लोडगंज', 10),
    (13, 1, 'sidhpur',    'Sidhpur',    'सिद्धपुर', NULL);

  -- The crew is given the REGION only. Everything inside must follow.
  INSERT INTO team_regions (team_id, region_id) VALUES (1, 10), (1, 13);
`);

console.log('\ntree shape');
check(same(await regionSubtree(DB, [10]), [10, 11, 12]), 'subtree of a region is itself plus its areas');
check(same(await regionSubtree(DB, [13]), [13]), 'subtree of a plain area is just itself');
check(same(await regionLeaves(DB, [10]), [11, 12]), 'leaves of a region are its areas');
check(same(await regionLeaves(DB, [13]), [13]), 'a plain area is its own leaf');
check(same(await regionLeaves(DB, [10, 11]), [11, 12]), 'region + area inside it dedupes to the leaves');
check(same(await regionAncestors(DB, [11]), [11, 10]), 'ancestors of an area include the region');
check((await regionDepth(DB, 11)) === 2, 'an area inside a region is depth 2');
check((await deepestBelow(DB, 10)) === 2, 'a region with areas is 2 levels deep');
check((await deepestBelow(DB, 13)) === 1, 'a plain area is 1 level deep');

console.log('\ncoverage follows the tree');
{
  const cov = coverageByService(await scopedCoverage(DB, 1));
  const slugs = cov[0].regions.map((r) => r.slug);
  check(same(slugs, ['kangra', 'naddi', 'mcleodganj', 'sidhpur']),
    'covering a region covers the areas inside it', slugs.join(','));
  const naddi = cov[0].regions.find((r) => r.slug === 'naddi');
  check(naddi.parent === 'kangra' && naddi.leaf === true, 'areas report their parent and leafness');
  const kangra = cov[0].regions.find((r) => r.slug === 'kangra');
  check(kangra.parent === null && kangra.leaf === false, 'a region reports itself as not a leaf');
}

// ---- three subscribers, picking at different levels ----
db.exec(`
  INSERT INTO subscriptions (id, endpoint) VALUES (1,'e/region'), (2,'e/area'), (3,'e/both'), (4,'e/other');
  INSERT INTO subscription_regions (subscription_id, region_id, service_id) VALUES
    (1, 10, 1),            -- whole of Kangra
    (2, 11, 1),            -- Naddi only
    (3, 10, 1), (3, 11, 1),-- both: the dedup case
    (4, 13, 1);            -- Sidhpur, unrelated
`);

console.log('\ndelivery walks up');
{
  const got = (await subscribersForRegions(DB, 1, [11])).map((s) => s.endpoint);
  check(same(got, ['e/region', 'e/area', 'e/both']), 'a notice on Naddi reaches region and area subscribers', got.join(','));
  check(got.length === new Set(got).size, 'nobody is woken twice');
  check(!got.includes('e/other'), 'an unrelated area is not woken');
}
{
  const got = (await subscribersForRegions(DB, 1, [13])).map((s) => s.endpoint);
  check(same(got, ['e/other']), 'a notice on a plain area reaches only its own subscriber', got.join(','));
}
{
  // Posting "all of Kangra" expands to leaves first, exactly as the API does.
  const leaves = await regionLeaves(DB, [10]);
  const got = (await subscribersForRegions(DB, 1, leaves)).map((s) => s.endpoint);
  check(same(got, ['e/region', 'e/area', 'e/both']), 'posting a whole region still wakes each person once', got.join(','));
  check(got.length === new Set(got).size, 'still nobody twice, across two leaves');
}

console.log('\na new area under a region reaches existing subscribers');
{
  // The reason subscriptions must not be expanded when they are made.
  db.exec(`INSERT INTO regions (id, service_id, slug, name_en, name_hi, parent_id)
           VALUES (14, 1, 'bhagsu', 'Bhagsu', 'भागसू', 10);`);
  const got = (await subscribersForRegions(DB, 1, [14])).map((s) => s.endpoint);
  check(got.includes('e/region'),
    'someone who picked Kangra last year hears about an area added today', got.join(','));
  check(!got.includes('e/area'), 'someone who picked only Naddi does not');
}

console.log('\nreads walk down');
{
  db.exec(`
    INSERT INTO notices (id, service_id, region_id, kind, win_from, win_to, reason_en, status)
    VALUES ('ntc_a', 1, 11, 'cut', '2030-01-01T00:00:00Z', '2030-01-01T02:00:00Z', 'test', 'scheduled');
  `);
  const inside = await regionSubtree(DB, [10]);
  const marks = inside.map((_, i) => `?${i + 2}`).join(',');
  const { results } = await DB.prepare(
    `SELECT id FROM notices WHERE service_id = ?1 AND region_id IN (${marks}) AND status = 'scheduled'`,
  ).bind(1, ...inside).all();
  check(results.length === 1 && results[0].id === 'ntc_a',
    'asking about the region returns a notice posted on an area inside it');

  const own = await regionSubtree(DB, [13]);
  const m2 = own.map((_, i) => `?${i + 2}`).join(',');
  const { results: none } = await DB.prepare(
    `SELECT id FROM notices WHERE service_id = ?1 AND region_id IN (${m2}) AND status = 'scheduled'`,
  ).bind(1, ...own).all();
  check(none.length === 0, 'an unrelated area shows nothing');
}

console.log('\nguards');
{
  // The cycle guard the nest endpoint relies on. Depth itself is uncapped.
  const below = await regionSubtree(DB, [10]);
  check(below.includes(11), 'nesting Kangra under Naddi would be caught as a cycle');
  check(!(await regionSubtree(DB, [13])).includes(10), 'an unrelated area is not a false cycle');
}

console.log('\nnesting is not capped');
{
  // district > block > village > feeder, and further. Arbitrary depth is the
  // point; only cycles are refused.
  let parent = 13;
  for (let i = 0; i < 6; i++) {
    db.exec(`INSERT INTO regions (id, service_id, slug, name_en, name_hi, parent_id)
             VALUES (${200 + i}, 1, 'deep${i}', 'Deep ${i}', 'गहरा ${i}', ${parent});`);
    parent = 200 + i;
  }
  check((await regionDepth(DB, 205)) === 7, 'a seven-level chain resolves its depth', String(await regionDepth(DB, 205)));
  check((await deepestBelow(DB, 13)) === 7, 'and reports its height from the top');
  check(same(await regionLeaves(DB, [13]), [205]), 'the leaf of a deep chain is the bottom one');
  const anc = await regionAncestors(DB, [205]);
  check(anc.includes(13) && anc.length === 7, 'delivery still walks the whole chain up');
  db.exec('DELETE FROM regions WHERE id BETWEEN 200 AND 205;');
}

console.log('\nonly the topmost picks are stored');
{
  const rows = [
    { id: 10, slug: 'kangra' }, { id: 11, slug: 'naddi' }, { id: 13, slug: 'sidhpur' },
  ];
  const top = (await topmostRegions(DB, rows)).map((r) => r.slug);
  check(same(top, ['kangra', 'sidhpur']),
    'picking a region and an area inside it stores only the region', top.join(','));
  check(!top.includes('naddi'),
    'so an area added under that region later is covered without re-issuing anything');
}

console.log('\nwhere an invite puts someone');
{
  const root = await globalRootTeam(DB);
  check(root.id === 900, 'the global root is found, not assumed');
  const svcRoot = await serviceRootTeam(DB, 1);
  check(svcRoot.id === 901, 'a service root is found for the service');

  // THE BUG: a service admin used to inherit the inviter's team. A site admin
  // sits on the global root, which belongs to no service — so the service
  // admin spanned every service. Placement must come from the role.
  const asRoot = await scopedServices(DB, root.id);
  const asSvcRoot = await scopedServices(DB, svcRoot.id);
  check(asRoot.length >= 1, 'the global root does reach services');
  check(asSvcRoot.length === 1 && asSvcRoot[0].slug === 'electricity',
    'a service root reaches exactly one service');
  check(root.id !== svcRoot.id,
    'so a service admin must never be placed on the global root');
}

console.log('\na poster is limited to areas, not just a service');
{
  // Given "Kangra", the crew covers Kangra and everything inside it.
  const crew = await crewForCoverage(DB, 901, 1, [10], 'Kangra');
  const cov = coverageByService(await scopedCoverage(DB, crew));
  const slugs = cov[0].regions.map((r) => r.slug);
  check(same(slugs, ['kangra', 'naddi', 'mcleodganj', 'bhagsu']),
    'a crew given a region covers everything inside it', slugs.join(','));
  check(!slugs.includes('sidhpur'), 'and nothing outside it');

  // Reuse, so two posters on the same patch share a crew rather than sprouting
  // one team per person.
  const again = await crewForCoverage(DB, 901, 1, [10], 'Kangra');
  check(again === crew, 'the same coverage reuses the same crew');
  const other = await crewForCoverage(DB, 901, 1, [13], 'Sidhpur');
  check(other !== crew, 'different coverage gets its own crew');

  // The reason coverage stores the topmost node.
  db.exec(`INSERT INTO regions (id, service_id, slug, name_en, name_hi, parent_id)
           VALUES (15, 1, 'dharamkot', 'Dharamkot', 'धरमकोट', 10);`);
  const later = coverageByService(await scopedCoverage(DB, crew))[0].regions.map((r) => r.slug);
  check(later.includes('dharamkot'),
    'an area added under that region reaches the crew without re-inviting anyone');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

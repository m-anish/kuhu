-- Repair: create the root teams that 0006 failed to insert.
--   npx wrangler d1 execute kuhu --remote --file=migrations/0008_root_teams_repair.sql
--
-- WHAT WENT WRONG
--
-- `teams.invite_code` is NOT NULL UNIQUE, left over from Season 0 when a team
-- was joined by typing a shared code. Invite links replaced that in Season 1
-- and the column became vestigial — but vestigial is not the same as absent,
-- and 0006 inserted the root teams without it. Because those inserts were
-- written `INSERT OR IGNORE`, the constraint violation was swallowed in
-- silence: the migration reported success, the roots did not exist, and every
-- site admin pointed at a team that was not there.
--
-- The lesson is about OR IGNORE, not about the column. Use it for genuinely
-- idempotent inserts; never for one whose absence would break the schema.

INSERT OR IGNORE INTO teams (id, name, parent_id, service_id, invite_code)
  VALUES (900, 'kuhu', NULL, NULL, 'root-kuhu-vestigial');

INSERT OR IGNORE INTO teams (id, name, parent_id, service_id, invite_code)
  VALUES (901, 'Electricity', 900, 1, 'root-electricity-vestigial');

-- Re-do the re-parenting that 0006 attempted against roots that did not exist.
UPDATE teams SET parent_id = 901, service_id = 1
 WHERE id NOT IN (900, 901) AND parent_id IS NULL;

-- Anyone stranded on a missing root is put back where 0006 meant to put them.
UPDATE posters SET team_id = 900 WHERE role = 'site_admin';

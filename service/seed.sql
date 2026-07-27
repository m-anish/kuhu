-- kuhu — a starting world: one team, a few areas.
--
-- There is no invite code here: access is by single-use link. After seeding,
-- mint the first admin's link with:
--   node tools/mint-invite.mjs --admin --local     (or --remote)
--
-- Rename these areas to the ones your electrician actually says out loud. An
-- admin can do that from the app; the slug, however, is permanent.

INSERT OR IGNORE INTO teams (id, name, parent_id) VALUES
  (1, 'Local line crew', NULL);

INSERT OR IGNORE INTO regions (id, slug, name_en, name_hi, team_id) VALUES
  (1, 'ward-1', 'Ward 1', 'वार्ड 1', 1),
  (2, 'ward-2', 'Ward 2', 'वार्ड 2', 1),
  (3, 'ward-3', 'Ward 3', 'वार्ड 3', 1);

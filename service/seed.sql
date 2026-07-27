-- kuhu — a starting world: one team, a few areas.
-- Change the invite code before anyone real uses it, and change the area names
-- to the ones your electrician actually says out loud.

INSERT OR IGNORE INTO teams (id, name, parent_id, invite_code) VALUES
  (1, 'Local line crew', NULL, 'KUHU-CHANGE-ME');

INSERT OR IGNORE INTO regions (id, slug, name_en, name_hi, team_id) VALUES
  (1, 'ward-1', 'Ward 1', 'वार्ड 1', 1),
  (2, 'ward-2', 'Ward 2', 'वार्ड 2', 1),
  (3, 'ward-3', 'Ward 3', 'वार्ड 3', 1);

-- kuhu — a starting world: one team, the areas around Dharamshala.
--
-- There is no invite code here: access is by single-use link. After seeding,
-- mint the first admin's link with:
--   node tools/mint-invite.mjs --admin --local     (or --remote)
--
-- An admin can rename any of these from the app. The slug, however, is
-- permanent — it lives in the public API URL and in every subscriber's saved
-- selection, so renaming changes only what people read.

INSERT OR IGNORE INTO teams (id, name, parent_id) VALUES
  (1, 'Local line crew', NULL);

INSERT OR IGNORE INTO regions (id, slug, name_en, name_hi, team_id) VALUES
  (1, 'naddi',       'Naddi',       'नड्डी',      1),
  (2, 'sidhpur',     'Sidhpur',     'सिद्धपुर',    1),
  (3, 'mcleodganj',  'McLeodganj',  'मैक्लोडगंज',  1),
  (4, 'forsythganj', 'Forsythganj', 'फ़ोर्सिथगंज', 1),
  (5, 'bir-khas',    'Bir Khas',    'बीड़ खास',    1),
  (6, 'chaugan',     'Chaugan',     'चौगान',      1);

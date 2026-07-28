-- kuhu — a starting world: one service, one crew, the areas around Dharamshala.
--
-- After seeding, mint the first site admin's link with:
--   node tools/mint-invite.mjs --site-admin --local     (or --remote)

-- ── the first service ─────────────────────────────────────────────────────
-- Kinds and reasons are data. A second service (water, roads, anything) is an
-- INSERT here plus its own crew — no code change, no deploy.
INSERT OR IGNORE INTO services (id, slug, name_en, name_hi, icon, accent, kinds, reasons, sort) VALUES (
  1, 'electricity', 'Electricity', 'बिजली', '⚡', '#d9a866',
  '[{"key":"cut","en":"Power cut","hi":"बिजली कटौती"},{"key":"advisory","en":"Advisory","hi":"सूचना"},{"key":"restored","en":"Restored","hi":"बिजली बहाल"}]',
  '[{"en":"Line maintenance","hi":"लाइन की मरम्मत"},{"en":"Transformer work","hi":"ट्रांसफ़ॉर्मर का काम"},{"en":"Storm damage","hi":"तूफ़ान से नुक़सान"},{"en":"Scheduled load shedding","hi":"निर्धारित लोड शेडिंग"},{"en":"Pole and wire work","hi":"खंभे और तार का काम"}]',
  1
);

-- ── the tree ──────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO teams (id, name, parent_id, service_id) VALUES
  (900, 'kuhu',             NULL, NULL),   -- site admins live here
  (901, 'Electricity',      900,  1),      -- service admins
  (1,   'Local line crew',  901,  1);      -- posters

-- ── electricity's own areas ───────────────────────────────────────────────
-- A second service would define its own list; water zones need not line up
-- with electricity feeders.
INSERT OR IGNORE INTO regions (id, service_id, slug, name_en, name_hi) VALUES
  (1, 1, 'naddi',       'Naddi',       'नड्डी'),
  (2, 1, 'sidhpur',     'Sidhpur',     'सिद्धपुर'),
  (3, 1, 'mcleodganj',  'McLeodganj',  'मैक्लोडगंज'),
  (4, 1, 'forsythganj', 'Forsythganj', 'फ़ोर्सिथगंज'),
  (5, 1, 'bir-khas',    'Bir Khas',    'बीड़ खास'),
  (6, 1, 'chaugan',     'Chaugan',     'चौगान');

-- Which crew answers for what, inside the service.
INSERT OR IGNORE INTO team_regions (team_id, region_id)
  SELECT 1, id FROM regions WHERE service_id = 1;

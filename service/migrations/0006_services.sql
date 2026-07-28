-- kuhu becomes a community notice service, of which electricity is the first
-- facet rather than the whole thing. Apply with:
--   npx wrangler d1 execute kuhu --remote --file=migrations/0006_services.sql
--
-- THE SHAPE
--
-- The team tree already nests, and reach already comes from it (see
-- concept.md). So the admin hierarchy is not a new mechanism — it is that same
-- tree, rooted properly:
--
--   kuhu                        (global root, no service)   ← site admins
--     └── Electricity           (service root)              ← service admins
--           └── Local line crew (a crew)                    ← posters
--
-- Role decides what powers you have; the team decides what you can see.
--
-- Areas belong to a service. An electricity feeder and a water supply zone are
-- not the same division of the same valley, so each service keeps its own list
-- and its own names, and every area query is scoped by service.
--
-- NOTE: posters.role and invites.role carry CHECK (role IN ('poster','admin'))
-- from the old schema, which rejects the new role names outright. SQLite
-- cannot drop a CHECK, so both tables are rebuilt below. Found by rehearsing
-- this migration against a copy of production rather than by reading it.

PRAGMA foreign_keys = OFF;

-- ── services ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id       INTEGER PRIMARY KEY,
  slug     TEXT NOT NULL UNIQUE,       -- appears in URLs and MQTT topics
  name_en  TEXT NOT NULL,
  name_hi  TEXT NOT NULL,
  icon     TEXT,                       -- one emoji, for chips and notifications
  accent   TEXT,                       -- hex, so each facet can look like itself
  -- Kinds and reason presets are per-service DATA, not code: water's notices
  -- are not "power cut / restored", and adding a facet should not need a
  -- deploy. JSON arrays of {key,en,hi} and {en,hi}.
  kinds    TEXT NOT NULL DEFAULT '[]',
  reasons  TEXT NOT NULL DEFAULT '[]',
  enabled  INTEGER NOT NULL DEFAULT 1,
  sort     INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO services (id, slug, name_en, name_hi, icon, accent, kinds, reasons, sort) VALUES (
  1, 'electricity', 'Electricity', 'बिजली', '⚡', '#d9a866',
  '[{"key":"cut","en":"Power cut","hi":"बिजली कटौती"},{"key":"advisory","en":"Advisory","hi":"सूचना"},{"key":"restored","en":"Restored","hi":"बिजली बहाल"}]',
  '[{"en":"Line maintenance","hi":"लाइन की मरम्मत"},{"en":"Transformer work","hi":"ट्रांसफ़ॉर्मर का काम"},{"en":"Storm damage","hi":"तूफ़ान से नुक़सान"},{"en":"Scheduled load shedding","hi":"निर्धारित लोड शेडिंग"},{"en":"Pole and wire work","hi":"खंभे और तार का काम"}]',
  1
);

-- ── teams gain a service, and a root above them ───────────────────────────
ALTER TABLE teams ADD COLUMN service_id INTEGER REFERENCES services(id);

INSERT OR IGNORE INTO teams (id, name, parent_id, service_id) VALUES (900, 'kuhu', NULL, NULL);
INSERT OR IGNORE INTO teams (id, name, parent_id, service_id) VALUES (901, 'Electricity', 900, 1);

-- Existing crews hang under the electricity root.
UPDATE teams SET parent_id = 901, service_id = 1
 WHERE id NOT IN (900, 901) AND parent_id IS NULL;
UPDATE teams SET service_id = 1 WHERE service_id IS NULL AND id != 900;

-- ── areas belong to a service ─────────────────────────────────────────────
-- Each service divides the map its own way: an electricity feeder is not a
-- water supply zone. So an area names its service and every query is scoped
-- by it.
--
-- The slug stays globally unique rather than per-service. Making it
-- per-service would mean dropping and rebuilding `regions`, and D1 does not
-- honour PRAGMA foreign_keys across separately-executed statements, so the
-- drop trips the foreign keys in subscription_regions and notices. Rebuilding
-- four inter-referencing tables on a live database is a poor trade for the
-- ability to have two areas literally called 'naddi'; name the water one
-- 'naddi-tank' and move on. (Learned by rehearsing this against a copy of
-- production, twice.)
ALTER TABLE regions ADD COLUMN service_id INTEGER REFERENCES services(id);
UPDATE regions SET service_id = 1 WHERE service_id IS NULL;
CREATE INDEX IF NOT EXISTS regions_service ON regions(service_id);

-- Coverage: which crew answers for which area, inside one service. A service
-- with a single crew barely needs it; one with a north and a south crew does.
CREATE TABLE IF NOT EXISTS team_regions (
  team_id   INTEGER NOT NULL REFERENCES teams(id),
  region_id INTEGER NOT NULL REFERENCES regions(id),
  PRIMARY KEY (team_id, region_id)
);

INSERT OR IGNORE INTO team_regions (team_id, region_id)
  SELECT team_id, id FROM regions WHERE team_id IS NOT NULL;

-- regions.team_id is now vestigial but harmless, so it stays.

-- ── posters: rebuilt for the new roles, plus a service ────────────────────
CREATE TABLE posters_new (
  id         INTEGER PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  service_id INTEGER REFERENCES services(id),   -- NULL for site admins
  name       TEXT NOT NULL,
  phone      TEXT,
  role       TEXT NOT NULL DEFAULT 'poster'
             CHECK (role IN ('poster','service_admin','site_admin')),
  token_hash TEXT NOT NULL UNIQUE,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 'admin' meant "admin of the only thing there was", which is a site admin;
-- site admins sit on the global root and belong to no single service.
INSERT INTO posters_new (id, team_id, service_id, name, phone, role, token_hash, revoked_at, created_at)
  SELECT p.id,
         CASE WHEN p.role = 'admin' THEN 900 ELSE p.team_id END,
         CASE WHEN p.role = 'admin' THEN NULL ELSE 1 END,
         p.name, p.phone,
         CASE WHEN p.role = 'admin' THEN 'site_admin' ELSE 'poster' END,
         p.token_hash, p.revoked_at, p.created_at
  FROM posters p;

DROP TABLE posters;
ALTER TABLE posters_new RENAME TO posters;

-- ── invites: same rebuild, same reason ────────────────────────────────────
CREATE TABLE invites_new (
  id         INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  service_id INTEGER REFERENCES services(id),
  role       TEXT NOT NULL DEFAULT 'poster'
             CHECK (role IN ('poster','service_admin','site_admin')),
  note       TEXT,
  created_by INTEGER REFERENCES posters(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_by    INTEGER REFERENCES posters(id),
  revoked_at TEXT,
  move_poster_id INTEGER REFERENCES posters(id)
);

INSERT INTO invites_new (id, token_hash, team_id, service_id, role, note, created_by,
                         created_at, expires_at, used_at, used_by, revoked_at, move_poster_id)
  SELECT i.id, i.token_hash,
         CASE WHEN i.role = 'admin' THEN 900 ELSE i.team_id END,
         CASE WHEN i.role = 'admin' THEN NULL ELSE 1 END,
         CASE WHEN i.role = 'admin' THEN 'site_admin' ELSE 'poster' END,
         i.note, i.created_by, i.created_at, i.expires_at, i.used_at, i.used_by,
         i.revoked_at, i.move_poster_id
  FROM invites i;

DROP TABLE invites;
ALTER TABLE invites_new RENAME TO invites;
CREATE INDEX IF NOT EXISTS invites_team ON invites(team_id, expires_at);

-- ── a notice belongs to a service ─────────────────────────────────────────
ALTER TABLE notices ADD COLUMN service_id INTEGER REFERENCES services(id);
UPDATE notices SET service_id = 1 WHERE service_id IS NULL;

-- ── a subscription is a (service, area) pair ──────────────────────────────
ALTER TABLE subscription_regions ADD COLUMN service_id INTEGER REFERENCES services(id);
UPDATE subscription_regions SET service_id = 1 WHERE service_id IS NULL;

-- ── retained MQTT state is per service AND area ───────────────────────────
CREATE TABLE IF NOT EXISTS mqtt_retained (
  service_id INTEGER NOT NULL REFERENCES services(id),
  region_id  INTEGER NOT NULL REFERENCES regions(id),
  until      TEXT NOT NULL,
  PRIMARY KEY (service_id, region_id)
);

-- (the old regions.mqtt_retained_until went away with the table rebuild; there
-- was nothing retained at migration time)

CREATE INDEX IF NOT EXISTS team_regions_region ON team_regions(region_id);

PRAGMA foreign_keys = ON;

-- kuhu — D1 schema (current, for fresh installs).
-- Existing databases migrate via migrations/*.sql instead.
--
-- kuhu carries community notices. Electricity is the first service, not the
-- only possible one; water, or anything else a neighbourhood needs warning
-- about, is a row in `services` rather than a fork of the code.
--
-- THE TREE
--   kuhu                        (global root, no service)   ← site admins
--     └── Electricity           (service root)              ← service admins
--           └── Local line crew (a crew)                    ← posters
--
-- Role decides powers; the team decides scope. One recursive query answers
-- "what may this person see?" at every level.
--
-- Areas belong to a service: an electricity feeder and a water supply zone are
-- different divisions of the same valley, so each service keeps its own list.
-- Coverage (which crew answers for which area) lives in team_regions.

CREATE TABLE IF NOT EXISTS services (
  id       INTEGER PRIMARY KEY,
  slug     TEXT NOT NULL UNIQUE,       -- appears in URLs and MQTT topics; permanent
  name_en  TEXT NOT NULL,
  name_hi  TEXT NOT NULL,
  icon     TEXT,                       -- one emoji
  accent   TEXT,                       -- hex
  -- Per-service DATA, not code: a new facet should not need a deploy.
  kinds    TEXT NOT NULL DEFAULT '[]', -- JSON [{key,en,hi}]
  reasons  TEXT NOT NULL DEFAULT '[]', -- JSON [{en,hi}]
  enabled  INTEGER NOT NULL DEFAULT 1,
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  INTEGER REFERENCES teams(id),
  service_id INTEGER REFERENCES services(id),   -- NULL only for the global root
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An area, as one service divides the map. Each service has its own list —
-- electricity feeders and water zones need not line up. The slug is globally
-- unique (not per-service) so that public URLs and MQTT topics never depend on
-- reading the service to disambiguate; give water's tank zone 'naddi-tank'.
CREATE TABLE IF NOT EXISTS regions (
  id         INTEGER PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id),
  slug       TEXT NOT NULL UNIQUE,            -- permanent once anyone subscribes
  name_en    TEXT NOT NULL,
  name_hi    TEXT NOT NULL,
  team_id    INTEGER                          -- vestigial; coverage is team_regions
);
CREATE INDEX IF NOT EXISTS regions_service ON regions(service_id);

CREATE TABLE IF NOT EXISTS team_regions (
  team_id   INTEGER NOT NULL REFERENCES teams(id),
  region_id INTEGER NOT NULL REFERENCES regions(id),
  PRIMARY KEY (team_id, region_id)
);
CREATE INDEX IF NOT EXISTS team_regions_region ON team_regions(region_id);

CREATE TABLE IF NOT EXISTS posters (
  id         INTEGER PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  service_id INTEGER REFERENCES services(id),  -- NULL for site admins, who span all
  name       TEXT NOT NULL,
  phone      TEXT,
  -- site_admin > service_admin > poster. Scope still comes from the team.
  role       TEXT NOT NULL DEFAULT 'poster'
             CHECK (role IN ('poster','service_admin','site_admin')),
  token_hash TEXT NOT NULL UNIQUE,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invites (
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
CREATE INDEX IF NOT EXISTS invites_team ON invites(team_id, expires_at);

CREATE TABLE IF NOT EXISTS notices (
  id         TEXT PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id),
  region_id  INTEGER NOT NULL REFERENCES regions(id),
  -- Validated against the service's own `kinds` at write time, not by a CHECK:
  -- the allowed set differs per service and must not need a migration.
  kind       TEXT NOT NULL DEFAULT 'cut',
  win_from   TEXT NOT NULL,
  win_to     TEXT NOT NULL,
  reason_en  TEXT,
  reason_hi  TEXT,
  status     TEXT NOT NULL DEFAULT 'scheduled'
             CHECK (status IN ('scheduled','cancelled')),
  posted_by  INTEGER REFERENCES posters(id),
  posted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  batch_id   TEXT
);
CREATE INDEX IF NOT EXISTS notices_service_region ON notices(service_id, region_id, win_to);
CREATE INDEX IF NOT EXISTS notices_batch ON notices(batch_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id         INTEGER PRIMARY KEY,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT,
  auth       TEXT,
  lang       TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','hi')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A subscription is a set of (service, area) pairs: someone may want water
-- notices for the village and electricity notices for the shop.
CREATE TABLE IF NOT EXISTS subscription_regions (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  region_id       INTEGER NOT NULL REFERENCES regions(id),
  service_id      INTEGER NOT NULL REFERENCES services(id),
  PRIMARY KEY (subscription_id, region_id, service_id)
);

CREATE TABLE IF NOT EXISTS mqtt_retained (
  service_id INTEGER NOT NULL REFERENCES services(id),
  region_id  INTEGER NOT NULL REFERENCES regions(id),
  until      TEXT NOT NULL,
  PRIMARY KEY (service_id, region_id)
);

-- kuhu — D1 schema (current, for fresh installs).
-- Existing databases migrate via migrations/*.sql instead.
--
-- Regions are the first-class object; teams are scoped and can nest.
-- Access is by single-use invite link; there are no reusable codes.

CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  INTEGER REFERENCES teams(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS regions (
  id      INTEGER PRIMARY KEY,
  slug    TEXT NOT NULL UNIQUE,               -- e.g. 'naddi'; permanent once anyone subscribes
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  -- When this area's retained MQTT payload stops being true. The scheduled
  -- job clears the topic after this; NULL means nothing is retained.
  mqtt_retained_until TEXT
);

CREATE TABLE IF NOT EXISTS posters (
  id         INTEGER PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  name       TEXT NOT NULL,
  phone      TEXT,                             -- self-declared; the admin knows their own crew
  role       TEXT NOT NULL DEFAULT 'poster' CHECK (role IN ('poster','admin')),
  token_hash TEXT NOT NULL UNIQUE,             -- sha256 of the bearer token; the token itself is never stored
  revoked_at TEXT,                             -- set instead of deleting, so notice history survives
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A single-use, expiring invite link. Only the hash is stored; the link itself
-- lives only in the WhatsApp message the admin sent.
CREATE TABLE IF NOT EXISTS invites (
  id         INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  role       TEXT NOT NULL DEFAULT 'poster' CHECK (role IN ('poster','admin')),
  note       TEXT,
  created_by INTEGER REFERENCES posters(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_by    INTEGER REFERENCES posters(id),
  revoked_at TEXT,
  -- Set when this invite moves an existing person to a new phone rather than
  -- adding a new one. Redeeming re-issues their token; the old phone dies.
  move_poster_id INTEGER REFERENCES posters(id)
);
CREATE INDEX IF NOT EXISTS invites_team ON invites(team_id, expires_at);

CREATE TABLE IF NOT EXISTS notices (
  id        TEXT PRIMARY KEY,                 -- 'ntc_' + random
  region_id INTEGER NOT NULL REFERENCES regions(id),
  kind      TEXT NOT NULL DEFAULT 'cut'       -- cut | advisory | restored
            CHECK (kind IN ('cut','advisory','restored')),
  win_from  TEXT NOT NULL,                    -- ISO 8601 with offset
  win_to    TEXT NOT NULL,
  reason_en TEXT,
  reason_hi TEXT,
  status    TEXT NOT NULL DEFAULT 'scheduled' -- scheduled | cancelled
            CHECK (status IN ('scheduled','cancelled')),
  posted_by INTEGER REFERENCES posters(id),
  posted_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Posting to several areas writes one row per area, sharing a batch id so
  -- they can be shown, and cancelled, as the single act they were.
  batch_id  TEXT
);
CREATE INDEX IF NOT EXISTS notices_region_window ON notices(region_id, win_to);
CREATE INDEX IF NOT EXISTS notices_batch ON notices(batch_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id         INTEGER PRIMARY KEY,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT,                            -- kept for future payload encryption; unused by tickle push
  auth       TEXT,
  lang       TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','hi')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscription_regions (
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  region_id       INTEGER NOT NULL REFERENCES regions(id),
  PRIMARY KEY (subscription_id, region_id)
);

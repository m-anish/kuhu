-- kuhu — D1 schema, Season 1.
-- Regions are the first-class object; teams are scoped and can nest.
-- v1 runs with one team and one region, but the schema is born knowing better.

CREATE TABLE IF NOT EXISTS teams (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   INTEGER REFERENCES teams(id),
  invite_code TEXT NOT NULL UNIQUE,           -- how a poster joins; rotate by UPDATE
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS regions (
  id      INTEGER PRIMARY KEY,
  slug    TEXT NOT NULL UNIQUE,               -- e.g. 'ward-3'
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS posters (
  id         INTEGER PRIMARY KEY,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  name       TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,            -- sha256 of the bearer token; token itself is never stored
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
  posted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS notices_region_window ON notices(region_id, win_to);

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

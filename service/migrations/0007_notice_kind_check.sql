-- Drop the electricity-shaped CHECK on notices.kind. Apply with:
--   npx wrangler d1 execute kuhu --remote --file=migrations/0007_notice_kind_check.sql
--
-- The old table hard-coded CHECK (kind IN ('cut','advisory','restored')) — the
-- electricity vocabulary, in the schema. A water notice ('supply_cut',
-- 'tanker') would be rejected by the database no matter what the code allowed.
--
-- Allowed kinds now come from the service's own `kinds` and are validated at
-- write time in the Worker, which is the only place that can know them.
-- SQLite cannot drop a CHECK, so the table is rebuilt.

PRAGMA foreign_keys = OFF;

CREATE TABLE notices_new (
  id         TEXT PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id),
  region_id  INTEGER NOT NULL REFERENCES regions(id),
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

INSERT INTO notices_new (id, service_id, region_id, kind, win_from, win_to,
                         reason_en, reason_hi, status, posted_by, posted_at, batch_id)
  SELECT id, COALESCE(service_id, 1), region_id, kind, win_from, win_to,
         reason_en, reason_hi, status, posted_by, posted_at, batch_id
  FROM notices;

DROP TABLE notices;
ALTER TABLE notices_new RENAME TO notices;

CREATE INDEX IF NOT EXISTS notices_service_region ON notices(service_id, region_id, win_to);
CREATE INDEX IF NOT EXISTS notices_batch ON notices(batch_id);

PRAGMA foreign_keys = ON;

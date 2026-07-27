-- Roles, and invites-as-links. Apply to an existing database:
--   npx wrangler d1 execute kuhu --remote --file=migrations/0002_roles_and_invites.sql
--
-- SQLite can't add CHECK constraints via ALTER, so role/kind validation for
-- these columns lives in the Worker rather than the schema. Fresh installs get
-- the constraints from schema.sql.

-- Posters gain a role and a revocation marker. Revoking sets a timestamp rather
-- than deleting the row, so "who posted this notice" survives someone leaving.
ALTER TABLE posters ADD COLUMN role TEXT NOT NULL DEFAULT 'poster';
ALTER TABLE posters ADD COLUMN phone TEXT;
ALTER TABLE posters ADD COLUMN revoked_at TEXT;

-- An invite is a single-use, expiring link. Only its hash is stored, same as
-- poster tokens — the link itself exists only in the admin's WhatsApp message.
CREATE TABLE IF NOT EXISTS invites (
  id         INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  team_id    INTEGER NOT NULL REFERENCES teams(id),
  role       TEXT NOT NULL DEFAULT 'poster',
  note       TEXT,                                  -- "for Ramesh" — the admin's own reminder
  created_by INTEGER REFERENCES posters(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_by    INTEGER REFERENCES posters(id),
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS invites_team ON invites(team_id, expires_at);

-- teams.invite_code is now vestigial: reusable codes are gone, replaced by
-- single-use links. Nothing reads it. It is left in place because SQLite makes
-- dropping a NOT NULL column awkward, and an unread column is harmless.

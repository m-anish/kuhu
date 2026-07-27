-- Self-service device move. Apply to an existing database:
--   npx wrangler d1 execute kuhu --remote --file=migrations/0003_device_move.sql
--
-- A move re-uses the invites machinery: same single-use, same expiry, same
-- hashed token. The difference is that redeeming one does not create a person —
-- it re-issues the token of an existing one, which invalidates the old phone.

ALTER TABLE invites ADD COLUMN move_poster_id INTEGER REFERENCES posters(id);

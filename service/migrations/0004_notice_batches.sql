-- One notice, several areas. Apply to an existing database:
--   npx wrangler d1 execute kuhu --remote --file=migrations/0004_notice_batches.sql
--
-- A notice still belongs to exactly one region — every consumer downstream
-- (next-cuts, subscriptions, push) depends on that and stays untouched. Posting
-- to several areas writes one row per area, tied together by a batch id so the
-- app can show them as the single act they were, and cancel them together.

ALTER TABLE notices ADD COLUMN batch_id TEXT;
CREATE INDEX IF NOT EXISTS notices_batch ON notices(batch_id);

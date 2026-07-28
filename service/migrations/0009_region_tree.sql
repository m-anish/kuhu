-- 0009 — areas become a tree: region > area.
--
-- One nullable self-reference, and nothing else. Deliberately ADD COLUMN
-- rather than a table rebuild: rebuilding `regions` is exactly what tripped
-- foreign keys during 0006, because D1 executes statements separately and
-- PRAGMA foreign_keys does not carry across them.
--
-- Every existing area gets parent_id = NULL and becomes a root. Nothing
-- changes for anyone until an admin actually nests something.
--
-- THE RULE, since it decides everything else:
--
--   Notices always live on LEAVES. Posting to a region expands to its leaves
--   at post time. Subscribing to a region stores the REGION and expands at
--   notify time — expanding a subscription when it is made would freeze it,
--   so an area added under Kangra next year would reach nobody who had
--   already subscribed.
--
--   Delivery therefore walks UP from the notice's area to its ancestors.
--   Reads walk DOWN from the queried node to its descendants. Same relation,
--   looked at from either end.
--
-- Slugs stay globally unique and flat, so public URLs and MQTT topics are
-- untouched by any of this.

ALTER TABLE regions ADD COLUMN parent_id INTEGER REFERENCES regions(id);

CREATE INDEX IF NOT EXISTS regions_parent ON regions(parent_id);

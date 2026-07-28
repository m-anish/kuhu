-- Track when each area's retained MQTT payload stops being true, so a
-- scheduled job can clear it. Apply with:
--   npx wrangler d1 execute kuhu --remote --file=migrations/0005_mqtt_retention.sql
--
-- Without this the cron would have to either re-publish every area on every
-- run (waking every connected device, hourly, for no news) or subscribe to
-- read its own retained state back. Recording the expiry when we publish is
-- cheaper than both and needs no broker round-trip.

ALTER TABLE regions ADD COLUMN mqtt_retained_until TEXT;

-- Repair: rename `_migrations` rows for three Goals Phase 1 migrations that
-- were renamed on disk from numbered (015/016/017) to timestamp-prefixed
-- (1779943871/1779943872/1779943873) without a corresponding bookkeeping
-- update.
--
-- Without this repair, DBs migrated under the old naming attempt to re-run
-- the timestamp-prefixed files and fail with `duplicate column name: kind`.
--
-- Idempotency:
--   - Fresh DB (no old names exist):     UPDATEs match 0 rows → no-op; the
--                                        timestamp-prefixed migrations then
--                                        run normally as designed.
--   - Mid-flight DB (old names present): UPDATEs rewrite the names → the
--                                        timestamp-prefixed migrations are
--                                        seen as applied and skipped.
--   - Already-repaired DB:               UPDATEs match 0 rows → no-op.
--
-- This migration only touches the bookkeeping table; no schema changes.

UPDATE _migrations
   SET name = '1779943871_add_goal_woop_columns.sql'
 WHERE name = '015_goals_enhancements.sql';

UPDATE _migrations
   SET name = '1779943872_create_milestones.sql'
 WHERE name = '016_milestones.sql';

UPDATE _migrations
   SET name = '1779943873_add_tasks_goal_link.sql'
 WHERE name = '017_tasks_goal_link.sql';

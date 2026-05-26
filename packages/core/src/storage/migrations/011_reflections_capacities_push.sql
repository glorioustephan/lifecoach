-- Make Capacities reflection write-back idempotent.
-- Records when a reflection was pushed into a Capacities daily note so the same
-- reflection is never appended twice (a repeated cron fire previously spammed
-- the daily note with duplicate, very long entries and locked up Capacities).
ALTER TABLE reflections ADD COLUMN pushed_to_capacities_at INTEGER;

-- Support fast dedup of reflection generation by (kind, period): a re-run over
-- the same window finds the existing reflection instead of creating another.
CREATE INDEX IF NOT EXISTS idx_reflections_kind_period
  ON reflections(kind, period_start, period_end);

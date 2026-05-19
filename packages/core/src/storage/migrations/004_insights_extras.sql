-- Phase 4.2 additions to the insights table.
-- snoozed_until: when the user defers an insight; it's hidden until this ts passes
-- priority:      agent-assigned priority (1=normal, 2=worth noticing, 3=needs attention)

ALTER TABLE insights ADD COLUMN snoozed_until INTEGER;
ALTER TABLE insights ADD COLUMN priority INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_insights_state ON insights(acted_on_at, dismissed_at, snoozed_until);
CREATE INDEX IF NOT EXISTS idx_insights_priority ON insights(priority DESC);

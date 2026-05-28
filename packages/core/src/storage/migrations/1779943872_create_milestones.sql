-- Milestones decompose abstract goals into concrete, linearly-ordered
-- checkpoints. Separate from goals (not sub-goals via parent_goal_id) because
-- the semantics differ: milestones are ordered, lighter-weight, expected to
-- complete in sequence, and don't carry kind/horizon/cadence themselves.
-- Sub-goals via goals.parent_goal_id remain available for genuinely nested
-- ambitions.

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  -- pending | active | done | abandoned. Mirrors goals.status semantics for
  -- ergonomic transitions; 'active' marks the current milestone in flight.
  status TEXT NOT NULL DEFAULT 'pending',
  -- Linear ordering within a goal. Lower indexes surface first.
  order_index INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER,
  completed_at INTEGER,
  -- Mirrors the artifact origin pattern so agent-proposed milestones can be
  -- distinguished from user-created ones, and so retro-confidence is auditable.
  origin TEXT NOT NULL DEFAULT 'manual', -- manual | conversation | cron
  confidence REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_milestones_goal ON milestones(goal_id, order_index);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_due ON milestones(due_at);

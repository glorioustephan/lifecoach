-- Habits domain: first-class recurring-action entities distinct from goals.
-- A habit may stand alone ("drink more water") or link up to a parent goal
-- and/or milestone that it contributes to. Completions are stored in a
-- separate append-only table so a full history survives even if the habit row
-- is archived.

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  parent_goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  parent_milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  notes TEXT,
  last_completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  -- A milestone FK only makes sense when a goal FK is also present.
  CHECK (parent_milestone_id IS NULL OR parent_goal_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_habits_parent_goal_id
  ON habits(parent_goal_id)
  WHERE parent_goal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_habits_status
  ON habits(status);

-- Append-only completion log. Deleted rows undo a logged completion (UI undo).
CREATE TABLE IF NOT EXISTS habit_completions (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  completed_at INTEGER NOT NULL,
  notes TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('manual', 'conversation', 'cron')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_id_date
  ON habit_completions(habit_id, completed_at DESC);

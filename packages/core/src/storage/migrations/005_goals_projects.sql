-- Phase 4.3: goals + projects as first-class entities.
-- Goals had been stored as facts with category='goal'. They get promoted here:
-- structured horizon, success criteria, parent goals, target metric, progress.
-- Projects bundle goals + tasks + documents + measurements under a shared scope.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | done | abandoned
  target_date INTEGER,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_started ON projects(started_at DESC);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT,
  horizon TEXT NOT NULL DEFAULT 'open', -- this-week | this-month | this-quarter | this-year | open
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | done | abandoned
  success_criteria TEXT,
  parent_goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  -- Optional numeric target for measurable goals
  target_metric TEXT,
  target_value REAL,
  current_progress REAL,
  due_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_horizon ON goals(horizon);
CREATE INDEX IF NOT EXISTS idx_goals_project ON goals(project_id);
CREATE INDEX IF NOT EXISTS idx_goals_due ON goals(due_at);

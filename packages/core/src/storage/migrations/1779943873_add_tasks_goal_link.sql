-- Make goals → tasks a first-class link. Until now, tasks had no association
-- with goals; this is the foundation of "next action per goal" in the briefing
-- and of progress that's visible rather than asserted. Both columns are
-- nullable so Todoist-synced tasks (the bulk of the table) continue to work
-- unchanged; they're only set when the agent or user explicitly links.

ALTER TABLE tasks ADD COLUMN goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone_id);

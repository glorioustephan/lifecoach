-- Mirror of tasks from external systems (Todoist primarily). Locally-created
-- tasks have NULL external_id/external_source.

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  external_source TEXT,
  content TEXT NOT NULL,
  description TEXT,
  project_id TEXT,
  project_name TEXT,
  labels TEXT NOT NULL DEFAULT '[]',     -- JSON array
  priority INTEGER,
  due_at INTEGER,
  due_string TEXT,
  completed_at INTEGER,
  url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  synced_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external
  ON tasks(external_source, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

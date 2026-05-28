-- Phase 2 surfacing layer. Two tables that turn goals from a static list into
-- something the system writes against:
--
--   goal_signals  — OKR-lite "signals of progress". Several per goal, each
--                   either quantitative (tied to a measurement metric and
--                   a target value) or qualitative ("I sleep before midnight
--                   most weeknights"). Replaces the single rigid
--                   success_criteria string with a small evolving set.
--
--   goal_evidence — append-only feed of "something happened that bears on
--                   this goal." Sources: chat (agent's record_goal_evidence
--                   tool when the user explicitly mentions a goal-relevant
--                   activity), cron (weekly goal-review pass), manual ("Log
--                   evidence" UI button). The Reflector and Insighter read
--                   this feed to notice progress, stalls, and obstacles.

CREATE TABLE IF NOT EXISTS goal_signals (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  -- 'quantitative' signals reference a measurement metric and carry a target.
  -- 'qualitative' signals are observational ("most weeknights").
  kind TEXT NOT NULL DEFAULT 'qualitative',
  -- Snake-case metric name matching the measurements table (e.g. 'weight_kg',
  -- 'sleep_hours'). Null for qualitative signals.
  metric TEXT,
  target_value REAL,
  current_value REAL,
  unit TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goal_signals_goal ON goal_signals(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_signals_metric ON goal_signals(metric);

CREATE TABLE IF NOT EXISTS goal_evidence (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  signal_id TEXT REFERENCES goal_signals(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  -- Pointer back to the originating row when known: 'message', 'task',
  -- 'measurement', 'reflection', 'manual'. Never a hard FK because origins
  -- live in different tables; the pair (source_ref_type, source_ref_id)
  -- is the standard backref pattern this codebase uses elsewhere.
  source_ref_type TEXT,
  source_ref_id TEXT,
  -- Optional numeric delta toward a signal's target_value (positive or
  -- negative). Lets the briefing show "+0.5 kg toward 70kg" without a fresh
  -- measurement event.
  delta REAL,
  recorded_at INTEGER NOT NULL,
  origin TEXT NOT NULL DEFAULT 'manual', -- manual | conversation | cron
  confidence REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goal_evidence_goal_recorded
  ON goal_evidence(goal_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_evidence_milestone ON goal_evidence(milestone_id);
CREATE INDEX IF NOT EXISTS idx_goal_evidence_signal ON goal_evidence(signal_id);
CREATE INDEX IF NOT EXISTS idx_goal_evidence_origin_recorded
  ON goal_evidence(origin, recorded_at DESC);

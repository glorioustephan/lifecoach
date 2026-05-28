-- Phase 1 goals foundation: shift goals from a static list to a research-backed
-- aspirational anchor. New columns capture WOOP (Wish/Outcome/Obstacle/Plan —
-- Oettingen), implementation intention (Gollwitzer), goal kind
-- (Outcome/Process/Identity — Clear, Deci & Ryan), a soft review cadence so
-- identity goals don't need a deadline, and bookkeeping fields driving
-- "stalled goal" detection and soft-archive. All additions are nullable except
-- `kind` and `review_cadence` which default safely for existing rows.

ALTER TABLE goals ADD COLUMN kind TEXT NOT NULL DEFAULT 'outcome';
-- outcome | process | identity

ALTER TABLE goals ADD COLUMN cadence TEXT;
-- daily | weekly | monthly. Meaningful only when kind='process'.

ALTER TABLE goals ADD COLUMN outcome TEXT;
-- WOOP outcome — the felt picture of success. Augments/replaces the rigid
-- success_criteria string for process and identity goals.

ALTER TABLE goals ADD COLUMN obstacle TEXT;
-- WOOP obstacle — what gets in the way. Critical for ADHD self-modelling.

ALTER TABLE goals ADD COLUMN implementation_intention TEXT;
-- "After <anchor>, I will <behavior> in <context>." Single canonical if-then.
-- Multiple intentions intentionally deferred to a side table later.

ALTER TABLE goals ADD COLUMN identity_statement TEXT;
-- "I am someone who…" — anchors identity-kind goals.

ALTER TABLE goals ADD COLUMN review_cadence TEXT NOT NULL DEFAULT 'weekly';
-- weekly | monthly | quarterly | as-needed. Drives surfacing rhythm without
-- forcing a deadline. Replaces hard reliance on `horizon` for identity goals.

ALTER TABLE goals ADD COLUMN last_reviewed_at INTEGER;
-- Updated on agent/user review pass; "stalled" = now - last_reviewed_at > cadence.

ALTER TABLE goals ADD COLUMN archived_at INTEGER;
-- Soft archive so we never lose context (and embeddings stay valid).

CREATE INDEX IF NOT EXISTS idx_goals_kind ON goals(kind);
CREATE INDEX IF NOT EXISTS idx_goals_last_reviewed ON goals(last_reviewed_at);
CREATE INDEX IF NOT EXISTS idx_goals_archived ON goals(archived_at);

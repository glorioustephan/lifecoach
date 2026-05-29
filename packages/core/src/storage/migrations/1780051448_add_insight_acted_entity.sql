-- Insight provenance: when the user creates a goal/task/habit directly from an
-- inbox card, record WHAT was created alongside acted_on_at. This gives the
-- "Acted" state a concrete meaning distinct from "Dismissed" (which only stamps
-- dismissed_at). Both columns are nullable and additive — existing acted rows
-- simply have NULL provenance.

ALTER TABLE insights ADD COLUMN acted_entity_type TEXT;  -- 'goal' | 'task' | 'habit'
ALTER TABLE insights ADD COLUMN acted_entity_id   TEXT;

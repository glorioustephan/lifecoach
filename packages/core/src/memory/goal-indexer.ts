import type { Goal, Milestone } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import type { Embedder } from "../embeddings/index.js";

/**
 * Build the text we embed for a goal. Packs every aspirational facet — title,
 * WOOP outcome / obstacle / plan, and identity statement — into a single chunk
 * so semantic recall hits any facet without diluting the embedding.
 *
 * Intentionally omits status, kind, and progress numbers so the embedding
 * stays valid through lifecycle changes (active → done, etc.).
 */
const renderGoalForEmbedding = (goal: Goal): string => {
  const lines: string[] = [`[goal:${goal.kind}] ${goal.title}`];
  if (goal.outcome && goal.outcome.trim().length > 0) {
    lines.push(`Outcome: ${goal.outcome.trim()}`);
  } else if (goal.body && goal.body.trim().length > 0) {
    // Legacy body field still carries the "why it matters" — keep indexing it
    // so older goals remain recallable without forcing a backfill edit.
    lines.push(goal.body.trim());
  }
  if (goal.obstacle && goal.obstacle.trim().length > 0) {
    lines.push(`Obstacle: ${goal.obstacle.trim()}`);
  }
  if (goal.implementationIntention && goal.implementationIntention.trim().length > 0) {
    lines.push(`Plan: ${goal.implementationIntention.trim()}`);
  }
  if (goal.identityStatement && goal.identityStatement.trim().length > 0) {
    lines.push(`Identity: ${goal.identityStatement.trim()}`);
  }
  if (goal.successCriteria && goal.successCriteria.trim().length > 0) {
    lines.push(`Success: ${goal.successCriteria.trim()}`);
  }
  if (goal.targetMetric) {
    const target =
      goal.targetValue !== null && goal.targetValue !== undefined
        ? ` (target ${goal.targetValue})`
        : "";
    lines.push(`Metric: ${goal.targetMetric}${target}`);
  }
  return lines.join("\n");
};

/**
 * Build the text we embed for a milestone. Prefixed with its parent goal's
 * title so recall returns useful context even when the milestone title is
 * terse ("Draft outline", "Step 2", etc.).
 */
const renderMilestoneForEmbedding = (
  milestone: Milestone,
  goalTitle: string,
): string => {
  const lines: string[] = [`[milestone] ${goalTitle}: ${milestone.title}`];
  if (milestone.body && milestone.body.trim().length > 0) {
    lines.push(milestone.body.trim());
  }
  return lines.join("\n");
};

/**
 * Replace (or create) the embedding for a single goal. Idempotent — call after
 * any upsert. Silently no-ops when the embedder is disabled.
 */
export const indexGoal = async (
  storage: Storage,
  embedder: Embedder,
  goal: Goal,
): Promise<void> => {
  if (!embedder.enabled) return;
  const text = renderGoalForEmbedding(goal);
  storage.embeddings.deleteForRef("goal", goal.id);
  const [vec] = await embedder.embedDocuments([text]);
  if (!vec || vec.length === 0) return;
  storage.embeddings.insert({
    refType: "goal",
    refId: goal.id,
    chunkIndex: 0,
    text,
    embedding: vec,
    model: embedder.metadata.model,
    dimension: embedder.metadata.dimension,
    sourceUpdatedAt: goal.updatedAt,
  });
};

/**
 * Replace (or create) the embedding for a single milestone. Fetches the parent
 * goal's title so the embedding carries enough context standalone. No-op if
 * the parent goal is missing (defensive — shouldn't happen given the ON
 * DELETE CASCADE).
 */
export const indexMilestone = async (
  storage: Storage,
  embedder: Embedder,
  milestone: Milestone,
): Promise<void> => {
  if (!embedder.enabled) return;
  const parent = storage.goals.get(milestone.goalId);
  if (!parent) return;
  const text = renderMilestoneForEmbedding(milestone, parent.title);
  storage.embeddings.deleteForRef("milestone", milestone.id);
  const [vec] = await embedder.embedDocuments([text]);
  if (!vec || vec.length === 0) return;
  storage.embeddings.insert({
    refType: "milestone",
    refId: milestone.id,
    chunkIndex: 0,
    text,
    embedding: vec,
    model: embedder.metadata.model,
    dimension: embedder.metadata.dimension,
    sourceUpdatedAt: milestone.updatedAt,
  });
};

/** Batch variant — single Voyage call per upsert wave. */
export const indexGoals = async (
  storage: Storage,
  embedder: Embedder,
  goals: Goal[],
): Promise<void> => {
  if (!embedder.enabled || goals.length === 0) return;
  const texts = goals.map(renderGoalForEmbedding);
  const vectors = await embedder.embedDocuments(texts);
  for (let i = 0; i < goals.length; i += 1) {
    const goal = goals[i];
    const vec = vectors[i];
    if (!goal || !vec || vec.length === 0) continue;
    storage.embeddings.deleteForRef("goal", goal.id);
    storage.embeddings.insert({
      refType: "goal",
      refId: goal.id,
      chunkIndex: 0,
      text: texts[i]!,
      embedding: vec,
      model: embedder.metadata.model,
      dimension: embedder.metadata.dimension,
      sourceUpdatedAt: goal.updatedAt,
    });
  }
};

import type { Task } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import type { Embedder } from "../embeddings/index.js";

/**
 * Build the text we embed for a task. Intentionally omits status so the
 * embedding stays valid when a task moves from active → completed.
 */
const renderForEmbedding = (task: Task): string => {
  const lines: string[] = [`[task] ${task.content}`];
  if (task.description && task.description.trim().length > 0) {
    lines.push(task.description.trim());
  }
  if (task.projectName) {
    lines.push(`project: ${task.projectName}`);
  }
  if (task.labels.length > 0) {
    lines.push(`labels: ${task.labels.join(", ")}`);
  }
  return lines.join("\n");
};

/**
 * Replace (or create) the embedding for a single task. Idempotent — call after
 * any upsert. Silently no-ops when the embedder is disabled.
 */
export const indexTask = async (
  storage: Storage,
  embedder: Embedder,
  task: Task,
): Promise<void> => {
  if (!embedder.enabled) return;
  const text = renderForEmbedding(task);
  // Replace existing embedding(s) for this task — content may have changed.
  storage.embeddings.deleteForRef("task", task.id);
  const [vec] = await embedder.embedDocuments([text]);
  if (!vec || vec.length === 0) return;
  storage.embeddings.insert({
    refType: "task",
    refId: task.id,
    chunkIndex: 0,
    text,
    embedding: vec,
    model: embedder.metadata.model,
    dimension: embedder.metadata.dimension,
    sourceUpdatedAt: task.updatedAt,
  });
};

/**
 * Batch variant for syncs. Embeds in a single Voyage call when possible.
 */
export const indexTasks = async (
  storage: Storage,
  embedder: Embedder,
  tasks: Task[],
): Promise<void> => {
  if (!embedder.enabled || tasks.length === 0) return;
  const texts = tasks.map(renderForEmbedding);
  const vectors = await embedder.embedDocuments(texts);
  for (let i = 0; i < tasks.length; i += 1) {
    const task = tasks[i];
    const vec = vectors[i];
    if (!task || !vec || vec.length === 0) continue;
    storage.embeddings.deleteForRef("task", task.id);
    storage.embeddings.insert({
      refType: "task",
      refId: task.id,
      chunkIndex: 0,
      text: texts[i]!,
      embedding: vec,
      model: embedder.metadata.model,
      dimension: embedder.metadata.dimension,
      sourceUpdatedAt: task.updatedAt,
    });
  }
};

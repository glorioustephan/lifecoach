import type { Storage } from "../storage/index.js";
import type { IdentityMemory } from "./identity.js";
import type { ReflectionMemory } from "./reflections.js";

export interface ContextBuilderDeps {
  identity: IdentityMemory;
  reflections: ReflectionMemory;
  /** Storage handle gives us access to active goals + their linked next
   *  actions for the always-on commitments block. */
  storage: Storage;
}

/**
 * Composes the "always-on" context block appended to the agent's system prompt.
 *
 * Strategy:
 *   1. Identity profile — always included.
 *   2. Latest weekly reflection — included if present.
 *   3. Active commitments — top 5 active goals (stalest review first), each
 *      as a one-liner with its kind and next linked task if any. Caps the
 *      always-on context at ~50 tokens of goal data so the system prompt
 *      doesn't bloat; the rest the agent loads via `recall`.
 *
 * Anything else (facts, documents, messages, milestones) is loaded on-demand
 * by the agent via the `recall` tool.
 */
export class ContextBuilder {
  constructor(private readonly deps: ContextBuilderDeps) {}

  build(): string {
    const sections: string[] = [];

    sections.push("## What I know about the user (identity profile)");
    sections.push(this.deps.identity.render());

    const reflection = this.deps.reflections.latest("weekly");
    if (reflection) {
      const ageDays = Math.round((Date.now() - reflection.createdAt) / (24 * 60 * 60 * 1000));
      sections.push(`\n## Most recent weekly reflection (${ageDays}d old)`);
      sections.push(reflection.body);
    }

    const commitments = this.renderActiveCommitments();
    if (commitments) {
      sections.push(`\n## Active commitments`);
      sections.push(commitments);
    }

    return sections.join("\n");
  }

  /** Top 5 active goals ordered by stalest review first. For each, render the
   *  next linked active task as the next action. */
  private renderActiveCommitments(): string | null {
    const goals = this.deps.storage.goals.list({ status: "active", limit: 5 });
    if (goals.length === 0) return null;

    const lines: string[] = [];
    for (const g of goals) {
      const nextTask = this.findNextTask(g.id);
      const kindTag = g.kind === "process" && g.cadence ? `${g.kind}/${g.cadence}` : g.kind;
      const next = nextTask
        ? ` — next: ${nextTask}`
        : ` — next: [no next action — propose one when relevant]`;
      lines.push(`- [${g.id.slice(0, 8)}] ${g.title} (${kindTag})${next}`);
    }
    return lines.join("\n");
  }

  private findNextTask(goalId: string): string | null {
    const tasks = this.deps.storage.tasks.list({
      status: "active",
      limit: 100,
    });
    // Prefer the task with the soonest due date; fall back to most recently
    // created. Linked but undated tasks still count.
    const linked = tasks
      .filter((t) => t.goalId === goalId)
      .sort((a, b) => {
        const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
        const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
        return b.createdAt - a.createdAt;
      });
    return linked[0]?.content ?? null;
  }
}

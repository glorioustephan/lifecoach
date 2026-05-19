import type { IdentityMemory } from "./identity.js";
import type { ReflectionMemory } from "./reflections.js";

export interface ContextBuilderDeps {
  identity: IdentityMemory;
  reflections: ReflectionMemory;
}

/**
 * Composes the "always-on" context block appended to the agent's system prompt.
 *
 * Strategy:
 *   1. Identity profile — always included.
 *   2. Latest weekly reflection — included if present.
 *
 * Anything else is loaded on-demand by the agent via the `recall` tool.
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

    return sections.join("\n");
  }
}

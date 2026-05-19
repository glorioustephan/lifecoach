import type { Reflection, ReflectionKind } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";
import { NotImplementedError } from "../util/errors.js";

export class ReflectionMemory {
  constructor(private readonly storage: Storage) {}

  latest(kind: ReflectionKind = "weekly"): Reflection | undefined {
    return this.storage.reflections.latest(kind);
  }

  record(r: { periodStart: number; periodEnd: number; kind: ReflectionKind; body: string }): Reflection {
    return this.storage.reflections.create(r);
  }

  /**
   * Produce a fresh reflection over a period.
   * Wire this to call the agent with a compact summarization prompt over
   * messages in the range, then persist via record(). Stubbed for now.
   */
  async summarizePeriod(
    _from: number,
    _to: number,
    _kind: ReflectionKind,
  ): Promise<Reflection> {
    throw new NotImplementedError(
      "ReflectionMemory.summarizePeriod",
      "implement in packages/core/src/memory/reflections.ts — pull messages with EpisodicMemory.recent and call the agent for a summary",
    );
  }
}

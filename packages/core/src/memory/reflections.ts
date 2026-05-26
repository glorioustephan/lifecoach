import type { NewReflection, Reflection, ReflectionKind } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";

export class ReflectionMemory {
  constructor(private readonly storage: Storage) {}

  latest(kind: ReflectionKind = "weekly"): Reflection | undefined {
    return this.storage.reflections.latest(kind);
  }

  /**
   * Persist a fully-formed reflection. Callers that need LLM generation
   * should use Reflector.generate() (packages/core/src/memory/reflector.ts)
   * which calls this after constructing the payload.
   */
  record(r: NewReflection): Reflection {
    return this.storage.reflections.create(r);
  }
}

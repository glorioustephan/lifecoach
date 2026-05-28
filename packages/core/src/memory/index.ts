import type { Storage } from "../storage/index.js";
import type { Embedder } from "../embeddings/index.js";
import { IdentityMemory } from "./identity.js";
import { EpisodicMemory } from "./episodic.js";
import { SemanticMemory } from "./semantic.js";
import { ReflectionMemory } from "./reflections.js";
import { ContextBuilder } from "./context-builder.js";

export interface Memory {
  identity: IdentityMemory;
  episodic: EpisodicMemory;
  semantic: SemanticMemory;
  reflections: ReflectionMemory;
  context: ContextBuilder;
}

export const createMemory = (storage: Storage, embedder: Embedder): Memory => {
  const identity = new IdentityMemory(storage);
  const reflections = new ReflectionMemory(storage);
  return {
    identity,
    episodic: new EpisodicMemory(storage),
    semantic: new SemanticMemory({ storage, embedder }),
    reflections,
    context: new ContextBuilder({ identity, reflections, storage }),
  };
};

export { IdentityMemory } from "./identity.js";
export { EpisodicMemory } from "./episodic.js";
export { SemanticMemory } from "./semantic.js";
export { ReflectionMemory } from "./reflections.js";
export { ContextBuilder } from "./context-builder.js";
export { indexTask, indexTasks } from "./task-indexer.js";
export { refreshAttentionSignals } from "./attention.js";
export { forgetDocument, type ForgetDocumentResult } from "./forget.js";
export { Reflector, kindWindow, type ReflectorOptions, type ReflectionPayload } from "./reflector.js";
export { Insighter, type InsighterOptions } from "./insighter.js";

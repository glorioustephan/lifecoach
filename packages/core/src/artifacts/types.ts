import type { ArtifactTypeDescriptor } from "@lifecoach/schemas";

/** The standardized output a plugin produces for one extracted artifact. */
export interface FormattedArtifact {
  title: string;
  /** Standardized Markdown. */
  body: string;
  tags: string[];
  category?: string;
}

/** One artifact the extractor pulled out of some text. */
export interface ExtractedArtifact {
  type: string;
  confidence: number;
  formatted: FormattedArtifact;
}

/**
 * An artifact type plugin. Adding a new artifact type = implement this once and
 * `register()` it. Nothing in the page, API, cron, or extractor changes.
 *
 * The combined extraction tool (`record_artifacts`) is assembled from every
 * requested plugin: each contributes a named array (`collectionKey`) of items
 * shaped by `itemSchema`. One LLM call therefore handles any/all types at once,
 * keeping token use moderate.
 */
export interface ArtifactPlugin {
  descriptor: ArtifactTypeDescriptor;
  /** Property name under which this type's items appear in the tool input, e.g. "recipes". */
  collectionKey: string;
  /** JSON schema for a single item. Must include a numeric `confidence` field. */
  itemSchema: Record<string, unknown>;
  /** A short, type-specific instruction appended to the extraction prompt. */
  promptHint: string;
  /**
   * Validate one raw tool item and render it. Returns the confidence + the
   * standardized Markdown, or null if the item doesn't qualify. The plugin's
   * concrete payload type stays internal, so the registry can hold a
   * heterogeneous set of plugins without a generic.
   */
  extractItem: (input: unknown) => { confidence: number; formatted: FormattedArtifact } | null;
}

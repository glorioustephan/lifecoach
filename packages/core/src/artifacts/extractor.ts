import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "../util/retry.js";
import { artifactPluginsFor } from "./registry.js";
import type { ArtifactPlugin, ExtractedArtifact } from "./types.js";

const MAX_CHARS = 24_000;

const buildPrompt = (text: string, plugins: ArtifactPlugin[]): string => {
  const truncated =
    text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n\n[truncated]" : text;
  const hints = plugins.map((p) => `- ${p.promptHint}`).join("\n");
  return `You extract reusable artifacts from a personal coaching conversation.

## Artifact types to look for
${hints}

## Rules
1. Only extract an item when it is clearly, intentionally present and complete. When in doubt, skip it.
2. Set \`confidence\` honestly per item (0–1). A complete, deliberate artifact ≈ 0.8–1.0; a rough or partial mention ≈ <0.7.
3. Preserve the user's specifics (quantities, names, numbers). Do NOT invent details that aren't in the text.
4. If nothing qualifies, return empty arrays. That is the correct answer most of the time.

## Conversation
${truncated}

---

Call \`record_artifacts\` with the items you found (empty arrays if none).`;
};

export interface ArtifactExtractorOptions {
  apiKey: string;
  model?: string;
  maxRetries?: number;
}

export class ArtifactExtractor {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxRetries: number;

  constructor(opts: ArtifactExtractorOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? "claude-sonnet-4-6";
    this.maxRetries = opts.maxRetries ?? 4;
  }

  /**
   * Run one extraction pass over `text`. With `types`, only those plugins are
   * considered (their schema is the only thing sent to the model — lean prompt).
   * Returns every parsed artifact with its self-reported confidence; the caller
   * decides what threshold to keep.
   */
  async extractFromText(
    text: string,
    opts: { types?: string[] } = {},
  ): Promise<ExtractedArtifact[]> {
    const plugins = artifactPluginsFor(opts.types);
    if (plugins.length === 0) return [];

    const properties: Record<string, unknown> = {};
    for (const p of plugins) {
      properties[p.collectionKey] = {
        type: "array",
        items: p.itemSchema,
        description: `Items of type "${p.descriptor.id}". Empty if none.`,
      };
    }
    const toolSchema = {
      type: "object" as const,
      properties,
      required: [] as string[],
    };

    const response = await withRetry(
      () =>
        this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          tools: [
            {
              name: "record_artifacts",
              description: "Record artifacts extracted from the conversation.",
              input_schema: toolSchema,
            },
          ],
          tool_choice: { type: "tool", name: "record_artifacts" },
          messages: [{ role: "user", content: buildPrompt(text, plugins) }],
        }),
      { maxAttempts: this.maxRetries },
    );

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return [];
    const input = toolUse.input as Record<string, unknown>;

    const out: ExtractedArtifact[] = [];
    for (const p of plugins) {
      const items = input[p.collectionKey];
      if (!Array.isArray(items)) continue;
      for (const raw of items) {
        const result = p.extractItem(raw);
        if (!result) continue;
        out.push({
          type: p.descriptor.id,
          confidence: result.confidence,
          formatted: result.formatted,
        });
      }
    }
    return out;
  }
}

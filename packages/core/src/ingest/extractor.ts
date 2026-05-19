import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { FactCategory, NewFact, NewMeasurement } from "@lifecoach/schemas";
import { withRetry } from "../util/retry.js";
import { LifecoachError } from "../util/errors.js";

// What the LLM is asked to emit, before we map to NewFact/NewMeasurement.
const extractedFactSchema = z.object({
  category: z.enum([
    "health",
    "preference",
    "recipe",
    "task",
    "routine",
    "goal",
    "relationship",
    "other",
  ]),
  subject: z.string().min(1),
  body: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.8),
});

const extractedMeasurementSchema = z.object({
  metric: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  // ISO 8601 (full or date-only). Skip if the LLM can't determine the date — we
  // don't want to backdate to "now" for things like a lab from last year.
  recordedAt: z.string().min(1),
});

export const extractionPayloadSchema = z.object({
  facts: z.array(extractedFactSchema).default([]),
  measurements: z.array(extractedMeasurementSchema).default([]),
  /** Free-text note from the model about what it skipped and why. Useful for debugging. */
  notes: z.string().optional(),
});
export type ExtractionPayload = z.infer<typeof extractionPayloadSchema>;

export interface ExtractContext {
  identityProfile: string;
  documentTitle?: string;
  documentSource?: string;
}

export interface ExtractionResult {
  facts: NewFact[];
  measurements: NewMeasurement[];
  notes?: string;
}

export interface Extractor {
  extract(text: string, ctx: ExtractContext): Promise<ExtractionResult>;
}

// JSON Schema sent to the model as the tool's input_schema. Keep this aligned
// with extractionPayloadSchema above — zod is the runtime guard, this is the
// model-facing contract.
const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    facts: {
      type: "array",
      description:
        "Facts about the user that should persist in long-term memory. Only extract personal information — what the user IS, PREFERS, DOES, or has STATED. Skip general reference material.",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "health",
              "preference",
              "recipe",
              "task",
              "routine",
              "goal",
              "relationship",
              "other",
            ],
          },
          subject: {
            type: "string",
            description: "Short tag, e.g. 'allergy', 'morning-routine', 'breakfast-preference'",
          },
          body: {
            type: "string",
            description: "Natural-language statement of the fact. Use the user's own phrasing when possible.",
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "0 = uncertain, 1 = explicitly stated. Default 0.8.",
          },
        },
        required: ["category", "subject", "body"],
      },
    },
    measurements: {
      type: "array",
      description:
        "Numeric measurements with metric, value, unit, and date. Only extract if all four are unambiguous (typical sources: lab reports, fitness trackers).",
      items: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            description:
              "Snake-case identifier, e.g. 'fasting_glucose', 'hemoglobin_a1c', 'weight_kg'",
          },
          value: { type: "number" },
          unit: { type: "string", description: "e.g. 'mg/dL', '%', 'kg', 'mmHg'" },
          recordedAt: {
            type: "string",
            description: "ISO 8601 date or datetime when the measurement was taken",
          },
        },
        required: ["metric", "value", "recordedAt"],
      },
    },
    notes: {
      type: "string",
      description:
        "Optional one-line explanation of what was skipped and why. Helps debug extraction quality.",
    },
  },
  required: ["facts", "measurements"],
};

const buildPrompt = (text: string, ctx: ExtractContext): string => {
  const titlePart = ctx.documentTitle ? `\nDocument title: ${ctx.documentTitle}` : "";
  const sourcePart = ctx.documentSource ? `\nSource: ${ctx.documentSource}` : "";

  return `You are a structured-extraction service for a personal life/health coach app.

The user's identity profile:
${ctx.identityProfile}
${titlePart}${sourcePart}

Given the document below, call \`record_extraction\` with:
- Facts about the user that should persist in long-term memory. Only extract personal information — what the user IS, PREFERS, DOES, HAS DONE, or has STATED. Skip general knowledge, reference material, and recommendations that don't describe the user.
- Numeric measurements with a clear metric + value + unit + date. Only extract if all four are unambiguous. Typical sources: lab reports, fitness trackers, weight logs.

If the document is general reference material (a recipe book, an article, an explainer note), return EMPTY arrays for both. Be conservative — when in doubt, leave it out.

Document:
---
${text}
---`;
};

export interface AnthropicExtractorOptions {
  apiKey: string;
  model?: string;
  /** Char cap on document body sent to the model. Default 60000 (~15K tokens, safely under any context limit). */
  maxInputChars?: number;
}

export class AnthropicExtractor implements Extractor {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxInputChars: number;

  constructor(opts: AnthropicExtractorOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? "claude-sonnet-4-6";
    this.maxInputChars = opts.maxInputChars ?? 60_000;
  }

  async extract(text: string, ctx: ExtractContext): Promise<ExtractionResult> {
    if (!text || text.trim().length === 0) {
      return { facts: [], measurements: [] };
    }
    const truncated = text.length > this.maxInputChars
      ? text.slice(0, this.maxInputChars)
      : text;

    const response = await withRetry(
      () =>
        this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          tools: [
            {
              name: "record_extraction",
              description: "Record facts and measurements extracted from a document.",
              input_schema: TOOL_INPUT_SCHEMA,
            },
          ],
          tool_choice: { type: "tool", name: "record_extraction" },
          messages: [
            {
              role: "user",
              content: buildPrompt(truncated, ctx),
            },
          ],
        }),
      { maxAttempts: 4 },
    );

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new LifecoachError(
        "Extractor: model did not call record_extraction",
        "EXTRACTION_NO_TOOL_USE",
      );
    }
    const parsed = extractionPayloadSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new LifecoachError(
        `Extractor: invalid tool input: ${parsed.error.message}`,
        "EXTRACTION_INVALID_PAYLOAD",
      );
    }

    return mapPayload(parsed.data);
  }
}

const mapPayload = (payload: ExtractionPayload): ExtractionResult => {
  const facts: NewFact[] = payload.facts.map((f) => ({
    category: f.category as FactCategory,
    subject: f.subject,
    body: f.body,
    source: "ingest:extractor",
    confidence: f.confidence,
    validTo: null,
  }));

  const measurements: NewMeasurement[] = payload.measurements
    .map((m) => {
      const ts = parseDate(m.recordedAt);
      if (ts === null) return null;
      return {
        metric: m.metric,
        value: m.value,
        ...(m.unit ? { unit: m.unit } : {}),
        recordedAt: ts,
      } satisfies NewMeasurement;
    })
    .filter((m): m is NewMeasurement => m !== null);

  return {
    facts,
    measurements,
    ...(payload.notes ? { notes: payload.notes } : {}),
  };
};

const parseDate = (raw: string): number | null => {
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  return t;
};

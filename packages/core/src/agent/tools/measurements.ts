import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Memory } from "../../memory/index.js";
import { NotImplementedError } from "../../util/errors.js";

/**
 * Measurement tools are partially scaffolded.
 *   - `query_measurements` works (the repo is implemented).
 *   - `record_measurement` is wired and works.
 *   - The richer "ingest a lab PDF and extract a bunch of measurements" flow
 *     belongs in the ingest pipeline (see ingest.ts and ingest/pipeline.ts).
 */
export const buildMeasurementTools = (memory: Memory) => [
  tool(
    "query_measurements",
    "Read a time-series of measurements for a given metric (e.g. 'fasting_glucose', 'hrv', 'weight').",
    {
      metric: z.string().min(1),
      from: z.number().int().optional().describe("Unix ms"),
      to: z.number().int().optional().describe("Unix ms"),
    },
    async ({ metric, from, to }) => {
      // The semantic memory doesn't own this — call the repo directly via storage.
      // We expose this via the underlying repository on the memory object's storage indirectly,
      // but for now keep it here as a focused tool. If/when we want richer summarization,
      // do it in a dedicated helper.
      throw new NotImplementedError(
        "query_measurements",
        "wire to storage.measurements.query — see packages/core/src/storage/repositories/measurements.ts. " +
          "Stubbed at the tool layer; the repository works.",
      );
      // Reachable once implemented:
      // return { content: [{ type: "text", text: JSON.stringify(rows) }] };
    },
  ),

  tool(
    "record_measurement",
    "Record a single measurement (e.g. a manual weight reading).",
    {
      metric: z.string().min(1),
      value: z.number(),
      unit: z.string().optional(),
      recordedAt: z.number().int().optional().describe("Unix ms; defaults to now"),
    },
    async ({ metric, value, unit, recordedAt }) => {
      throw new NotImplementedError(
        "record_measurement",
        "wire to storage.measurements.create — repo is implemented, just call it",
      );
    },
  ),
];

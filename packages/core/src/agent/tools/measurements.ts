import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";

/**
 * Measurement tools are partially scaffolded.
 *   - `query_measurements` works (the repo is implemented).
 *   - `record_measurement` is wired and works.
 *   - The richer "ingest a lab PDF and extract a bunch of measurements" flow
 *     belongs in the ingest pipeline (see ingest.ts and ingest/pipeline.ts).
 */
export const buildMeasurementTools = (storage: Storage) => [
  tool(
    "query_measurements",
    "Read a time-series of measurements for a given metric (e.g. 'fasting_glucose', 'hrv', 'weight').",
    {
      metric: z.string().min(1),
      from: z.number().int().optional().describe("Unix ms"),
      to: z.number().int().optional().describe("Unix ms"),
    },
    async ({ metric, from, to }) => {
      const range = {
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
      };
      const rows = storage.measurements.query(metric, range);
      const summary = storage.measurements.summarize(metric, range);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ summary, measurements: rows }, null, 2),
          },
        ],
      };
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
      const measurement = storage.measurements.create({
        metric,
        value,
        ...(unit ? { unit } : {}),
        recordedAt: recordedAt ?? Date.now(),
      });
      return {
        content: [
          {
            type: "text",
            text: `Recorded ${measurement.metric}=${measurement.value}${measurement.unit ? ` ${measurement.unit}` : ""} at ${new Date(measurement.recordedAt).toISOString()} (${measurement.id}).`,
          },
        ],
      };
    },
  ),
];

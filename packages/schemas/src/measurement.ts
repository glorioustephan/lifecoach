import { z } from "zod";

export const measurementSchema = z.object({
  id: z.string(),
  metric: z.string().min(1),
  value: z.number(),
  unit: z.string().optional(),
  recordedAt: z.number().int(),
  sourceDocumentId: z.string().optional(),
  createdAt: z.number().int(),
});
export type Measurement = z.infer<typeof measurementSchema>;

export const newMeasurementSchema = measurementSchema.omit({
  id: true,
  createdAt: true,
});
export type NewMeasurement = z.infer<typeof newMeasurementSchema>;

export const measurementRangeSchema = z.object({
  from: z.number().int().optional(),
  to: z.number().int().optional(),
});
export type MeasurementRange = z.infer<typeof measurementRangeSchema>;

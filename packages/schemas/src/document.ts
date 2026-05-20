import { z } from "zod";

export const documentSchema = z.object({
  id: z.string(),
  source: z.string(),
  mime: z.string().optional(),
  title: z.string().optional(),
  body: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ingestedAt: z.number().int(),
  /** External system identifier, e.g. a Capacities object UUID. Null for locally-ingested files. */
  externalId: z.string().nullable().optional(),
  /** Which external system the external_id belongs to (e.g. "capacities"). */
  externalSource: z.string().nullable().optional(),
});
export type Document = z.infer<typeof documentSchema>;

export const newDocumentSchema = documentSchema.omit({
  id: true,
  ingestedAt: true,
});
export type NewDocument = z.infer<typeof newDocumentSchema>;

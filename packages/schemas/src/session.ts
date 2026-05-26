import { z } from "zod";

export const sessionSchema = z.object({
  id: z.string(),
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable().optional(),
  summary: z.string().nullable().optional(),
  archivedAt: z.number().int().nullable().optional(),
  /**
   * The Claude Agent SDK's own session id for this conversation. The SDK owns
   * the full message transcript under this id; we pass it back as
   * `options.resume` on later turns so the model retains in-conversation
   * context. Null until the first turn establishes it.
   */
  sdkSessionId: z.string().nullable().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

export const newSessionSchema = sessionSchema.omit({ id: true });
export type NewSession = z.infer<typeof newSessionSchema>;

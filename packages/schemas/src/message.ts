import { z } from "zod";

export const messageRole = z.enum(["user", "assistant", "system", "tool"]);
export type MessageRole = z.infer<typeof messageRole>;

export const toolUseSchema = z.object({
  name: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
});
export type ToolUse = z.infer<typeof toolUseSchema>;

export const messageSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: messageRole,
  content: z.string(),
  toolUse: toolUseSchema.optional(),
  createdAt: z.number().int(),
});
export type Message = z.infer<typeof messageSchema>;

export const newMessageSchema = messageSchema.omit({
  id: true,
  createdAt: true,
});
export type NewMessage = z.infer<typeof newMessageSchema>;

/**
 * MCP tool error helpers.
 *
 * `.claude/rules/mcp.md` mandates that tool handlers return structured error
 * responses (`{ isError: true, content: [...] }`) rather than throwing —
 * unhandled exceptions through the Agent SDK transport surface as opaque
 * strings the model can't reason about. These helpers keep the wire shape
 * consistent across handlers.
 */

import { LifecoachError } from "../../util/errors.js";

export interface ToolErrorResponse {
  // Index signature matches the Agent SDK's tool-handler return type — it
  // accepts arbitrary additional fields, and TS will otherwise reject our
  // narrower interface where the SDK demands an open record.
  [key: string]: unknown;
  isError: true;
  content: [{ type: "text"; text: string }];
}

/**
 * Build a structured MCP error response. Always includes the literal
 * "Error:" prefix so the model has an unambiguous lexical signal.
 */
export const toolError = (message: string): ToolErrorResponse => ({
  isError: true,
  content: [{ type: "text", text: `Error: ${message}` }],
});

/**
 * Convert a thrown value into a `toolError` response. Use inside tool
 * handlers that wrap risky operations:
 *
 *   try {
 *     ...
 *   } catch (err) {
 *     return toolErrorFromException(err);
 *   }
 *
 * Preserves the `code` from a `LifecoachError` when present, so callers can
 * still see e.g. `Error: [GOAL_NOT_FOUND] ...`.
 */
export const toolErrorFromException = (err: unknown): ToolErrorResponse => {
  if (err instanceof LifecoachError) {
    return toolError(`[${err.code}] ${err.message}`);
  }
  if (err instanceof Error) {
    return toolError(err.message);
  }
  return toolError(String(err));
};

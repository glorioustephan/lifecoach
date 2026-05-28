---
title: TOOL_NAME MCP Tool Spec
slug: TOOL_NAME
audience: [agents]
owner: mcp-protocol-engineer
status: draft
created: FILL_IN_DATE
updated: FILL_IN_DATE
source: authored
pair: []
---

<!-- ENGINEER-FACING CONTRACT for the TOOL_NAME MCP tool.
     This spec is normative. Implement exactly what is described here.
     Raise open questions for the paired advisor before starting implementation. -->

## Tool name

`TOOL_NAME`

<!-- snake_case. Must match the name registered in the MCP server's tool manifest. -->

## Purpose

<!-- One paragraph: what does this tool do, who calls it, and what problem does it solve?
     Include the user-facing scenario that motivated this tool. -->

## Input schema (Zod TypeScript)

```typescript
import { z } from "zod";

const TOOL_NAMEInputSchema = z.object({
  // FILL IN: each field with .describe() annotation
  // Example:
  // account_id: z.string().uuid().describe("Monarch account identifier"),
  // start_date: z.string().describe("ISO 8601 start date for the query range"),
});

export type TOOL_NAMEInput = z.infer<typeof TOOL_NAMEInputSchema>;
```

## Output schema

```typescript
// Success shape
type TOOL_NAMESuccess = {
  success: true;
  // FILL IN
};

// Error shape
type TOOL_NAMEError = {
  success: false;
  error: string;
  code: "FILL_IN" | "INTERNAL_ERROR";
};

type TOOL_NAMEOutput = TOOL_NAMESuccess | TOOL_NAMEError;
```

## Side effects

<!-- One bullet per side effect. Be exhaustive.
     Examples:
     - Writes to `transactions` table (upsert on external_id)
     - Calls Monarch API GET /v1/transactions with user OAuth token
     - Emits `transaction.synced` event to internal bus
     - No external side effects (read-only tool)
-->

## Auth

<!-- How is this tool authenticated?
     Examples:
     - No auth required (internal-only tool, no user data)
     - Reads MONARCH_ACCESS_TOKEN from env (refreshed by connectors/monarch)
     - Requires valid session token in tool call context
-->

## Observability

<!-- Required logging and metrics. Minimum requirements:
     - One structured log line on success: { level: "info", tool: "TOOL_NAME", duration_ms, result_count }
     - One structured log line on error: { level: "error", tool: "TOOL_NAME", error_code, message }
     List any additional counters, spans, or tracing requirements.
-->

## Error modes

<!-- Enumerate every expected error case.
     Format: error_code — condition — recommended client behavior
     Example:
     - UNAUTHORIZED — OAuth token missing or expired — client should trigger token refresh
     - NOT_FOUND — requested resource does not exist — client should surface to user
     - RATE_LIMITED — upstream API returned 429 — client should back off and retry after delay
     - INTERNAL_ERROR — unexpected server-side error — log and surface generic error to user
-->

## Example call

```typescript
// Example invocation via Claude Agent SDK / MCP client
const result = await mcpClient.callTool("TOOL_NAME", {
  // FILL IN: example input matching the schema above
});

// Expected success response:
// { success: true, ... }

// Expected error response:
// { success: false, error: "...", code: "NOT_FOUND" }
```

## Open questions

<!-- Questions for the advisor or architect before implementation begins.
     Delete this section when all are resolved. -->

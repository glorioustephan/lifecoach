---
title: FILL_IN_PLUGIN_NAME Plugin Spec
slug: FILL_IN_SLUG
audience: [agents]
owner: memory-systems-engineer
status: draft
created: FILL_IN_DATE
updated: FILL_IN_DATE
source: authored
pair: []
---

<!-- ENGINEER-FACING CONTRACT. This spec is normative; the paired brief is aspirational.
     Implement exactly what is specified here. To request clarification, flip status to
     needs-input and append ## Open questions for <advisor>. -->

## Tool name

<!-- The MCP tool name this plugin exposes. snake_case.
     Example: record_tax_lot, sync_monarch_transactions -->

## Inputs (Zod schema)

```typescript
// z.object({ ... }) — all fields with types and .describe() annotations
// Mark optional fields with .optional()
// Example:
// z.object({
//   symbol: z.string().describe("Ticker symbol, e.g. AAPL"),
//   quantity: z.number().positive().describe("Number of shares"),
//   cost_basis: z.number().describe("Total cost basis in USD"),
//   acquired_date: z.string().describe("ISO 8601 date string"),
// })
```

## Outputs

```typescript
// Return shape. Use z.object or z.discriminatedUnion for success/error.
// Example:
// { success: true, id: string, created_at: string }
// { success: false, error: string, code: "DUPLICATE" | "INVALID_INPUT" }
```

## Side effects

<!-- Enumerate every external effect: DB writes, API calls, file writes, events emitted.
     Format: one bullet per effect.
     Example:
     - Inserts row into `tax_lots` table (idempotent on symbol+acquired_date)
     - Emits `tax_lot.recorded` event to internal event bus
-->

## Storage tables

<!-- SQLite table(s) this plugin reads/writes.
     For new tables: include CREATE TABLE DDL (draft — migration-engineer finalizes).
     For existing tables: reference the table name and columns used.
-->

```sql
-- CREATE TABLE IF NOT EXISTS ...
```

## Auth

<!-- How is this plugin authenticated/authorized?
     Examples: No auth (internal only), Bearer token from env, OAuth via connector.
     Specify: token name, env var, rotation policy. -->

## Observability

<!-- Required logging and metrics.
     Minimum: one structured log line on success, one on error.
     Include: log fields (level, tool_name, duration_ms, error_code if applicable).
     Any Prometheus/OpenTelemetry counters or spans needed. -->

## Tests

<!-- Required test cases (list; test-engineer implements).
     Include: happy path, at least two error paths, idempotency check if relevant.
     Example:
     - records a valid tax lot and returns the new row id
     - rejects negative quantity with INVALID_INPUT code
     - duplicate symbol+date returns existing id (idempotent)
-->

## Open questions

<!-- Questions for the advisor before implementation can begin.
     Delete this section when all are resolved.
-->

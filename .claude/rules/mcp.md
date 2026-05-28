---
paths:
  - "packages/mcp-server/**"
  - "packages/mcp-alpaca-server/**"
  - "packages/core/src/agent/tools/**"
---

# MCP Protocol Rules

Rules for all MCP server packages and Claude Agent SDK tool definitions.

## Tool naming

All MCP tool names must be `snake_case` and follow the `verb_noun` pattern:

- Good: `record_transaction`, `search_memory`, `get_portfolio_summary`, `list_habits`
- Bad: `RecordTransaction`, `searchMemory`, `getPortfolioSummary` (camelCase / PascalCase)
- Bad: `transaction_record` (noun first), `do_thing` (vague verb)

Tool names are part of the public API surface. Once in production use, renames require a deprecation notice and a migration path.

## Required Zod input schemas

Every tool handler must declare its input as a Zod schema. No untyped or `z.any()` inputs.

```ts
import { z } from 'zod';

const RecordTransactionInput = z.object({
  amount: z.number().describe('Amount in USD, positive for income, negative for expense'),
  category: z.string().describe('Spending category slug from the finance taxonomy'),
  description: z.string().max(500).optional(),
  occurred_at: z.string().datetime().optional(),
});
```

The schema must be passed to the tool registration; it becomes the JSON Schema the MCP host exposes to the model. Always include `.describe()` on every field.

## In-process MCP via Claude Agent SDK

For tools that are called within the Claude Agent SDK runtime, use `createSdkMcpServer()` from the Agent SDK rather than spawning a separate process:

```ts
import { createSdkMcpServer } from '@anthropic-ai/agent-sdk';
const mcpServer = createSdkMcpServer({ tools: [...] });
```

This avoids IPC overhead and keeps tool execution in the same Node.js process. External MCP servers (stdio or HTTP) are only used when the tool must run in isolation (e.g. the Alpaca server which requires separate credentials).

## Tool-call observability

Wrap every tool handler in a timing/logging shim:

```ts
async function withObservability<T>(
  toolName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.debug({ tool: toolName, durationMs: Date.now() - start }, 'tool ok');
    return result;
  } catch (err) {
    logger.error({ tool: toolName, durationMs: Date.now() - start, err }, 'tool error');
    throw err;
  }
}
```

Log at `debug` on success, `error` on failure. Never log tool arguments that may contain PII (e.g. raw user messages, financial account numbers).

## No direct DB access from tool handlers

Tool handlers must not import or query the database directly. All persistence goes through repository interfaces:

- Import from `packages/core/src/memory/storage/repositories/`.
- Tool handler → repository method → prepared statement.
- This decoupling allows unit-testing tool handlers with mock repositories.

If a tool requires data that no repository exposes, add the repository method first, then wire the tool.

## Error surface

Tool errors must be returned as structured MCP error responses, not thrown unhandled:

```ts
return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
```

Never let an unhandled exception propagate to the MCP transport layer.

## Tool spec docs

Every tool exposed by `packages/mcp-server` or `packages/mcp-alpaca-server` must have a corresponding spec at `docs/specs/mcp-tools/<tool-name>.md`. Use the `mcp-tool-spec` skill to create one.

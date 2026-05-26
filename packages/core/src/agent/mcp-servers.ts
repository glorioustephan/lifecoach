import type { Options, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { LifecoachConfig } from "../config/index.js";

type McpServers = NonNullable<Options["mcpServers"]>;
type SdkServer = ReturnType<typeof createSdkMcpServer>;

/**
 * Compose the MCP server map handed to the Claude Agent SDK for a chat turn.
 *
 * Always includes the in-process `lifecoach-memory` server. When a Capacities
 * MCP token is configured, ALSO wires the remote Capacities MCP server — that
 * is the only path that exposes page bodies (`search` + `getObjectContent`),
 * which the REST API cannot. Until the token exists, this is simply absent;
 * there is no stub that pretends to work.
 *
 * Note: the Capacities MCP authorizes via OAuth 2.1. We pass the token as a
 * bearer header here; if your token expires you must refresh it. See
 * env.example for the one-time authorization steps.
 */
export const buildMcpServers = (
  config: LifecoachConfig,
  memoryServer: SdkServer,
): McpServers => {
  const servers: McpServers = { "lifecoach-memory": memoryServer };
  if (config.capacitiesMcpUrl && config.capacitiesMcpToken) {
    servers["capacities"] = {
      type: "http",
      url: config.capacitiesMcpUrl,
      headers: { Authorization: `Bearer ${config.capacitiesMcpToken}` },
    };
  }
  return servers;
};

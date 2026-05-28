import { tool } from "@anthropic-ai/claude-agent-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { withRetry } from "../../util/retry.js";

/**
 * Web research tools. Empty when no Anthropic API key is configured. Today
 * surfaces a single, scoped `research_alternative` tool used by the chat
 * agent during a Discuss handoff on a recurring-expense insight: the coach
 * calls this to find concrete cheaper alternatives + dollar deltas BEFORE
 * proposing a switch to the user.
 *
 * Implementation: makes a secondary, isolated Anthropic `messages.create`
 * call with the `web_search` server tool enabled, so the model can fetch
 * current pricing. Results are returned as plain text for the chat agent to
 * fold into its response. Failures are non-fatal — the tool returns a
 * "research unavailable" message so the conversation can continue.
 */
export const buildWebResearchTools = (opts: {
  apiKey: string | undefined;
  model: string | undefined;
}) => {
  if (!opts.apiKey) return [];
  const client = new Anthropic({ apiKey: opts.apiKey });
  const model = opts.model ?? "claude-sonnet-4-6";

  return [
    tool(
      "research_alternative",
      "Research cheaper alternative providers for a recurring service via web search. " +
        "Use ONLY when the user is actively discussing downgrading a specific subscription " +
        "(phone plan, internet, streaming, insurance, software). Returns 1–2 specific " +
        "alternatives with monthly cost + source URLs, plus an estimated monthly savings. " +
        "Treat the result as a starting point for discussion, not advice — confirm with the user.",
      {
        serviceDescription: z
          .string()
          .describe(
            "What the service is and what the user actually needs from it (e.g. 'unlimited talk/text + 2 lines of unlimited data, no contract'). Be specific so alternatives match real needs.",
          ),
        currentMonthlyCost: z
          .number()
          .describe("Current monthly cost in USD."),
        location: z
          .string()
          .optional()
          .describe("Country / region for availability filtering. Defaults to US."),
      },
      async ({ serviceDescription, currentMonthlyCost, location }) => {
        const region = location ?? "US";
        const prompt = `Find 1–2 specific cheaper alternative providers for this service in ${region}.

Current service: ${serviceDescription}
Current cost: $${currentMonthlyCost.toFixed(2)}/month

Search the web for current pricing. Respond concisely (under 250 words) with:
- For each alternative: provider name, monthly cost in USD, key feature parity vs. the current service, and a source URL.
- Estimated monthly savings vs. the current cost.
- If you can't find a credibly cheaper alternative with feature parity, say so plainly — don't pad.

Cite sources by URL. No marketing fluff.`;

        try {
          const response = await withRetry(
            () =>
              client.messages.create({
                model,
                max_tokens: 1024,
                // Anthropic server tool — runs inside Anthropic's infra, no extra key.
                // Cast: the SDK's typed Tool union may not yet include this server tool.
                tools: [
                  {
                    type: "web_search_20250305",
                    name: "web_search",
                    max_uses: 5,
                  } as never,
                ],
                messages: [{ role: "user", content: prompt }],
              }),
            { maxAttempts: 2 },
          );
          const text = response.content
            .filter((b) => b.type === "text")
            .map((b) => (b as { type: "text"; text: string }).text)
            .join("\n")
            .trim();
          return {
            content: [
              {
                type: "text" as const,
                text: text || "No credible cheaper alternative found via web search.",
              },
            ],
          };
        } catch (err) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Web research unavailable: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          };
        }
      },
    ),
  ];
};

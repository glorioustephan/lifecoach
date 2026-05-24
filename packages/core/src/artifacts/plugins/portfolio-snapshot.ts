import { z } from "zod";
import type { ArtifactPlugin } from "../index.js";

export const portfolioSnapshotPayloadSchema = z.object({
  date: z.string().describe("Date of snapshot (YYYY-MM-DD)"),
  total_value: z.number().describe("Total market value of portfolio"),
  cost_basis: z.number().describe("Total amount invested (cost basis)"),
  unrealized_gain_loss_percent: z.number().describe("Unrealized gain/loss as percentage"),
  top_holdings: z.array(
    z.object({
      symbol: z.string().describe("Ticker symbol (e.g., 'VTI', 'VXUS')"),
      percentage: z.number().describe("Percentage of portfolio"),
    }),
  ).describe("Top 3-5 holdings by portfolio percentage"),
});

export type PortfolioSnapshotPayload = z.infer<typeof portfolioSnapshotPayloadSchema>;

export const portfolioSnapshotPlugin: ArtifactPlugin = {
  id: "portfolio-snapshot",
  name: "Portfolio Snapshot",
  description: "Investment portfolio allocation, valuations, and unrealized gains/losses.",
  badgeColor: "accent",
  keywords: ["portfolio", "stocks", "investments", "holdings", "allocation", "gains", "losses"],
  detectionPrompt: `Look for mentions of investments, stocks, portfolio composition, or investment performance. The user might say "I'm mostly in VTI and VXUS" or "My portfolio is up 12%" or ask "What's my allocation?" Flag whenever they discuss their investment holdings or performance.`,
  payloadSchema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Date of snapshot (YYYY-MM-DD)",
      },
      total_value: {
        type: "number",
        description: "Total market value",
      },
      cost_basis: {
        type: "number",
        description: "Total amount invested",
      },
      unrealized_gain_loss_percent: {
        type: "number",
        description: "Unrealized gain/loss percentage",
      },
      top_holdings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Ticker symbol",
            },
            percentage: {
              type: "number",
              description: "Percentage of portfolio",
            },
          },
          required: ["symbol", "percentage"],
        },
        description: "Top holdings by percentage",
      },
    },
    required: ["date", "total_value", "cost_basis", "unrealized_gain_loss_percent", "top_holdings"],
  },
};

import { z } from "zod";
import { getArtifactDescriptor } from "@lifecoach/schemas";
import type { ArtifactPlugin, FormattedArtifact } from "../types.js";

const holdingSchema = z.object({
  symbol: z.string().min(1),
  percentage: z.number().min(0).max(100),
});

const portfolioSnapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  total_value: z.number(),
  cost_basis: z.number(),
  unrealized_gain_loss_percent: z.number(),
  top_holdings: z.array(holdingSchema).min(1),
  confidence: z.number().min(0).max(1),
});

type PortfolioSnapshot = z.infer<typeof portfolioSnapshotSchema>;

const itemSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    date: { type: "string", description: "Snapshot date as YYYY-MM-DD." },
    total_value: { type: "number", description: "Total portfolio market value in dollars." },
    cost_basis: { type: "number", description: "Total amount invested (cost basis) in dollars." },
    unrealized_gain_loss_percent: {
      type: "number",
      description: "Unrealized gain/loss as a percentage, e.g. 9.7 or -3.2.",
    },
    top_holdings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Ticker symbol, e.g. 'VTI'." },
          percentage: { type: "number", description: "Percentage of portfolio." },
        },
        required: ["symbol", "percentage"],
      },
      description: "Top 3–5 holdings by portfolio percentage.",
    },
    confidence: {
      type: "number",
      description: "0–1: confidence this is a genuine portfolio snapshot with concrete allocations.",
    },
  },
  required: ["date", "total_value", "cost_basis", "unrealized_gain_loss_percent", "top_holdings", "confidence"],
};

const format = (data: PortfolioSnapshot): FormattedArtifact => {
  const gainSign = data.unrealized_gain_loss_percent >= 0 ? "+" : "";
  const lines = [
    `# Portfolio Snapshot — ${data.date}`,
    "",
    `**Value:** $${data.total_value.toFixed(2)} · **Cost basis:** $${data.cost_basis.toFixed(2)} · **Gain:** ${gainSign}${data.unrealized_gain_loss_percent.toFixed(1)}%`,
    "",
    "## Top Holdings",
    "",
    ...data.top_holdings.map((h) => `- **${h.symbol}**: ${h.percentage.toFixed(1)}%`),
  ];
  return {
    title: `Portfolio snapshot — ${data.date}`,
    body: lines.join("\n"),
    tags: ["portfolio", "investments", ...data.top_holdings.slice(0, 3).map((h) => h.symbol.toLowerCase())],
    category: "finance",
  };
};

export const portfolioSnapshotPlugin: ArtifactPlugin = {
  descriptor: getArtifactDescriptor("portfolio-snapshot")!,
  collectionKey: "portfolio_snapshots",
  itemSchema,
  promptHint:
    "portfolio_snapshots: investment portfolio summaries with specific allocations or valuations. " +
    "Only extract when the user shares concrete portfolio numbers or allocations, not vague investment talk.",
  extractItem: (input) => {
    const parsed = portfolioSnapshotSchema.safeParse(input);
    if (!parsed.success) return null;
    return { confidence: parsed.data.confidence, formatted: format(parsed.data) };
  },
};

import Anthropic from "@anthropic-ai/sdk";
import type { AlpacaClient } from "./client.js";
import type { Storage } from "../../storage/index.js";
import { withRetry } from "../../util/retry.js";
import { LifecoachError } from "../../util/errors.js";

export interface PortfolioContext {
  totalValue: number;
  costBasis: number;
  unrealizedGainPercent: number;
  holdings: Array<{
    symbol: string;
    quantity: number;
    currentPrice: number;
    marketValue: number;
    costBasis?: number;
  }>;
}

export interface InvestmentGoal {
  name: string;
  targetAmount: number;
  timelineMonths: number;
  riskTolerance: "conservative" | "moderate" | "aggressive";
  category: string;
}

export interface InvestmentRecommendation {
  symbol: string;
  name?: string;
  rationale: string;
  action: "buy" | "hold" | "sell" | "rebalance";
  targetAllocation?: number;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
}

interface RecommendationPayload {
  recommendations: InvestmentRecommendation[];
}

const RECOMMENDATION_PAYLOAD_SCHEMA = {
  type: "object" as const,
  properties: {
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Ticker symbol (e.g., 'VTI', 'VGRO')",
          },
          name: {
            type: "string",
            description: "Human-readable fund/stock name",
          },
          rationale: {
            type: "string",
            description:
              "1-2 sentence explanation for recommendation, considering portfolio balance, risk tolerance, and goals",
          },
          action: {
            type: "string",
            enum: ["buy", "hold", "sell", "rebalance"],
            description: "Recommended action",
          },
          targetAllocation: {
            type: "number",
            description: "Target portfolio allocation percentage (0-100)",
          },
          confidence: {
            type: "number",
            description: "Confidence level 0-100",
          },
          riskLevel: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Risk level of this holding/action",
          },
        },
        required: ["symbol", "rationale", "action", "confidence", "riskLevel"],
      },
      description: "Array of investment recommendations",
    },
  },
  required: ["recommendations"],
};

export interface RecommenderOptions {
  apiKey: string;
  model?: string;
  maxRetries?: number;
}

export class InvestmentRecommender {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxRetries: number;

  constructor(opts: RecommenderOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? "claude-sonnet-4-6";
    this.maxRetries = opts.maxRetries ?? 3;
  }

  async generateRecommendations(
    alpaca: AlpacaClient,
    portfolio: PortfolioContext,
    goals: InvestmentGoal[],
    riskTolerance: "conservative" | "moderate" | "aggressive",
  ): Promise<InvestmentRecommendation[]> {
    const prompt = this._buildPrompt(portfolio, goals, riskTolerance);

    const response = await withRetry(
      () =>
        this.client.messages.create({
          model: this.model,
          max_tokens: 2048,
          tools: [
            {
              name: "generate_recommendations",
              description: "Generate investment recommendations based on portfolio and goals",
              input_schema: RECOMMENDATION_PAYLOAD_SCHEMA,
            },
          ],
          tool_choice: { type: "tool", name: "generate_recommendations" },
          messages: [{ role: "user", content: prompt }],
        }),
      { maxAttempts: this.maxRetries },
    );

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new LifecoachError(
        "Recommender: model did not call generate_recommendations",
        "RECOMMENDER_NO_TOOL_USE",
      );
    }

    const payload = toolUse.input as RecommendationPayload;
    if (!Array.isArray(payload.recommendations)) {
      throw new LifecoachError(
        "Recommender: invalid response format",
        "RECOMMENDER_INVALID_PAYLOAD",
      );
    }

    return payload.recommendations;
  }

  private _buildPrompt(
    portfolio: PortfolioContext,
    goals: InvestmentGoal[],
    riskTolerance: "conservative" | "moderate" | "aggressive",
  ): string {
    const goalsSection =
      goals.length > 0
        ? goals
            .map((g) => `- ${g.name}: $${g.targetAmount} in ${g.timelineMonths} months (${g.riskTolerance} risk)`)
            .join("\n")
        : "No specific goals defined.";

    const holdingsSection =
      portfolio.holdings.length > 0
        ? portfolio.holdings
            .map((h) => `- ${h.symbol}: ${h.quantity} shares @ $${h.currentPrice.toFixed(2)} = $${h.marketValue.toFixed(2)}`)
            .join("\n")
        : "No current holdings.";

    return `You are an investment advisor analyzing a portfolio for rebalancing and growth.

## Portfolio Snapshot
- Total Value: $${portfolio.totalValue.toFixed(2)}
- Cost Basis: $${portfolio.costBasis.toFixed(2)}
- Unrealized Gain: ${portfolio.unrealizedGainPercent.toFixed(1)}%

## Current Holdings
${holdingsSection}

## Investment Goals
${goalsSection}

## Risk Tolerance
${riskTolerance}

---

Call \`generate_recommendations\` with specific, actionable recommendations. Consider:
1. Asset allocation balance (stocks, bonds, diversification)
2. Risk tolerance alignment
3. Goal timeline and amounts
4. Current market conditions and valuation
5. Concentration risk in current holdings

Be concrete: recommend specific symbols (VTI, VXUS, BND, etc.), not vague asset classes. Explain why each holding fits the user's profile. Flag any concentration risk or missing diversification.`;
  }
}

#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  TextContent,
  ToolResultBlockSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AlpacaClient, InvestmentRecommender, type PortfolioContext, type InvestmentGoal } from "@lifecoach/core";

const API_KEY = process.env.ALPACA_API_KEY || "";
const SECRET_KEY = process.env.ALPACA_SECRET_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const PAPER_TRADING = process.env.ALPACA_PAPER_TRADING !== "false";

if (!API_KEY || !SECRET_KEY) {
  console.error("Error: ALPACA_API_KEY and ALPACA_SECRET_KEY must be set");
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error("Error: ANTHROPIC_API_KEY must be set");
  process.exit(1);
}

const alpaca = new AlpacaClient({
  apiKey: API_KEY,
  secretKey: SECRET_KEY,
  paperTrading: PAPER_TRADING,
});

const recommender = new InvestmentRecommender({
  apiKey: ANTHROPIC_API_KEY,
});

const server = new Server({
  name: "alpaca-investment-advisor",
  version: "0.1.0",
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_recommendations",
      description:
        "Get investment recommendations based on current portfolio, goals, and risk tolerance. Uses Claude to analyze and recommend rebalancing or new positions.",
      inputSchema: {
        type: "object",
        properties: {
          portfolio: {
            type: "object",
            description: "Current portfolio snapshot",
            properties: {
              totalValue: { type: "number", description: "Total portfolio market value" },
              costBasis: { type: "number", description: "Total amount invested" },
              unrealizedGainPercent: { type: "number", description: "Unrealized gain as percentage" },
              holdings: {
                type: "array",
                description: "Array of current holdings",
                items: {
                  type: "object",
                  properties: {
                    symbol: { type: "string" },
                    quantity: { type: "number" },
                    currentPrice: { type: "number" },
                    marketValue: { type: "number" },
                    costBasis: { type: "number" },
                  },
                  required: ["symbol", "quantity", "currentPrice", "marketValue"],
                },
              },
            },
            required: ["totalValue", "costBasis", "unrealizedGainPercent", "holdings"],
          },
          goals: {
            type: "array",
            description: "Investment goals (optional)",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                targetAmount: { type: "number" },
                timelineMonths: { type: "number" },
                riskTolerance: { type: "string", enum: ["conservative", "moderate", "aggressive"] },
                category: { type: "string" },
              },
              required: ["name", "targetAmount", "timelineMonths", "riskTolerance"],
            },
          },
          riskTolerance: {
            type: "string",
            enum: ["conservative", "moderate", "aggressive"],
            description: "Overall portfolio risk tolerance",
          },
        },
        required: ["portfolio", "riskTolerance"],
      },
    },
    {
      name: "get_asset_info",
      description: "Get detailed information about a specific asset (stock, ETF, fund).",
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Ticker symbol (e.g., 'VTI', 'AAPL')",
          },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_market_status",
      description: "Check if the market is currently open.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_account_status",
      description: "Get current account info (buying power, equity, cash).",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "get_recommendations") {
      const { portfolio, goals = [], riskTolerance } = args as {
        portfolio: PortfolioContext;
        goals?: InvestmentGoal[];
        riskTolerance: string;
      };

      const recommendations = await recommender.generateRecommendations(
        alpaca,
        portfolio,
        goals,
        riskTolerance as "conservative" | "moderate" | "aggressive",
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(recommendations, null, 2),
          },
        ],
      };
    }

    if (name === "get_asset_info") {
      const { symbol } = args as { symbol: string };
      const asset = await alpaca.getAsset(symbol);
      const quote = await alpaca.getLatestQuote(symbol);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                asset,
                quote,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (name === "get_market_status") {
      const status = await alpaca.getMarketStatus();
      const isOpen = await alpaca.isMarketOpen();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status, isOpen }, null, 2),
          },
        ],
      };
    }

    if (name === "get_account_status") {
      const account = await alpaca.getAccountInfo();
      const positions = await alpaca.getPositions();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                account,
                positionCount: positions.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Alpaca investment advisor MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

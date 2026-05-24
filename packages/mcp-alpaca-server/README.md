# Alpaca Investment Advisor MCP Server

This MCP (Model Context Protocol) server provides Claude with access to investment recommendations, market data, and portfolio analysis via the Alpaca API.

## Features

- **Investment Recommendations**: Claude-powered analysis of your portfolio with specific buy/hold/sell/rebalance recommendations
- **Market Status**: Check if markets are open and get real-time data
- **Asset Information**: Lookup details on stocks, ETFs, and funds
- **Account Status**: View your account's buying power, equity, and positions

## Setup

### Prerequisites

1. Alpaca account (free with paper trading): https://alpaca.markets
2. Alpaca API keys
3. Anthropic API key (for Claude)

### Environment Variables

```bash
export ALPACA_API_KEY="your_api_key"
export ALPACA_SECRET_KEY="your_secret_key"
export ALPACA_PAPER_TRADING=true  # Use paper trading (default: true)
export ANTHROPIC_API_KEY="your_anthropic_key"
```

### Installation

```bash
# Build the server
pnpm build

# Start the server
pnpm start
```

### MCP Configuration

Add to your `.claude/config.json`:

```json
{
  "mcpServers": {
    "alpaca-advisor": {
      "command": "node",
      "args": ["/path/to/packages/mcp-alpaca-server/dist/server.js"],
      "env": {
        "ALPACA_API_KEY": "your_key",
        "ALPACA_SECRET_KEY": "your_secret",
        "ANTHROPIC_API_KEY": "your_anthropic_key",
        "ALPACA_PAPER_TRADING": "true"
      }
    }
  }
}
```

## Tools

### get_recommendations

Analyzes your portfolio and generates investment recommendations.

**Input:**
- `portfolio`: Current portfolio snapshot (total value, cost basis, holdings)
- `goals`: Array of investment goals (optional)
- `riskTolerance`: Your risk tolerance (conservative, moderate, aggressive)

**Output:**
- Array of recommendations with specific symbols, rationale, and confidence scores

**Example:**

```
I have $50,000 invested in VTI ($23k), VXUS ($15k), and BND ($12k). 
I'm moderate risk tolerance and want to save $100k for retirement in 10 years.
What should I buy next?
```

### get_asset_info

Lookup details on a specific asset.

**Input:**
- `symbol`: Ticker symbol (e.g., "VTI", "AAPL")

**Output:**
- Asset details (name, exchange, trading status, etc.)
- Current bid/ask/last price

### get_market_status

Check if markets are currently open.

**Output:**
- Market status (open, closed, early-close)
- Whether markets are open right now

### get_account_status

View your account information.

**Output:**
- Buying power, equity, cash balance
- Number of open positions

## Integration with Life Coach

The Alpaca MCP server integrates with Life Coach's financial dimension:

1. **Recommendations in Reflections**: Weekly/monthly reflections can include investment recommendations
2. **Portfolio in Artifacts**: Investment snapshots are auto-extracted as portfolio-snapshot artifacts
3. **Agent Tool**: The `get_investment_recommendations` agent tool queries the MCP server

## Development

```bash
# Start with hot reload
pnpm dev

# Build TypeScript
pnpm build

# Start built server
pnpm start
```

## Notes

- **Paper Trading**: By default uses Alpaca's paper trading environment (no real money)
- **Market Hours**: Investment recommendations are most useful during/after market hours
- **Rate Limiting**: Alpaca has rate limits; the client implements exponential backoff retry logic
- **Real Trading**: To enable live trading, set `ALPACA_PAPER_TRADING=false` (use with caution!)

## License

MIT

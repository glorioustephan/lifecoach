import { withRetry } from "../../util/retry.js";
import { LifecoachError } from "../../util/errors.js";

export interface AlpacaApiError extends Error {
  code: string;
  statusCode?: number | undefined;
}

export class AlpacaApiError extends Error implements AlpacaApiError {
  code: string;
  statusCode?: number | undefined;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "AlpacaApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface AlpacaAsset {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  exchange: string;
  status: "active" | "inactive";
  tradable: boolean;
  marginable: boolean;
  shortable: boolean;
  fractionable: boolean;
}

export interface AlpacaQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
}

export interface AlpacaBar {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AlpacaClientOptions {
  apiKey: string;
  secretKey: string;
  baseUrl?: string;
  paperTrading?: boolean;
}

export class AlpacaClient {
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;

  constructor(opts: AlpacaClientOptions) {
    this.apiKey = opts.apiKey;
    this.secretKey = opts.secretKey;
    this.baseUrl = opts.baseUrl ?? "https://api.alpaca.markets";
    if (opts.paperTrading) {
      this.baseUrl = "https://paper-api.alpaca.markets";
    }
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "APCA-API-KEY-ID": this.apiKey,
      "APCA-API-SECRET-KEY": this.secretKey,
      "Content-Type": "application/json",
    };

    return withRetry(
      async () => {
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...options,
          headers,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new AlpacaApiError(
            `Alpaca API error: ${response.statusText} — ${errorBody}`,
            "ALPACA_API_ERROR",
            response.status,
          );
        }

        return response.json() as Promise<T>;
      },
      { maxAttempts: this.maxRetries },
    );
  }

  async getAsset(symbol: string): Promise<AlpacaAsset> {
    return this.request<AlpacaAsset>(`/v1/assets/${symbol}`);
  }

  async searchAssets(filter?: { status?: "active" | "inactive"; assetClass?: string }): Promise<AlpacaAsset[]> {
    const params = new URLSearchParams();
    if (filter?.status) params.append("status", filter.status);
    if (filter?.assetClass) params.append("asset_class", filter.assetClass);

    const qs = params.toString();
    return this.request<AlpacaAsset[]>(`/v1/assets?${qs}`);
  }

  async getLatestQuote(symbol: string): Promise<AlpacaQuote> {
    const result = await this.request<{ [key: string]: AlpacaQuote }>(`/v1beta3/latest/quotes?symbols=${symbol}`);
    return result[symbol] || { symbol, bid: 0, ask: 0, last: 0, timestamp: 0 };
  }

  async getBars(
    symbol: string,
    timeframe: string,
    opts?: { limit?: number; startTime?: string; endTime?: string },
  ): Promise<AlpacaBar[]> {
    const params = new URLSearchParams({
      timeframe,
      ...(opts?.limit ? { limit: opts.limit.toString() } : {}),
      ...(opts?.startTime ? { start: opts.startTime } : {}),
      ...(opts?.endTime ? { end: opts.endTime } : {}),
    });

    const result = await this.request<{ bars: { [key: string]: AlpacaBar[] } }>(
      `/v1beta3/bars?symbols=${symbol}&${params.toString()}`,
    );
    return result.bars[symbol] || [];
  }

  async getAccountInfo(): Promise<{
    account_number: string;
    buying_power: number;
    cash: number;
    equity: number;
    portfolio_value: number;
    regt_buying_power: number;
    status: "ACCOUNT_UPDATED" | "ACCOUNT_RESTRICTED";
  }> {
    return this.request("/v2/account");
  }

  async getPositions(): Promise<
    Array<{
      asset_id: string;
      symbol: string;
      qty: number;
      avg_fill_price: number;
      current_price: number;
      market_value: number;
      unrealized_pl: number;
      unrealized_plpc: number;
      costbasis: number;
    }>
  > {
    return this.request("/v2/positions");
  }

  async isMarketOpen(): Promise<boolean> {
    try {
      const clock = await this.request<{ is_open: boolean }>("/v1/clock");
      return clock.is_open;
    } catch {
      return false;
    }
  }

  async getMarketStatus(): Promise<"open" | "closed" | "early-close"> {
    const clock = await this.request<{
      is_open: boolean;
      next_close: string;
      next_open: string;
    }>("/v1/clock");
    return clock.is_open ? "open" : "closed";
  }
}

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  EmailPasswordAuthProvider,
  FixedTokenAuthProvider,
  MonarchGraphQLClient,
} from "monarch-money-ts";
import type { AuthProvider, GetTransactionsOptions } from "monarch-money-ts";
import { LifecoachError } from "../../util/errors.js";

// The library's typed API methods (getAccounts/getTransactions/getPortfolio)
// validate responses against STRICT zod schemas that reject null fields Monarch
// legitimately returns (e.g. logoUrl/institution on manual accounts, plaidName on
// manual transactions) — which fails the whole sync. We issue the same queries
// via the GraphQL client directly with permissive schemas and rely on our own
// defensive mapping, so sync no longer depends on patching the library.
const looseRows = z.array(z.record(z.unknown()));

const GET_ACCOUNTS_QUERY = `
  query Web_GetAccounts($filters: AccountFilters) {
    accounts(filters: $filters) {
      id
      isAsset
      type { name display __typename }
      subtype { name display __typename }
      displayName
      displayBalance
      signedBalance
      institution { name __typename }
      __typename
    }
  }
`;
const looseAccountsResponse = z.object({ accounts: looseRows });

const GET_TRANSACTIONS_QUERY = `
  query Web_GetTransactionsList($offset: Int, $limit: Int, $filters: TransactionFilterInput, $orderBy: TransactionOrdering) {
    allTransactions(filters: $filters) {
      totalCount
      results(offset: $offset, limit: $limit, orderBy: $orderBy) {
        id
        amount
        pending
        date
        isRecurring
        account { id __typename }
        category { id name __typename }
        merchant {
          id
          name
          recurringTransactionStream { frequency isActive __typename }
          __typename
        }
        __typename
      }
      __typename
    }
  }
`;
const looseTransactionsResponse = z.object({
  allTransactions: z.object({ results: looseRows }).passthrough(),
});

const GET_PORTFOLIO_QUERY = `
  query Web_GetPortfolio($portfolioInput: PortfolioInput) {
    portfolio(input: $portfolioInput) {
      aggregateHoldings {
        edges {
          node {
            id
            quantity
            basis
            totalValue
            security { ticker closingPrice __typename }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
  }
`;
const loosePortfolioResponse = z.object({
  portfolio: z
    .object({ aggregateHoldings: z.object({ edges: looseRows }).passthrough() })
    .passthrough(),
});

// ─── Public interfaces ───────────────────────────────────────────────────────

export interface MonarchAccount {
  id: string;
  displayName: string;
  type: { name: string; display: string };
  subtype: { name: string; display: string };
  currentBalance: number;
  isAsset: boolean;
  institution: { name: string; primaryColor?: string } | null;
}

export interface MonarchTransaction {
  id: string;
  date: string;
  amount: number;
  merchant: string;
  category?: { name: string } | null;
  isPending: boolean;
  /** Real Monarch account id (null only if the response omits it). */
  accountId: string | null;
  /** True if Monarch flagged this transaction as recurring (subscription/scheduled). */
  isRecurring: boolean;
  /** Cadence from merchant.recurringTransactionStream (e.g. "MONTHLY"). */
  recurringFrequency?: string | null;
}

export interface MonarchNetWorth {
  totalAssets: number;
  totalLiabilities: number;
  networth: number;
}

export interface MonarchHolding {
  symbol: string;
  quantity: number;
  currentPrice: number;
  marketValue: number;
  costBasis?: number;
}

// ─── Persisted session shape ─────────────────────────────────────────────────

interface PersistedSession {
  token: string;
  expiresAtMs: number;
}

// ─── Client ──────────────────────────────────────────────────────────────────

export class MonarchClient {
  private auth: AuthProvider | null = null;
  private graphql: MonarchGraphQLClient | null = null;
  private readonly sessionFile: string;

  constructor(sessionFile?: string) {
    this.sessionFile = sessionFile ?? ".mm/mm_session.json";
  }

  /**
   * Authenticate with email + password. Persists the token to sessionFile so
   * subsequent calls can skip the login round-trip.
   */
  async authenticate(email: string, password: string, totpKey?: string): Promise<void> {
    // Monarch shows the authenticator setup key with spaces and in lower/mixed
    // case (e.g. "abcd efgh ijkl mnop"); the TOTP generator needs the bare
    // uppercase base32 seed, so normalize before use.
    const normalizedTotpKey = totpKey ? totpKey.replace(/\s+/g, "").toUpperCase() : undefined;

    const onTokenUpdate = (token: string, expiresAtMs: number | undefined) => {
      try {
        const dir = path.dirname(this.sessionFile);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          this.sessionFile,
          JSON.stringify({ token, expiresAtMs: expiresAtMs ?? (Date.now() + 24 * 60 * 60 * 1000) } satisfies PersistedSession, null, 2),
          "utf8",
        );
      } catch {
        // Non-fatal: token will be refreshed next run via email/password
      }
    };

    this.auth = new EmailPasswordAuthProvider({
      email,
      password,
      ...(normalizedTotpKey ? { totpKey: normalizedTotpKey } : {}),
      onTokenUpdate,
    });
    this.graphql = new MonarchGraphQLClient();

    // Trigger a real token fetch to validate credentials and persist session
    try {
      await this.auth.getToken();
    } catch (err) {
      this.auth = null;
      this.graphql = null;
      throw new LifecoachError(
        `Monarch authentication failed: ${err instanceof Error ? err.message : String(err)}`,
        "MONARCH_AUTH_FAILED",
      );
    }
  }

  /**
   * Attempt to restore a previously persisted session. Returns true if a
   * valid (non-expired) token was found.
   */
  async loadSession(): Promise<boolean> {
    try {
      if (!fs.existsSync(this.sessionFile)) return false;
      const raw = fs.readFileSync(this.sessionFile, "utf8");
      const session = JSON.parse(raw) as PersistedSession;
      if (!session.token || !session.expiresAtMs) return false;
      // Treat as expired if it expires within the next 5 minutes
      if (Date.now() >= session.expiresAtMs - 5 * 60 * 1000) return false;

      // Restore with a token-only provider. EmailPasswordAuthProvider throws on
      // empty email/password (even when a token is supplied), which would make
      // loadSession always fail and force a fresh login on every sync — and a
      // second login within the same 30s TOTP window gets rejected by Monarch.
      // FixedTokenAuthProvider reuses the persisted token directly; when it
      // eventually expires, the expiry check above returns false and the caller
      // re-authenticates once.
      this.auth = new FixedTokenAuthProvider(session.token);
      this.graphql = new MonarchGraphQLClient();
      return true;
    } catch {
      return false;
    }
  }

  isAuthenticated(): boolean {
    return this.auth !== null && this.graphql !== null;
  }

  private ensureAuth(): { auth: AuthProvider; graphql: MonarchGraphQLClient } {
    if (!this.auth || !this.graphql) {
      throw new LifecoachError("Monarch client not authenticated", "MONARCH_NOT_AUTHENTICATED");
    }
    return { auth: this.auth, graphql: this.graphql };
  }

  // ─── API methods ────────────────────────────────────────────────────────────

  async listAccounts(): Promise<MonarchAccount[]> {
    const { auth, graphql } = this.ensureAuth();
    try {
      const response = await graphql.request(
        GET_ACCOUNTS_QUERY,
        auth,
        looseAccountsResponse,
        { filters: {} },
      );
      return response.accounts.map((acc: any) => ({
        id: acc.id,
        displayName: acc.displayName,
        type: acc.type ?? { name: "unknown", display: "Unknown" },
        subtype: acc.subtype ?? { name: "unknown", display: "Unknown" },
        currentBalance: acc.displayBalance ?? acc.signedBalance ?? 0,
        isAsset: acc.isAsset ?? true,
        institution: acc.institution ?? null,
      }));
    } catch (err) {
      throw new LifecoachError(
        `Failed to list Monarch accounts: ${err instanceof Error ? err.message : String(err)}`,
        "MONARCH_ACCOUNTS_FAILED",
      );
    }
  }

  async listTransactions(options?: Partial<GetTransactionsOptions>): Promise<MonarchTransaction[]> {
    const { auth, graphql } = this.ensureAuth();
    try {
      const response = await graphql.request(GET_TRANSACTIONS_QUERY, auth, looseTransactionsResponse, {
        offset: options?.offset,
        limit: options?.limit,
        orderBy: options?.orderBy,
        filters: options?.filters ?? {},
      });
      return response.allTransactions.results.map((txn: any) => ({
        id: txn.id,
        date: txn.date,
        amount: txn.amount,
        merchant: txn.merchant?.name ?? "Unknown",
        category: txn.category ? { name: txn.category.name } : null,
        isPending: txn.pending ?? false,
        accountId: txn.account?.id ?? null,
        isRecurring: txn.isRecurring ?? false,
        recurringFrequency:
          txn.merchant?.recurringTransactionStream?.isActive
            ? (txn.merchant.recurringTransactionStream.frequency ?? null)
            : null,
      }));
    } catch (err) {
      throw new LifecoachError(
        `Failed to list Monarch transactions: ${err instanceof Error ? err.message : String(err)}`,
        "MONARCH_TRANSACTIONS_FAILED",
      );
    }
  }

  async getNetWorth(): Promise<MonarchNetWorth> {
    const accounts = await this.listAccounts();
    let totalAssets = 0;
    let totalLiabilities = 0;
    for (const acc of accounts) {
      if (acc.isAsset) {
        totalAssets += acc.currentBalance;
      } else {
        totalLiabilities += Math.abs(acc.currentBalance);
      }
    }
    return { totalAssets, totalLiabilities, networth: totalAssets - totalLiabilities };
  }

  async getHoldings(): Promise<MonarchHolding[]> {
    const { auth, graphql } = this.ensureAuth();
    try {
      const response = await graphql.request(GET_PORTFOLIO_QUERY, auth, loosePortfolioResponse, {
        portfolioInput: {},
      });
      return (response.portfolio?.aggregateHoldings?.edges ?? [])
        .map((edge: any) => edge.node ?? edge)
        .map((holding: any) => ({
          symbol: holding.security?.ticker ?? holding.holdings?.[0]?.ticker ?? "UNKNOWN",
          quantity: holding.quantity ?? 0,
          currentPrice: holding.security?.closingPrice ?? 0,
          marketValue: holding.totalValue ?? 0,
          costBasis: holding.basis,
        }));
    } catch (err) {
      throw new LifecoachError(
        `Failed to get Monarch holdings: ${err instanceof Error ? err.message : String(err)}`,
        "MONARCH_HOLDINGS_FAILED",
      );
    }
  }
}

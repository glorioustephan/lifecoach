import fs from "node:fs";
import path from "node:path";
import {
  EmailPasswordAuthProvider,
  MonarchGraphQLClient,
  getAccounts,
  getTransactions,
  getPortfolio,
} from "monarch-money-ts";
import type { GetTransactionsOptions } from "monarch-money-ts";
import { LifecoachError } from "../../util/errors.js";

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
  private auth: EmailPasswordAuthProvider | null = null;
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
      ...(totpKey ? { totpKey } : {}),
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

      const onTokenUpdate = (token: string, expiresAtMs: number | undefined) => {
        try {
          fs.writeFileSync(
            this.sessionFile,
            JSON.stringify({ token, expiresAtMs: expiresAtMs ?? (Date.now() + 24 * 60 * 60 * 1000) } satisfies PersistedSession, null, 2),
            "utf8",
          );
        } catch {
          // Non-fatal
        }
      };

      this.auth = new EmailPasswordAuthProvider({
        email: "",
        password: "",
        token: session.token,
        tokenExpiresAtMs: session.expiresAtMs,
        onTokenUpdate,
      });
      this.graphql = new MonarchGraphQLClient();
      return true;
    } catch {
      return false;
    }
  }

  isAuthenticated(): boolean {
    return this.auth !== null && this.graphql !== null;
  }

  private ensureAuth(): { auth: EmailPasswordAuthProvider; graphql: MonarchGraphQLClient } {
    if (!this.auth || !this.graphql) {
      throw new LifecoachError("Monarch client not authenticated", "MONARCH_NOT_AUTHENTICATED");
    }
    return { auth: this.auth, graphql: this.graphql };
  }

  // ─── API methods ────────────────────────────────────────────────────────────

  async listAccounts(): Promise<MonarchAccount[]> {
    const { auth, graphql } = this.ensureAuth();
    try {
      const response = await getAccounts(auth, graphql);
      return ((response as any).accounts ?? response ?? []).map((acc: any) => ({
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
      const response = await getTransactions(auth, graphql, options as GetTransactionsOptions);
      return ((response as any).allTransactions?.results ?? []).map((txn: any) => ({
        id: txn.id,
        date: txn.date,
        amount: txn.amount,
        merchant: txn.merchant?.name ?? "Unknown",
        category: txn.category ? { name: txn.category.name } : null,
        isPending: txn.pending ?? false,
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
      const response = await getPortfolio(auth, graphql);
      return ((response as any).aggregateHoldings?.edges ?? (response as any).portfolio?.aggregateHoldings?.edges ?? [])
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

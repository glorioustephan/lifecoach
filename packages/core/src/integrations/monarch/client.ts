import { MonarchMoney } from "monarch-ts";
import type {
  AccountsResponse,
  BudgetsResponse,
  HoldingsResponse,
  GetTransactionsOptions,
  TransactionDetailsResponse,
} from "monarch-ts";
import { withRetry } from "../../util/retry.js";
import { LifecoachError } from "../../util/errors.js";

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

export interface MonarchBudgetData {
  monthlyAmountsByCategory: Array<{
    category: { id: string; name: string };
    monthlyAmounts: Array<{
      month: string;
      plannedCashFlowAmount: number;
      actualAmount: number;
      remainingAmount: number;
    }>;
  }>;
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
  unrealizedGainLoss?: number;
  unrealizedGainLossPercent?: number;
}

export class MonarchClient {
  private client: MonarchMoney | null = null;
  private readonly sessionFile: string;

  constructor(sessionFile?: string) {
    this.sessionFile = sessionFile || ".mm/mm_session.json";
  }

  async authenticate(email: string, password: string, mfaSecretKey?: string): Promise<void> {
    try {
      this.client = new MonarchMoney({
        sessionFile: this.sessionFile,
      });

      await withRetry(
        async () => {
          await this.client!.login({
            email,
            password,
            mfaSecretKey,
            saveSession: true,
          });
        },
        3,
        "Monarch authentication",
      );
    } catch (error) {
      this.client = null;
      throw new LifecoachError(
        `Failed to authenticate with Monarch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async loadSession(): Promise<boolean> {
    try {
      this.client = new MonarchMoney({
        sessionFile: this.sessionFile,
      });
      return this.client.loadSession();
    } catch (error) {
      this.client = null;
      return false;
    }
  }

  isAuthenticated(): boolean {
    return this.client !== null;
  }

  async listAccounts(): Promise<MonarchAccount[]> {
    if (!this.client) throw new LifecoachError("Monarch client not authenticated");

    try {
      const response = (await withRetry(
        () => this.client!.getAccounts(),
        3,
        "Fetch Monarch accounts",
      )) as AccountsResponse;

      return (response.accounts || []).map((acc: any) => ({
        id: acc.id,
        displayName: acc.displayName,
        type: acc.type,
        subtype: acc.subtype,
        currentBalance: acc.currentBalance,
        isAsset: acc.isAsset,
        institution: acc.institution,
      }));
    } catch (error) {
      throw new LifecoachError(
        `Failed to list Monarch accounts: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async listTransactions(options?: GetTransactionsOptions): Promise<MonarchTransaction[]> {
    if (!this.client) throw new LifecoachError("Monarch client not authenticated");

    try {
      const response = await withRetry(
        () =>
          this.client!.getTransactions({
            limit: 500,
            ...options,
          }),
        3,
        "Fetch Monarch transactions",
      );

      return (response.transactions || []).map((txn: any) => ({
        id: txn.id,
        date: txn.date,
        amount: txn.amount,
        merchant: txn.merchant || "Unknown",
        category: txn.category,
        isPending: txn.isPending || false,
      }));
    } catch (error) {
      throw new LifecoachError(
        `Failed to list Monarch transactions: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getTransactionDetails(transactionId: string): Promise<any> {
    if (!this.client) throw new LifecoachError("Monarch client not authenticated");

    try {
      return await withRetry(
        () => this.client!.getTransactionDetails(transactionId),
        3,
        "Fetch Monarch transaction details",
      );
    } catch (error) {
      throw new LifecoachError(
        `Failed to get transaction details: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getBudgetStatus(month?: string): Promise<MonarchBudgetData | null> {
    if (!this.client) throw new LifecoachError("Monarch client not authenticated");

    try {
      const response = (await withRetry(
        () => this.client!.getBudgets(month ? { month } : undefined),
        3,
        "Fetch Monarch budgets",
      )) as BudgetsResponse;

      return response.budgetData || null;
    } catch (error) {
      throw new LifecoachError(
        `Failed to get budget status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getNetWorth(): Promise<MonarchNetWorth> {
    if (!this.client) throw new LifecoachError("Monarch client not authenticated");

    try {
      const accounts = await this.listAccounts();
      let totalAssets = 0;
      let totalLiabilities = 0;

      accounts.forEach((acc) => {
        if (acc.isAsset) {
          totalAssets += acc.currentBalance;
        } else {
          totalLiabilities += Math.abs(acc.currentBalance);
        }
      });

      return {
        totalAssets,
        totalLiabilities,
        networth: totalAssets - totalLiabilities,
      };
    } catch (error) {
      throw new LifecoachError(
        `Failed to calculate net worth: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getHoldings(accountId: string): Promise<MonarchHolding[]> {
    if (!this.client) throw new LifecoachError("Monarch client not authenticated");

    try {
      const response = (await withRetry(
        () => this.client!.getAccountHoldings(accountId),
        3,
        "Fetch Monarch holdings",
      )) as HoldingsResponse;

      return (response.portfolio?.aggregateHoldings?.edges || [])
        .map((edge: any) => edge.node)
        .map((holding: any) => ({
          symbol: holding.security?.ticker || "UNKNOWN",
          quantity: holding.quantity,
          currentPrice: holding.security?.currentPrice || 0,
          marketValue: holding.totalValue,
          costBasis: holding.basis,
          unrealizedGainLoss: holding.totalValue - (holding.basis || 0),
          unrealizedGainLossPercent:
            holding.basis && holding.basis !== 0
              ? ((holding.totalValue - holding.basis) / holding.basis) * 100
              : undefined,
        }));
    } catch (error) {
      throw new LifecoachError(
        `Failed to get holdings: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async requestAccountRefresh(accountIds: string[]): Promise<void> {
    if (!this.client) throw new LifecoachError("Monarch client not authenticated");

    try {
      await withRetry(
        () => this.client!.requestAccountsRefresh(accountIds),
        3,
        "Request Monarch account refresh",
      );
    } catch (error) {
      throw new LifecoachError(
        `Failed to request account refresh: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async isRefreshComplete(accountIds: string[]): Promise<boolean> {
    if (!this.client) throw new LifecoachError("Monarch client not authenticated");

    try {
      const response = await withRetry(
        () => this.client!.isAccountsRefreshComplete(accountIds),
        3,
        "Check Monarch refresh status",
      );
      return response.isRefreshComplete || false;
    } catch (error) {
      throw new LifecoachError(
        `Failed to check refresh status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

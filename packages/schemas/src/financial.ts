import { z } from "zod";

export const accountType = z.enum([
  "checking",
  "savings",
  "credit_card",
  "investment",
  "debt",
  "other",
]);
export type AccountType = z.infer<typeof accountType>;

export const accountStatus = z.enum(["active", "inactive", "closed"]);
export type AccountStatus = z.infer<typeof accountStatus>;

export const accountSchema = z.object({
  id: z.string(),
  externalId: z.string(), // Monarch account ID
  displayName: z.string().min(1),
  type: accountType,
  balance: z.number(),
  currency: z.string().default("USD"),
  institution: z.string().optional(), // Bank/institution name
  status: accountStatus.default("active"),
  syncedAt: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Account = z.infer<typeof accountSchema>;

export const newAccountSchema = accountSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type NewAccount = z.infer<typeof newAccountSchema>;

export const transactionSchema = z.object({
  id: z.string(),
  externalId: z.string(), // Monarch transaction ID
  accountId: z.string(),
  date: z.number().int(), // Unix timestamp
  amount: z.number(),
  currency: z.string().default("USD"),
  merchant: z.string(),
  category: z.string().optional(),
  description: z.string().optional(),
  isPending: z.boolean().default(false),
  notes: z.string().optional(), // User annotations
  /** Subscription / scheduled-charge flag (from Monarch isRecurring). */
  isRecurring: z.boolean().default(false),
  /** Frequency from Monarch merchant.recurringTransactionStream (e.g. "MONTHLY"). */
  recurringFrequency: z.string().optional(),
  /**
   * Monarch category-group type for this transaction's category. Known values:
   * `income`, `expense`, `transfer`. Used to exclude transfers (between owned
   * accounts, credit-card payments, loan principal) from monthly_burn /
   * savings_rate so cash movements aren't counted as spending.
   */
  categoryGroupType: z.string().optional(),
  syncedAt: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const newTransactionSchema = transactionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type NewTransaction = z.infer<typeof newTransactionSchema>;

export const assetType = z.enum(["stock", "fund", "etf", "crypto", "commodity", "other"]);
export type AssetType = z.infer<typeof assetType>;

export const holdingSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  symbol: z.string().min(1),
  quantity: z.number(),
  currentPrice: z.number(),
  marketValue: z.number(),
  costBasis: z.number().optional(),
  assetType: assetType.default("stock"),
  snapshotDate: z.number().int(),
  syncedAt: z.number().int(),
  createdAt: z.number().int(),
});
export type Holding = z.infer<typeof holdingSchema>;

export const newHoldingSchema = holdingSchema.omit({
  id: true,
  createdAt: true,
});
export type NewHolding = z.infer<typeof newHoldingSchema>;

export const budgetStatus = z.enum(["active", "inactive", "archived"]);
export type BudgetStatus = z.infer<typeof budgetStatus>;

export const budgetSchema = z.object({
  id: z.string(),
  category: z.string().min(1),
  month: z.string(), // YYYY-MM format
  limit: z.number(),
  spent: z.number().default(0),
  status: budgetStatus.default("active"),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Budget = z.infer<typeof budgetSchema>;

export const newBudgetSchema = budgetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type NewBudget = z.infer<typeof newBudgetSchema>;

export const insightCategory = z.enum([
  "spending",
  "debt",
  "investment",
  "cashflow",
]);
export type InsightCategory = z.infer<typeof insightCategory>;

export const financialInsightPriority = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type FinancialInsightPriority = z.infer<typeof financialInsightPriority>;

export const financialInsightSchema = z.object({
  id: z.string(),
  topic: z.string().min(1),
  body: z.string().min(1),
  category: insightCategory,
  priority: financialInsightPriority.default(1),
  recommendation: z.string().optional(),
  sourceDataIds: z.array(z.string()).default([]), // transaction/account IDs that anchored this insight
  dismissedAt: z.number().int().nullable().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type FinancialInsight = z.infer<typeof financialInsightSchema>;

export const newFinancialInsightSchema = financialInsightSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  dismissedAt: true,
});
export type NewFinancialInsight = z.infer<typeof newFinancialInsightSchema>;

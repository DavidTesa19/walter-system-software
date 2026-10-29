import { apiDelete, apiGet, apiPost, apiPut } from '../utils/api';

export type BillingCycle = 'monthly' | 'yearly' | 'one_time' | 'usage';
export type ExpenseStatus = 'active' | 'planned' | 'paused' | 'cancelled';
export type Currency = 'CZK' | 'USD' | 'EUR';
/** A provider whose real bills the server reads (server/finance/providers.js). */
export type CostSource = 'anthropic' | 'openai' | 'railway' | 'cloudflare' | 'google';
/** A provider in the app's own AI usage log. */
export type Provider = 'anthropic' | 'openai' | 'brave' | 'elevenlabs';
export type UsageFeature = 'jarvis' | 'jarvis_ocr' | 'chat' | 'voice_stt' | 'voice_tts' | 'web_search';

export interface Expense {
  id: number;
  catalogKey: string | null;
  name: string;
  vendor: string | null;
  category: string;
  billingCycle: BillingCycle;
  amount: number;
  currency: Currency;
  isEstimate: boolean;
  status: ExpenseStatus;
  startedOn: string | null;
  renewsOn: string | null;
  description: string | null;
  usedFor: string | null;
  envKeys: string[];
  dashboardUrl: string | null;
  costSource: CostSource | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseInput = Omit<Expense, 'id' | 'catalogKey' | 'createdAt' | 'updatedAt'>;

export interface UsageRow {
  month: string;
  provider: Provider;
  model: string | null;
  feature: UsageFeature;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  units: number;
  costUsd: number;
  unpriced: number;
}

export interface ProviderCostRow {
  provider: CostSource;
  month: string;
  lineItem: string;
  /** In `currency`, the currency the provider bills in. */
  amount: number;
  currency: string;
}

export interface RailwayPeriod {
  workspace: string;
  plan: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** Usage so far this period, in USD, before VAT and before the plan's credit. */
  currentUsage: number;
  nextInvoiceDate: string | null;
  /** The next invoice as it stands now, VAT included. */
  nextInvoiceTotal: number | null;
  currency: string;
}

export interface ProviderStatus {
  label: string;
  envKeys: string[];
  configured: boolean;
  /** Last successful read of the bills. */
  fetchedAt: string | null;
  checkedAt: string | null;
  error: string | null;
  details: { workspaces?: RailwayPeriod[] } | null;
}

export interface BraveQuota {
  limit: number;
  remaining: number;
  used: number;
  resetsAt: string | null;
  at: string;
}

export interface BrevoPlan {
  type: string | null;
  credits: number | null;
  creditsType: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface DomainCheck {
  catalogKey: string;
  domain: string;
  checkedAt: string | null;
  error: string | null;
  registrar?: string | null;
  registeredAt?: string | null;
  expiresAt?: string | null;
}

export interface KeyStatus {
  name: string;
  scope: 'server' | 'client';
  optional: boolean;
  services: string[];
  configured: boolean | null;
}

export interface FinanceOverview {
  generatedAt: string;
  since: string;
  rates: { date: string | null; source: 'cnb' | 'fallback'; rates: Record<string, number> };
  categories: Record<string, string>;
  expenses: Expense[];
  catalogMissing: Array<{ key: string; name: string; category: string }>;
  keys: KeyStatus[];
  usage: { firstLoggedAt: string | null; rows: UsageRow[] };
  providers: Record<CostSource, ProviderStatus>;
  providerCosts: ProviderCostRow[];
  checks: {
    brave: { configured: boolean; quota: BraveQuota | null };
    brevo: { configured: boolean; checkedAt: string | null; error: string | null; plans: BrevoPlan[] | null };
    domains: DomainCheck[];
  };
}

/** bill: a connected provider's bill; recurring: a month filled in from a fixed cost; manual: added by hand. */
export type HistoryKind = 'bill' | 'recurring' | 'manual';

export interface HistoryEntry {
  /** p<id> for payments, b:<provider>:<month> for bills. */
  id: string;
  kind: HistoryKind;
  paymentId: number | null;
  provider: CostSource | null;
  date: string;
  month: string;
  expenseId: number | null;
  service: string;
  description: string | null;
  category: string;
  /** In `currency`. */
  amount: number;
  currency: string;
  czk: number;
  /** The CZK amount is what the bank charged, typed in by hand. */
  exactCzk: boolean;
  /** The ČNB fixing used, for a payment in a foreign currency. */
  rate: { value: number; day: string | null; fallback: boolean } | null;
  note: string | null;
  /** A bill's line items for the month. */
  lines: Array<{ lineItem: string; amount: number; czk: number }> | null;
}

export interface HistoryService {
  id: number;
  name: string;
  category: string;
  currency: Currency;
  amount: number;
  /** A connector already brings this service's bills into the history. */
  billedByConnector: boolean;
}

export interface FinanceHistory {
  /** YYYY-MM of the first month. */
  start: string;
  months: string[];
  categories: Record<string, string>;
  services: HistoryService[];
  entries: HistoryEntry[];
}

export interface PaymentInput {
  paidOn: string;
  expenseId: number | null;
  category: string;
  description: string | null;
  amount: number;
  currency: Currency;
  amountCzk: number | null;
  note: string | null;
}

export type JarvisTurnStatus = 'ok' | 'stopped' | 'empty' | 'truncated' | 'error' | 'refusal' | 'tool_limit';

export interface JarvisTurn {
  at: string;
  userId: number | null;
  conversationId: string | null;
  question: string;
  voice: boolean;
  status: JarvisTurnStatus;
  error: string | null;
  durationMs: number;
  firstTextMs: number | null;
  tools: string[];
  failedTools: number;
  costUsd: number;
}

export interface JarvisUsage {
  days: number;
  totals: {
    questions: number;
    voiceQuestions: number;
    failed: number;
    stopped: number;
    jarvisCostUsd: number;
    aiCostUsd: number;
    averageCostUsd: number;
    medianMs: number | null;
    p90Ms: number | null;
    medianFirstTextMs: number | null;
  };
  byUser: Array<{
    userId: number | null;
    questions: number;
    voiceQuestions: number;
    failed: number;
    averageMs: number | null;
    features: Record<string, number>;
    costUsd: number;
  }>;
  byFeature: Array<{ feature: string; calls: number; costUsd: number }>;
  tools: Array<{ name: string; uses: number }>;
  expensive: JarvisTurn[];
  slowest: JarvisTurn[];
  failures: JarvisTurn[];
}

export const financeApi = {
  overview: () => apiGet<FinanceOverview>('/api/finance/overview'),
  jarvisUsage: (days: number) => apiGet<JarvisUsage>(`/api/finance/jarvis?days=${days}`),
  sync: () => apiPost<FinanceOverview>('/api/finance/sync', {}),
  importCatalog: (keys?: string[]) => apiPost<{ added: number }>('/api/finance/import-catalog', keys ? { keys } : {}),
  createExpense: (input: ExpenseInput) => apiPost<Expense>('/api/finance/expenses', input),
  updateExpense: (id: number, input: Partial<ExpenseInput>) => apiPut<Expense>(`/api/finance/expenses/${id}`, input),
  deleteExpense: (id: number) => apiDelete<void>(`/api/finance/expenses/${id}`),
  history: () => apiGet<FinanceHistory>('/api/finance/history'),
  createPayment: (input: PaymentInput) => apiPost<unknown>('/api/finance/payments', input),
  updatePayment: (id: number, input: Partial<PaymentInput>) => apiPut<unknown>(`/api/finance/payments/${id}`, input),
  deletePayment: (id: number) => apiDelete<void>(`/api/finance/payments/${id}`),
};

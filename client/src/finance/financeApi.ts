import { apiDelete, apiGet, apiPost, apiPut } from '../utils/api';

export type BillingCycle = 'monthly' | 'yearly' | 'one_time' | 'usage';
export type ExpenseStatus = 'active' | 'planned' | 'paused' | 'cancelled';
export type Currency = 'CZK' | 'USD' | 'EUR';
export type CostSource = 'anthropic' | 'openai';
export type Provider = CostSource | 'brave';
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
  amountUsd: number;
}

export interface ProviderStatus {
  label: string;
  configured: boolean;
  fetchedAt: string | null;
  error: string | null;
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
}

export const financeApi = {
  overview: () => apiGet<FinanceOverview>('/api/finance/overview'),
  sync: () => apiPost<FinanceOverview>('/api/finance/sync', {}),
  importCatalog: (keys?: string[]) => apiPost<{ added: number }>('/api/finance/import-catalog', keys ? { keys } : {}),
  createExpense: (input: ExpenseInput) => apiPost<Expense>('/api/finance/expenses', input),
  updateExpense: (id: number, input: Partial<ExpenseInput>) => apiPut<Expense>(`/api/finance/expenses/${id}`, input),
  deleteExpense: (id: number) => apiDelete<void>(`/api/finance/expenses/${id}`),
};

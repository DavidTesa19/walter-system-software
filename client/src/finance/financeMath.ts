// Turns the finance overview into the numbers the screen shows: every amount
// in CZK, the monthly run-rate of each cost, and the AI cost per month.
//
// Usage-based costs (AI, Railway usage…) count with a measured figure when
// there is one — the provider's bill, otherwise the app's own usage log — and
// with the typed-in estimate otherwise.

import type { BillingCycle, Expense, ExpenseStatus, FinanceOverview, Provider } from './financeApi';

export const BILLING_LABELS: Record<BillingCycle, string> = {
  monthly: 'Měsíčně',
  yearly: 'Ročně',
  one_time: 'Jednorázově',
  usage: 'Podle spotřeby',
};

export const STATUS_LABELS: Record<ExpenseStatus, string> = {
  active: 'Aktivní',
  planned: 'Plánované',
  paused: 'Pozastavené',
  cancelled: 'Zrušené',
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  brave: 'Brave Search',
};

// Stacking order in the AI chart, bottom up; also the series colour order.
export const CHART_PROVIDERS: Provider[] = ['anthropic', 'openai', 'brave'];

export const FEATURE_LABELS: Record<string, string> = {
  jarvis: 'Jarvis',
  jarvis_ocr: 'Jarvis – přepis skenů',
  chat: 'AI Asistent',
  voice_stt: 'Hlas – přepis dotazu',
  voice_tts: 'Hlas – předčítání',
  web_search: 'Vyhledávání na webu',
};

// Brave gives $5 of searches free every month.
const BRAVE_MONTHLY_CREDIT_USD = 5;

type Rates = FinanceOverview['rates']['rates'];

export const toCzk = (amount: number, currency: string, rates: Rates) => amount * (rates[currency] ?? 1);

const czkWhole = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const czkCents = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatCzk = (value: number) => (value !== 0 && Math.abs(value) < 100 ? czkCents : czkWhole).format(value);

export const formatMoney = (value: number, currency: string) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, minimumFractionDigits: currency === 'CZK' ? 0 : 2, maximumFractionDigits: 2 }).format(value);

export const formatUsd = (value: number) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: value !== 0 && Math.abs(value) < 0.1 ? 4 : 2 }).format(value);

export const formatCount = (value: number) =>
  new Intl.NumberFormat('cs-CZ', { notation: value >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);

export const formatDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('cs-CZ') : '—');

export const monthLabel = (month: string, style: 'short' | 'long' = 'short') =>
  new Date(`${month}-15T12:00:00`).toLocaleDateString('cs-CZ', { month: style, year: 'numeric' });

const pragueToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());

export const currentMonth = () => pragueToday().slice(0, 7);

const shiftMonth = (month: string, by: number) => {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return date.toISOString().slice(0, 7);
};

/** The twelve months the overview covers, oldest first. */
export const overviewMonths = (since: string) => Array.from({ length: 12 }, (_, index) => shiftMonth(since.slice(0, 7), index));

export interface ProviderMonth {
  usd: number;
  billed: boolean;
}

/**
 * AI cost per month and provider: the provider's bill where its admin key is
 * set and it has figures, the usage log's estimate otherwise.
 */
export function aiCostByMonth(overview: FinanceOverview): Map<string, Partial<Record<Provider, ProviderMonth>>> {
  const months = new Map<string, Partial<Record<Provider, ProviderMonth>>>();
  const billedProviders = new Set(overview.providerCosts.map((row) => row.provider));
  const add = (month: string, provider: Provider, usd: number, billed: boolean) => {
    const entry = months.get(month) ?? {};
    const current = entry[provider] ?? { usd: 0, billed };
    entry[provider] = { usd: current.usd + usd, billed };
    months.set(month, entry);
  };
  for (const row of overview.providerCosts) add(row.month, row.provider, row.amountUsd, true);
  for (const row of overview.usage.rows) {
    if (row.provider !== 'brave' && billedProviders.has(row.provider)) continue;
    add(row.month, row.provider, row.costUsd, false);
  }
  return months;
}

/** Which usage-log provider measures an expense, if any. */
export const measuredProvider = (expense: Expense): Provider | null =>
  expense.costSource ?? (expense.catalogKey === 'brave-search' ? 'brave' : null);

export interface MonthlyFigure {
  czk: number;
  /** How the figure was arrived at, for the table. */
  basis: string;
  estimate: boolean;
}

const daysInMonth = (month: string) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
};

/**
 * What one cost adds to a typical month, in CZK. One-off costs add nothing;
 * yearly ones a twelfth; usage-based ones last month's measured cost, this
 * month's so far projected to a full month, or the typed-in estimate.
 */
export function monthlyFigure(expense: Expense, overview: FinanceOverview, aiMonths: ReturnType<typeof aiCostByMonth>): MonthlyFigure {
  const rates = overview.rates.rates;
  const own = toCzk(expense.amount, expense.currency, rates);
  if (expense.billingCycle === 'one_time') return { czk: 0, basis: 'jednorázově', estimate: expense.isEstimate };
  if (expense.billingCycle === 'yearly') return { czk: own / 12, basis: 'roční částka / 12', estimate: expense.isEstimate };
  if (expense.billingCycle === 'monthly') return { czk: own, basis: 'měsíční částka', estimate: expense.isEstimate };

  const provider = measuredProvider(expense);
  if (provider) {
    const month = currentMonth();
    const previous = aiMonths.get(shiftMonth(month, -1))?.[provider];
    const current = aiMonths.get(month)?.[provider];
    const credit = provider === 'brave' ? BRAVE_MONTHLY_CREDIT_USD : 0;
    if (previous && previous.usd > 0) {
      return {
        czk: toCzk(Math.max(previous.usd - credit, 0), 'USD', rates),
        basis: previous.billed ? `vyúčtování za ${monthLabel(shiftMonth(month, -1), 'long')}` : `odhad z provozu za ${monthLabel(shiftMonth(month, -1), 'long')}`,
        estimate: !previous.billed,
      };
    }
    if (current && current.usd > 0) {
      const day = Number(pragueToday().slice(8, 10));
      const projected = (current.usd / day) * daysInMonth(month);
      return {
        czk: toCzk(Math.max(projected - credit, 0), 'USD', rates),
        basis: current.billed ? 'tento měsíc dosud, přepočteno na celý měsíc' : 'odhad z provozu, přepočteno na celý měsíc',
        estimate: true,
      };
    }
  }
  return { czk: own, basis: expense.isEstimate ? 'odhad podle ceníku' : 'zadaná měsíční částka', estimate: expense.isEstimate };
}

/** The next payment date of a cost on or after today, rolling a past date forward. */
export function nextPayment(expense: Expense): string | null {
  if (!expense.renewsOn || (expense.billingCycle !== 'monthly' && expense.billingCycle !== 'yearly')) return null;
  const today = pragueToday();
  const [year, month, day] = expense.renewsOn.split('-').map(Number);
  const step = expense.billingCycle === 'yearly' ? 12 : 1;
  for (let i = 0; i < 1200; i += step) {
    const candidate = new Date(Date.UTC(year, month - 1 + i, 1));
    const last = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)).getUTCDate();
    candidate.setUTCDate(Math.min(day, last));
    const iso = candidate.toISOString().slice(0, 10);
    if (iso >= today) return iso;
  }
  return null;
}

export const daysUntil = (iso: string) =>
  Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${pragueToday()}T12:00:00`).getTime()) / 86_400_000);

export const isCounted = (expense: Expense) => expense.status === 'active';

// Turns the finance overview into the numbers the screen shows: every amount
// in CZK, what each cost adds to a month, and how sure that number is.
//
// A cost is "connected" when its number comes from the provider itself (the
// bill, Brave's own counter, Brevo's plan), "fixed" when an admin confirmed
// the price from an invoice, and "unconfirmed" otherwise — a price-list
// estimate or the app's own usage log.

import type { BillingCycle, CostSource, Expense, ExpenseStatus, FinanceOverview, Provider } from './financeApi';

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

/**
 * Where a measured cost comes from: a provider's bills, Brave's counter, or
 * (ElevenLabs) only the app's own usage log.
 */
export type Source = CostSource | 'brave' | 'elevenlabs';
const hasNoBills = (source: Source): source is 'brave' | 'elevenlabs' => source === 'brave' || source === 'elevenlabs';

export const SOURCE_LABELS: Record<Source, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  railway: 'Railway',
  cloudflare: 'Cloudflare',
  google: 'Google Cloud',
  brave: 'Brave Search',
  elevenlabs: 'ElevenLabs',
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  brave: 'Brave Search',
  elevenlabs: 'ElevenLabs',
};

// Stacking order in the AI chart, bottom up; also the series colour order.
export const CHART_PROVIDERS: Provider[] = ['anthropic', 'openai', 'brave', 'elevenlabs'];

export const FEATURE_LABELS: Record<string, string> = {
  jarvis: 'Jarvis',
  jarvis_ocr: 'Jarvis – přepis skenů',
  chat: 'AI Asistent',
  voice_stt: 'Hlas – přepis dotazu',
  voice_tts: 'Hlas – předčítání',
  web_search: 'Vyhledávání na webu',
};

export type CostStatus = 'connected' | 'fixed' | 'unconfirmed' | 'error';

export const COST_STATUS_INFO: Record<CostStatus, { label: string; tone: string }> = {
  connected: { label: 'Napojeno', tone: 'active' },
  fixed: { label: 'Pevná cena', tone: 'planned' },
  unconfirmed: { label: 'Nepotvrzeno', tone: 'estimate' },
  error: { label: 'Chyba napojení', tone: 'cancelled' },
};

// Rows imported before an entry had a cost source still find their provider.
const CATALOG_SOURCES: Record<string, Source> = {
  'anthropic-api': 'anthropic',
  'openai-api': 'openai',
  'railway-plan': 'railway',
  'railway-usage': 'railway',
  'google-maps': 'google',
  'cloudflare-r2': 'cloudflare',
  'brave-search': 'brave',
};

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

export const formatDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' }) : '—';

export const monthLabel = (month: string, style: 'short' | 'long' = 'short') =>
  new Date(`${month}-15T12:00:00`).toLocaleDateString('cs-CZ', { month: style, year: 'numeric' });

const pragueDay = (date: Date | string = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(date));

export const currentMonth = () => pragueDay().slice(0, 7);

export const shiftMonth = (month: string, by: number) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
};

/** The twelve months the overview covers, oldest first. */
export const overviewMonths = (since: string) => Array.from({ length: 12 }, (_, index) => shiftMonth(since.slice(0, 7), index));

export const daysUntil = (iso: string) =>
  Math.round((new Date(`${pragueDay(iso)}T12:00:00`).getTime() - new Date(`${pragueDay()}T12:00:00`).getTime()) / 86_400_000);

export const isCounted = (expense: Expense) => expense.status === 'active';

export interface Measured {
  czk: number;
  /** From the provider's bill rather than the app's usage log. */
  billed: boolean;
}

export type MeasuredMonths = Map<string, Partial<Record<Source, Measured>>>;

/** A provider whose bills have been read at least once, even if they were all zero. */
const isBillingConnected = (overview: FinanceOverview, source: CostSource) => {
  const provider = overview.providers[source];
  return Boolean(provider?.configured && provider.fetchedAt);
};

/**
 * Cost per month and source, in CZK: the provider's bill when it is
 * connected, the app's usage log (AI providers only) otherwise.
 */
export function measuredByMonth(overview: FinanceOverview): MeasuredMonths {
  const rates = overview.rates.rates;
  const months: MeasuredMonths = new Map();
  const add = (month: string, source: Source, czk: number, billed: boolean) => {
    const entry = months.get(month) ?? {};
    entry[source] = { czk: (entry[source]?.czk ?? 0) + czk, billed };
    months.set(month, entry);
  };
  for (const row of overview.providerCosts) add(row.month, row.provider, toCzk(row.amount, row.currency, rates), true);
  for (const row of overview.usage.rows) {
    if (!hasNoBills(row.provider) && isBillingConnected(overview, row.provider)) continue;
    add(row.month, row.provider, toCzk(row.costUsd, 'USD', rates), false);
  }
  return months;
}

export const measuredSource = (expense: Expense): Source | null =>
  expense.costSource ?? (expense.catalogKey ? CATALOG_SOURCES[expense.catalogKey] ?? null : null);

export interface MonthlyFigure {
  czk: number;
  /** How the figure was arrived at, for the table. */
  basis: string;
  status: CostStatus;
  /** The number is the provider's bill, so the typed amount plays no part. */
  fromBill?: boolean;
}

const typedFigure = (expense: Expense, rates: Rates, basisFixed: string): MonthlyFigure => {
  const own = toCzk(expense.amount, expense.currency, rates);
  const czk = expense.billingCycle === 'yearly' ? own / 12 : expense.billingCycle === 'one_time' ? 0 : own;
  const basis =
    expense.billingCycle === 'one_time'
      ? 'jednorázově'
      : expense.amount === 0 && !expense.isEstimate
        ? 'zdarma'
        : expense.isEstimate
        ? 'odhad podle ceníku — opravte podle faktury'
        : expense.billingCycle === 'yearly'
          ? 'roční částka z faktury / 12'
          : basisFixed;
  return { czk, basis, status: expense.isEstimate ? 'unconfirmed' : 'fixed' };
};

/**
 * What one cost adds to a month, in CZK, and where the number comes from.
 * A provider's bill is counted once even when several rows point to it (the
 * Railway plan and usage are one invoice): the first row takes it, the
 * others show where it is.
 */
export function monthlyFigure(
  expense: Expense,
  overview: FinanceOverview,
  measured: MeasuredMonths,
  claimed: Map<Source, string>
): MonthlyFigure {
  const rates = overview.rates.rates;
  const source = measuredSource(expense);
  const previousMonth = shiftMonth(currentMonth(), -1);

  if (source && !hasNoBills(source)) {
    const provider = overview.providers[source];
    if (isBillingConnected(overview, source)) {
      const owner = claimed.get(source);
      if (owner) return { czk: 0, basis: `v ceně řádku „${owner}“`, status: 'connected', fromBill: true };
      claimed.set(source, expense.name);
      return {
        czk: measured.get(previousMonth)?.[source]?.czk ?? 0,
        basis: `vyúčtování za ${monthLabel(previousMonth, 'long')}`,
        status: provider.error ? 'error' : 'connected',
        fromBill: true,
      };
    }
    if (provider?.configured && provider.error) {
      return { ...typedFigure(expense, rates, 'zadaná částka'), basis: `napojení selhalo: ${provider.error}`, status: 'error' };
    }
    // Not connected: the AI providers still have the app's own usage log.
    const logged = measured.get(previousMonth)?.[source];
    if (logged && logged.czk > 0 && !claimed.has(source)) {
      claimed.set(source, expense.name);
      return { czk: logged.czk, basis: `odhad z provozu aplikace za ${monthLabel(previousMonth, 'long')}`, status: 'unconfirmed' };
    }
    return typedFigure(expense, rates, 'zadaná částka z faktury');
  }

  if (source === 'brave' && overview.checks.brave.quota) {
    const { used, limit } = overview.checks.brave.quota;
    const figure = typedFigure(expense, rates, 'zadaná částka');
    return {
      ...figure,
      basis: `${formatCount(used)} z ${formatCount(limit)} dotazů tento měsíc (počítá Brave)`,
      status: expense.isEstimate ? 'unconfirmed' : 'connected',
    };
  }

  if (expense.catalogKey === 'brevo' && overview.checks.brevo.plans?.length) {
    const plans = overview.checks.brevo.plans;
    if (plans.every((plan) => plan.type === 'free')) {
      return { czk: 0, basis: 'tarif Free, ověřeno u Brevo', status: 'connected' };
    }
    const figure = typedFigure(expense, rates, 'zadaná částka z faktury');
    return { ...figure, basis: `tarif ${plans.map((plan) => plan.type).join(', ')} (ověřeno u Brevo) · ${figure.basis}` };
  }

  return typedFigure(expense, rates, 'měsíční částka z faktury');
}

export interface CostRow {
  expense: Expense;
  monthly: MonthlyFigure;
}

/** Every cost with its monthly figure, in list order. */
export function costRows(overview: FinanceOverview, measured: MeasuredMonths): CostRow[] {
  const claimed = new Map<Source, string>();
  // Active rows claim a shared bill before inactive ones.
  const ordered = [...overview.expenses].sort((a, b) => Number(isCounted(b)) - Number(isCounted(a)));
  const figures = new Map(ordered.map((expense) => [expense.id, monthlyFigure(expense, overview, measured, claimed)]));
  return overview.expenses.map((expense) => ({ expense, monthly: figures.get(expense.id)! }));
}

/** Registry facts about the domain an expense pays for, if it is one. */
export const domainCheckFor = (expense: Expense, overview: FinanceOverview) =>
  overview.checks.domains.find((check) => check.catalogKey === expense.catalogKey) ?? null;

/**
 * The next payment date of a cost. A domain's comes from the registry and may
 * lie in the past (expired); otherwise the typed date rolls forward to today.
 */
export function nextPayment(expense: Expense, overview: FinanceOverview): string | null {
  const domain = domainCheckFor(expense, overview);
  if (domain?.expiresAt) return pragueDay(domain.expiresAt);
  if (!expense.renewsOn || (expense.billingCycle !== 'monthly' && expense.billingCycle !== 'yearly')) return null;
  const today = pragueDay();
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

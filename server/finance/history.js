// The payment history behind Finance › Historie: what was paid in each month
// since the app started (09/2025). Three kinds of entry, never copied into
// one another:
//   bill       a connected provider's own bill (finance_provider_costs),
//              one entry per provider and month, each bill day converted at
//              that day's ČNB rate
//   recurring  a month filled in from a confirmed fixed cost
//              (finance_payments, origin 'recurring'); editable, removable
//   manual     a payment added by hand
// The client only sums and draws; every CZK amount is computed here.

import { CATALOG, CATEGORY_LABELS } from './catalog.js';
import { BILLING_PROVIDERS, isProviderConfigured } from './providers.js';
import { createDayRates } from './rates.js';

export const HISTORY_START = '2025-09-01';

// Category of a provider's bills when no cost line links to the provider.
const PROVIDER_CATEGORY = { anthropic: 'ai', openai: 'ai', railway: 'hosting', google: 'maps', cloudflare: 'storage' };

const pragueDay = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(date));

/** The billing provider whose bills cover a cost line, if any. */
export const costSourceOf = (expense) =>
  expense.costSource ?? CATALOG.find((entry) => entry.key === expense.catalogKey)?.costSource ?? null;

const isBilledByConnector = (expense) => {
  const source = costSourceOf(expense);
  return Boolean(source && BILLING_PROVIDERS[source] && isProviderConfigured(source));
};

// YYYY-MM-DD for the given day of a month, clamped to the month's last day.
const dateIn = (year, monthIndex, day) => {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, last))).toISOString().slice(0, 10);
};

/** Every month from HISTORY_START to the current one, as YYYY-MM. */
export function historyMonths() {
  const months = [];
  const end = pragueDay().slice(0, 7);
  let [year, month] = HISTORY_START.split('-').map(Number);
  for (let guard = 0; guard < 600; guard += 1) {
    const value = `${year}-${String(month).padStart(2, '0')}`;
    months.push(value);
    if (value >= end) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * The months a confirmed fixed cost was paid in, from HISTORY_START to today.
 * Only active, confirmed (not an estimate), non-zero monthly or yearly costs
 * that no connector already bills. A monthly cost falls on the day of its
 * start (or renewal) date, a yearly one on that date's anniversary. A domain
 * whose registry expiry has passed was not renewed, so that year is skipped.
 */
export function recurringPayments(expenses, domainChecks = []) {
  const today = pragueDay();
  const payments = [];
  for (const expense of expenses) {
    if (expense.status !== 'active' || expense.isEstimate || !(Number(expense.amount) > 0)) continue;
    if (expense.billingCycle !== 'monthly' && expense.billingCycle !== 'yearly') continue;
    if (isBilledByConnector(expense)) continue;

    const domain = domainChecks.find((check) => check.catalogKey && check.catalogKey === expense.catalogKey);
    const anchor = expense.startedOn ?? expense.renewsOn ?? (domain?.registeredAt ? pragueDay(domain.registeredAt) : null);
    if (!anchor && expense.billingCycle === 'yearly') continue; // no month to put it in
    const [, anchorMonth, anchorDay] = (anchor ?? HISTORY_START).split('-').map(Number);
    const from = [HISTORY_START, expense.startedOn ?? HISTORY_START].sort().at(-1);
    const expiry = domain?.expiresAt ? pragueDay(domain.expiresAt) : null;

    const dates = [];
    const startYear = Number(HISTORY_START.slice(0, 4));
    const endYear = Number(today.slice(0, 4));
    for (let year = startYear; year <= endYear; year += 1) {
      if (expense.billingCycle === 'yearly') dates.push(dateIn(year, anchorMonth - 1, anchorDay));
      else for (let month = 0; month < 12; month += 1) dates.push(dateIn(year, month, anchorDay));
    }
    for (const date of dates) {
      if (date < from || date > today) continue;
      if (expiry && date >= expiry) continue;
      payments.push({
        paidOn: date,
        expenseId: expense.id,
        category: expense.category,
        description: expense.name,
        amount: Number(expense.amount),
        currency: expense.currency,
        recurringKey: `${expense.id}:${date.slice(0, 7)}`,
      });
    }
  }
  return payments;
}

/** Every entry of the history, each with its amount in CZK. */
export async function buildHistory({ store, expenses }) {
  const [payments, billDays] = await Promise.all([store.listPayments(), store.providerCostDays(HISTORY_START)]);
  const rateFor = await createDayRates([...payments.map((payment) => payment.paidOn), ...billDays.map((bill) => bill.day)]);
  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]));
  const entries = [];

  for (const payment of payments) {
    if (payment.paidOn < HISTORY_START) continue;
    const expense = payment.expenseId ? expenseById.get(payment.expenseId) : null;
    const exact = payment.amountCzk !== null && payment.amountCzk !== undefined;
    const rate = rateFor(payment.paidOn, payment.currency);
    entries.push({
      id: `p${payment.id}`,
      kind: payment.origin === 'recurring' ? 'recurring' : 'manual',
      paymentId: payment.id,
      provider: null,
      date: payment.paidOn,
      month: payment.paidOn.slice(0, 7),
      expenseId: payment.expenseId,
      service: expense?.name ?? payment.description ?? 'Platba',
      description: payment.description,
      category: payment.category,
      amount: payment.amount,
      currency: payment.currency,
      czk: exact ? payment.amountCzk : payment.amount * rate.rate,
      exactCzk: exact,
      rate: exact || payment.currency === 'CZK' ? null : { value: rate.rate, day: rate.day, fallback: rate.fallback },
      note: payment.note,
      lines: null,
    });
  }

  // A provider's bills, one entry per month; each day at its own rate.
  const bills = new Map();
  for (const bill of billDays) {
    const month = bill.day.slice(0, 7);
    const key = `${bill.provider}|${month}`;
    const group = bills.get(key) ?? { provider: bill.provider, month, date: bill.day, currency: bill.currency, amount: 0, czk: 0, lines: new Map() };
    const czk = bill.amount * rateFor(bill.day, bill.currency).rate;
    group.amount += bill.amount;
    group.czk += czk;
    if (bill.day > group.date) group.date = bill.day;
    const line = group.lines.get(bill.lineItem) ?? { lineItem: bill.lineItem, amount: 0, czk: 0 };
    line.amount += bill.amount;
    line.czk += czk;
    group.lines.set(bill.lineItem, line);
    bills.set(key, group);
  }
  for (const group of bills.values()) {
    const linked = expenses.find((expense) => costSourceOf(expense) === group.provider && expense.status === 'active')
      ?? expenses.find((expense) => costSourceOf(expense) === group.provider);
    const label = BILLING_PROVIDERS[group.provider]?.label ?? group.provider;
    entries.push({
      id: `b:${group.provider}:${group.month}`,
      kind: 'bill',
      paymentId: null,
      provider: group.provider,
      date: group.date,
      month: group.month,
      expenseId: linked?.id ?? null,
      service: label,
      description: `Vyúčtování ${label}`,
      category: linked?.category ?? PROVIDER_CATEGORY[group.provider] ?? 'other',
      amount: group.amount,
      currency: group.currency,
      czk: group.czk,
      exactCzk: false,
      rate: null,
      note: null,
      lines: [...group.lines.values()].sort((a, b) => b.czk - a.czk),
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    start: HISTORY_START.slice(0, 7),
    months: historyMonths(),
    categories: CATEGORY_LABELS,
    services: expenses.map((expense) => ({
      id: expense.id,
      name: expense.name,
      category: expense.category,
      currency: expense.currency,
      amount: expense.amount,
      billedByConnector: isBilledByConnector(expense),
    })),
    entries,
  };
}

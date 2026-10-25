// Admin API for the finance overview (Analýza › Finance): the cost list, the
// AI usage log, the providers' real bills and the checks on fixed-price
// services. Everything here is admin-only.

import { z } from 'zod/v4';
import {
  BILLING_CYCLES,
  CATALOG,
  CATALOG_DOMAINS,
  CATEGORY_LABELS,
  COST_SOURCES,
  CURRENCIES,
  EXPENSE_STATUSES,
  catalogExpense,
  describeKeys,
} from './catalog.js';
import { isBrevoConfigured, lookupBrevoPlan, lookupDomain } from './checks.js';
import { env } from './http.js';
import { BILLING_PROVIDERS, ProviderCostError, fetchProviderCosts, isProviderConfigured } from './providers.js';
import { getRates } from './rates.js';
import { createFileFinanceStore, createPgFinanceStore } from './store.js';
import { setStateSink, setUsageSink } from './usage.js';

const HISTORY_MONTHS = 12;
// Bills are re-read when the screen opens and the last read is older than
// this; the button on the screen reads them at once.
const SYNC_MAX_AGE_MS = 3 * 3600 * 1000;
const CHECK_MAX_AGE_MS = 6 * 3600 * 1000;
const PROVIDERS = Object.keys(BILLING_PROVIDERS);

const syncKey = (provider) => `sync:${provider}`;
const domainKey = (domain) => `domain:${domain}`;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum musí být ve tvaru RRRR-MM-DD.');
const text = (max) => z.string().trim().max(max).nullable().optional();

const expenseInput = z
  .object({
    name: z.string().trim().min(1, 'Vyplňte název.').max(200),
    vendor: text(200),
    category: z.enum(Object.keys(CATEGORY_LABELS)),
    billingCycle: z.enum(BILLING_CYCLES),
    amount: z.number().min(0, 'Částka nemůže být záporná.').max(100_000_000),
    currency: z.enum(CURRENCIES),
    isEstimate: z.boolean(),
    status: z.enum(EXPENSE_STATUSES),
    startedOn: dateString.nullable().optional(),
    renewsOn: dateString.nullable().optional(),
    description: text(5000),
    usedFor: text(5000),
    notes: text(5000),
    envKeys: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
    dashboardUrl: z
      .string()
      .trim()
      .max(500)
      .refine((value) => value === '' || /^https?:\/\//i.test(value), 'Odkaz musí začínat http:// nebo https://.')
      .nullable()
      .optional(),
    costSource: z.enum(COST_SOURCES).nullable().optional(),
  })
  .strict();

const firstIssue = (error) => error.issues[0]?.message ?? 'Neplatná data.';

// First day of the month `monthsBack` months ago, in Prague time, as UTC.
const monthStart = (monthsBack) => {
  const [year, month] = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .split('-')
    .map(Number);
  const date = new Date(Date.UTC(year, month - 1 - monthsBack, 1));
  return { day: date.toISOString().slice(0, 10), date };
};

const isStale = (state, maxAge) => !state?.at || Date.now() - new Date(state.at).getTime() > maxAge;

const errorMessage = (error, label) => {
  if (error instanceof ProviderCostError) return error.message;
  console.error(`${label}:`, error);
  return 'Načtení se nezdařilo.';
};

const wrap = (fallback, handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error(fallback, error);
    res.status(500).json({ error: fallback });
  }
};

/**
 * pool: the Postgres pool, or null in the JSON development backend (the data
 * then lives in finance.json in dataDir).
 */
export function registerFinanceRoutes(app, { authenticateToken, requireRole, pool, dataDir }) {
  const guard = [authenticateToken, requireRole('admin')];
  const store = pool ? createPgFinanceStore(pool) : createFileFinanceStore(dataDir);
  setUsageSink((entry) => store.recordUsage(entry));
  setStateSink((key, value) => store.setState(key, value));

  // Reads in progress, so two open screens do not fetch the same thing twice.
  const running = new Map();
  const once = (key, work) => {
    if (!running.has(key)) running.set(key, work().finally(() => running.delete(key)));
    return running.get(key);
  };

  // A provider's bills. The first successful read takes the whole year; later
  // ones refresh from the start of last month, which also catches late
  // corrections to the previous bill. Its state remembers the last attempt,
  // the last success and what the provider said about the open period.
  const syncProvider = (provider, previous) =>
    once(syncKey(provider), async () => {
      const from = monthStart(previous?.okAt ? 1 : HISTORY_MONTHS - 1).date;
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      const now = new Date().toISOString();
      try {
        const { rows, details } = await fetchProviderCosts(provider, from, tomorrow);
        await store.saveProviderCosts(provider, from.toISOString().slice(0, 10), tomorrow.toISOString().slice(0, 10), rows);
        await store.setState(syncKey(provider), { at: now, okAt: now, error: null, details: details ?? null });
      } catch (error) {
        await store
          .setState(syncKey(provider), { ...(previous ?? {}), at: now, error: errorMessage(error, `${BILLING_PROVIDERS[provider].label} costs not synced`) })
          .catch(() => {});
      }
    });

  // A check of a fixed-price service (domain expiry, Brevo plan), kept for a
  // few hours; a failed check keeps the last good value next to the error.
  const refreshCheck = (key, previous, force, load) => {
    if (!force && !isStale(previous, CHECK_MAX_AGE_MS)) return null;
    return once(key, async () => {
      const now = new Date().toISOString();
      try {
        await store.setState(key, { at: now, error: null, value: await load() });
      } catch (error) {
        await store.setState(key, { ...(previous ?? {}), at: now, error: errorMessage(error, `Finance check ${key} failed`) }).catch(() => {});
      }
    });
  };

  const stateKeys = [
    ...PROVIDERS.map(syncKey),
    'brave_quota',
    'brevo_plan',
    ...CATALOG_DOMAINS.map(({ domain }) => domainKey(domain)),
  ];

  const refreshAll = async (states, force) => {
    await Promise.all([
      ...PROVIDERS.filter((provider) => isProviderConfigured(provider)).map((provider) => {
        const previous = states[syncKey(provider)];
        return force || isStale(previous, SYNC_MAX_AGE_MS) ? syncProvider(provider, previous) : null;
      }),
      isBrevoConfigured() ? refreshCheck('brevo_plan', states.brevo_plan, force, lookupBrevoPlan) : null,
      ...CATALOG_DOMAINS.map(({ domain }) =>
        refreshCheck(domainKey(domain), states[domainKey(domain)], force, () => lookupDomain(domain))
      ),
    ]);
  };

  const overview = async ({ force = false } = {}) => {
    const since = monthStart(HISTORY_MONTHS - 1);
    await refreshAll(await store.getStates(stateKeys), force);
    const [states, expenses, keys, usage, providerCosts, rates] = await Promise.all([
      store.getStates(stateKeys),
      store.listExpenses(),
      store.catalogKeys(),
      store.usageSummary(since.date),
      store.providerCostSummary(since.day),
      getRates(),
    ]);
    const brevo = states.brevo_plan;
    return {
      generatedAt: new Date().toISOString(),
      since: since.day,
      rates,
      categories: CATEGORY_LABELS,
      expenses,
      catalogMissing: CATALOG.filter((entry) => !keys.has(entry.key)).map((entry) => ({
        key: entry.key,
        name: entry.name,
        category: entry.category,
      })),
      keys: describeKeys(),
      usage,
      providers: Object.fromEntries(
        PROVIDERS.map((provider) => {
          const configured = isProviderConfigured(provider);
          const state = states[syncKey(provider)];
          return [
            provider,
            {
              label: BILLING_PROVIDERS[provider].label,
              envKeys: BILLING_PROVIDERS[provider].envKeys,
              configured,
              fetchedAt: configured ? state?.okAt ?? providerCosts.fetchedAt[provider] ?? null : null,
              checkedAt: configured ? state?.at ?? null : null,
              error: configured ? state?.error ?? null : null,
              details: configured ? state?.details ?? null : null,
            },
          ];
        })
      ),
      providerCosts: providerCosts.rows,
      checks: {
        brave: { configured: Boolean(env('BRAVE_SEARCH_API_KEY')), quota: states.brave_quota ?? null },
        brevo: {
          configured: isBrevoConfigured(),
          checkedAt: brevo?.at ?? null,
          error: isBrevoConfigured() ? brevo?.error ?? null : null,
          plans: brevo?.value?.plans ?? null,
        },
        domains: CATALOG_DOMAINS.map(({ key, domain }) => {
          const state = states[domainKey(domain)];
          return { catalogKey: key, domain, checkedAt: state?.at ?? null, error: state?.error ?? null, ...(state?.value ?? {}) };
        }),
      },
    };
  };

  app.get('/api/finance/overview', ...guard, wrap('Finanční přehled se nepodařilo načíst.', async (_req, res) => {
    res.json(await overview());
  }));

  app.post('/api/finance/sync', ...guard, wrap('Náklady od poskytovatelů se nepodařilo načíst.', async (_req, res) => {
    res.json(await overview({ force: true }));
  }));

  app.post('/api/finance/expenses', ...guard, wrap('Náklad se nepodařilo uložit.', async (req, res) => {
    const parsed = expenseInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    res.status(201).json(await store.createExpense(parsed.data));
  }));

  app.put('/api/finance/expenses/:id', ...guard, wrap('Náklad se nepodařilo uložit.', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Neplatné ID.' });
    const parsed = expenseInput.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const expense = await store.updateExpense(id, parsed.data);
    if (!expense) return res.status(404).json({ error: 'Náklad neexistuje.' });
    res.json(expense);
  }));

  app.delete('/api/finance/expenses/:id', ...guard, wrap('Náklad se nepodařilo smazat.', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Neplatné ID.' });
    if (!(await store.deleteExpense(id))) return res.status(404).json({ error: 'Náklad neexistuje.' });
    res.status(204).end();
  }));

  // Adds the detected services that are not in the list yet (all of them, or
  // the given keys). An entry deleted on purpose comes back only this way.
  app.post('/api/finance/import-catalog', ...guard, wrap('Služby se nepodařilo přidat.', async (req, res) => {
    const wanted = Array.isArray(req.body?.keys) ? new Set(req.body.keys.map(String)) : null;
    const existing = await store.catalogKeys();
    const added = [];
    for (const entry of CATALOG) {
      if (existing.has(entry.key) || (wanted && !wanted.has(entry.key))) continue;
      try {
        added.push(await store.createExpense(catalogExpense(entry)));
      } catch (error) {
        // Added meanwhile by another admin: the unique key keeps one copy.
        if (error?.code !== '23505') throw error;
      }
    }
    res.json({ added: added.length });
  }));
}

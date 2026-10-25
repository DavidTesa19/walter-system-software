// What each provider actually billed, read from its own billing API. Every
// connector needs its own credential — never the key the app uses for its
// calls — and only reads:
//   anthropic   ANTHROPIC_ADMIN_KEY   sk-ant-admin01-…  Claude Console › Settings › Admin keys
//                                     (organisations only, not individual accounts)
//   openai      OPENAI_ADMIN_KEY      sk-admin-…  platform.openai.com › Settings › Organization › Admin keys
//   railway     RAILWAY_API_TOKEN     railway.com › Account › Tokens, workspace "No workspace"
//                                     (RAILWAY_WORKSPACE_ID narrows it to one workspace)
//   cloudflare  CLOUDFLARE_API_TOKEN  a token with "Billing Read", plus CLOUDFLARE_ACCOUNT_ID
//   google      see google-billing.js (BigQuery billing export)
// The credentials never leave this server.
//
// Each fetch returns { rows, details }: rows are daily
// { day: 'YYYY-MM-DD', lineItem, model, amount, currency } in the currency the
// provider bills in; details is what the provider says about the open period.

import { ProviderCostError, env, requestJson } from './http.js';
import { fetchGoogleBilling, isGoogleBillingConfigured } from './google-billing.js';

export { ProviderCostError };

const MAX_PAGES = 12;

// ---------- Anthropic: USD cents as decimal strings, one bucket per day ----------

async function fetchAnthropic(from, to) {
  const rows = [];
  let page = null;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const params = new URLSearchParams({
      starting_at: from.toISOString(),
      ending_at: to.toISOString(),
      bucket_width: '1d',
      limit: '31',
    });
    params.append('group_by[]', 'description');
    if (page) params.set('page', page);
    const body = await requestJson(`https://api.anthropic.com/v1/organizations/cost_report?${params}`, {
      headers: {
        'x-api-key': env('ANTHROPIC_ADMIN_KEY'),
        'anthropic-version': '2023-06-01',
        'User-Agent': 'WalterSystem/1.0 (finance overview)',
      },
    });
    for (const bucket of body?.data ?? []) {
      const day = String(bucket.starting_at ?? '').slice(0, 10);
      for (const result of bucket.results ?? []) {
        const cents = Number(result.amount);
        if (!day || !Number.isFinite(cents)) continue;
        rows.push({ day, lineItem: result.description || 'Ostatní', model: result.model ?? null, amount: cents / 100, currency: 'USD' });
      }
    }
    if (!body?.has_more || !body?.next_page) break;
    page = body.next_page;
  }
  return { rows, details: null };
}

// ---------- OpenAI: Unix-second buckets, amount.value in dollars ----------

async function fetchOpenAi(from, to) {
  const rows = [];
  let page = null;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const params = new URLSearchParams({
      start_time: String(Math.floor(from.getTime() / 1000)),
      end_time: String(Math.floor(to.getTime() / 1000)),
      bucket_width: '1d',
      group_by: 'line_item',
      limit: '31',
    });
    if (page) params.set('page', page);
    const body = await requestJson(`https://api.openai.com/v1/organization/costs?${params}`, {
      headers: { Authorization: `Bearer ${env('OPENAI_ADMIN_KEY')}` },
    });
    for (const bucket of body?.data ?? []) {
      const day = new Date(Number(bucket.start_time) * 1000).toISOString().slice(0, 10);
      for (const result of bucket.results ?? []) {
        const value = Number(result.amount?.value);
        if (!Number.isFinite(value)) continue;
        rows.push({ day, lineItem: result.line_item || 'Ostatní', model: null, amount: value, currency: String(result.amount?.currency ?? 'usd').toUpperCase() });
      }
    }
    if (!body?.has_more || !body?.next_page) break;
    page = body.next_page;
  }
  return { rows, details: null };
}

// ---------- Railway: the paid invoices themselves (VAT included) ----------

const RAILWAY_URL = 'https://backboard.railway.com/graphql/v2';

async function railway(query, variables) {
  const body = await requestJson(RAILWAY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RAILWAY_API_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (body?.errors?.length) {
    const message = body.errors[0]?.message ?? 'chyba';
    if (/not authorized|unauthorized|authentication/i.test(message)) {
      throw new ProviderCostError(`Token byl odmítnut (${message}). Použijte token účtu (Account › Tokens, bez workspace).`);
    }
    throw new ProviderCostError(message);
  }
  return body.data;
}

const shortDate = (iso) => new Date(iso).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric' });
const longDate = (iso) => new Date(iso).toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' });
const pragueDay = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(iso));

const WORKSPACE_BILLING = `
  query Billing($id: String!) {
    workspace(workspaceId: $id) {
      id
      name
      plan
      customer {
        currentUsage
        billingPeriod { start end }
        subscriptions { status nextInvoiceDate nextInvoiceCurrentTotal }
        invoices { invoiceId periodStart periodEnd total status }
      }
    }
  }`;

async function fetchRailway(from, to) {
  const configured = env('RAILWAY_WORKSPACE_ID');
  const workspaces = configured
    ? [{ id: configured }]
    : ((await railway('{ me { workspaces { id name } } }'))?.me?.workspaces ?? []);
  if (!workspaces.length) throw new ProviderCostError('Token nevidí žádný workspace.');

  const fromDay = from.toISOString().slice(0, 10);
  const toDay = to.toISOString().slice(0, 10);
  const rows = [];
  const details = [];
  for (const { id } of workspaces) {
    const workspace = (await railway(WORKSPACE_BILLING, { id }))?.workspace;
    const customer = workspace?.customer;
    if (!customer) continue;
    const prefix = workspaces.length > 1 ? `${workspace.name}: ` : '';
    for (const invoice of customer.invoices ?? []) {
      // Void invoices were never charged; drafts not yet.
      if (invoice.status !== 'paid' && invoice.status !== 'open') continue;
      const day = pragueDay(invoice.periodEnd);
      if (day < fromDay || day > toDay) continue;
      const label = invoice.periodStart === invoice.periodEnd
        ? `Předplatné tarifu ${workspace.plan ?? ''}`.trim()
        : `Vyúčtování ${shortDate(invoice.periodStart)}–${longDate(invoice.periodEnd)}`;
      rows.push({ day, lineItem: `${prefix}${label}`, model: null, amount: Number(invoice.total) / 100, currency: 'USD' });
    }
    const subscription = (customer.subscriptions ?? []).find((item) => item.status === 'active') ?? customer.subscriptions?.[0];
    details.push({
      workspace: workspace.name,
      plan: workspace.plan,
      periodStart: customer.billingPeriod?.start ?? null,
      periodEnd: customer.billingPeriod?.end ?? null,
      // Usage so far this period, before VAT and before the plan's included credit.
      currentUsage: Number(customer.currentUsage ?? 0),
      nextInvoiceDate: subscription?.nextInvoiceDate ?? null,
      nextInvoiceTotal: subscription?.nextInvoiceCurrentTotal != null ? Number(subscription.nextInvoiceCurrentTotal) / 100 : null,
      currency: 'USD',
    });
  }
  return { rows, details: { workspaces: details } };
}

// ---------- Cloudflare: Billable Usage API, one request per month ----------

async function fetchCloudflare(from, to) {
  const account = env('CLOUDFLARE_ACCOUNT_ID');
  if (!/^[0-9a-f]{32}$/i.test(account)) throw new ProviderCostError('CLOUDFLARE_ACCOUNT_ID má být 32 znaků z přehledu účtu Cloudflare.');
  const rows = [];
  let start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (start < to) {
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const startDay = start.toISOString().slice(0, 10);
    const nextDay = next.toISOString().slice(0, 10);
    const body = await requestJson(
      `https://api.cloudflare.com/client/v4/accounts/${account}/billable-usage?from=${startDay}&to=${nextDay}`,
      { headers: { Authorization: `Bearer ${env('CLOUDFLARE_API_TOKEN')}` } }
    );
    if (body?.success === false) throw new ProviderCostError(body.errors?.[0]?.message ?? 'Cloudflare odmítl dotaz.');
    for (const item of body?.result ?? []) {
      const day = String(item.ChargePeriodStart ?? item.BillingPeriodStart ?? '').slice(0, 10);
      const amount = Number(item.ContractedCost);
      // Whether `to` is inclusive is not documented; keep each month's own days only.
      if (!day || day < startDay || day >= nextDay || !Number.isFinite(amount)) continue;
      rows.push({ day, lineItem: item.ServiceName || item.ServiceFamilyName || 'Cloudflare', model: null, amount, currency: item.BillingCurrency || 'USD' });
    }
    start = next;
  }
  return { rows, details: null };
}

// ---------- registry ----------

export const BILLING_PROVIDERS = {
  anthropic: { label: 'Anthropic', envKeys: ['ANTHROPIC_ADMIN_KEY'], fetch: fetchAnthropic },
  openai: { label: 'OpenAI', envKeys: ['OPENAI_ADMIN_KEY'], fetch: fetchOpenAi },
  railway: { label: 'Railway', envKeys: ['RAILWAY_API_TOKEN'], fetch: fetchRailway },
  cloudflare: { label: 'Cloudflare', envKeys: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], fetch: fetchCloudflare },
  google: {
    label: 'Google Cloud',
    envKeys: ['GOOGLE_BILLING_SERVICE_ACCOUNT', 'GOOGLE_BILLING_EXPORT_TABLE'],
    fetch: fetchGoogleBilling,
    isConfigured: isGoogleBillingConfigured,
  },
};

export const isProviderConfigured = (provider) => {
  const entry = BILLING_PROVIDERS[provider];
  return entry.isConfigured ? entry.isConfigured() : entry.envKeys.every((name) => Boolean(env(name)));
};

/** Daily billed amounts for one provider between two dates (UTC days). */
export async function fetchProviderCosts(provider, from, to) {
  if (!isProviderConfigured(provider)) throw new ProviderCostError('Přístup není nastavený.');
  return BILLING_PROVIDERS[provider].fetch(from, to);
}

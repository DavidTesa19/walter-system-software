// What Anthropic and OpenAI actually billed, from their organisation cost APIs.
// Both need an admin key (not the regular API key the app uses for calls):
//   ANTHROPIC_ADMIN_KEY  sk-ant-admin01-…  Claude Console › Settings › Admin keys
//                        (only organisations have them, not individual accounts)
//   OPENAI_ADMIN_KEY     sk-admin-…        platform.openai.com › Settings › Admin keys
// The keys only read cost reports; they never leave this server.
//
// Each fetch returns daily rows { day: 'YYYY-MM-DD', lineItem, model, amountUsd }.

const ANTHROPIC_COST_URL = 'https://api.anthropic.com/v1/organizations/cost_report';
const OPENAI_COST_URL = 'https://api.openai.com/v1/organization/costs';
const MAX_PAGES = 12;
const REQUEST_TIMEOUT_MS = 20_000;

export const PROVIDER_LABELS = { anthropic: 'Anthropic', openai: 'OpenAI' };

const adminKey = (provider) =>
  String((provider === 'anthropic' ? process.env.ANTHROPIC_ADMIN_KEY : process.env.OPENAI_ADMIN_KEY) ?? '').trim();

export const isProviderConfigured = (provider) => Boolean(adminKey(provider));

export class ProviderCostError extends Error {}

async function getJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.error?.message ?? body?.error ?? `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      throw new ProviderCostError(`Klíč byl odmítnut (${detail}). Je to admin klíč s právem číst náklady?`);
    }
    throw new ProviderCostError(String(detail));
  }
  return body;
}

// Anthropic: amounts are USD cents as decimal strings, one bucket per day.
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
    const body = await getJson(`${ANTHROPIC_COST_URL}?${params}`, {
      'x-api-key': adminKey('anthropic'),
      'anthropic-version': '2023-06-01',
      'User-Agent': 'WalterSystem/1.0 (finance overview)',
    });
    for (const bucket of body?.data ?? []) {
      const day = String(bucket.starting_at ?? '').slice(0, 10);
      for (const result of bucket.results ?? []) {
        const cents = Number(result.amount);
        if (!day || !Number.isFinite(cents)) continue;
        rows.push({ day, lineItem: result.description || 'Ostatní', model: result.model ?? null, amountUsd: cents / 100 });
      }
    }
    if (!body?.has_more || !body?.next_page) break;
    page = body.next_page;
  }
  return rows;
}

// OpenAI: Unix-second buckets, amount.value in dollars.
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
    const body = await getJson(`${OPENAI_COST_URL}?${params}`, {
      Authorization: `Bearer ${adminKey('openai')}`,
    });
    for (const bucket of body?.data ?? []) {
      const day = new Date(Number(bucket.start_time) * 1000).toISOString().slice(0, 10);
      for (const result of bucket.results ?? []) {
        const value = Number(result.amount?.value);
        if (!Number.isFinite(value)) continue;
        rows.push({ day, lineItem: result.line_item || 'Ostatní', model: null, amountUsd: value });
      }
    }
    if (!body?.has_more || !body?.next_page) break;
    page = body.next_page;
  }
  return rows;
}

/** Daily billed amounts for one provider between two dates (UTC days). */
export async function fetchProviderCosts(provider, from, to) {
  if (!isProviderConfigured(provider)) throw new ProviderCostError('Admin klíč není nastavený.');
  return provider === 'anthropic' ? fetchAnthropic(from, to) : fetchOpenAi(from, to);
}

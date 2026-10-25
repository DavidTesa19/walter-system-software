// CZK exchange rates from the Czech National Bank's daily fixing (public, no
// key). Fetched at most every few hours; if ČNB cannot be reached the last
// known rates are used, and before the first success a fixed fallback that the
// screen labels as such.

const CNB_URL =
  'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';
const MAX_AGE_MS = 6 * 3600 * 1000;
const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000;

// ČNB fixing of 23 Oct 2026, rounded.
const FALLBACK = { date: null, source: 'fallback', rates: { CZK: 1, USD: 21.7, EUR: 24.3 } };

let cached = null;
let lastAttemptAt = 0;

// "23.10.2026 #205" then "země|měna|množství|kód|kurz" lines; the rate is per
// `množství` units and uses a decimal comma.
export function parseCnbRates(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const [day, month, year] = (lines[0]?.match(/^(\d{2})\.(\d{2})\.(\d{4})/) ?? []).slice(1);
  const rates = { CZK: 1 };
  for (const line of lines.slice(2)) {
    const [, , amount, code, rate] = line.split('|');
    const perUnit = Number(String(rate ?? '').replace(',', '.')) / Number(amount);
    if (code && Number.isFinite(perUnit) && perUnit > 0) rates[code.trim()] = perUnit;
  }
  if (!rates.USD || !rates.EUR) throw new Error('ČNB rates are missing USD or EUR');
  return { date: year ? `${year}-${month}-${day}` : null, source: 'cnb', rates };
}

export async function getRates() {
  const now = Date.now();
  const fresh = cached && now - cached.fetchedAt < MAX_AGE_MS;
  if (fresh || now - lastAttemptAt < RETRY_AFTER_FAILURE_MS) return cached ?? FALLBACK;
  lastAttemptAt = now;
  try {
    const response = await fetch(CNB_URL, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`ČNB answered ${response.status}`);
    cached = { ...parseCnbRates(await response.text()), fetchedAt: now };
  } catch (error) {
    console.error('ČNB exchange rates not refreshed:', error.message);
  }
  return cached ?? FALLBACK;
}

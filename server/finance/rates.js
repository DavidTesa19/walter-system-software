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

// ---------- rates of past days (payment history) ----------
//
// ČNB publishes a whole year of daily fixings in one file. A payment is
// converted at the fixing of its own day, or of the last working day before
// it (weekends and holidays have no fixing). Past years are kept for good;
// the current year is re-read every few hours.

const YEAR_URL = (year) =>
  `https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/rok.txt?rok=${year}`;

const years = new Map();

// "Datum|1 AUD|…|1 USD" then "02.01.2025|15,145|…" rows; each column is the
// price of N units, with a decimal comma.
export function parseCnbYear(text) {
  const [header, ...lines] = String(text ?? '').split(/\r?\n/).filter(Boolean);
  const columns = (header ?? '').split('|').slice(1).map((column) => {
    const [amount, code] = column.trim().split(/\s+/);
    return { amount: Number(amount), code };
  });
  const days = [];
  for (const line of lines) {
    const [date, ...values] = line.split('|');
    const [day, month, year] = (date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/) ?? []).slice(1);
    if (!year) continue;
    const rates = { CZK: 1 };
    columns.forEach(({ amount, code }, index) => {
      const value = Number(String(values[index] ?? '').replace(',', '.')) / amount;
      if (code && Number.isFinite(value) && value > 0) rates[code] = value;
    });
    days.push({ day: `${year}-${month}-${day}`, rates });
  }
  return days.sort((a, b) => a.day.localeCompare(b.day));
}

async function loadYear(year) {
  const cachedYear = years.get(year);
  const isCurrent = year === new Date().getUTCFullYear();
  if (cachedYear && (!isCurrent || Date.now() - cachedYear.fetchedAt < MAX_AGE_MS)) return cachedYear.days;
  try {
    const response = await fetch(YEAR_URL(year), { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`ČNB answered ${response.status}`);
    const days = parseCnbYear(await response.text());
    if (!days.length) throw new Error('empty year file');
    years.set(year, { fetchedAt: Date.now(), days });
    return days;
  } catch (error) {
    console.error(`ČNB rates for ${year} not loaded:`, error.message);
    return cachedYear?.days ?? [];
  }
}

/**
 * A lookup for converting payments of the given days (YYYY-MM-DD) to CZK.
 * rate(day, currency) returns { rate, day } — the fixing actually used —
 * or today's rate (marked fallback) when no fixing on or before it is known.
 */
export async function createDayRates(days) {
  const neededYears = new Set();
  for (const day of days) {
    const year = Number(day.slice(0, 4));
    neededYears.add(year);
    neededYears.add(year - 1); // early January falls back to last year's last fixing
  }
  const all = (await Promise.all([...neededYears].sort().map(loadYear))).flat().sort((a, b) => a.day.localeCompare(b.day));
  const today = await getRates();

  return (day, currency) => {
    if (currency === 'CZK') return { rate: 1, day, fallback: false };
    // Binary search for the last fixing on or before `day`.
    let low = 0;
    let high = all.length - 1;
    let found = null;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (all[middle].day <= day) {
        found = all[middle];
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    const rate = found?.rates[currency];
    if (rate) return { rate, day: found.day, fallback: false };
    return { rate: today.rates[currency] ?? 1, day: today.date, fallback: true };
  };
}

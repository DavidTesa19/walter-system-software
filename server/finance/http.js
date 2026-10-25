// JSON over HTTP for the billing connectors, with errors the finance screen
// can show as they are (Czech, no stack traces).

const REQUEST_TIMEOUT_MS = 20_000;

export class ProviderCostError extends Error {}

const errorDetail = (body, status) => {
  const detail =
    body?.error?.message ??
    (typeof body?.error === 'string' ? body.error : null) ??
    body?.errors?.[0]?.message ??
    body?.message ??
    `HTTP ${status}`;
  return String(detail).slice(0, 300);
};

/** fetch → parsed JSON; any non-2xx answer becomes a ProviderCostError. */
export async function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  let response;
  try {
    response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new ProviderCostError(error?.name === 'TimeoutError' ? 'Služba neodpověděla včas.' : 'Službu se nepodařilo zastihnout.');
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = errorDetail(json, response.status);
    if (response.status === 401 || response.status === 403) {
      throw new ProviderCostError(`Klíč byl odmítnut (${detail}). Má právo číst vyúčtování?`);
    }
    throw new ProviderCostError(detail);
  }
  return json;
}

export const env = (name) => String(process.env[name] ?? '').trim();

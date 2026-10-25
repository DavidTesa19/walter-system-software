// Google Cloud (Maps Platform included) has no API that returns costs
// directly; they come from the billing account's export to BigQuery. Setup,
// once, in the Google Cloud console:
//   1. Billing › Billing export › BigQuery export › "Standard usage cost":
//      enable it into a dataset. Data starts from that day (no history).
//   2. IAM › Service accounts: create one, give it "BigQuery Data Viewer" on
//      the dataset and "BigQuery Job User" on its project, create a JSON key.
//   3. On the server: GOOGLE_BILLING_SERVICE_ACCOUNT = the JSON key (as is or
//      base64-encoded), GOOGLE_BILLING_EXPORT_TABLE = project.dataset.table
//      (the table is named gcp_billing_export_v1_…).
// Signing in uses the service account's own key (JWT → OAuth token); no
// Google library needed.

import crypto from 'node:crypto';
import { ProviderCostError, env, requestJson } from './http.js';

const SCOPE = 'https://www.googleapis.com/auth/bigquery';
const TABLE_PATTERN = /^[a-z][a-z0-9-]{4,61}[a-z0-9]\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/;

let cachedToken = null;

const base64url = (value) => Buffer.from(value).toString('base64url');

function serviceAccount() {
  const raw = env('GOOGLE_BILLING_SERVICE_ACCOUNT');
  try {
    const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (!json.client_email || !json.private_key) throw new Error('incomplete');
    return json;
  } catch {
    throw new ProviderCostError('GOOGLE_BILLING_SERVICE_ACCOUNT není platný JSON klíč servisního účtu.');
  }
}

function exportTable() {
  const table = env('GOOGLE_BILLING_EXPORT_TABLE');
  if (!TABLE_PATTERN.test(table)) {
    throw new ProviderCostError('GOOGLE_BILLING_EXPORT_TABLE musí mít tvar projekt.dataset.tabulka.');
  }
  return table;
}

async function accessToken(account) {
  if (cachedToken && cachedToken.email === account.client_email && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 })
  )}`;
  let signature;
  try {
    signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  } catch {
    throw new ProviderCostError('Soukromý klíč servisního účtu Google nejde použít.');
  }
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${unsigned}.${signature}`,
  });
  const json = await requestJson(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  cachedToken = { email: account.client_email, token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

export const isGoogleBillingConfigured = () =>
  Boolean(env('GOOGLE_BILLING_SERVICE_ACCOUNT') && env('GOOGLE_BILLING_EXPORT_TABLE'));

/** Daily cost per Google service (credits such as the Maps free tier already subtracted). */
export async function fetchGoogleBilling(from, to) {
  const account = serviceAccount();
  const table = exportTable();
  const token = await accessToken(account);
  const project = table.split('.')[0];
  const query = `
    SELECT FORMAT_DATE('%F', DATE(usage_start_time, 'Europe/Prague')) AS day,
           service.description AS service,
           currency,
           SUM(cost) + SUM(IFNULL((SELECT SUM(credit.amount) FROM UNNEST(credits) AS credit), 0)) AS amount
      FROM \`${table}\`
     WHERE usage_start_time >= @from AND usage_start_time < @to
     GROUP BY day, service, currency`;
  const parameter = (name, value) => ({ name, parameterType: { type: 'TIMESTAMP' }, parameterValue: { value } });
  const result = await requestJson(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [parameter('from', from.toISOString()), parameter('to', to.toISOString())],
      timeoutMs: 30_000,
    }),
  });
  if (!result.jobComplete) throw new ProviderCostError('BigQuery dotaz nestihl doběhnout, zkuste načíst znovu.');
  if (result.pageToken) console.warn('Google billing: more rows than one page; the rest are not shown.');
  const rows = (result.rows ?? []).map(({ f }) => ({
    day: f[0].v,
    lineItem: f[1].v || 'Google Cloud',
    model: null,
    amount: Number(f[3].v),
    currency: f[2].v || 'USD',
  }));
  return { rows: rows.filter((row) => row.day && Number.isFinite(row.amount)), details: null };
}

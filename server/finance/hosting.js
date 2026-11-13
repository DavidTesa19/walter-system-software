// Analýza › Finance › Hosting: what each part of the Railway setup costs this
// billing period, what it will probably cost by the period's end, and what
// sits inside the database and the backups.
//
// Railway's GraphQL `usage` gives each service's consumption since a date:
// MEMORY_USAGE_GB and DISK_USAGE_GB in GB-minutes, CPU_USAGE in vCPU-minutes,
// NETWORK_TX_GB in GB. Railway bills almost only RAM held (RAILWAY_COSTS.md).
// A service's month is projected from its last hour, so a service
// switched off today is not projected for the rest of the month.
//
// Read with the Finance connector's own account token (RAILWAY_API_TOKEN).

import { ProviderCostError, env, requestJson } from './http.js';

// RAILWAY_API_URL only for local tests against a mock.
const railwayUrl = () => env('RAILWAY_API_URL') || 'https://backboard.railway.com/graphql/v2';

// Railway's price list (2026-11), per unit of each measurement.
export const RAILWAY_PRICES = Object.freeze({
  MEMORY_USAGE_GB: 0.000231, // per GB-minute  ≈ $10 per GB-month
  CPU_USAGE: 0.000463, // per vCPU-minute     ≈ $20 per vCPU-month
  NETWORK_TX_GB: 0.05, // per GB sent out
  DISK_USAGE_GB: 0.00000347, // per GB-minute  ≈ $0.15 per GB-month
  BACKUP_USAGE_GB: 0.00000347, // volume backups, priced like the volume
});
const MEASUREMENTS = Object.keys(RAILWAY_PRICES);
const COST_KEYS = { MEMORY_USAGE_GB: 'memory', CPU_USAGE: 'cpu', NETWORK_TX_GB: 'egress', DISK_USAGE_GB: 'disk', BACKUP_USAGE_GB: 'backup' };

// The Hobby plan: $5 a month, which includes $5 of usage. Czech VAT on top.
export const PLAN = Object.freeze({ feeUsd: 5, includedUsd: 5 });
export const vatRate = () => {
  const raw = String(env('RAILWAY_VAT_RATE') ?? '').trim();
  const value = raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 && value < 1 ? value : 0.21;
};

// What the bill comes to for a usage total: the fee plus anything above the
// included usage, plus VAT.
export const billFor = (usageUsd, vat = vatRate()) => (PLAN.feeUsd + Math.max(0, usageUsd - PLAN.includedUsd)) * (1 + vat);

// What a service is, from its name (Railway knows only the name).
export function serviceRole(name, { deleted = false } = {}) {
  const value = String(name ?? '');
  if (deleted) return { kind: 'deleted', what: 'Služba, která už neexistuje (běžela část období).' };
  if (/period\s*\d/i.test(value)) return { kind: 'paused', what: 'Stará kopie aplikace (snapshot); pozastavená, bez nasazení nic nestojí.' };
  if (/postgres|database|\bdb\b/i.test(value)) return { kind: 'database', what: 'Databáze PostgreSQL: všechna data, nahrané soubory, historie změn a zálohy.' };
  if (/form/i.test(value)) return { kind: 'form', what: 'Veřejný formulář (form.waltersystem.cz), jedna statická stránka.' };
  if (/back|api|server/i.test(value)) return { kind: 'api', what: 'API server: přihlášení, data, Jarvis, noční zálohy.' };
  if (/front|web|app/i.test(value)) return { kind: 'web', what: 'Webová aplikace (app.waltersystem.cz), statické soubory.' };
  return { kind: 'other', what: '' };
}

const minutesBetween = (from, to) => Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / 60000);

// Sums usage rows ({ measurement, value, tags: { serviceId } }) per service.
function byService(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    const id = row?.tags?.serviceId ?? 'unknown';
    const entry = map.get(id) ?? Object.fromEntries(MEASUREMENTS.map((key) => [key, 0]));
    if (row.measurement in entry) entry[row.measurement] += Number(row.value) || 0;
    map.set(id, entry);
  }
  return map;
}

const costOf = (usage) => {
  const costs = {};
  let total = 0;
  for (const key of MEASUREMENTS) {
    const value = (usage?.[key] ?? 0) * RAILWAY_PRICES[key];
    costs[COST_KEYS[key]] = value;
    total += value;
  }
  return { ...costs, total };
};

/**
 * Pure: the per-service breakdown from Railway's usage rows.
 * period:   { start, end } of the billing period
 * current:  usage rows since the period's start, grouped by service
 * recent:   usage rows of the last `recentMinutes` (the current rate)
 * previous: usage rows of the previous period
 * services: [{ id, name }] the project's existing services
 */
export function summariseRailwayUsage({ period, now, current, recent, recentMinutes, previous, services, estimated }) {
  const elapsed = minutesBetween(period.start, now);
  const total = minutesBetween(period.start, period.end);
  const remaining = Math.max(0, total - elapsed);
  const previousMinutes = total; // the previous period has the same length, near enough
  const names = new Map((services ?? []).map((service) => [service.id, service.name]));
  const soFar = byService(current);
  const lately = byService(recent);
  const before = byService(previous);
  const ids = new Set([...soFar.keys(), ...before.keys(), ...names.keys()]);

  const rows = [...ids].map((id) => {
    const deleted = !names.has(id);
    const usage = soFar.get(id);
    const rate = lately.get(id);
    const costs = costOf(usage);
    const rateCosts = costOf(rate);
    const projectedUsd = costs.total + (rateCosts.total / Math.max(1, recentMinutes)) * remaining;
    const previousUsd = costOf(before.get(id)).total;
    return {
      id,
      name: names.get(id) ?? 'Smazaná služba',
      deleted,
      ...serviceRole(names.get(id), { deleted }),
      avgMemoryGb: (usage?.MEMORY_USAGE_GB ?? 0) / elapsed,
      nowMemoryGb: (rate?.MEMORY_USAGE_GB ?? 0) / Math.max(1, recentMinutes),
      avgDiskGb: (usage?.DISK_USAGE_GB ?? 0) / elapsed,
      previousAvgMemoryGb: (before.get(id)?.MEMORY_USAGE_GB ?? 0) / previousMinutes,
      costs,
      soFarUsd: costs.total,
      projectedUsd,
      previousUsd,
    };
  })
    // Services that cost nothing in either period (an empty placeholder) are left out.
    .filter((row) => row.soFarUsd > 0.0005 || row.previousUsd > 0.0005 || !row.deleted)
    .sort((a, b) => b.projectedUsd - a.projectedUsd || b.previousUsd - a.previousUsd);

  const sum = (key) => rows.reduce((acc, row) => acc + row[key], 0);
  const railwayEstimateUsd = (estimated ?? []).reduce((acc, row) => acc + (Number(row.estimatedValue) || 0) * (RAILWAY_PRICES[row.measurement] ?? 0), 0);
  const projectedUsd = sum('projectedUsd');
  const previousUsageUsd = sum('previousUsd');
  const vat = vatRate();
  return {
    period: { start: new Date(period.start).toISOString(), end: new Date(period.end).toISOString(), elapsedShare: Math.min(1, elapsed / total) },
    services: rows,
    totals: {
      soFarUsd: sum('soFarUsd'),
      projectedUsd,
      projectedBillUsd: billFor(projectedUsd, vat),
      railwayEstimateUsd: estimated ? railwayEstimateUsd : null,
      previousUsageUsd,
      previousBillUsd: billFor(previousUsageUsd, vat),
    },
    vatRate: vat,
  };
}

// ---------- Railway API ----------

async function railway(query, variables) {
  const body = await requestJson(railwayUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RAILWAY_API_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (body?.errors?.length) throw new ProviderCostError(body.errors[0]?.message ?? 'Railway API error');
  return body.data;
}

const WORKSPACE = `
  query Workspace($id: String!) {
    workspace(workspaceId: $id) {
      name
      plan
      customer { billingPeriod { start end } }
      projects { edges { node { id name services { edges { node { id name } } } } } }
    }
  }`;

const USAGE = `
  query Usage($project: String!, $start: DateTime!, $end: DateTime!, $measurements: [MetricMeasurement!]!) {
    usage(projectId: $project, measurements: $measurements, groupBy: [SERVICE_ID], startDate: $start, endDate: $end, includeDeleted: true) {
      measurement
      value
      tags { serviceId }
    }
  }`;

const ESTIMATED = `
  query Estimated($project: String!, $measurements: [MetricMeasurement!]!) {
    estimatedUsage(projectId: $project, measurements: $measurements, includeDeleted: true) { measurement estimatedValue }
  }`;

export const isRailwayConfigured = () => Boolean(env('RAILWAY_API_TOKEN'));

// The current period of every project the token sees, summarised.
export async function fetchRailwayHosting({ now = new Date(), recentMinutes = 60 } = {}) {
  if (!isRailwayConfigured()) throw new ProviderCostError('RAILWAY_API_TOKEN není nastavený.');
  const configured = env('RAILWAY_WORKSPACE_ID');
  const workspaces = configured
    ? [{ id: configured }]
    : ((await railway('{ me { workspaces { id name } } }'))?.me?.workspaces ?? []);
  const projects = [];
  for (const { id } of workspaces) {
    const workspace = (await railway(WORKSPACE, { id }))?.workspace;
    const period = workspace?.customer?.billingPeriod;
    if (!period?.start || !period?.end) continue;
    for (const { node: project } of workspace.projects?.edges ?? []) {
      const start = new Date(period.start);
      const end = new Date(period.end);
      const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
      const recentStart = new Date(Math.max(start.getTime(), now.getTime() - recentMinutes * 60000));
      const range = (from, to) => railway(USAGE, { project: project.id, start: from.toISOString(), end: to.toISOString(), measurements: MEASUREMENTS });
      const [current, recent, previous, estimated] = await Promise.all([
        range(start, now),
        range(recentStart, now),
        range(previousStart, start),
        railway(ESTIMATED, { project: project.id, measurements: MEASUREMENTS }).catch(() => null),
      ]);
      projects.push({
        workspace: workspace.name,
        plan: workspace.plan,
        project: project.name,
        ...summariseRailwayUsage({
          period: { start, end },
          now,
          current: current?.usage,
          recent: recent?.usage,
          recentMinutes: Math.max(1, (now.getTime() - recentStart.getTime()) / 60000),
          previous: previous?.usage,
          services: (project.services?.edges ?? []).map(({ node }) => ({ id: node.id, name: node.name })),
          estimated: estimated?.estimatedUsage ?? null,
        }),
      });
    }
  }
  return { fetchedAt: now.toISOString(), projects };
}

// ---------- What is inside the database ----------

// Tables grouped by what they hold. Anything not listed is business data.
const TABLE_GROUPS = [
  { key: 'files', label: 'Nahrané soubory', tables: ['documents', 'document_file_hashes'] },
  { key: 'history', label: 'Historie změn (a smazané soubory pro obnovu)', tables: ['audit_log', 'audit_blobs'] },
  { key: 'backups', label: 'Zálohy uložené v databázi', tables: ['backups', 'backup_files', 'backup_file_refs'] },
  { key: 'telemetry', label: 'Statistiky používání a AI', match: /^(analytics_events|finance_ai_|finance_provider_costs|finance_state)/ },
  { key: 'jarvis', label: 'Konverzace s Jarvisem a chaty', match: /^(jarvis_|conversations|chat_)/ },
  { key: 'screenshots', label: 'Snímky u hlášení chyb', tables: ['bug_report_screenshots'] },
];

export function groupTables(tables) {
  const groups = new Map(TABLE_GROUPS.map((group) => [group.key, { key: group.key, label: group.label, bytes: 0, tables: 0 }]));
  groups.set('business', { key: 'business', label: 'Obchodní data (subjekty, zakázky, úkoly, kalendář…)', bytes: 0, tables: 0 });
  for (const { name, bytes } of tables) {
    const group = TABLE_GROUPS.find((candidate) => candidate.tables?.includes(name) || candidate.match?.test(name));
    const target = groups.get(group?.key ?? 'business');
    target.bytes += Number(bytes) || 0;
    target.tables += 1;
  }
  return [...groups.values()].filter((group) => group.tables > 0).sort((a, b) => b.bytes - a.bytes);
}

export async function databaseBreakdown(pool) {
  const { rows } = await pool.query(
    `SELECT relname AS name, pg_total_relation_size(relid)::bigint AS bytes FROM pg_stat_user_tables`,
  );
  const { rows: [size] } = await pool.query('SELECT pg_database_size(current_database())::bigint AS bytes');
  const groups = groupTables(rows);
  const tablesBytes = groups.reduce((sum, group) => sum + group.bytes, 0);
  const databaseBytes = Number(size.bytes);
  return {
    databaseBytes,
    groups: [...groups, { key: 'system', label: 'Systém Postgresu (katalog, indexy systému)', bytes: Math.max(0, databaseBytes - tablesBytes), tables: 0 }],
  };
}

export async function backupBreakdown(pool) {
  const exists = async (table) => (await pool.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${table}`])).rows[0].ok;
  if (!(await exists('backups'))) return null;
  const { rows: [archives] } = await pool.query(`
    SELECT count(*)::int AS count,
           coalesce(sum(size_bytes), 0)::bigint AS bytes,
           count(*) FILTER (WHERE offsite_status = 'ok')::int AS offsite_ok,
           coalesce(sum(size_bytes) FILTER (WHERE offsite_status = 'ok'), 0)::bigint AS offsite_bytes,
           max(created_at) AS latest
      FROM backups WHERE status = 'ok'`);
  const files = (await exists('backup_files'))
    ? (await pool.query('SELECT count(*)::int AS count, coalesce(sum(size_bytes), 0)::bigint AS bytes FROM backup_files')).rows[0]
    : { count: 0, bytes: 0 };
  return {
    archives: Number(archives.count),
    archiveBytes: Number(archives.bytes),
    offsiteArchives: Number(archives.offsite_ok),
    offsiteArchiveBytes: Number(archives.offsite_bytes),
    offsiteFiles: Number(files.count),
    offsiteFileBytes: Number(files.bytes),
    latest: archives.latest ? new Date(archives.latest).toISOString() : null,
  };
}

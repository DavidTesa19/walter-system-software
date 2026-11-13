// Analýza › Finance › Hosting: Railway usage per service, the bill estimate,
// service roles and what the database holds. Pure; no network, no database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN, RAILWAY_PRICES, billFor, groupTables, serviceRole, summariseRailwayUsage } from '../finance/hosting.js';

const row = (measurement, serviceId, value) => ({ measurement, value, tags: { serviceId } });

test('billFor: the $5 fee covers $5 of usage, VAT on top', () => {
  assert.equal(PLAN.feeUsd, 5);
  assert.ok(Math.abs(billFor(17.26, 0.21) - 20.88) < 0.01); // the 2026-11-12 invoice: $20.89
  assert.ok(Math.abs(billFor(3, 0.21) - 6.05) < 1e-9); // under $5 of usage: the floor
  assert.equal(billFor(5, 0), 5);
});

test('serviceRole reads what a service is from its name', () => {
  assert.equal(serviceRole('Postgres').kind, 'database');
  assert.equal(serviceRole('Back-End').kind, 'api');
  assert.equal(serviceRole('Walter System Front-End').kind, 'web');
  assert.equal(serviceRole('Public Form Page').kind, 'form');
  assert.equal(serviceRole('Back-End Period 0').kind, 'paused');
  assert.equal(serviceRole('Form Page Period 0').kind, 'paused');
  assert.equal(serviceRole('x', { deleted: true }).kind, 'deleted');
});

test('summariseRailwayUsage: per service, projected from the recent rate', () => {
  const period = { start: '2026-11-12T21:00:00Z', end: '2026-12-12T21:00:00Z' };
  const now = new Date('2026-11-13T21:00:00Z'); // one day of 30
  const day = 1440;
  const result = summariseRailwayUsage({
    period,
    now,
    services: [{ id: 'pg', name: 'Postgres' }, { id: 'api', name: 'Back-End' }, { id: 'p0', name: 'Back-End Period 0' }],
    // Postgres 0.5 GB all day and a 1 GB volume; the API 0.2 GB; Period 0 ran
    // 0.1 GB for the first half of the day, then was switched off.
    current: [
      row('MEMORY_USAGE_GB', 'pg', 0.5 * day), row('DISK_USAGE_GB', 'pg', 1 * day),
      row('MEMORY_USAGE_GB', 'api', 0.2 * day), row('NETWORK_TX_GB', 'api', 0.02),
      row('MEMORY_USAGE_GB', 'p0', 0.1 * day / 2),
    ],
    recent: [row('MEMORY_USAGE_GB', 'pg', 0.5 * 360), row('DISK_USAGE_GB', 'pg', 360), row('MEMORY_USAGE_GB', 'api', 0.2 * 360)],
    recentMinutes: 360,
    previous: [row('MEMORY_USAGE_GB', 'pg', 0.73 * 30 * day), row('MEMORY_USAGE_GB', 'gone', 0.2 * 30 * day)],
    estimated: [{ measurement: 'MEMORY_USAGE_GB', estimatedValue: 0.7 * 30 * day }],
  });
  const byName = Object.fromEntries(result.services.map((s) => [s.name, s]));
  // Postgres: 0.5 GB for 30 days ≈ $10.4 plus the disk.
  const pg = byName.Postgres;
  assert.ok(Math.abs(pg.avgMemoryGb - 0.5) < 1e-9);
  assert.ok(Math.abs(pg.nowMemoryGb - 0.5) < 1e-9);
  assert.ok(Math.abs(pg.avgDiskGb - 1) < 1e-9);
  const pgMonth = 0.5 * 30 * day * RAILWAY_PRICES.MEMORY_USAGE_GB + 30 * day * RAILWAY_PRICES.DISK_USAGE_GB;
  assert.ok(Math.abs(pg.projectedUsd - pgMonth) < 1e-6);
  assert.ok(Math.abs(pg.previousUsd - 0.73 * 30 * day * RAILWAY_PRICES.MEMORY_USAGE_GB) < 1e-6);
  // Period 0 is switched off: only its first half-day counts.
  const p0 = byName['Back-End Period 0'];
  assert.equal(p0.kind, 'paused');
  assert.ok(Math.abs(p0.projectedUsd - p0.soFarUsd) < 1e-12);
  // A service gone from the project still shows from the previous period.
  assert.equal(byName['Smazaná služba'].deleted, true);
  assert.ok(result.services[0].name === 'Postgres', 'sorted by the projected cost');
  assert.ok(Math.abs(result.period.elapsedShare - 1 / 30) < 1e-9);
  assert.ok(Math.abs(result.totals.railwayEstimateUsd - 0.7 * 30 * day * RAILWAY_PRICES.MEMORY_USAGE_GB) < 1e-6);
  assert.ok(Math.abs(result.totals.projectedBillUsd - billFor(result.totals.projectedUsd)) < 1e-9);
});

test('groupTables sorts tables into what they hold', () => {
  const groups = groupTables([
    { name: 'documents', bytes: 500 },
    { name: 'document_file_hashes', bytes: 10 },
    { name: 'audit_log', bytes: 40 },
    { name: 'audit_blobs', bytes: 60 },
    { name: 'backups', bytes: 8 },
    { name: 'analytics_events', bytes: 7 },
    { name: 'finance_ai_usage', bytes: 1 },
    { name: 'jarvis_conversations', bytes: 3 },
    { name: 'client_entities', bytes: 5 },
    { name: 'tasks', bytes: 2 },
  ]);
  const by = Object.fromEntries(groups.map((g) => [g.key, g.bytes]));
  assert.deepEqual(by, { files: 510, history: 100, backups: 8, telemetry: 8, jarvis: 3, business: 7 });
  assert.equal(groups[0].key, 'files');
});

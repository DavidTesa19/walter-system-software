// Analýza › Dokumenty and the backup's document read (RAILWAY_COSTS.md step 4):
// owner labels, storage prices, and that the nightly backup takes file hashes
// from document_file_hashes instead of reading every file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_TABLES, STORAGE_PRICES, missingOwnerLabel, ownerLabel, storageCostUsd } from '../documents/overview.js';
import { monthKey, monthlyHistory, nextMonth } from '../documents/history.js';
import { rowSelectSql } from '../safety/backups.js';
import { AUDIT_EXCLUDED_TABLES, BACKUP_EXCLUDED_TABLES, DOCUMENT_HASH_TABLE } from '../safety/tables.js';

test('ownerLabel: code with a person, a company or a future function', () => {
  assert.equal(ownerLabel({ id: 1, entity_id: 'K045', first_name: 'Jan', last_name: 'Novák', company_name: 'X s.r.o.' }), 'K045 · Jan Novák');
  assert.equal(ownerLabel({ id: 2, entity_id: 'P001', first_name: ' ', company_name: 'Alfa a.s.' }), 'P001 · Alfa a.s.');
  assert.equal(ownerLabel({ id: 3, name: 'Export do Excelu' }), 'Export do Excelu');
  assert.equal(ownerLabel({ id: 4 }), '#4');
  assert.equal(ownerLabel(null), null);
});

test('every document entity type maps to a table, section and role', () => {
  assert.deepEqual(Object.keys(OWNER_TABLES).sort(), [
    'clients', 'future-functions', 'growth-clients', 'growth-partners', 'growth-tipers',
    'partners', 'project-clients', 'project-partners', 'project-tipers', 'tipers',
  ]);
  assert.equal(OWNER_TABLES['project-tipers'].section, 'projects');
  assert.equal(OWNER_TABLES['growth-clients'].role, 'client');
});

test('storageCostUsd: disk by the GB, R2 free up to 10 GB', () => {
  const gb = 1024 ** 3;
  const half = storageCostUsd({ diskBytes: gb / 2, offsiteBytes: gb });
  assert.ok(Math.abs(half.disk - STORAGE_PRICES.railwayDiskUsdPerGbMonth / 2) < 1e-9);
  assert.equal(half.offsite, 0);
  const big = storageCostUsd({ diskBytes: 0, offsiteBytes: 12 * gb });
  assert.ok(Math.abs(big.offsite - 2 * STORAGE_PRICES.r2UsdPerGbMonth) < 1e-9);
  assert.equal(big.total, big.disk + big.offsite);
});

test('backup read of documents: hashes from the hash table, never the bytes', () => {
  const columns = ['id', 'filename', 'data', 'size_bytes'];
  const withTable = rowSelectSql('documents', columns, { hashTable: true });
  assert.match(withTable, /LEFT JOIN document_file_hashes h ON h\.document_id = t\.id/);
  assert.match(withTable, /coalesce\(h\.sha256, encode\(sha256\(t\.data\), 'hex'\)\) AS data_sha256/);
  assert.doesNotMatch(withTable, /t\."data",/, 'the file bytes are not selected');
  const without = rowSelectSql('documents', columns);
  assert.match(without, /encode\(sha256\(t\.data\), 'hex'\) AS data_sha256/);
  assert.match(rowSelectSql('clients', ['id', 'name']), /SELECT t\."id", t\."name" FROM "clients" t ORDER BY t\.id/);
});

test('the hash table is kept out of the change log and the backups', () => {
  assert.equal(DOCUMENT_HASH_TABLE, 'document_file_hashes');
  assert.ok(AUDIT_EXCLUDED_TABLES.has(DOCUMENT_HASH_TABLE));
  assert.ok(BACKUP_EXCLUDED_TABLES.has(DOCUMENT_HASH_TABLE));
});

test('missingOwnerLabel names the section and role of a deleted subject', () => {
  assert.equal(missingOwnerLabel('project-clients', 25), 'Smazaný subjekt · Neveřejné klient #25');
  assert.equal(missingOwnerLabel('tipers', 3), 'Smazaný subjekt · Veřejné tipař #3');
  assert.equal(missingOwnerLabel('future-functions', 7), 'Smazaná funkce #7');
  assert.equal(missingOwnerLabel('odd-type', 1), 'odd-type #1');
});

test('monthKey and nextMonth work in Prague time across a year end', () => {
  // 23:30 UTC on 31 Dec is already January in Prague.
  assert.equal(monthKey('2025-12-31T23:30:00Z'), '2026-01');
  assert.equal(monthKey('not a date'), null);
  assert.equal(nextMonth('2025-12'), '2026-01');
  assert.equal(nextMonth('2026-04'), '2026-05');
});

test('monthlyHistory: totals, empty months, deletions and the projection', () => {
  const MB = 1024 ** 2;
  const history = monthlyHistory({
    files: [
      { createdAt: '2026-04-10T10:00:00Z', sizeBytes: 10 * MB },
      { createdAt: '2026-04-20T10:00:00Z', sizeBytes: 5 * MB },
      { createdAt: '2026-06-02T10:00:00Z', sizeBytes: 3 * MB },
    ],
    deletions: [{ createdAt: '2026-05-01T10:00:00Z', deletedAt: '2026-07-15T10:00:00Z', sizeBytes: 4 * MB }],
    now: new Date('2026-08-05T10:00:00Z'),
    prices: STORAGE_PRICES,
    usdCzk: 20,
  });
  assert.deepEqual(history.months.map((m) => m.month), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  assert.deepEqual(history.months.map((m) => m.totalBytes / MB), [15, 19, 22, 18, 18]);
  assert.deepEqual(history.months.map((m) => m.totalCount), [2, 3, 4, 3, 3]);
  const july = history.months[3];
  assert.equal(july.removedBytes, 4 * MB);
  assert.equal(july.netBytes, -4 * MB);
  // 18 MB at $0.15/GB and 20 Kč/$.
  assert.ok(Math.abs(history.summary.costCzk - (18 / 1024) * 0.15 * 20) < 1e-9);
  assert.equal(history.summary.costPerGbCzk, 3);
  assert.equal(history.summary.averagedMonths, 5);
  assert.ok(Math.abs(history.summary.avgMonthlyBytes - (18 * MB) / 5) < 1);
  assert.equal(history.summary.busiestMonth.month, '2026-04');
  assert.deepEqual(monthlyHistory({ prices: STORAGE_PRICES, usdCzk: 20 }).months, []);
});

test('repairFilename: latin1-mangled names come back, others stay', async () => {
  const { repairFilename } = await import('../documents/orphans.js');
  // What the bug stored: the browser's UTF-8 bytes read as latin1 (macOS sends
  // names decomposed, Windows composed).
  const mangle = (name, form = 'NFC') => Buffer.from(name.normalize(form), 'utf8').toString('latin1');
  assert.equal(repairFilename(mangle('Ruská LOI návrh.docx', 'NFD')), 'Ruská LOI návrh.docx');
  assert.equal(repairFilename(mangle('ČD Na Švihance.pdf', 'NFD')), 'ČD Na Švihance.pdf');
  assert.equal(repairFilename(mangle('260218_Laboratorní výsledky.pdf')), '260218_Laboratorní výsledky.pdf');
  // Mangled some other way: the repair would give "Z†mek", so the name stays.
  assert.equal(repairFilename('Zâ mek Jablonnâ  - foto.pdf'), 'Zâ mek Jablonnâ  - foto.pdf');
  assert.equal(repairFilename('Zámek Jablonná'), 'Zámek Jablonná');
  assert.equal(repairFilename('Ořechovka.pdf'), 'Ořechovka.pdf');
  assert.equal(repairFilename('plain.pdf'), 'plain.pdf');
});

test('planOwnerMove: one top folder moves as is, anything else gets a wrapper', async () => {
  const { planOwnerMove, parseOwnerKey } = await import('../documents/orphans.js');
  const single = planOwnerMove([
    { id: 1, item_kind: 'folder', parent_id: null, filename: 'Developerský projekt Plzeň' },
    { id: 2, item_kind: 'file', parent_id: 1, filename: 'a.pdf' },
  ], { fallbackName: 'Bývalý subjekt #25' });
  assert.equal(single.wrapperName, null);
  assert.deepEqual(single.rootIds, []);

  const loose = planOwnerMove([
    { id: 3, item_kind: 'file', parent_id: null, filename: 'x.pdf' },
    { id: 4, item_kind: 'file', parent_id: null, filename: Buffer.from('Materiál.pdf'.normalize('NFD'), 'utf8').toString('latin1') },
  ], { fallbackName: 'Bývalý subjekt #28' });
  assert.equal(loose.wrapperName, 'Bývalý subjekt #28');
  assert.deepEqual(loose.rootIds, [3, 4]);
  assert.deepEqual(loose.renames, [{ id: 4, filename: 'Materiál.pdf' }]);

  const several = planOwnerMove([
    { id: 5, item_kind: 'folder', parent_id: null, filename: 'Klecany' },
    { id: 6, item_kind: 'folder', parent_id: null, filename: 'Ralsko' },
    { id: 7, item_kind: 'file', parent_id: 99, filename: 'orphan-parent.pdf' },
  ], { fallbackName: 'Bývalý subjekt #27', repairNames: false });
  assert.equal(several.wrapperName, 'Klecany, Ralsko');
  assert.deepEqual(several.rootIds, [5, 6, 7]);
  assert.deepEqual(several.renames, []);

  assert.deepEqual(parseOwnerKey('project-clients:25'), { entityType: 'project-clients', entityId: 25 });
  assert.equal(parseOwnerKey('x:y'), null);
});

// Analýza › Dokumenty and the backup's document read (RAILWAY_COSTS.md step 4):
// owner labels, storage prices, and that the nightly backup takes file hashes
// from document_file_hashes instead of reading every file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_TABLES, STORAGE_PRICES, ownerLabel, storageCostUsd } from '../documents/overview.js';
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

// Database backups: nightly snapshots with tiered retention, off-site copies,
// and a restore that applies only the differences.
//
// A backup is two things:
//   - an archive: every table's rows as JSON, gzipped. Small (the business data
//     is a few MB), so a copy always stays in the `backups` table as well.
//   - the document files, stored off-site once per distinct file (by SHA-256)
//     and referenced from every archive that contains them. 400+ MB of files
//     are uploaded once, not every night.
//
// A restore does not wipe and reload. It works out which rows differ from the
// backup and changes only those, inside one transaction, so every restored row
// goes through the change log under one changeset — a restore can itself be
// reverted, and a safety backup is taken right before it as well.

import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { currentActor, runWithContext } from './context.js';
import { createOffsiteStorage, getOffsiteConfig, isEncryptionConfigured } from './offsite.js';
import { SafetyError } from './pg-store.js';
import { valuesEqual } from './revert.js';
import {
  BACKUP_EXCLUDED_TABLES,
  RESTORE_GROUPS,
  SAFETY_TABLES,
  isSafeIdentifier,
  quoteIdent,
  restoreGroupOf,
  tableLabel,
} from './tables.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const ARCHIVE_FORMAT = 'walter-backup';
export const ARCHIVE_VERSION = 1;

// How long each kind of backup is kept. The nightly job makes one backup a
// day: on the 1st of the month it is a monthly, on Sundays a weekly, otherwise
// a daily — so there is always one per day for the last week, one per week for
// five weeks and one per month for a year.
export const RETENTION_DAYS = { daily: 7, weekly: 35, monthly: 365, safety: 14, manual: null };
const FAILED_RETENTION_DAYS = 14;
// Retention never deletes the newest successful backups, whatever their age.
const ALWAYS_KEEP_LATEST = 3;
const INSERT_BATCH = 200;
// Each upload holds one whole file in memory (up to 50 MB).
const UPLOAD_CONCURRENCY = 3;
const VERIFY_SAMPLE = 20;

export const BACKUP_KIND_LABELS = {
  daily: 'Denní',
  weekly: 'Týdenní',
  monthly: 'Měsíční',
  safety: 'Bezpečnostní',
  manual: 'Ruční',
};

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function mapWithConcurrency(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function listColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND is_generated <> 'ALWAYS'
      ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((row) => row.column_name);
}

// Rows are matched on the table's primary key — `id` almost everywhere, but
// entity_counters is keyed by entity_type, and it is the table that keeps the
// subject codes (K001…) unique, so it must come back too.
async function primaryKeyOf(client, table) {
  const { rows } = await client.query(
    `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary
      ORDER BY array_position(i.indkey::int2[], a.attnum)`,
    [`public.${quoteIdent(table)}`]
  );
  return rows.map((row) => row.attname);
}

async function listPublicTables(client) {
  const { rows } = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
  return rows.map((row) => row.tablename).filter(isSafeIdentifier);
}

// Parents before children, following every foreign key between the tables.
async function orderByDependencies(client, tables) {
  const { rows } = await client.query(`
    SELECT child.relname AS child, parent.relname AS parent
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_class parent ON parent.oid = c.confrelid
     WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
  `);
  const wanted = new Set(tables);
  const parentsOf = new Map(tables.map((table) => [table, new Set()]));
  for (const { child, parent } of rows) {
    if (child !== parent && wanted.has(child) && wanted.has(parent)) parentsOf.get(child).add(parent);
  }
  const ordered = [];
  const done = new Set();
  const visit = (table, trail = new Set()) => {
    if (done.has(table) || trail.has(table)) return;
    trail.add(table);
    for (const parent of parentsOf.get(table) ?? []) visit(parent, trail);
    done.add(table);
    ordered.push(table);
  };
  for (const table of [...tables].sort()) visit(table);
  return ordered;
}

const rowSelectSql = (table, columns) => {
  const list = columns.filter((column) => !(table === 'documents' && column === 'data')).map(quoteIdent).join(', ');
  const extra = table === 'documents'
    ? `, encode(sha256(data), 'hex') AS data_sha256, octet_length(data) AS data_size`
    : '';
  const order = columns.includes('id') ? ' ORDER BY id' : '';
  return `SELECT to_jsonb(x) AS row FROM (SELECT ${list}${extra} FROM ${quoteIdent(table)}${order}) x`;
};

export async function readArchiveBuffer(buffer) {
  const archive = JSON.parse((await gunzip(buffer)).toString('utf8'));
  if (archive?.format !== ARCHIVE_FORMAT || typeof archive.tables !== 'object') {
    throw new SafetyError('Soubor není záloha Walter System.', 422);
  }
  if (archive.version > ARCHIVE_VERSION) {
    throw new SafetyError(`Záloha má novější formát (${archive.version}), než tato verze aplikace umí načíst.`, 422);
  }
  return archive;
}

export function selectArchiveTables(archive, groups) {
  const chosen = new Set(Array.isArray(groups) && groups.length > 0
    ? groups
    : RESTORE_GROUPS.filter((group) => group.defaultSelected).map((group) => group.id));
  return Object.keys(archive.tables).filter((table) =>
    isSafeIdentifier(table) && !SAFETY_TABLES.has(table) && chosen.has(restoreGroupOf(table))
  );
}

/**
 * Make the selected tables match the archive. Runs inside the caller's
 * transaction on `client`; with dryRun it only counts.
 *
 * fetchFile(sha) -> Buffer|null is asked for document bytes that are not in
 * the database any more.
 */
export async function applyArchive(client, archive, {
  tables,
  dryRun = false,
  fetchFile = async () => null,
  fileExists = async () => false,
  protectUserId = null,
} = {}) {
  const existingTables = new Set(await listPublicTables(client));
  const targetTables = tables.filter((table) => existingTables.has(table));
  const ordered = await orderByDependencies(client, targetTables);
  const summary = new Map(ordered.map((table) => [table, { table, label: tableLabel(table), inserted: 0, updated: 0, deleted: 0 }]));
  const missingFiles = [];
  const skippedTables = [];
  const columnsOf = new Map();
  const keyColumnsOf = new Map();
  for (const table of ordered) {
    columnsOf.set(table, await listColumns(client, table));
    keyColumnsOf.set(table, await primaryKeyOf(client, table));
  }
  const keyOf = (table, row) => JSON.stringify(keyColumnsOf.get(table).map((column) => row[column] ?? null));
  const keyMatch = (table) => keyColumnsOf.get(table).map((column) => `t.${quoteIdent(column)} = r.${quoteIdent(column)}`).join(' AND ');
  const restorable = ordered.filter((table) => {
    if (keyColumnsOf.get(table).length > 0) return true;
    skippedTables.push(table);
    return false;
  });

  // 1. Rows that are not in the backup go, children first. Accounts are never
  //    deleted by a restore — that could lock out whoever is restoring.
  for (const table of [...restorable].reverse()) {
    if (table === 'users' || table === 'user_palettes') continue;
    const keyColumns = keyColumnsOf.get(table);
    const keep = new Set((archive.tables[table]?.rows ?? []).map((row) => keyOf(table, row)));
    const { rows } = await client.query(
      `SELECT to_jsonb(x) AS row FROM (SELECT ${keyColumns.map(quoteIdent).join(', ')} FROM ${quoteIdent(table)}) x`
    );
    const extra = rows.map(({ row }) => row).filter((row) => !keep.has(keyOf(table, row)));
    if (extra.length === 0) continue;
    summary.get(table).deleted += extra.length;
    if (!dryRun) {
      for (const batch of chunk(extra, 500)) {
        await client.query(
          `DELETE FROM ${quoteIdent(table)} AS t
            USING jsonb_populate_recordset(NULL::${quoteIdent(table)}, $1::jsonb) AS r
            WHERE ${keyMatch(table)}`,
          [JSON.stringify(batch)]
        );
      }
    }
  }

  // 2. Missing rows come back and changed rows are set back, parents first.
  let documentHashes = null;
  for (const table of restorable) {
    const columns = columnsOf.get(table);
    const keyColumns = keyColumnsOf.get(table);
    const columnSet = new Set(columns);
    const archiveRows = archive.tables[table]?.rows ?? [];
    const { rows: currentRows } = await client.query(rowSelectSql(table, columns));
    const current = new Map(currentRows.map(({ row }) => [keyOf(table, row), row]));

    const toInsert = [];
    const toUpdate = [];
    for (const row of archiveRows) {
      if (table === 'users' && protectUserId != null && String(row.id) === String(protectUserId)) continue;
      const now = current.get(keyOf(table, row));
      if (!now) {
        toInsert.push(row);
        continue;
      }
      const differs = Object.keys(row).some((key) =>
        (columnSet.has(key) || key === 'data_sha256') && key !== 'data' && !valuesEqual(row[key], now[key])
      );
      if (differs) toUpdate.push({ row, fileChanged: table === 'documents' && row.data_sha256 !== now.data_sha256 });
    }

    summary.get(table).inserted += toInsert.length;
    summary.get(table).updated += toUpdate.length;

    const fields = (row) => Object.keys(row).filter((key) => columnSet.has(key) && key !== 'data');

    if (table === 'documents') {
      if (!documentHashes) {
        const { rows } = await client.query(`SELECT DISTINCT ON (sha) id, sha FROM (SELECT id, encode(sha256(data), 'hex') AS sha FROM documents) d`);
        documentHashes = new Map(rows.map((row) => [row.sha, row.id]));
      }
      const bytesFor = async (sha) => {
        if (!sha) return null;
        if (documentHashes.has(sha)) {
          const { rows } = await client.query('SELECT data FROM documents WHERE id = $1', [documentHashes.get(sha)]);
          if (rows[0]) return rows[0].data;
        }
        const { rows } = await client.query('SELECT data FROM audit_blobs WHERE sha256 = $1 LIMIT 1', [sha]);
        if (rows[0]) return rows[0].data;
        return fetchFile(sha);
      };

      // A dry run only checks the bytes can be found, without downloading them.
      const canFind = async (sha) => {
        if (!sha) return false;
        if (documentHashes.has(sha)) return true;
        const { rows } = await client.query(
          'SELECT EXISTS (SELECT 1 FROM audit_blobs WHERE sha256 = $1) AS found',
          [sha]
        );
        return rows[0].found || fileExists(sha);
      };

      for (const row of toInsert) {
        if (dryRun) {
          if (!(await canFind(row.data_sha256))) missingFiles.push({ id: row.id, filename: row.filename });
          continue;
        }
        const data = await bytesFor(row.data_sha256);
        if (!data) {
          missingFiles.push({ id: row.id, filename: row.filename });
          summary.get(table).inserted -= 1;
          continue;
        }
        const keys = fields(row);
        await client.query(
          `INSERT INTO documents (${keys.map(quoteIdent).join(', ')}, data)
           SELECT ${keys.map((key) => `r.${quoteIdent(key)}`).join(', ')}, $2
             FROM jsonb_populate_record(NULL::documents, $1::jsonb) AS r`,
          [JSON.stringify(row), data]
        );
      }
      for (const { row, fileChanged } of toUpdate) {
        if (dryRun) {
          if (fileChanged && !(await canFind(row.data_sha256))) missingFiles.push({ id: row.id, filename: row.filename });
          continue;
        }
        const keys = fields(row).filter((key) => key !== 'id');
        if (keys.length > 0) {
          await client.query(
            `UPDATE documents AS t SET ${keys.map((key) => `${quoteIdent(key)} = r.${quoteIdent(key)}`).join(', ')}
               FROM jsonb_populate_record(NULL::documents, $1::jsonb) AS r WHERE t.id = r.id`,
            [JSON.stringify(row)]
          );
        }
        if (fileChanged) {
          const data = await bytesFor(row.data_sha256);
          if (data) {
            await client.query('UPDATE documents SET data = $1 WHERE id = $2', [data, row.id]);
          } else {
            missingFiles.push({ id: row.id, filename: row.filename });
          }
        }
      }
    } else if (!dryRun) {
      // Rows of one table share their columns, so batch them.
      for (const batch of chunk(toInsert, INSERT_BATCH)) {
        const keys = [...new Set(batch.flatMap(fields))];
        await client.query(
          `INSERT INTO ${quoteIdent(table)} (${keys.map(quoteIdent).join(', ')})
           SELECT ${keys.map((key) => `r.${quoteIdent(key)}`).join(', ')}
             FROM jsonb_populate_recordset(NULL::${quoteIdent(table)}, $1::jsonb) AS r`,
          [JSON.stringify(batch)]
        );
      }
      for (const batch of chunk(toUpdate.map(({ row }) => row), INSERT_BATCH)) {
        const keys = [...new Set(batch.flatMap(fields))].filter((key) => !keyColumns.includes(key));
        if (keys.length === 0) continue;
        await client.query(
          `UPDATE ${quoteIdent(table)} AS t SET ${keys.map((key) => `${quoteIdent(key)} = r.${quoteIdent(key)}`).join(', ')}
             FROM jsonb_populate_recordset(NULL::${quoteIdent(table)}, $1::jsonb) AS r WHERE ${keyMatch(table)}`,
          [JSON.stringify(batch)]
        );
      }
    }

    if (!dryRun && toInsert.length > 0 && columnSet.has('id')) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${quoteIdent(table)}), 1))`,
        [table]
      );
    }
  }

  const tablesSummary = [...summary.values()].filter((item) => item.inserted || item.updated || item.deleted);
  return {
    tables: tablesSummary,
    totals: tablesSummary.reduce((acc, item) => ({
      inserted: acc.inserted + item.inserted,
      updated: acc.updated + item.updated,
      deleted: acc.deleted + item.deleted,
    }), { inserted: 0, updated: 0, deleted: 0 }),
    missingFiles,
    skippedTables,
  };
}

const toBackupSummary = (row) => ({
  id: Number(row.id),
  kind: row.kind,
  kindLabel: BACKUP_KIND_LABELS[row.kind] ?? row.kind,
  status: row.status,
  note: row.note,
  createdAt: row.created_at,
  finishedAt: row.finished_at,
  expiresAt: row.expires_at,
  createdBy: row.created_by_name,
  tableCounts: row.table_counts,
  sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
  fileCount: row.file_count,
  fileBytes: row.file_bytes == null ? null : Number(row.file_bytes),
  offsiteStatus: row.offsite_status,
  offsiteError: row.offsite_error,
  encrypted: row.encrypted,
  storedInDatabase: Boolean(row.has_archive),
  checksum: row.checksum,
  error: row.error,
});

const SUMMARY_COLUMNS = `id, kind, status, note, created_at, finished_at, expires_at, created_by_name, table_counts,
  size_bytes, file_count, file_bytes, offsite_status, offsite_key, offsite_error, encrypted, checksum, error,
  (archive IS NOT NULL) AS has_archive`;

export function createPgBackupService({ pool, onBackupFailed = async () => {} }) {
  const offsite = createOffsiteStorage();

  // Spot-check that files the index says are off-site really are. If any is
  // gone (the bucket was emptied, say), forget the whole index so this backup
  // uploads everything again.
  async function verifyStoredFiles() {
    const { rows } = await pool.query(
      `SELECT sha256 FROM backup_files WHERE location = $1 ORDER BY random() LIMIT ${VERIFY_SAMPLE}`,
      [offsite.location]
    );
    for (const { sha256: hash } of rows) {
      if (!(await offsite.exists(offsite.fileKey(hash)))) {
        await pool.query('DELETE FROM backup_files WHERE location = $1', [offsite.location]);
        console.warn('⚠ Off-site files were missing from the bucket; re-uploading all of them.');
        return false;
      }
    }
    return true;
  }

  async function uploadFiles(snapshotFiles) {
    if (!offsite || snapshotFiles.size === 0) return { uploaded: 0, missing: [] };
    await verifyStoredFiles();
    const hashes = [...snapshotFiles.keys()];
    const { rows } = await pool.query(
      'SELECT sha256 FROM backup_files WHERE location = $1 AND sha256 = ANY($2::text[])',
      [offsite.location, hashes]
    );
    const stored = new Set(rows.map((row) => row.sha256));
    const pending = hashes.filter((hash) => !stored.has(hash));
    const missing = [];
    let uploaded = 0;
    await mapWithConcurrency(pending, UPLOAD_CONCURRENCY, async (hash) => {
      const { documentId } = snapshotFiles.get(hash);
      let { rows: found } = await pool.query('SELECT data FROM documents WHERE id = $1', [documentId]);
      if (!found[0] || sha256(found[0].data) !== hash) {
        ({ rows: found } = await pool.query('SELECT data FROM audit_blobs WHERE sha256 = $1 LIMIT 1', [hash]));
      }
      const data = found[0]?.data;
      if (!data || sha256(data) !== hash) {
        missing.push(hash);
        return;
      }
      await offsite.put(offsite.fileKey(hash), data);
      await pool.query(
        'INSERT INTO backup_files (location, sha256, size_bytes) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [offsite.location, hash, data.length]
      );
      uploaded += 1;
    });
    return { uploaded, missing };
  }

  async function fetchOffsiteFile(hash) {
    if (!offsite) return null;
    try {
      const data = await offsite.get(offsite.fileKey(hash));
      return sha256(data) === hash ? data : null;
    } catch {
      return null;
    }
  }

  async function offsiteFileExists(hash) {
    if (!offsite) return false;
    return offsite.exists(offsite.fileKey(hash)).catch(() => false);
  }

  async function loadArchive(row) {
    if (row.archive) return readArchiveBuffer(row.archive);
    if (row.offsite_key && offsite) return readArchiveBuffer(await offsite.get(row.offsite_key));
    throw new SafetyError('Data této zálohy nejsou k dispozici.', 410);
  }

  async function getBackupRow(id, { withArchive = false } = {}) {
    const { rows } = await pool.query(
      `SELECT ${SUMMARY_COLUMNS}${withArchive ? ', archive' : ''} FROM backups WHERE id = $1`,
      [Number(id)]
    );
    if (!rows[0]) throw new SafetyError('Záloha nenalezena.', 404);
    return rows[0];
  }

  const service = {
    offsiteConfigured: Boolean(offsite),

    describeConfig() {
      const config = getOffsiteConfig();
      return {
        offsite: offsite ? { configured: true, ...offsite.describe() } : { configured: false },
        encryption: isEncryptionConfigured(),
        retentionDays: RETENTION_DAYS,
        alwaysKeepLatest: ALWAYS_KEEP_LATEST,
        schedule: {
          enabled: process.env.BACKUP_SCHEDULE_DISABLED !== 'true',
          hour: Number(process.env.BACKUP_HOUR ?? 2),
          timeZone: 'Europe/Prague',
        },
        prefix: config.prefix,
      };
    },

    async list() {
      const { rows } = await pool.query(`SELECT ${SUMMARY_COLUMNS} FROM backups ORDER BY created_at DESC LIMIT 200`);
      return rows.map(toBackupSummary);
    },

    async createBackup({ kind = 'manual', note = null } = {}) {
      if (!(kind in RETENTION_DAYS)) throw new SafetyError('Neznámý typ zálohy.');
      const actor = currentActor();
      const lockClient = await pool.connect();
      let backupId = null;
      try {
        const { rows: lock } = await lockClient.query(`SELECT pg_try_advisory_lock(hashtext('walter_backup_run')) AS ok`);
        if (!lock[0].ok) throw new SafetyError('Jiná záloha právě probíhá, zkuste to za chvíli.', 409);
        try {
          const { rows: inserted } = await pool.query(
            `INSERT INTO backups (kind, status, note, created_by_user_id, created_by_name)
             VALUES ($1, 'running', $2, $3, $4) RETURNING id, created_at`,
            [kind, note, actor.userId, actor.username ?? (actor.type === 'system' ? 'Systém' : null)]
          );
          backupId = inserted[0].id;
          const createdAt = inserted[0].created_at;

          // One consistent snapshot of every table.
          const snapClient = await pool.connect();
          const archiveTables = {};
          const tableCounts = {};
          const files = new Map();
          let serverVersion = null;
          try {
            await snapClient.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            serverVersion = (await snapClient.query('SHOW server_version')).rows[0].server_version;
            for (const table of await listPublicTables(snapClient)) {
              if (BACKUP_EXCLUDED_TABLES.has(table)) continue;
              const columns = await listColumns(snapClient, table);
              const { rows } = await snapClient.query(rowSelectSql(table, columns));
              const tableRows = rows.map((r) => r.row);
              archiveTables[table] = { columns, rows: tableRows };
              tableCounts[table] = tableRows.length;
              if (table === 'documents') {
                for (const doc of tableRows) {
                  if (doc.data_sha256 && !files.has(doc.data_sha256)) {
                    files.set(doc.data_sha256, { documentId: doc.id, size: Number(doc.data_size ?? 0) });
                  }
                }
              }
            }
            await snapClient.query('COMMIT');
          } catch (error) {
            await snapClient.query('ROLLBACK').catch(() => {});
            throw error;
          } finally {
            snapClient.release();
          }

          const fileBytes = [...files.values()].reduce((sum, file) => sum + file.size, 0);
          const archive = {
            format: ARCHIVE_FORMAT,
            version: ARCHIVE_VERSION,
            backupId: Number(backupId),
            kind,
            note,
            createdAt: new Date(createdAt).toISOString(),
            postgres: serverVersion,
            tables: archiveTables,
            files: { count: files.size, bytes: fileBytes },
          };
          const archiveBuffer = await gzip(Buffer.from(JSON.stringify(archive)));

          let offsiteStatus = 'disabled';
          let offsiteKey = null;
          let offsiteError = null;
          if (offsite) {
            try {
              const { missing } = await uploadFiles(files);
              offsiteKey = offsite.archiveKey(backupId, kind, createdAt);
              await offsite.put(offsiteKey, archiveBuffer);
              offsiteStatus = missing.length > 0 ? 'partial' : 'ok';
              if (missing.length > 0) offsiteError = `${missing.length} souborů se nepodařilo načíst.`;
            } catch (error) {
              offsiteStatus = 'failed';
              offsiteError = error.message;
            }
          }

          if (files.size > 0) {
            await pool.query(
              `INSERT INTO backup_file_refs (backup_id, sha256)
               SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
              [backupId, [...files.keys()]]
            );
          }

          const retention = RETENTION_DAYS[kind];
          const { rows: finished } = await pool.query(
            `UPDATE backups SET
               status = 'ok', finished_at = now(), archive = $2, size_bytes = $3, table_counts = $4::jsonb,
               file_count = $5, file_bytes = $6, offsite_status = $7, offsite_key = $8, offsite_error = $9,
               encrypted = $10, checksum = $11,
               expires_at = CASE WHEN $12::int IS NULL THEN NULL ELSE created_at + ($12::int * interval '1 day') END
             WHERE id = $1 RETURNING ${SUMMARY_COLUMNS}`,
            [backupId, archiveBuffer, archiveBuffer.length, JSON.stringify(tableCounts), files.size, fileBytes,
              offsiteStatus, offsiteKey, offsiteError, Boolean(offsite) && isEncryptionConfigured(),
              sha256(archiveBuffer), retention]
          );
          const summary = toBackupSummary(finished[0]);
          if (offsiteStatus === 'failed') {
            await onBackupFailed(summary, new Error(`Off-site kopie selhala: ${offsiteError}`));
          }
          return summary;
        } finally {
          await lockClient.query(`SELECT pg_advisory_unlock(hashtext('walter_backup_run'))`).catch(() => {});
        }
      } catch (error) {
        if (backupId != null) {
          await pool.query(
            `UPDATE backups SET status = 'failed', finished_at = now(), error = $2,
               expires_at = now() + ($3::int * interval '1 day') WHERE id = $1`,
            [backupId, error.message, FAILED_RETENTION_DAYS]
          ).catch(() => {});
          await onBackupFailed({ id: Number(backupId), kind }, error).catch(() => {});
        }
        throw error;
      } finally {
        lockClient.release();
      }
    },

    async download(id) {
      const row = await getBackupRow(id, { withArchive: true });
      if (row.status !== 'ok') throw new SafetyError('Záloha není dokončená.', 409);
      const buffer = row.archive ?? (row.offsite_key && offsite ? await offsite.get(row.offsite_key) : null);
      if (!buffer) throw new SafetyError('Data této zálohy nejsou k dispozici.', 410);
      const stamp = new Date(row.created_at).toISOString().slice(0, 16).replace(/[:T]/g, '-');
      return { buffer, filename: `walter-zaloha-${row.id}-${stamp}.json.gz` };
    },

    async restore(id, { groups, dryRun = false } = {}) {
      const row = await getBackupRow(id, { withArchive: true });
      if (row.status !== 'ok') throw new SafetyError('Z nedokončené zálohy nelze obnovovat.', 409);
      const archive = await loadArchive(row);
      const tables = selectArchiveTables(archive, groups);
      if (tables.length === 0) throw new SafetyError('Vyberte, co se má obnovit.');
      const actor = currentActor();

      let safetyBackup = null;
      if (!dryRun) {
        safetyBackup = await service.createBackup({
          kind: 'safety',
          note: `Před obnovou ze zálohy #${row.id}`,
        });
      }

      const createdLabel = new Date(row.created_at).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });
      return runWithContext({
        changesetId: `restore-${crypto.randomUUID()}`,
        note: `Obnova ze zálohy #${row.id} (${createdLabel})`,
        reverts: `backup:${row.id}`,
      }, async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query("SELECT set_config('walter.allow_mass_delete', 'on', true)");
          const result = await applyArchive(client, archive, {
            tables,
            dryRun,
            fetchFile: fetchOffsiteFile,
            fileExists: offsiteFileExists,
            protectUserId: actor.userId,
          });
          await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
          return { ...result, dryRun, backupId: Number(row.id), safetyBackupId: safetyBackup?.id ?? null };
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          client.release();
        }
      });
    },

    async remove(id) {
      const row = await getBackupRow(id);
      if (row.status === 'running') throw new SafetyError('Probíhající zálohu nelze smazat.', 409);
      const { rows: newest } = await pool.query(
        `SELECT id FROM backups WHERE status = 'ok' ORDER BY created_at DESC LIMIT ${ALWAYS_KEEP_LATEST}`
      );
      if (row.status === 'ok' && newest.some((item) => String(item.id) === String(row.id))) {
        throw new SafetyError(`Nejnovější ${ALWAYS_KEEP_LATEST} zálohy nelze smazat.`, 409);
      }
      await pool.query('DELETE FROM backups WHERE id = $1', [row.id]);
      if (row.offsite_key && offsite) await offsite.remove(row.offsite_key).catch(() => {});
      await service.collectUnusedFiles();
      return { deleted: Number(row.id) };
    },

    // Expired backups go, but never the newest few successful ones.
    async purgeExpired() {
      const { rows } = await pool.query(
        `DELETE FROM backups
          WHERE id IN (
            SELECT id FROM backups
             WHERE expires_at IS NOT NULL AND expires_at < now() AND status <> 'running'
               AND id NOT IN (SELECT id FROM backups WHERE status = 'ok' ORDER BY created_at DESC LIMIT ${ALWAYS_KEEP_LATEST})
          )
          RETURNING id, offsite_key`
      );
      if (offsite) {
        for (const row of rows) {
          if (row.offsite_key) await offsite.remove(row.offsite_key).catch(() => {});
        }
      }
      const removedFiles = await service.collectUnusedFiles();
      return { removedBackups: rows.length, removedFiles };
    },

    // Off-site files no remaining backup refers to.
    async collectUnusedFiles() {
      if (!offsite) return 0;
      const { rows } = await pool.query(
        `SELECT sha256 FROM backup_files f
          WHERE location = $1 AND NOT EXISTS (SELECT 1 FROM backup_file_refs r WHERE r.sha256 = f.sha256)`,
        [offsite.location]
      );
      for (const { sha256: hash } of rows) {
        await offsite.remove(offsite.fileKey(hash)).catch(() => {});
        await pool.query('DELETE FROM backup_files WHERE location = $1 AND sha256 = $2', [offsite.location, hash]);
      }
      return rows.length;
    },

    async testOffsite() {
      if (!offsite) throw new SafetyError('Off-site úložiště není nastavené.', 409);
      await offsite.selfTest();
      return { ok: true, ...offsite.describe(), encryption: isEncryptionConfigured() };
    },

    // A server restart in the middle of a backup leaves it "running" forever.
    async markInterrupted() {
      await pool.query(
        `UPDATE backups SET status = 'failed', finished_at = now(), error = 'Přerušeno restartem serveru.',
           expires_at = now() + ($1::int * interval '1 day')
         WHERE status = 'running' AND created_at < now() - interval '2 hours'`,
        [FAILED_RETENTION_DAYS]
      );
    },
  };

  return service;
}

// ---------------------------------------------------------------------------
// Nightly schedule
// ---------------------------------------------------------------------------

export function pragueNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Prague',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: Number(parts.day),
    hour: Number(parts.hour),
    weekday: parts.weekday,
  };
}

export const scheduledKindFor = (now) => (now.day === 1 ? 'monthly' : now.weekday === 'Sun' ? 'weekly' : 'daily');

export function startBackupScheduler({ pool, service, store, auditRetentionDays }) {
  if (process.env.BACKUP_SCHEDULE_DISABLED === 'true') {
    console.log('ℹ Nightly backups are disabled (BACKUP_SCHEDULE_DISABLED=true)');
    return () => {};
  }
  const hour = Number(process.env.BACKUP_HOUR ?? 2);
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const now = pragueNow();
      if (now.hour < hour) return;
      const client = await pool.connect();
      try {
        const { rows: lock } = await client.query(`SELECT pg_try_advisory_lock(hashtext('walter_backup_job')) AS ok`);
        if (!lock[0].ok) return;
        try {
          const { rows } = await client.query(
            `SELECT status FROM backups
              WHERE kind IN ('daily', 'weekly', 'monthly')
                AND (created_at AT TIME ZONE 'Europe/Prague')::date = $1::date`,
            [now.date]
          );
          if (rows.some((row) => row.status === 'ok' || row.status === 'running')) return;
          if (rows.filter((row) => row.status === 'failed').length >= 3) return;

          await runWithContext({ detachRequest: true, type: 'system', changesetId: `backup-${now.date}` }, async () => {
            const kind = scheduledKindFor(now);
            await service.createBackup({ kind, note: 'Automatická noční záloha' });
            await service.purgeExpired();
            const purged = await store.purgeOldAuditEntries(auditRetentionDays);
            console.log(`✓ Nightly ${kind} backup done; ${purged} change-log entries past ${auditRetentionDays} days removed`);
          });
        } finally {
          await client.query(`SELECT pg_advisory_unlock(hashtext('walter_backup_job'))`).catch(() => {});
        }
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('✗ Nightly backup failed:', error.message);
    } finally {
      running = false;
    }
  };

  service.markInterrupted().catch((error) => console.error('Backup cleanup failed:', error.message));
  const first = setTimeout(tick, 90_000);
  const interval = setInterval(tick, 10 * 60_000);
  first.unref?.();
  interval.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}

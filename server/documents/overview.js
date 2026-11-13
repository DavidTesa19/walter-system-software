// Analýza › Dokumenty: every uploaded file with the subject it belongs to, its
// size, duplicates, the deleted files still kept for a restore, and what
// storing all of it costs. Admin only, read only (deleting goes through the
// normal DELETE /documents/:id, so the change log and section guards apply).
//
// File sizes come from document_file_hashes (safety/pg-install.js), so this
// never reads the file bytes either.

import crypto from 'node:crypto';
import { getRates } from '../finance/rates.js';
import { monthlyHistory } from './history.js';

// Railway bills a volume at $0.000003472 per GB-minute (≈ $0.15 per GB-month)
// and RAM at $0.000231 per GB-minute (≈ $10 per GB-month); Cloudflare R2 is
// free up to 10 GB, then $0.015 per GB-month. Measured on the bills of
// 2026-11 (RAILWAY_COSTS.md).
export const STORAGE_PRICES = Object.freeze({
  railwayDiskUsdPerGbMonth: 0.15,
  railwayRamUsdPerGbMonth: 10,
  r2UsdPerGbMonth: 0.015,
  r2FreeGb: 10,
});

const GB = 1024 ** 3;

// Where each document owner lives, and how the app opens it.
export const OWNER_TABLES = Object.freeze({
  clients: { table: 'client_entities', section: 'public', role: 'client' },
  partners: { table: 'partner_entities', section: 'public', role: 'partner' },
  tipers: { table: 'tiper_entities', section: 'public', role: 'tiper' },
  'project-clients': { table: 'project_client_entities', section: 'projects', role: 'client' },
  'project-partners': { table: 'project_partner_entities', section: 'projects', role: 'partner' },
  'project-tipers': { table: 'project_tiper_entities', section: 'projects', role: 'tiper' },
  'growth-clients': { table: 'growth_client_entities', section: 'growth', role: 'client' },
  'growth-partners': { table: 'growth_partner_entities', section: 'growth', role: 'partner' },
  'growth-tipers': { table: 'growth_tiper_entities', section: 'growth', role: 'tiper' },
  'future-functions': { table: 'future_functions', section: 'future', role: null },
});

// The tables Veřejné used before the subject/zakázka split (2026). A file still
// pointing at one of these ids is not shown in any profile.
const LEGACY_TABLES = Object.freeze({ clients: 'clients', partners: 'partners', tipers: 'tipers' });

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// "K045 · Jan Novák" / "K045 · Alza.cz a.s." / the future function's name.
export function ownerLabel(row) {
  if (!row) return null;
  const person = [text(row.first_name), text(row.last_name)].filter(Boolean).join(' ');
  const name = person || text(row.company_name) || text(row.name);
  const code = text(row.entity_id);
  return [code, name].filter(Boolean).join(' · ') || `#${row.id}`;
}

// Monthly cost of keeping `bytes` on Railway's disk, and of the off-site copy
// beyond R2's free allowance (shared with the backup archives).
export function storageCostUsd({ diskBytes = 0, offsiteBytes = 0 }, prices = STORAGE_PRICES) {
  const disk = (diskBytes / GB) * prices.railwayDiskUsdPerGbMonth;
  const offsite = Math.max(0, offsiteBytes / GB - prices.r2FreeGb) * prices.r2UsdPerGbMonth;
  return { disk, offsite, total: disk + offsite };
}

const toIso = (value) => (value ? new Date(value).toISOString() : null);

async function tableExists(pool, name) {
  const { rows } = await pool.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${name}`]);
  return rows[0].ok;
}

async function loadOwners(pool, documents) {
  const idsByType = new Map();
  for (const doc of documents) {
    if (!OWNER_TABLES[doc.entityType]) continue;
    if (!idsByType.has(doc.entityType)) idsByType.set(doc.entityType, new Set());
    idsByType.get(doc.entityType).add(doc.entityId);
  }
  const owners = new Map();
  const lookup = async (type, table, ids, state) => {
    if (ids.length === 0 || !(await tableExists(pool, table))) return;
    // to_jsonb keeps this working whichever name columns a table has.
    const { rows } = await pool.query(`SELECT id, to_jsonb(t) AS row FROM "${table}" t WHERE id = ANY($1::int[])`, [ids]);
    for (const { id, row } of rows) owners.set(`${type}:${id}`, { ...row, __state: state });
  };
  for (const [type, ids] of idsByType) {
    await lookup(type, OWNER_TABLES[type].table, [...ids], 'ok');
    if (LEGACY_TABLES[type]) {
      await lookup(type, LEGACY_TABLES[type], [...ids].filter((id) => !owners.has(`${type}:${id}`)), 'legacy');
    }
  }
  return owners;
}

const ROLE_WORDS = { client: 'klient', partner: 'partner', tiper: 'tipař' };
const SECTION_WORDS = { public: 'Veřejné', projects: 'Neveřejné', growth: 'Growth Club', future: 'Budoucí funkce' };

// "Smazaný subjekt · Neveřejné klient #25"
export function missingOwnerLabel(entityType, entityId) {
  const meta = OWNER_TABLES[entityType];
  if (!meta) return `${entityType} #${entityId}`;
  if (meta.section === 'future') return `Smazaná funkce #${entityId}`;
  return `Smazaný subjekt · ${SECTION_WORDS[meta.section]} ${ROLE_WORDS[meta.role] ?? ''} #${entityId}`.replace(/\s+#/, ' #');
}

// Folder names from the root down: "Smlouvy / 2026".
function folderPaths(documents) {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const pathOf = (id, seen = new Set()) => {
    const folder = byId.get(id);
    if (!folder || seen.has(id)) return '';
    seen.add(id);
    const parent = folder.parentId != null ? pathOf(folder.parentId, seen) : '';
    return parent ? `${parent} / ${folder.filename}` : folder.filename;
  };
  return (doc) => (doc.parentId != null ? pathOf(doc.parentId) : '');
}

function shapeDocuments(documents, owners) {
  const folderOf = folderPaths(documents);
  return documents
    .filter((doc) => doc.itemKind !== 'folder')
    .map((doc) => {
      const meta = OWNER_TABLES[doc.entityType] ?? { section: 'unknown', role: null };
      const owner = owners.get(`${doc.entityType}:${doc.entityId}`) ?? null;
      return {
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256,
        folder: folderOf(doc),
        createdAt: doc.createdAt,
        archivedAt: doc.archivedAt,
        noteId: doc.noteId,
        uploadedBy: doc.uploadedBy,
        entityType: doc.entityType,
        entityId: doc.entityId,
        section: meta.section,
        role: meta.role,
        // ok: opens in its profile; legacy: only in the pre-2026 tables, no
        // profile shows it; missing: the subject is gone.
        owner: owner?.__state === 'ok'
          ? { label: ownerLabel(owner), status: text(owner.status) || 'accepted', exists: true, state: 'ok' }
          : owner
            ? { label: `${ownerLabel(owner)} (starý záznam)`, status: null, exists: false, state: 'legacy' }
            : { label: missingOwnerLabel(doc.entityType, doc.entityId), status: null, exists: false, state: 'missing' },
      };
    });
}

async function pgOverview(pool) {
  const hasHashes = await tableExists(pool, 'document_file_hashes');
  const hasAudit = await tableExists(pool, 'audit_log');
  const hasBlobs = await tableExists(pool, 'audit_blobs');
  const hasBackups = await tableExists(pool, 'backups');
  const hasBackupFiles = await tableExists(pool, 'backup_files');

  const { rows } = await pool.query(`
    SELECT d.id, d.entity_type, d.entity_id, d.item_kind, d.parent_id, d.filename, d.mime_type,
           ${hasHashes ? 'coalesce(h.size_bytes, d.size_bytes)' : 'd.size_bytes'}::bigint AS size_bytes,
           ${hasHashes ? 'h.sha256' : 'NULL::text'} AS sha256,
           d.created_at, d.archived_at, d.note_id,
           ${hasAudit ? 'u.actor_name' : 'NULL::text'} AS uploaded_by
      FROM documents d
      ${hasHashes ? 'LEFT JOIN document_file_hashes h ON h.document_id = d.id' : ''}
      ${hasAudit ? `LEFT JOIN LATERAL (
        SELECT a.actor_name FROM audit_log a
         WHERE a.table_name = 'documents' AND a.row_id = d.id::text AND a.op = 'I'
         ORDER BY a.id LIMIT 1) u ON true` : ''}
     ORDER BY d.id`);
  const documents = rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    itemKind: row.item_kind,
    parentId: row.parent_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes ?? 0),
    sha256: row.sha256,
    createdAt: toIso(row.created_at),
    archivedAt: toIso(row.archived_at),
    noteId: row.note_id,
    uploadedBy: row.uploaded_by,
  }));

  // Deleted files are kept (audit_blobs) so a delete can be undone, until the
  // change log's retention removes them. pg_column_size reads the stored size
  // without fetching the bytes.
  let deleted = [];
  if (hasBlobs && hasAudit) {
    const { rows: blobRows } = await pool.query(`
      SELECT b.audit_id, b.sha256, pg_column_size(b.data)::bigint AS stored_bytes,
             a.old_data->>'filename' AS filename, (a.old_data->>'size_bytes')::bigint AS size_bytes,
             a.old_data->>'entity_type' AS entity_type, a.at AS deleted_at, a.actor_name
        FROM audit_blobs b JOIN audit_log a ON a.id = b.audit_id
       ORDER BY a.at DESC`);
    deleted = blobRows.map((row) => ({
      auditId: Number(row.audit_id),
      filename: row.filename,
      sizeBytes: Number(row.size_bytes ?? row.stored_bytes ?? 0),
      storedBytes: Number(row.stored_bytes ?? 0),
      entityType: row.entity_type,
      deletedAt: toIso(row.deleted_at),
      deletedBy: row.actor_name,
    }));
  }

  const { rows: [sizes] } = await pool.query(`
    SELECT pg_database_size(current_database())::bigint AS database_bytes,
           pg_total_relation_size('documents')::bigint AS documents_bytes,
           ${hasBlobs ? "pg_total_relation_size('audit_blobs')" : '0'}::bigint AS deleted_bytes,
           ${hasBackups ? "pg_total_relation_size('backups')" : '0'}::bigint AS backups_bytes,
           ${hasBackupFiles ? '(SELECT coalesce(sum(size_bytes), 0) FROM backup_files)' : '0'}::bigint AS offsite_file_bytes,
           ${hasBackupFiles ? '(SELECT count(*) FROM backup_files)' : '0'}::bigint AS offsite_file_count,
           ${hasBackups ? "(SELECT coalesce(sum(size_bytes), 0) FROM backups WHERE status = 'ok')" : '0'}::bigint AS archive_bytes`);

  // Every file deletion the change log knows (since 2026-10), for the monthly
  // history; folders weigh nothing.
  let deletions = [];
  if (hasAudit) {
    const { rows: deletedRows } = await pool.query(`
      SELECT (old_data->>'size_bytes')::bigint AS size_bytes, old_data->>'created_at' AS created_at, at
        FROM audit_log
       WHERE table_name = 'documents' AND op = 'D' AND coalesce(old_data->>'item_kind', 'file') <> 'folder'`);
    deletions = deletedRows.map((row) => ({
      sizeBytes: Number(row.size_bytes ?? 0),
      createdAt: row.created_at,
      deletedAt: toIso(row.at),
    }));
  }

  const owners = await loadOwners(pool, documents);
  return {
    documents: shapeDocuments(documents, owners),
    folderCount: documents.filter((doc) => doc.itemKind === 'folder').length,
    deletions,
    deleted,
    storage: {
      databaseBytes: Number(sizes.database_bytes),
      documentsBytes: Number(sizes.documents_bytes),
      deletedBytes: Number(sizes.deleted_bytes),
      backupsBytes: Number(sizes.backups_bytes),
      offsiteFileBytes: Number(sizes.offsite_file_bytes),
      offsiteFileCount: Number(sizes.offsite_file_count),
      offsiteArchiveBytes: Number(sizes.archive_bytes),
      source: 'postgres',
    },
  };
}

// The JSON dev store keeps files base64-encoded in db.json.
function fileOverview(store) {
  const all = Array.isArray(store?.documents) ? store.documents : [];
  const documents = all.map((doc) => {
    const bytes = typeof doc.data === 'string' ? Buffer.from(doc.data, 'base64') : null;
    return {
      id: Number(doc.id),
      entityType: doc.entityType,
      entityId: Number(doc.entityId),
      itemKind: doc.itemKind === 'folder' ? 'folder' : 'file',
      parentId: doc.parentId != null ? Number(doc.parentId) : null,
      filename: doc.filename,
      mimeType: doc.mimeType,
      sizeBytes: Number(doc.sizeBytes ?? bytes?.length ?? 0),
      sha256: bytes ? crypto.createHash('sha256').update(bytes).digest('hex') : null,
      createdAt: doc.createdAt ?? null,
      archivedAt: doc.archivedAt ?? null,
      noteId: doc.noteId ?? null,
      uploadedBy: null,
    };
  });
  const owners = new Map();
  for (const doc of documents) {
    const meta = OWNER_TABLES[doc.entityType];
    if (!meta) continue;
    const list = store[meta.table] ?? (doc.entityType === 'future-functions' ? store.futureFunctions : null) ?? [];
    const owner = Array.isArray(list) ? list.find((row) => Number(row.id) === doc.entityId) : null;
    if (owner) owners.set(`${doc.entityType}:${doc.entityId}`, owner);
  }
  const fileBytes = documents.reduce((sum, doc) => sum + doc.sizeBytes, 0);
  return {
    documents: shapeDocuments(documents, owners),
    folderCount: documents.filter((doc) => doc.itemKind === 'folder').length,
    deletions: [],
    deleted: [],
    storage: {
      databaseBytes: fileBytes,
      documentsBytes: fileBytes,
      deletedBytes: 0,
      backupsBytes: 0,
      offsiteFileBytes: 0,
      offsiteFileCount: 0,
      offsiteArchiveBytes: 0,
      source: 'json',
    },
  };
}

export function registerDocumentOverviewRoutes(app, { authenticateToken, requireRole, pool, readStore }) {
  app.get('/api/documents/overview', authenticateToken, requireRole('admin'), async (_req, res) => {
    try {
      const { deletions, ...overview } = pool ? await pgOverview(pool) : fileOverview(readStore());
      const { storage } = overview;
      const cost = storageCostUsd({
        diskBytes: storage.documentsBytes + storage.deletedBytes,
        offsiteBytes: storage.offsiteFileBytes + storage.offsiteArchiveBytes,
      });
      const { rates, date } = await getRates();
      const history = monthlyHistory({
        files: overview.documents,
        deletions,
        now: new Date(),
        prices: STORAGE_PRICES,
        usdCzk: rates.USD,
      });
      res.json({
        ...overview,
        history,
        cost: { ...cost, usdCzk: rates.USD, rateDate: date ?? null },
        prices: STORAGE_PRICES,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Document overview failed:', error);
      res.status(500).json({ error: 'Přehled dokumentů se nepodařilo načíst.' });
    }
  });
}

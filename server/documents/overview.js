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
import { OrphanError, parseOwnerKey, planOwnerMove } from './orphans.js';

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

// ---------- Soubory bez subjektu: move or delete a former subject's files ----------

const MAX_OWNERS_PER_CALL = 60;

function readOwnerKeys(body) {
  const keys = Array.isArray(body?.owners) ? body.owners : [];
  if (keys.length === 0) throw new OrphanError('Vyberte aspoň jeden bývalý subjekt.');
  if (keys.length > MAX_OWNERS_PER_CALL) throw new OrphanError(`Najednou nejvýš ${MAX_OWNERS_PER_CALL} subjektů.`);
  const owners = keys.map(parseOwnerKey);
  if (owners.some((owner) => !owner || !OWNER_TABLES[owner.entityType])) throw new OrphanError('Neplatný subjekt.');
  return owners;
}

// Every key must still be without a subject: this tool never touches files a
// profile shows.
async function pgOwnerDocs(client, owners) {
  const docs = [];
  for (const owner of owners) {
    const { rows } = await client.query(
      `SELECT id, entity_type, entity_id, item_kind, parent_id, filename FROM documents
        WHERE entity_type = $1 AND entity_id = $2 ORDER BY id`,
      [owner.entityType, owner.entityId],
    );
    docs.push({ owner, docs: rows });
  }
  const existing = await loadOwners(client, docs.flatMap(({ owner }) => [{ entityType: owner.entityType, entityId: owner.entityId }]));
  for (const { owner } of docs) {
    if (existing.get(`${owner.entityType}:${owner.entityId}`)?.__state === 'ok') {
      throw new OrphanError(`${owner.entityType} #${owner.entityId} má subjekt; jeho soubory se spravují v profilu.`, 409);
    }
  }
  return docs;
}

async function pgMoveOrphans(pool, { owners, target, repairNames }) {
  const targetMeta = OWNER_TABLES[target.entityType];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: targetRows } = await client.query(`SELECT id FROM "${targetMeta.table}" WHERE id = $1`, [target.entityId]);
    if (targetRows.length === 0) throw new OrphanError('Cílový subjekt neexistuje.', 404);
    const groups = await pgOwnerDocs(client, owners);
    let moved = 0;
    let renamed = 0;
    let wrappers = 0;
    for (const { owner, docs } of groups) {
      if (docs.length === 0) continue;
      const plan = planOwnerMove(docs, {
        fallbackName: `Bývalý subjekt #${owner.entityId}`,
        repairNames,
      });
      let wrapperId = null;
      if (plan.wrapperName) {
        const { rows } = await client.query(
          `INSERT INTO documents (entity_type, entity_id, item_kind, parent_id, filename, mime_type, size_bytes, data)
           VALUES ($1, $2, 'folder', NULL, $3, 'inode/directory', 0, $4) RETURNING id`,
          [target.entityType, target.entityId, plan.wrapperName, Buffer.alloc(0)],
        );
        wrapperId = rows[0].id;
        wrappers += 1;
      }
      const ids = docs.map((doc) => Number(doc.id));
      await client.query(
        `UPDATE documents SET entity_type = $1, entity_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($3::int[])`,
        [target.entityType, target.entityId, ids],
      );
      if (wrapperId != null && plan.rootIds.length > 0) {
        await client.query('UPDATE documents SET parent_id = $1 WHERE id = ANY($2::int[])', [wrapperId, plan.rootIds]);
      }
      for (const { id, filename } of plan.renames) {
        await client.query('UPDATE documents SET filename = $1 WHERE id = $2', [filename.slice(0, 255), id]);
      }
      moved += docs.filter((doc) => doc.item_kind !== 'folder').length;
      renamed += plan.renames.length;
    }
    await client.query('COMMIT');
    return { moved, renamed, wrappers };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function pgDeleteOrphans(pool, { owners }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const groups = await pgOwnerDocs(client, owners);
    const ids = groups.flatMap(({ docs }) => docs.map((doc) => Number(doc.id)));
    const files = groups.flatMap(({ docs }) => docs.filter((doc) => doc.item_kind !== 'folder')).length;
    if (ids.length > 0) await client.query('DELETE FROM documents WHERE id = ANY($1::int[])', [ids]);
    await client.query('COMMIT');
    return { deleted: files };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// The JSON dev store: the same rules on db.json's documents array.
function fileOrphanOwners(store, owners) {
  const all = Array.isArray(store.documents) ? store.documents : [];
  return owners.map((owner) => {
    const meta = OWNER_TABLES[owner.entityType];
    const list = store[meta.table] ?? (owner.entityType === 'future-functions' ? store.futureFunctions : null) ?? [];
    if (Array.isArray(list) && list.some((row) => Number(row.id) === owner.entityId)) {
      throw new OrphanError(`${owner.entityType} #${owner.entityId} má subjekt; jeho soubory se spravují v profilu.`, 409);
    }
    const docs = all.filter((doc) => doc.entityType === owner.entityType && Number(doc.entityId) === owner.entityId);
    return { owner, docs };
  });
}

function fileMoveOrphans(store, { owners, target, repairNames }) {
  const meta = OWNER_TABLES[target.entityType];
  const list = store[meta.table] ?? (target.entityType === 'future-functions' ? store.futureFunctions : null) ?? [];
  if (!Array.isArray(list) || !list.some((row) => Number(row.id) === target.entityId)) throw new OrphanError('Cílový subjekt neexistuje.', 404);
  let moved = 0;
  let renamed = 0;
  let wrappers = 0;
  for (const { owner, docs } of fileOrphanOwners(store, owners)) {
    if (docs.length === 0) continue;
    const plan = planOwnerMove(
      docs.map((doc) => ({ id: doc.id, item_kind: doc.itemKind === 'folder' ? 'folder' : 'file', parent_id: doc.parentId ?? null, filename: doc.filename })),
      { fallbackName: `Bývalý subjekt #${owner.entityId}`, repairNames },
    );
    let wrapperId = null;
    if (plan.wrapperName) {
      wrapperId = store.documents.reduce((max, doc) => Math.max(max, Number(doc.id) || 0), 0) + 1;
      store.documents.push({
        id: wrapperId, entityType: target.entityType, entityId: target.entityId, itemKind: 'folder', parentId: null,
        filename: plan.wrapperName, mimeType: 'inode/directory', sizeBytes: 0, data: '', createdAt: new Date().toISOString(),
      });
      wrappers += 1;
    }
    const renames = new Map(plan.renames.map((item) => [Number(item.id), item.filename]));
    const roots = new Set(plan.rootIds);
    for (const doc of docs) {
      doc.entityType = target.entityType;
      doc.entityId = target.entityId;
      if (wrapperId != null && roots.has(Number(doc.id))) doc.parentId = wrapperId;
      if (renames.has(Number(doc.id))) doc.filename = renames.get(Number(doc.id));
      if (doc.itemKind !== 'folder') moved += 1;
    }
    renamed += plan.renames.length;
  }
  return { moved, renamed, wrappers };
}

function fileDeleteOrphans(store, { owners }) {
  const groups = fileOrphanOwners(store, owners);
  const ids = new Set(groups.flatMap(({ docs }) => docs.map((doc) => Number(doc.id))));
  const files = groups.flatMap(({ docs }) => docs.filter((doc) => doc.itemKind !== 'folder')).length;
  store.documents = store.documents.filter((doc) => !ids.has(Number(doc.id)));
  return { deleted: files };
}

export function registerDocumentOverviewRoutes(app, { authenticateToken, requireRole, pool, readStore, writeStore }) {
  const fail = (res, error, fallback) => {
    if (error instanceof OrphanError) return res.status(error.status).json({ error: error.message });
    console.error(fallback, error);
    return res.status(500).json({ error: fallback });
  };

  app.post('/api/documents/orphans/move', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const owners = readOwnerKeys(req.body);
      const target = { entityType: String(req.body?.target?.entityType ?? ''), entityId: Number(req.body?.target?.entityId) };
      if (!OWNER_TABLES[target.entityType] || !Number.isInteger(target.entityId)) throw new OrphanError('Vyberte cílový subjekt.');
      const repairNames = req.body?.repairNames !== false;
      if (pool) return res.json(await pgMoveOrphans(pool, { owners, target, repairNames }));
      const store = readStore();
      const result = fileMoveOrphans(store, { owners, target, repairNames });
      if (!writeStore(store)) throw new Error('db.json not written');
      return res.json(result);
    } catch (error) {
      return fail(res, error, 'Soubory se nepodařilo přesunout.');
    }
  });

  app.post('/api/documents/orphans/delete', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
      const owners = readOwnerKeys(req.body);
      if (pool) return res.json(await pgDeleteOrphans(pool, { owners }));
      const store = readStore();
      const result = fileDeleteOrphans(store, { owners });
      if (!writeStore(store)) throw new Error('db.json not written');
      return res.json(result);
    } catch (error) {
      return fail(res, error, 'Soubory se nepodařilo smazat.');
    }
  });

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

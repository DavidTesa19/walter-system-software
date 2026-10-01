// Reading the change log and putting things back, on Postgres.

import crypto from 'node:crypto';
import { currentActor, currentDbContextValue, runWithContext } from './context.js';
import { DEFAULT_SAFETY_SETTINGS } from './pg-install.js';
import { planEntryRevert, planVersionRestore } from './revert.js';
import {
  AUDIT_EXCLUDED_TABLES,
  REDACTED_VALUE,
  describeRow,
  isSafeIdentifier,
  quoteIdent,
  tableKind,
  tableLabel,
} from './tables.js';

export class SafetyError extends Error {
  constructor(message, status = 400, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const DISPLAY_HIDDEN_FIELDS = new Set(['field_activity']);
const MAX_ENTRIES_PER_GROUP = 100;
const FK_VIOLATION = '23503';

// Tables whose deletions are shown in the trash on their own. Chat messages
// and settings only ever come back together with what they belonged to.
const TRASH_HIDDEN_TABLES = new Set(['chat_messages', 'safety_settings']);

const TRASH_HEADLINE_RANK = (table) => {
  const kind = tableKind(table);
  if (kind === 'subject') return 0;
  if (kind === 'commission') return 1;
  return { users: 2, documents: 3, notes: 4, chat_rooms: 5 }[table] ?? 6;
};

const stripHidden = (row) => {
  if (!row || typeof row !== 'object') return row ?? null;
  const copy = { ...row };
  for (const field of DISPLAY_HIDDEN_FIELDS) delete copy[field];
  return copy;
};

const pick = (row, fields) => {
  if (!row) return null;
  const out = {};
  for (const field of fields) if (field in row) out[field] = row[field];
  return out;
};

function toEntry(row, { full = false } = {}) {
  const oldData = row.old_data ?? null;
  const newData = row.new_data ?? null;
  const changedFields = (row.changed_fields ?? []).filter((field) => !DISPLAY_HIDDEN_FIELDS.has(field));
  const compact = !full && row.op === 'U';
  return {
    id: Number(row.id),
    at: row.at,
    table: row.table_name,
    tableLabel: tableLabel(row.table_name),
    rowId: row.row_id,
    op: row.op,
    label: describeRow(row.table_name, newData ?? oldData),
    changedFields,
    oldData: compact ? pick(oldData, changedFields) : stripHidden(oldData),
    newData: compact ? pick(newData, changedFields) : stripHidden(newData),
    actor: { type: row.actor_type, userId: row.actor_user_id, name: row.actor_name },
    changesetId: row.changeset_id,
    route: row.route,
    note: row.note,
    reverts: row.reverts,
  };
}

// The internal form the revert planner works on (full rows, no trimming).
const toPlanEntry = (row) => ({
  id: Number(row.id),
  op: row.op,
  table: row.table_name,
  rowId: row.row_id,
  oldData: row.old_data,
  newData: row.new_data,
  changedFields: row.changed_fields ?? [],
});

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export function createPgSafetyStore(pool) {
  const columnCache = new Map();

  async function getColumns(client, table) {
    if (columnCache.has(table)) return columnCache.get(table);
    const { rows } = await client.query(
      `SELECT column_name, data_type, is_generated
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    const columns = new Map(
      rows
        .filter((row) => row.is_generated !== 'ALWAYS')
        .map((row) => [row.column_name, row.data_type])
    );
    if (columns.size > 0) columnCache.set(table, columns);
    return columns;
  }

  async function assertRestorableTable(client, table) {
    if (!isSafeIdentifier(table) || AUDIT_EXCLUDED_TABLES.has(table)) {
      throw new SafetyError(`Tabulku ${table} nelze tímto způsobem obnovit.`);
    }
    const columns = await getColumns(client, table);
    if (!columns.has('id')) throw new SafetyError(`Tabulka ${table} už neexistuje.`);
    return columns;
  }

  async function getCurrentRow(client, table, rowId) {
    const columns = [...(await getColumns(client, table)).keys()]
      .filter((column) => !(table === 'documents' && column === 'data'));
    const { rows } = await client.query(
      `SELECT to_jsonb(x) AS row FROM (SELECT ${columns.map(quoteIdent).join(', ')} FROM "${table}" WHERE id::text = $1) x`,
      [String(rowId)]
    );
    return rows[0]?.row ?? null;
  }

  async function syncSequence(client, table) {
    await client.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), 1))`,
      [table]
    );
  }

  async function applyUpdate(client, table, rowId, values, actor) {
    const columns = await getColumns(client, table);
    const fields = Object.keys(values).filter((field) => field !== 'id' && columns.has(field));
    if (fields.length === 0) return;
    const sets = fields.map((field) => `${quoteIdent(field)} = r.${quoteIdent(field)}`);
    const params = [JSON.stringify(values), String(rowId)];
    if (columns.has('updated_at') && !fields.includes('updated_at')) sets.push('updated_at = CURRENT_TIMESTAMP');
    if (columns.has('updated_by_user_id') && actor.userId && !fields.includes('updated_by_user_id')) {
      params.push(actor.userId);
      sets.push(`updated_by_user_id = $${params.length}`);
    }
    await client.query(
      `UPDATE "${table}" AS t SET ${sets.join(', ')}
         FROM jsonb_populate_record(NULL::"${table}", $1::jsonb) AS r
        WHERE t.id::text = $2`,
      params
    );
  }

  async function applyInsert(client, table, values, { blobAuditId = null } = {}) {
    const columns = await getColumns(client, table);
    const record = { ...values };
    if (table === 'users' && record.password_hash === REDACTED_VALUE) record.password_hash = null;
    const fields = Object.keys(record).filter((field) => columns.has(field) && field !== 'data');
    const columnList = fields.map(quoteIdent).join(', ');
    const selectList = fields.map((field) => `r.${quoteIdent(field)}`).join(', ');

    if (table === 'documents') {
      const { rowCount } = await client.query(
        `INSERT INTO documents (${columnList}, data)
         SELECT ${selectList}, b.data
           FROM jsonb_populate_record(NULL::documents, $1::jsonb) AS r
           JOIN audit_blobs b ON b.audit_id = $2`,
        [JSON.stringify(record), blobAuditId]
      );
      if (rowCount === 0) {
        throw new SafetyError(`Soubor „${record.filename ?? record.id}“ už není k dispozici, obnovte ho ze zálohy.`, 409);
      }
    } else {
      await client.query(
        `INSERT INTO "${table}" (${columnList})
         SELECT ${selectList} FROM jsonb_populate_record(NULL::"${table}", $1::jsonb) AS r`,
        [JSON.stringify(record)]
      );
    }
    await syncSequence(client, table);
  }

  async function latestDocumentBlob(client, rowId) {
    const { rows } = await client.query(
      `SELECT b.audit_id FROM audit_blobs b JOIN audit_log a ON a.id = b.audit_id
        WHERE a.table_name = 'documents' AND a.row_id = $1
        ORDER BY a.id DESC LIMIT 1`,
      [String(rowId)]
    );
    return rows[0]?.audit_id ?? null;
  }

  // Tag the statements that follow (inside this transaction only) as undoing
  // `reverts`, so each log row a revert writes points at what it put back.
  async function tagStatements(client, reverts) {
    await client.query("SELECT set_config('walter.ctx', $1, true)", [currentDbContextValue({ reverts })]);
  }

  async function applyPlan(client, entry, plan, actor) {
    if (plan.action === 'delete') {
      await client.query(`DELETE FROM "${entry.table}" WHERE id::text = $1`, [String(entry.rowId)]);
    } else if (plan.action === 'update') {
      await applyUpdate(client, entry.table, entry.rowId, plan.values, actor);
    } else if (plan.action === 'insert') {
      const blobAuditId = entry.table === 'documents'
        ? (entry.op === 'D' ? entry.id : await latestDocumentBlob(client, entry.rowId))
        : null;
      await applyInsert(client, entry.table, plan.values, { blobAuditId });
    }
  }

  // Runs a list of steps in one transaction, all or nothing. A step that trips
  // a foreign key (a commission put back before its subject) is retried after
  // the others, so the order entries come in does not matter.
  async function runSteps(steps, { force, changesetId, note }) {
    return runWithContext({ changesetId, note }, async () => {
      const actor = currentActor();
      const client = await pool.connect();
      const conflicts = [];
      const errors = [];
      let applied = 0;
      let skipped = 0;
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('walter.allow_mass_delete', 'on', true)");

        let pending = steps;
        while (pending.length > 0) {
          const deferred = [];
          for (const step of pending) {
            await client.query('SAVEPOINT walter_step');
            try {
              await tagStatements(client, step.reverts);
              await assertRestorableTable(client, step.entry.table);
              const current = await getCurrentRow(client, step.entry.table, step.entry.rowId);
              const plan = step.plan(step.entry, current);
              const describe = { auditId: step.entry.id, op: step.entry.op, table: step.entry.table, tableLabel: tableLabel(step.entry.table), rowId: step.entry.rowId, label: describeRow(step.entry.table, step.entry.newData ?? step.entry.oldData ?? current) };
              if (plan.action === 'error') {
                errors.push({ ...describe, reason: plan.reason });
              } else if (plan.action === 'noop') {
                skipped += 1;
              } else {
                if (plan.conflicts.length > 0) conflicts.push({ ...describe, fields: plan.conflicts });
                await applyPlan(client, step.entry, plan, actor);
                applied += 1;
              }
              await client.query('RELEASE SAVEPOINT walter_step');
            } catch (error) {
              await client.query('ROLLBACK TO SAVEPOINT walter_step');
              if (error.code === FK_VIOLATION) {
                deferred.push({ ...step, lastError: error });
              } else {
                errors.push({
                  auditId: step.entry.id,
                  table: step.entry.table,
                  tableLabel: tableLabel(step.entry.table),
                  rowId: step.entry.rowId,
                  label: describeRow(step.entry.table, step.entry.newData ?? step.entry.oldData),
                  reason: error instanceof SafetyError ? error.message : `Databáze změnu odmítla: ${error.message}`,
                });
              }
            }
          }
          if (deferred.length === pending.length) {
            for (const step of deferred) {
              errors.push({
                auditId: step.entry.id,
                table: step.entry.table,
                tableLabel: tableLabel(step.entry.table),
                rowId: step.entry.rowId,
                label: describeRow(step.entry.table, step.entry.newData ?? step.entry.oldData),
                reason: `Záznam závisí na jiném, který neexistuje (${step.lastError.detail ?? step.lastError.message}).`,
              });
            }
            break;
          }
          pending = deferred;
        }

        if (errors.length > 0 || (conflicts.length > 0 && !force)) {
          await client.query('ROLLBACK');
          return { ok: false, applied: 0, skipped, conflicts, errors };
        }
        await client.query('COMMIT');
        return { ok: true, changesetId, applied, skipped, conflicts, errors };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    });
  }

  async function loadEntriesForRevert({ auditIds, changesetId }) {
    if (changesetId) {
      const { rows } = await pool.query(
        `SELECT * FROM audit_log WHERE changeset_id = $1 ORDER BY id DESC`,
        [changesetId]
      );
      return rows;
    }
    const ids = (auditIds ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return [];
    const { rows } = await pool.query(
      `SELECT * FROM audit_log WHERE id = ANY($1::bigint[]) ORDER BY id DESC`,
      [ids]
    );
    return rows;
  }

  async function attachRevertStatus(entries) {
    if (entries.length === 0) return entries;
    const refs = entries.map((entry) => `audit:${entry.id}`);
    const { rows } = await pool.query(
      `SELECT reverts, min(at) AS at, min(actor_name) AS by, min(changeset_id) AS changeset_id
         FROM audit_log WHERE reverts = ANY($1::text[]) GROUP BY reverts`,
      [refs]
    );
    const byRef = new Map(rows.map((row) => [row.reverts, row]));
    return entries.map((entry) => {
      const hit = byRef.get(`audit:${entry.id}`);
      return hit ? { ...entry, reverted: { at: hit.at, by: hit.by, changesetId: hit.changeset_id } } : { ...entry, reverted: null };
    });
  }

  function buildChangeFilters(filters, params) {
    const where = [];
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace('$?', `$${params.length}`));
    };
    const from = toDateOrNull(filters.from);
    const to = toDateOrNull(filters.to);
    if (from) add('at >= $?', from);
    if (to) add('at <= $?', to);
    if (filters.actorType) add('actor_type = $?', String(filters.actorType));
    if (filters.userId && Number.isInteger(Number(filters.userId))) add('actor_user_id = $?', Number(filters.userId));
    if (filters.op && ['I', 'U', 'D'].includes(filters.op)) add('op = $?', filters.op);
    if (filters.changesetId) add('changeset_id = $?', String(filters.changesetId));
    if (filters.table && isSafeIdentifier(filters.table)) add('table_name = $?', filters.table);
    if (filters.kind === 'subject') where.push("table_name LIKE '%\\_entities'");
    if (filters.kind === 'commission') where.push("table_name LIKE '%\\_commissions'");
    if (filters.rowId && filters.table) add('row_id = $?', String(filters.rowId));
    if (filters.q && String(filters.q).trim()) {
      const needle = `%${String(filters.q).trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(needle);
      const i = params.length;
      where.push(`(old_data::text ILIKE $${i} OR new_data::text ILIKE $${i} OR actor_name ILIKE $${i} OR route ILIKE $${i})`);
    }
    return where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  }

  return {
    available: true,

    async listChanges(filters = {}) {
      const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
      const params = [];
      const whereSql = buildChangeFilters(filters, params);
      const before = Number(filters.before);
      params.push(limit);
      const limitParam = `$${params.length}`;
      let havingSql = '';
      if (Number.isInteger(before) && before > 0) {
        params.push(before);
        havingSql = `HAVING max(id) < $${params.length}`;
      }

      const { rows } = await pool.query(
        `WITH filtered AS (
           SELECT * FROM audit_log ${whereSql}
         ),
         groups AS (
           SELECT changeset_id, max(id) AS last_id
             FROM filtered
            GROUP BY changeset_id
            ${havingSql}
            ORDER BY max(id) DESC
            LIMIT ${limitParam}
         ),
         ranked AS (
           SELECT f.*, g.last_id,
                  row_number() OVER (PARTITION BY f.changeset_id ORDER BY f.id) AS position
             FROM filtered f JOIN groups g ON g.changeset_id = f.changeset_id
         )
         SELECT r.*,
                (SELECT count(*) FROM audit_log a WHERE a.changeset_id = r.changeset_id) AS changeset_size
           FROM ranked r
          WHERE r.position <= ${MAX_ENTRIES_PER_GROUP}
          ORDER BY r.last_id DESC, r.id ASC`,
        params
      );

      const entries = await attachRevertStatus(rows.map((row) => ({ ...toEntry(row), _lastId: Number(row.last_id), _size: Number(row.changeset_size) })));
      const groups = [];
      const byChangeset = new Map();
      for (const entry of entries) {
        let group = byChangeset.get(entry.changesetId);
        if (!group) {
          group = {
            changesetId: entry.changesetId,
            lastId: entry._lastId,
            size: entry._size,
            at: entry.at,
            actor: entry.actor,
            route: entry.route,
            note: entry.note,
            reverts: entry.reverts,
            entries: [],
          };
          byChangeset.set(entry.changesetId, group);
          groups.push(group);
        }
        const { _lastId, _size, ...clean } = entry;
        group.entries.push(clean);
      }
      for (const group of groups) {
        group.endedAt = group.entries[group.entries.length - 1]?.at ?? group.at;
        group.revertedCount = group.entries.filter((entry) => entry.reverted).length;
      }

      const nextBefore = groups.length === limit ? groups[groups.length - 1].lastId : null;
      return { groups, nextBefore };
    },

    async getRecordHistory(table, rowId) {
      if (!isSafeIdentifier(table)) throw new SafetyError('Neplatná tabulka.');
      const { rows } = await pool.query(
        `SELECT * FROM audit_log WHERE table_name = $1 AND row_id = $2 ORDER BY id DESC LIMIT 300`,
        [table, String(rowId)]
      );
      const client = await pool.connect();
      let current = null;
      try {
        const columns = await getColumns(client, table);
        if (columns.has('id')) current = await getCurrentRow(client, table, rowId);
      } finally {
        client.release();
      }
      const entries = await attachRevertStatus(rows.map((row) => toEntry(row, { full: true })));
      return {
        table,
        tableLabel: tableLabel(table),
        rowId: String(rowId),
        label: describeRow(table, current ?? rows[0]?.new_data ?? rows[0]?.old_data),
        exists: Boolean(current),
        current: stripHidden(current),
        entries,
      };
    },

    async revert({ auditIds, changesetId, force = false }) {
      const rows = await loadEntriesForRevert({ auditIds, changesetId });
      if (rows.length === 0) throw new SafetyError('Změna nenalezena.', 404);
      const steps = rows.map((row) => {
        const entry = toPlanEntry(row);
        return { entry, plan: planEntryRevert, reverts: `audit:${entry.id}` };
      });
      // rows are newest first; the oldest one says who started the action, when.
      const first = rows[rows.length - 1];
      const who = first.actor_type === 'ai_agent' ? `AI agenta (${first.actor_name ?? '?'})` : (first.actor_name ?? 'systému');
      const when = new Date(first.at).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', dateStyle: 'short', timeStyle: 'short' });
      const what = changesetId ? 'akce' : steps.length === 1 ? 'změny' : `${steps.length} změn`;
      return runSteps(steps, {
        force,
        changesetId: `revert-${crypto.randomUUID()}`,
        note: `Vrácení ${what} od ${who} z ${when}`,
      });
    },

    async restoreVersion({ table, rowId, auditId }) {
      const { rows } = await pool.query(
        `SELECT * FROM audit_log WHERE id = $1 AND table_name = $2 AND row_id = $3`,
        [Number(auditId), table, String(rowId)]
      );
      if (rows.length === 0) throw new SafetyError('Verze záznamu nenalezena.', 404);
      const entry = toPlanEntry(rows[0]);
      return runSteps([{ entry, plan: planVersionRestore, reverts: `version:${entry.id}` }], {
        force: true,
        changesetId: `version-${crypto.randomUUID()}`,
        note: `Obnovení verze záznamu z ${new Date(rows[0].at).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', dateStyle: 'short', timeStyle: 'short' })}`,
      });
    },

    async listTrash({ limit = 50, before = null, q = '' } = {}) {
      const params = [];
      let where = "op = 'D'";
      if (Number.isInteger(Number(before)) && Number(before) > 0) {
        params.push(Number(before));
        where += ` AND id < $${params.length}`;
      }
      if (q && String(q).trim()) {
        params.push(`%${String(q).trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
        where += ` AND old_data::text ILIKE $${params.length}`;
      }
      const { rows } = await pool.query(
        `SELECT * FROM audit_log WHERE ${where} ORDER BY id DESC LIMIT 1000`,
        params
      );

      // Keep only what is still gone.
      const idsByTable = new Map();
      for (const row of rows) {
        if (!isSafeIdentifier(row.table_name)) continue;
        if (!idsByTable.has(row.table_name)) idsByTable.set(row.table_name, new Set());
        idsByTable.get(row.table_name).add(String(row.row_id));
      }
      const existing = new Set();
      for (const [table, ids] of idsByTable) {
        const exists = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`public.${table}`]);
        if (!exists.rows[0].ok) continue;
        const { rows: present } = await pool.query(
          `SELECT id::text AS id FROM "${table}" WHERE id::text = ANY($1::text[])`,
          [[...ids]]
        );
        for (const row of present) existing.add(`${table}:${row.id}`);
      }

      const groups = [];
      const byChangeset = new Map();
      for (const row of rows) {
        if (existing.has(`${row.table_name}:${row.row_id}`)) continue;
        let group = byChangeset.get(row.changeset_id);
        if (!group) {
          group = { changesetId: row.changeset_id, at: row.at, actor: { type: row.actor_type, userId: row.actor_user_id, name: row.actor_name }, route: row.route, items: [] };
          byChangeset.set(row.changeset_id, group);
          groups.push(group);
        }
        group.items.push({
          auditId: Number(row.id),
          table: row.table_name,
          tableLabel: tableLabel(row.table_name),
          rowId: row.row_id,
          label: describeRow(row.table_name, row.old_data),
          hidden: TRASH_HIDDEN_TABLES.has(row.table_name),
        });
      }

      const visible = groups
        .filter((group) => group.items.some((item) => !item.hidden))
        .map((group) => {
          const shown = group.items.filter((item) => !item.hidden);
          const headline = [...shown].sort((a, b) => TRASH_HEADLINE_RANK(a.table) - TRASH_HEADLINE_RANK(b.table))[0];
          const counts = {};
          for (const item of group.items) counts[item.tableLabel] = (counts[item.tableLabel] ?? 0) + 1;
          return { ...group, headline, counts, auditIds: group.items.map((item) => item.auditId) };
        });

      const page = visible.slice(0, Math.min(Number(limit) || 50, 200));
      const lastShown = page[page.length - 1];
      return {
        groups: page,
        nextBefore: visible.length > page.length && lastShown ? Math.min(...lastShown.auditIds) : null,
      };
    },

    async getSettings() {
      const { rows } = await pool.query(`SELECT key, value, updated_at FROM safety_settings`);
      const settings = { ...DEFAULT_SAFETY_SETTINGS };
      for (const row of rows) settings[row.key] = row.value;
      return settings;
    },

    async updateSettings(patch) {
      const allowed = {
        ai_writes_enabled: (value) => typeof value === 'boolean',
        ai_allow_hard_delete: (value) => typeof value === 'boolean',
        ai_max_rows_per_run: (value) => Number.isInteger(value) && value >= 1 && value <= 10000,
      };
      const entries = Object.entries(patch ?? {}).filter(([key, value]) => allowed[key]?.(value));
      if (entries.length === 0) throw new SafetyError('Žádné platné nastavení ke změně.');
      for (const [key, value] of entries) {
        await pool.query(
          `INSERT INTO safety_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, JSON.stringify(value)]
        );
      }
      return this.getSettings();
    },

    async getActivitySummary() {
      const { rows } = await pool.query(
        `SELECT
           count(*) FILTER (WHERE at > now() - interval '24 hours') AS last_day,
           count(*) FILTER (WHERE at > now() - interval '7 days') AS last_week,
           count(*) FILTER (WHERE op = 'D' AND at > now() - interval '7 days') AS deletes_week,
           count(DISTINCT changeset_id) FILTER (WHERE actor_type = 'ai_agent') AS agent_runs,
           count(*) AS total,
           min(at) AS oldest
         FROM audit_log`
      );
      const row = rows[0] ?? {};
      return {
        lastDay: Number(row.last_day ?? 0),
        lastWeek: Number(row.last_week ?? 0),
        deletesWeek: Number(row.deletes_week ?? 0),
        agentRuns: Number(row.agent_runs ?? 0),
        total: Number(row.total ?? 0),
        oldest: row.oldest ?? null,
      };
    },

    async listActors() {
      const { rows } = await pool.query(
        `SELECT actor_user_id AS id, max(actor_name) AS name, actor_type AS type, count(*) AS changes
           FROM audit_log GROUP BY actor_user_id, actor_type ORDER BY max(at) DESC LIMIT 100`
      );
      return rows.map((row) => ({ id: row.id, name: row.name, type: row.type, changes: Number(row.changes) }));
    },

    // Old log entries go after AUDIT_RETENTION_DAYS (default a year). The deleted
    // documents' bytes go with them.
    async purgeOldAuditEntries(days) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('walter.audit_maintenance', 'on', true)");
        const { rowCount } = await client.query(
          `DELETE FROM audit_log WHERE at < now() - ($1::int * interval '1 day')`,
          [days]
        );
        await client.query('COMMIT');
        return rowCount;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

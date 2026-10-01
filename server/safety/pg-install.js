// Installs the safety layer into Postgres: the change log, the guards against
// destructive statements, and the brakes for the AI agent.
//
// It lives in the database rather than in the route handlers on purpose. The
// app writes through ~60 different code paths, and the future AI agent will add
// more; a trigger sees every one of them, including edits made straight in
// Railway's data tab. Everything here is idempotent and runs on every boot.
//
// Escape hatches, all session settings that only last as long as they are set:
//   walter.suppress_audit     = on   skip the change log (unused by the app)
//   walter.allow_mass_delete  = on   lift the per-statement delete limit
//   walter.allow_truncate     = on   allow TRUNCATE
//   walter.audit_maintenance  = on   allow deleting old change-log entries
//   walter.allow_drop         = on   allow DROP TABLE / DROP COLUMN in public

import {
  AGENT_FORBIDDEN_TABLES,
  AUDIT_EXCLUDED_TABLES,
  IGNORED_CHANGE_FIELDS,
  MASS_DELETE_LIMIT,
  MASS_DELETE_UNGUARDED_TABLES,
  REDACTED_VALUE,
  isAgentReadableTable,
  isSafeIdentifier,
  quoteIdent,
} from './tables.js';

export const AGENT_READONLY_ROLE = 'walter_ai_readonly';

export const DEFAULT_SAFETY_SETTINGS = {
  ai_writes_enabled: true,
  ai_allow_hard_delete: false,
  ai_max_rows_per_run: 200,
};

const sqlTextArray = (values) => `ARRAY[${values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ')}]::text[]`;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    tx_id BIGINT NOT NULL DEFAULT txid_current(),
    table_name TEXT NOT NULL,
    row_id TEXT,
    op CHAR(1) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    actor_user_id INTEGER,
    actor_name TEXT,
    actor_type TEXT NOT NULL DEFAULT 'system',
    request_id TEXT,
    changeset_id TEXT,
    route TEXT,
    note TEXT,
    reverts TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_log_at ON audit_log (at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_log_row ON audit_log (table_name, row_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_log_changeset ON audit_log (changeset_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (actor_user_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_log_reverts ON audit_log (reverts) WHERE reverts IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_audit_log_deletes ON audit_log (id DESC) WHERE op = 'D';

  -- The bytes of deleted documents, so a deleted file can come back.
  CREATE TABLE IF NOT EXISTS audit_blobs (
    audit_id BIGINT PRIMARY KEY REFERENCES audit_log(id) ON DELETE CASCADE,
    sha256 TEXT NOT NULL,
    data BYTEA NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_blobs_sha ON audit_blobs (sha256);

  CREATE TABLE IF NOT EXISTS safety_settings (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS backups (
    id BIGSERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_by_user_id INTEGER,
    created_by_name TEXT,
    table_counts JSONB,
    size_bytes BIGINT,
    file_count INTEGER,
    file_bytes BIGINT,
    offsite_status TEXT,
    offsite_key TEXT,
    offsite_error TEXT,
    encrypted BOOLEAN NOT NULL DEFAULT false,
    checksum TEXT,
    archive BYTEA,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_backups_created ON backups (created_at DESC);

  -- Document files already copied off-site, by content hash. Each file goes up
  -- once, however many backups reference it.
  -- Keyed by location too, so pointing backups at another bucket uploads
  -- everything there instead of trusting what was stored elsewhere.
  CREATE TABLE IF NOT EXISTS backup_files (
    location TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    stored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (location, sha256)
  );
  CREATE TABLE IF NOT EXISTS backup_file_refs (
    backup_id BIGINT NOT NULL REFERENCES backups(id) ON DELETE CASCADE,
    sha256 TEXT NOT NULL,
    PRIMARY KEY (backup_id, sha256)
  );
  CREATE INDEX IF NOT EXISTS idx_backup_file_refs_sha ON backup_file_refs (sha256);
`;

const FUNCTIONS_SQL = `
  CREATE OR REPLACE FUNCTION walter_ctx() RETURNS jsonb
  LANGUAGE plpgsql STABLE AS $fn$
  BEGIN
    RETURN nullif(current_setting('walter.ctx', true), '')::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END
  $fn$;

  -- Brakes on what an AI agent may write (fail closed: the write is refused).
  CREATE OR REPLACE FUNCTION walter_check_agent_write(tbl text, op text, ctx jsonb) RETURNS void
  LANGUAGE plpgsql AS $fn$
  DECLARE
    settings jsonb;
    used bigint;
    max_rows int;
  BEGIN
    SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO settings
      FROM safety_settings WHERE key LIKE 'ai\\_%';

    IF coalesce((settings->>'ai_writes_enabled')::boolean, true) = false THEN
      RAISE EXCEPTION 'Walter safety: AI agent writes are switched off.'
        USING ERRCODE = 'WS001';
    END IF;

    IF op = 'DELETE' AND coalesce((settings->>'ai_allow_hard_delete')::boolean, false) = false THEN
      RAISE EXCEPTION 'Walter safety: the AI agent may not delete records from %; archive them instead.', tbl
        USING ERRCODE = 'WS001';
    END IF;

    max_rows := coalesce((settings->>'ai_max_rows_per_run')::int, 200);
    IF ctx ? 'c' THEN
      SELECT count(*) INTO used FROM audit_log WHERE changeset_id = ctx->>'c';
      IF used >= max_rows THEN
        RAISE EXCEPTION 'Walter safety: AI agent run % reached its limit of % changed records.', ctx->>'c', max_rows
          USING ERRCODE = 'WS001';
      END IF;
    END IF;
  END
  $fn$;

  -- The change log. One row per inserted, updated or deleted record, with the
  -- whole record before and after.
  CREATE OR REPLACE FUNCTION walter_audit_row() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  DECLARE
    ctx jsonb;
    actor text;
    old_j jsonb;
    new_j jsonb;
    changed text[];
    new_audit_id bigint;
    blob bytea;
  BEGIN
    IF coalesce(current_setting('walter.suppress_audit', true), '') = 'on' THEN
      RETURN NULL;
    END IF;

    ctx := walter_ctx();
    actor := coalesce(ctx->>'t', 'system');

    -- File bytes never go into the JSON (a deleted file's bytes go to
    -- audit_blobs). walter_document_json skips the column instead of encoding
    -- a whole file as hex only to throw it away.
    IF TG_TABLE_NAME = 'documents' THEN
      IF TG_OP <> 'INSERT' THEN EXECUTE 'SELECT walter_document_json($1)' INTO old_j USING OLD; END IF;
      IF TG_OP <> 'DELETE' THEN EXECUTE 'SELECT walter_document_json($1)' INTO new_j USING NEW; END IF;
    ELSE
      IF TG_OP <> 'INSERT' THEN old_j := to_jsonb(OLD); END IF;
      IF TG_OP <> 'DELETE' THEN new_j := to_jsonb(NEW); END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO changed
        FROM (SELECT jsonb_object_keys(new_j) AS k UNION SELECT jsonb_object_keys(old_j)) keys
       WHERE (new_j -> k) IS DISTINCT FROM (old_j -> k)
         AND NOT (k = ANY (${sqlTextArray(IGNORED_CHANGE_FIELDS)}));
      IF cardinality(changed) = 0 THEN
        RETURN NULL;
      END IF;
    END IF;

    IF actor = 'ai_agent' THEN
      PERFORM walter_check_agent_write(TG_TABLE_NAME, TG_OP, ctx);
    END IF;

    IF TG_TABLE_NAME = 'users' THEN
      IF old_j->>'password_hash' IS NOT NULL THEN
        old_j := jsonb_set(old_j, '{password_hash}', to_jsonb('${REDACTED_VALUE}'::text));
      END IF;
      IF new_j->>'password_hash' IS NOT NULL THEN
        new_j := jsonb_set(new_j, '{password_hash}', to_jsonb('${REDACTED_VALUE}'::text));
      END IF;
    END IF;

    -- Logging must never take a user's save down with it: on failure, warn.
    BEGIN
      INSERT INTO audit_log (table_name, row_id, op, old_data, new_data, changed_fields,
                             actor_user_id, actor_name, actor_type, request_id, changeset_id,
                             route, note, reverts)
      VALUES (TG_TABLE_NAME, coalesce(new_j->>'id', old_j->>'id'), left(TG_OP, 1), old_j, new_j, changed,
              (ctx->>'u')::int, ctx->>'n', actor, ctx->>'r',
              coalesce(ctx->>'c', 'tx-' || txid_current()::text),
              ctx->>'p', ctx->>'note', ctx->>'rv')
      RETURNING id INTO new_audit_id;

      IF TG_TABLE_NAME = 'documents' AND TG_OP = 'DELETE' THEN
        EXECUTE 'SELECT ($1).data' INTO blob USING OLD;
        IF blob IS NOT NULL THEN
          INSERT INTO audit_blobs (audit_id, sha256, data)
          VALUES (new_audit_id, encode(sha256(blob), 'hex'), blob);
        END IF;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'walter audit: could not log % on %: %', TG_OP, TG_TABLE_NAME, SQLERRM;
    END;

    RETURN NULL;
  END
  $fn$;

  -- Refuse one statement that deletes more than a handful of rows. Rows that
  -- went because their parent was deleted (ON DELETE CASCADE — a subject taking
  -- its commissions with it) do not count: those parents are passed in as
  -- (parent table, column) argument pairs, and a row whose parent is gone is a
  -- cascade. The statement-level trigger fires after the cascade finished.
  CREATE OR REPLACE FUNCTION walter_guard_mass_delete() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  DECLARE
    deleted_count bigint;
    max_rows int := TG_ARGV[0]::int;
    direct_rows text := 'true';
    i int := 1;
  BEGIN
    IF coalesce(current_setting('walter.allow_mass_delete', true), '') = 'on' THEN
      RETURN NULL;
    END IF;
    WHILE i + 1 < TG_NARGS LOOP
      direct_rows := direct_rows || format(
        ' AND (d.%I IS NULL OR EXISTS (SELECT 1 FROM %I p WHERE p.id = d.%I))',
        TG_ARGV[i + 1], TG_ARGV[i], TG_ARGV[i + 1]);
      i := i + 2;
    END LOOP;
    EXECUTE 'SELECT count(*) FROM walter_deleted_rows d WHERE ' || direct_rows INTO deleted_count;
    IF deleted_count > max_rows THEN
      RAISE EXCEPTION 'Walter safety: refusing to delete % rows from % in one statement (limit %).',
        deleted_count, TG_TABLE_NAME, max_rows
        USING ERRCODE = 'WS002',
              HINT = 'Delete records one by one, or SET LOCAL walter.allow_mass_delete = on inside a transaction if this is really intended.';
    END IF;
    RETURN NULL;
  END
  $fn$;

  CREATE OR REPLACE FUNCTION walter_guard_truncate() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF coalesce(current_setting('walter.allow_truncate', true), '') = 'on' THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'Walter safety: TRUNCATE of % is blocked.', TG_TABLE_NAME
      USING ERRCODE = 'WS003',
            HINT = 'SET LOCAL walter.allow_truncate = on inside a transaction if this is really intended.';
  END
  $fn$;

  CREATE OR REPLACE FUNCTION walter_protect_audit() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF coalesce(current_setting('walter.audit_maintenance', true), '') = 'on' THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Walter safety: the change log is append-only.'
      USING ERRCODE = 'WS004';
  END
  $fn$;

  -- Depth > 1 means the write comes from another trigger — the change log
  -- recording the agent's own edit — not from the agent itself.
  CREATE OR REPLACE FUNCTION walter_block_agent() RETURNS trigger
  LANGUAGE plpgsql AS $fn$
  BEGIN
    IF pg_trigger_depth() = 1 AND walter_ctx()->>'t' = 'ai_agent' THEN
      RAISE EXCEPTION 'Walter safety: the AI agent may not change %.', TG_TABLE_NAME
        USING ERRCODE = 'WS001';
    END IF;
    RETURN NULL;
  END
  $fn$;

  CREATE OR REPLACE FUNCTION walter_guard_drop() RETURNS event_trigger
  LANGUAGE plpgsql AS $fn$
  DECLARE
    obj record;
  BEGIN
    IF coalesce(current_setting('walter.allow_drop', true), '') = 'on' THEN
      RETURN;
    END IF;
    FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects() LOOP
      IF (obj.object_type IN ('table', 'table column') AND obj.schema_name = 'public' AND NOT obj.is_temporary)
         OR (obj.object_type = 'schema' AND obj.object_name = 'public') THEN
        RAISE EXCEPTION 'Walter safety: dropping % is blocked.', obj.object_identity
          USING ERRCODE = 'WS005',
                HINT = 'SET LOCAL walter.allow_drop = on inside a transaction if this is really intended.';
      END IF;
    END LOOP;
  END
  $fn$;
`;

async function listPublicTables(client) {
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  return rows.map((row) => row.tablename).filter(isSafeIdentifier);
}

// Single-column ON DELETE CASCADE foreign keys onto a parent's id, per child.
async function listCascadeParents(client) {
  const { rows } = await client.query(`
    SELECT child.relname AS child, parent.relname AS parent, col.attname AS column_name
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      JOIN pg_class parent ON parent.oid = c.confrelid
      JOIN pg_attribute col ON col.attrelid = c.conrelid AND col.attnum = c.conkey[1]
      JOIN pg_attribute parent_col ON parent_col.attrelid = c.confrelid AND parent_col.attnum = c.confkey[1]
     WHERE c.contype = 'f'
       AND c.confdeltype = 'c'
       AND cardinality(c.conkey) = 1
       AND parent_col.attname = 'id'
       AND c.connamespace = 'public'::regnamespace
     ORDER BY child.relname, c.conname
  `);
  const byChild = new Map();
  for (const row of rows) {
    if (!isSafeIdentifier(row.parent) || !isSafeIdentifier(row.column_name)) continue;
    if (!byChild.has(row.child)) byChild.set(row.child, []);
    byChild.get(row.child).push(row.parent, row.column_name);
  }
  return byChild;
}

async function installTableTriggers(client, tables) {
  const forbidden = new Set(AGENT_FORBIDDEN_TABLES);
  const cascadeParents = await listCascadeParents(client);

  for (const table of tables) {
    const audited = !AUDIT_EXCLUDED_TABLES.has(table);

    if (audited) {
      await client.query(`
        CREATE OR REPLACE TRIGGER walter_audit
        AFTER INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION walter_audit_row()
      `);
    } else {
      await client.query(`DROP TRIGGER IF EXISTS walter_audit ON "${table}"`);
    }

    if (audited && !MASS_DELETE_UNGUARDED_TABLES.has(table)) {
      await client.query(`
        CREATE OR REPLACE TRIGGER walter_guard_mass_delete
        AFTER DELETE ON "${table}"
        REFERENCING OLD TABLE AS walter_deleted_rows
        FOR EACH STATEMENT EXECUTE FUNCTION walter_guard_mass_delete(${
          [String(MASS_DELETE_LIMIT), ...(cascadeParents.get(table) ?? [])].map((arg) => `'${arg}'`).join(', ')
        })
      `);
    } else {
      await client.query(`DROP TRIGGER IF EXISTS walter_guard_mass_delete ON "${table}"`);
    }

    await client.query(`
      CREATE OR REPLACE TRIGGER walter_guard_truncate
      BEFORE TRUNCATE ON "${table}"
      FOR EACH STATEMENT EXECUTE FUNCTION walter_guard_truncate()
    `);

    if (forbidden.has(table)) {
      await client.query(`
        CREATE OR REPLACE TRIGGER walter_block_agent
        BEFORE INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH STATEMENT EXECUTE FUNCTION walter_block_agent()
      `);
    } else {
      await client.query(`DROP TRIGGER IF EXISTS walter_block_agent ON "${table}"`);
    }
  }

  for (const table of ['audit_log', 'audit_blobs']) {
    await client.query(`
      CREATE OR REPLACE TRIGGER walter_protect_audit
      BEFORE UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION walter_protect_audit()
    `);
  }
}

// documents as JSON without the file bytes. The column list is read from the
// catalog on every boot, right after initDatabase may have added columns.
async function installDocumentJson(client, tables) {
  if (!tables.includes('documents')) return 'skipped';
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents' AND column_name <> 'data'
      ORDER BY ordinal_position`
  );
  const pairs = rows.map(({ column_name: name }) => `${client.escapeLiteral(name)}, d.${quoteIdent(name)}`);
  await client.query(`
    CREATE OR REPLACE FUNCTION walter_document_json(d documents) RETURNS jsonb
    LANGUAGE sql STABLE AS $fn$ SELECT jsonb_build_object(${pairs.join(', ')}) $fn$
  `);
  return 'ok';
}

// Blocking DROP TABLE needs an event trigger, which only a superuser can make.
// Railway's default user is one; anywhere else this just logs and moves on.
async function installDropGuard(client) {
  const { rows } = await client.query(`SELECT 1 FROM pg_event_trigger WHERE evtname = 'walter_guard_drop'`);
  if (rows.length > 0) return 'installed';
  await client.query(`CREATE EVENT TRIGGER walter_guard_drop ON sql_drop EXECUTE FUNCTION walter_guard_drop()`);
  return 'installed';
}

// The AI agent searches through its own login, which can only read. Created
// only once AI_READONLY_DB_PASSWORD is set, so nothing changes until then.
async function installAgentReadonlyRole(client, tables) {
  const password = process.env.AI_READONLY_DB_PASSWORD;
  if (!password) return 'not-configured';

  await client.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${AGENT_READONLY_ROLE}') THEN
        CREATE ROLE ${AGENT_READONLY_ROLE} LOGIN;
      END IF;
    END $$;
  `);
  await client.query(
    `ALTER ROLE ${AGENT_READONLY_ROLE} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${client.escapeLiteral(password)}`
  );
  await client.query(`ALTER ROLE ${AGENT_READONLY_ROLE} SET default_transaction_read_only = on`);
  await client.query(`ALTER ROLE ${AGENT_READONLY_ROLE} SET statement_timeout = '15s'`);
  const { rows: dbRows } = await client.query('SELECT current_database() AS name');
  await client.query(`GRANT CONNECT ON DATABASE "${dbRows[0].name}" TO ${AGENT_READONLY_ROLE}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${AGENT_READONLY_ROLE}`);
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${AGENT_READONLY_ROLE}`);

  for (const table of tables) {
    if (isAgentReadableTable(table)) {
      await client.query(`GRANT SELECT ON "${table}" TO ${AGENT_READONLY_ROLE}`);
    }
  }

  // Document metadata, never the file bytes.
  if (tables.includes('documents')) {
    const { rows } = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'documents' AND column_name <> 'data'`
    );
    const columns = rows.map((row) => row.column_name);
    if (columns.length > 0) {
      await client.query(`GRANT SELECT (${columns.map(quoteIdent).join(', ')}) ON documents TO ${AGENT_READONLY_ROLE}`);
    }
  }

  return 'installed';
}

async function seedSettings(client) {
  for (const [key, value] of Object.entries(DEFAULT_SAFETY_SETTINGS)) {
    await client.query(
      `INSERT INTO safety_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value)]
    );
  }
}

// Status of the last install, shown on the admin screen.
export const installStatus = {
  installedAt: null,
  auditedTables: 0,
  dropGuard: 'unknown',
  agentReadonlyRole: 'unknown',
  errors: [],
};

// Never throws: a failure here must not stop the app from starting.
export async function installSafetyLayer(client) {
  installStatus.errors = [];
  const step = async (name, fn) => {
    try {
      return await fn();
    } catch (error) {
      console.error(`✗ Safety layer: ${name} failed:`, error.message);
      installStatus.errors.push(`${name}: ${error.message}`);
      return 'failed';
    }
  };

  await step('lock', () => client.query(`SELECT pg_advisory_lock(hashtext('walter_safety_install'))`));
  try {
    const schemaOk = await step('schema', async () => {
      await client.query(SCHEMA_SQL);
      await client.query(FUNCTIONS_SQL);
      await seedSettings(client);
      return 'ok';
    });
    if (schemaOk !== 'ok') return installStatus;

    const tables = await listPublicTables(client);
    await step('document json', () => installDocumentJson(client, tables));
    await step('triggers', () => installTableTriggers(client, tables));
    installStatus.auditedTables = tables.filter((table) => !AUDIT_EXCLUDED_TABLES.has(table)).length;
    installStatus.dropGuard = await step('drop guard', () => installDropGuard(client));
    installStatus.agentReadonlyRole = await step('agent read-only role', () => installAgentReadonlyRole(client, tables));
    installStatus.installedAt = new Date().toISOString();

    console.log(`✓ Safety layer installed (change log on ${installStatus.auditedTables} tables, drop guard: ${installStatus.dropGuard})`);
  } finally {
    await step('unlock', () => client.query(`SELECT pg_advisory_unlock(hashtext('walter_safety_install'))`));
  }

  return installStatus;
}

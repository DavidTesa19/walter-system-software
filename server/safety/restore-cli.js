#!/usr/bin/env node
// Disaster recovery from the command line, for when the app itself cannot be
// used — the database is gone, or empty, so there is no admin to log in with.
//
// Restores into whatever DATABASE_URL points at (server/.env or the shell).
// Without --yes it only reports what it would change.
//
//   node safety/restore-cli.js --list                    list off-site backups
//   node safety/restore-cli.js --latest                  newest off-site backup
//   node safety/restore-cli.js --key archives/2026/...   a specific off-site backup
//   node safety/restore-cli.js --file zaloha.json.gz     a backup downloaded from the app
//
// Options:
//   --groups subjects,documents,...  only these restore groups (default: all)
//   --yes                            actually write; otherwise a dry run
//
// Document files come from the database if they are still there, otherwise
// from the off-site bucket (BACKUP_S3_* and, if used, BACKUP_ENCRYPTION_KEY).

import fs from 'node:fs';
import crypto from 'node:crypto';
import db, { initDatabase } from '../db.js';
import { runWithContext } from './context.js';
import { createOffsiteStorage } from './offsite.js';
import { applyArchive, readArchiveBuffer, selectArchiveTables } from './backups.js';
import { RESTORE_GROUPS } from './tables.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

async function main() {
  if (!process.env.DATABASE_URL) fail('DATABASE_URL není nastavená.');
  const target = new URL(process.env.DATABASE_URL);
  const offsite = createOffsiteStorage();

  if (flag('list')) {
    if (!offsite) fail('Off-site úložiště není nastavené (BACKUP_S3_*).');
    const archives = await offsite.listArchives();
    for (const item of archives) {
      console.log(`${item.key}  ${(item.size / 1024).toFixed(0)} kB`);
    }
    if (archives.length === 0) console.log('Žádné zálohy.');
    return;
  }

  let buffer;
  let source;
  if (option('file')) {
    source = option('file');
    buffer = fs.readFileSync(source);
  } else if (option('key') || flag('latest')) {
    if (!offsite) fail('Off-site úložiště není nastavené (BACKUP_S3_*).');
    let key = option('key');
    if (!key) {
      const archives = await offsite.listArchives();
      if (archives.length === 0) fail('V off-site úložišti nejsou žádné zálohy.');
      key = archives[0].key;
    }
    source = `off-site ${key}`;
    buffer = await offsite.get(key);
  } else {
    fail('Zadejte --list, --latest, --key <klíč> nebo --file <soubor>.');
  }

  const archive = await readArchiveBuffer(buffer);
  const groupsOption = option('groups');
  const groups = groupsOption ? groupsOption.split(',').map((g) => g.trim()) : RESTORE_GROUPS.map((g) => g.id);
  const tables = selectArchiveTables(archive, groups);
  const write = flag('yes');

  console.log(`Záloha:  #${archive.backupId} (${archive.kind}) z ${archive.createdAt}, zdroj: ${source}`);
  console.log(`Cíl:     ${target.hostname}:${target.port || 5432}${target.pathname}`);
  console.log(`Skupiny: ${groups.join(', ')}`);
  console.log(write ? 'Režim:   ZÁPIS' : 'Režim:   jen náhled (pro zápis přidejte --yes)');

  // Creates the schema on an empty database, and the safety triggers with it.
  await initDatabase();

  const fetchFile = async (sha) => {
    if (!offsite) return null;
    try {
      const data = await offsite.get(offsite.fileKey(sha));
      return crypto.createHash('sha256').update(data).digest('hex') === sha ? data : null;
    } catch {
      return null;
    }
  };

  const result = await runWithContext({
    detachRequest: true,
    type: 'system',
    changesetId: `restore-cli-${crypto.randomUUID()}`,
    note: `Obnova z příkazové řádky ze zálohy #${archive.backupId}`,
    reverts: `backup:${archive.backupId}`,
  }, async () => {
    const client = await db.getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('walter.allow_mass_delete', 'on', true)");
      const fileExists = async (sha) => Boolean(offsite) && offsite.exists(offsite.fileKey(sha)).catch(() => false);
      const outcome = await applyArchive(client, archive, { tables, dryRun: !write, fetchFile, fileExists });
      await client.query(write ? 'COMMIT' : 'ROLLBACK');
      return outcome;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  for (const table of result.tables) {
    console.log(`  ${table.label.padEnd(40)} +${table.inserted}  ~${table.updated}  -${table.deleted}`);
  }
  console.log(`Celkem: obnoveno ${result.totals.inserted}, upraveno ${result.totals.updated}, odebráno ${result.totals.deleted}`);
  if (result.missingFiles.length > 0) {
    console.log(`⚠ ${result.missingFiles.length} souborů se nepodařilo najít: ${result.missingFiles.map((f) => f.filename).join(', ')}`);
  }
  console.log(write ? '✓ Hotovo.' : 'Nic nebylo zapsáno.');
}

main()
  .catch((error) => {
    console.error('✗', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.getPool()?.end());

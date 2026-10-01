// Admin API for the change log, the trash, backups and the AI agent switches.
// Everything here is admin-only.

import { runWithContext } from './context.js';
import { installStatus } from './pg-install.js';
import { createPgSafetyStore, SafetyError } from './pg-store.js';
import { BACKUP_KIND_LABELS, createPgBackupService, startBackupScheduler } from './backups.js';
import { publicRestoreGroups } from './tables.js';

const DEFAULT_AUDIT_RETENTION_DAYS = 365;
const RESTORE_CONFIRMATION = 'OBNOVIT';

const UNAVAILABLE_REASON =
  'Historie změn a zálohy běží jen nad databází PostgreSQL (produkce). Lokální JSON režim je nemá.';

const sendError = (res, error, fallback) => {
  if (error instanceof SafetyError) {
    return res.status(error.status).json({ error: error.message, details: error.details });
  }
  if (typeof error?.code === 'string' && error.code.startsWith('WS')) {
    return res.status(409).json({ error: error.message });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
};

const wrap = (fallback, handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    sendError(res, error, fallback);
  }
};

/**
 * pool: the Postgres pool, or null in the JSON development backend, where the
 * routes answer that the feature is unavailable instead of 404ing.
 * notifyAdmins({ subject, text }): optional alert for failed nightly backups.
 */
export function registerSafetyRoutes(app, { authenticateToken, requireRole, pool, notifyAdmins = async () => {} }) {
  const guard = [authenticateToken, requireRole('admin')];

  if (!pool) {
    app.get('/api/safety/status', ...guard, (_req, res) => res.json({ available: false, reason: UNAVAILABLE_REASON }));
    app.all(/^\/api\/safety\/.+/, ...guard, (_req, res) => res.status(503).json({ error: UNAVAILABLE_REASON }));
    return { stop: () => {} };
  }

  const auditRetentionDays = Number(process.env.AUDIT_RETENTION_DAYS) > 0
    ? Number(process.env.AUDIT_RETENTION_DAYS)
    : DEFAULT_AUDIT_RETENTION_DAYS;
  const store = createPgSafetyStore(pool);
  const backups = createPgBackupService({
    pool,
    onBackupFailed: async (backup, error) => {
      console.error(`✗ Backup #${backup.id} (${backup.kind}) failed:`, error.message);
      await notifyAdmins({
        subject: 'Walter System: záloha se nezdařila',
        text:
          `${BACKUP_KIND_LABELS[backup.kind] ?? 'Záloha'} záloha #${backup.id} se nezdařila.\n\n` +
          `Chyba: ${error.message}\n\n` +
          'Podrobnosti najdete v aplikaci v sekci Bezpečnost a zálohy.',
      }).catch((mailError) => console.error('Backup failure e-mail not sent:', mailError.message));
    },
  });

  app.get('/api/safety/status', ...guard, wrap('Nepodařilo se načíst stav zabezpečení', async (_req, res) => {
    const [summary, settings, list] = await Promise.all([
      store.getActivitySummary(),
      store.getSettings(),
      backups.list(),
    ]);
    res.json({
      available: true,
      install: installStatus,
      summary,
      settings,
      backups: {
        config: backups.describeConfig(),
        latest: list[0] ?? null,
        lastSuccessful: list.find((backup) => backup.status === 'ok') ?? null,
        lastFailed: list.find((backup) => backup.status === 'failed') ?? null,
      },
      auditRetentionDays,
    });
  }));

  app.get('/api/safety/changes', ...guard, wrap('Nepodařilo se načíst historii změn', async (req, res) => {
    res.json(await store.listChanges(req.query));
  }));

  app.get('/api/safety/actors', ...guard, wrap('Nepodařilo se načíst autory změn', async (_req, res) => {
    res.json(await store.listActors());
  }));

  app.get('/api/safety/records/:table/:rowId', ...guard, wrap('Nepodařilo se načíst historii záznamu', async (req, res) => {
    res.json(await store.getRecordHistory(req.params.table, req.params.rowId));
  }));

  app.post('/api/safety/records/:table/:rowId/restore', ...guard, wrap('Nepodařilo se obnovit verzi záznamu', async (req, res) => {
    const result = await store.restoreVersion({
      table: req.params.table,
      rowId: req.params.rowId,
      auditId: req.body?.auditId,
    });
    res.status(result.ok ? 200 : 409).json(result);
  }));

  app.post('/api/safety/revert', ...guard, wrap('Nepodařilo se vrátit změnu', async (req, res) => {
    const { auditIds, changesetId, force } = req.body ?? {};
    if (!changesetId && !(Array.isArray(auditIds) && auditIds.length > 0)) {
      throw new SafetyError('Vyberte změnu, kterou chcete vrátit.');
    }
    const result = await store.revert({
      auditIds: Array.isArray(auditIds) ? auditIds : undefined,
      changesetId: typeof changesetId === 'string' ? changesetId : undefined,
      force: force === true,
    });
    res.status(result.ok ? 200 : 409).json(result);
  }));

  app.get('/api/safety/trash', ...guard, wrap('Nepodařilo se načíst koš', async (req, res) => {
    res.json(await store.listTrash({ before: req.query.before, q: req.query.q, limit: req.query.limit }));
  }));

  app.get('/api/safety/settings', ...guard, wrap('Nepodařilo se načíst nastavení', async (_req, res) => {
    res.json(await store.getSettings());
  }));

  app.put('/api/safety/settings', ...guard, wrap('Nepodařilo se uložit nastavení', async (req, res) => {
    res.json(await store.updateSettings(req.body));
  }));

  app.get('/api/safety/backups', ...guard, wrap('Nepodařilo se načíst zálohy', async (_req, res) => {
    res.json({ backups: await backups.list(), config: backups.describeConfig(), groups: publicRestoreGroups() });
  }));

  // The first off-site backup uploads every document, which can take minutes,
  // so this answers straight away and the screen polls the list.
  app.post('/api/safety/backups', ...guard, wrap('Nepodařilo se spustit zálohu', async (req, res) => {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) || null : null;
    const running = (await backups.list()).find((backup) => backup.status === 'running');
    if (running) throw new SafetyError('Jiná záloha právě probíhá, zkuste to za chvíli.', 409);
    runWithContext({}, () => backups.createBackup({ kind: 'manual', note })).catch((error) => {
      console.error('Manual backup failed:', error.message);
    });
    res.status(202).json({ started: true });
  }));

  app.post('/api/safety/backups/test-offsite', ...guard, wrap('Test off-site úložiště selhal', async (_req, res) => {
    try {
      res.json(await backups.testOffsite());
    } catch (error) {
      if (error instanceof SafetyError) throw error;
      throw new SafetyError(`Off-site úložiště neodpovídá: ${error.message}`, 502);
    }
  }));

  app.get('/api/safety/backups/:id/download', ...guard, wrap('Nepodařilo se stáhnout zálohu', async (req, res) => {
    const { buffer, filename } = await backups.download(req.params.id);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }));

  app.post('/api/safety/backups/:id/restore', ...guard, wrap('Obnova ze zálohy selhala', async (req, res) => {
    const { groups, dryRun, confirm } = req.body ?? {};
    if (!dryRun && confirm !== RESTORE_CONFIRMATION) {
      throw new SafetyError(`Pro potvrzení obnovy napište ${RESTORE_CONFIRMATION}.`);
    }
    const result = await backups.restore(req.params.id, {
      groups: Array.isArray(groups) ? groups.filter((group) => typeof group === 'string') : undefined,
      dryRun: dryRun === true,
    });
    res.json(result);
  }));

  app.delete('/api/safety/backups/:id', ...guard, wrap('Nepodařilo se smazat zálohu', async (req, res) => {
    res.json(await backups.remove(req.params.id));
  }));

  const stop = startBackupScheduler({ pool, service: backups, store, auditRetentionDays });
  return { store, backups, stop };
}

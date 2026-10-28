// API for Hlášení chyb. Anyone signed in can report a bug (with screenshots)
// and read the reports; admins and managers triage them (status, severity,
// resolution note). A report is deleted by an admin, or by its author while
// nobody has started on it yet.

import multer from 'multer';
import { z } from 'zod/v4';
import { reenterRequestContext } from '../safety/context.js';
import { createFileBugReportStore, createPgBugReportStore } from './store.js';

export const BUG_SEVERITIES = ['low', 'medium', 'high', 'critical'];
export const BUG_STATUSES = ['new', 'in_progress', 'resolved', 'wont_fix'];
const CLOSED_STATUSES = new Set(['resolved', 'wont_fix']);

const MAX_SCREENSHOTS = 6;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
// Raster images only: an SVG or HTML "screenshot" served back from our own
// origin could run script.
const SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const text = (max) => z.string().trim().max(max).nullable().optional();

const createInput = z.object({
  title: z.string().trim().min(1, 'Napište stručně, co nefunguje.').max(300),
  description: text(10000),
  severity: z.enum(BUG_SEVERITIES),
  viewId: text(100),
  viewLabel: text(200),
  pageUrl: text(2000),
  viewport: text(50),
});

const updateInput = z
  .object({
    title: z.string().trim().min(1, 'Název nemůže být prázdný.').max(300),
    description: text(10000),
    severity: z.enum(BUG_SEVERITIES),
    status: z.enum(BUG_STATUSES),
    resolutionNote: text(5000),
  })
  .partial()
  .strict();

const firstIssue = (error) => error.issues[0]?.message ?? 'Neplatná data.';

const wrap = (fallback, handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error(fallback, error);
    res.status(500).json({ error: fallback });
  }
};

// Busboy hands multer the filename as latin1; browsers send UTF-8.
const uploadedFilename = (raw) => {
  const name = String(raw ?? '').replace(/[\r\n]/g, '').trim() || 'snimek';
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return (decoded.includes('�') ? name : decoded).slice(-180);
};

const canTriage = (user) => user.role === 'admin' || user.role === 'manager';

/**
 * pool: the Postgres pool, or null in the JSON development backend (the data
 * then lives in bug-reports.json in dataDir).
 */
export function registerBugReportRoutes(app, { authenticateToken, pool, dataDir }) {
  const store = pool ? createPgBugReportStore(pool) : createFileBugReportStore(dataDir);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SCREENSHOT_BYTES, files: MAX_SCREENSHOTS },
  }).array('screenshots', MAX_SCREENSHOTS);
  // multer's own errors (too large, too many) as a readable 400.
  const readScreenshots = (req, res, next) =>
    upload(req, res, (error) => {
      if (!error) return next();
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Snímek je větší než ${MAX_SCREENSHOT_BYTES / 1024 / 1024} MB.`
          : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Přiložit jde nejvýše ${MAX_SCREENSHOTS} snímků.`
            : 'Snímky se nepodařilo přijmout.';
      res.status(400).json({ error: message });
    });

  app.get('/api/bug-reports', authenticateToken, wrap('Hlášení se nepodařilo načíst.', async (req, res) => {
    res.json({ reports: await store.listReports(), canTriage: canTriage(req.user) });
  }));

  app.post(
    '/api/bug-reports',
    authenticateToken,
    readScreenshots,
    // multer resumes the chain from a stream event; without this the change
    // log would record the report as written by "system".
    reenterRequestContext,
    wrap('Hlášení se nepodařilo uložit.', async (req, res) => {
      const parsed = createInput.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
      const files = req.files ?? [];
      const unsupported = files.find((file) => !SCREENSHOT_TYPES.has(file.mimetype));
      if (unsupported) {
        return res.status(400).json({ error: `${uploadedFilename(unsupported.originalname)} není obrázek (PNG, JPEG, WebP, GIF).` });
      }
      const report = await store.createReport(
        {
          ...parsed.data,
          status: 'new',
          reporterUserId: req.user.id,
          reporterName: req.user.username,
          userAgent: String(req.headers['user-agent'] ?? '').slice(0, 500) || null,
        },
        files.map((file) => ({ filename: uploadedFilename(file.originalname), mimeType: file.mimetype, buffer: file.buffer }))
      );
      res.status(201).json(report);
    })
  );

  app.patch('/api/bug-reports/:id', authenticateToken, wrap('Hlášení se nepodařilo uložit.', async (req, res) => {
    if (!canTriage(req.user)) return res.status(403).json({ error: 'Hlášení mohou upravovat jen administrátoři a manažeři.' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Neplatné ID.' });
    const parsed = updateInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const current = await store.getReport(id);
    if (!current) return res.status(404).json({ error: 'Hlášení neexistuje.' });
    const changes = { ...parsed.data };
    if (changes.status && changes.status !== current.status) {
      changes.resolvedAt = CLOSED_STATUSES.has(changes.status) ? new Date().toISOString() : null;
    }
    res.json(await store.updateReport(id, changes));
  }));

  app.delete('/api/bug-reports/:id', authenticateToken, wrap('Hlášení se nepodařilo smazat.', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Neplatné ID.' });
    const report = await store.getReport(id);
    if (!report) return res.status(404).json({ error: 'Hlášení neexistuje.' });
    const ownUntouched = report.reporterUserId === req.user.id && report.status === 'new';
    if (req.user.role !== 'admin' && !ownUntouched) {
      return res.status(403).json({ error: 'Hlášení může smazat administrátor, nebo autor, dokud se neřeší.' });
    }
    await store.deleteReport(id);
    res.status(204).end();
  }));

  app.get('/api/bug-reports/:id/screenshots/:screenshotId', authenticateToken, wrap('Snímek se nepodařilo načíst.', async (req, res) => {
    const id = Number(req.params.id);
    const screenshotId = Number(req.params.screenshotId);
    if (!Number.isInteger(id) || !Number.isInteger(screenshotId)) return res.status(400).json({ error: 'Neplatné ID.' });
    const shot = await store.getScreenshot(id, screenshotId);
    if (!shot || !SCREENSHOT_TYPES.has(shot.mimeType)) return res.status(404).json({ error: 'Snímek neexistuje.' });
    res.setHeader('Content-Type', shot.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(shot.filename)}`);
    res.send(shot.buffer);
  }));
}

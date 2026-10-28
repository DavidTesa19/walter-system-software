// Storage for Hlášení chyb, the bug reports sent from the floating bug button.
//   bug_reports             one row per report: what is wrong, how bad it is,
//                           who sent it from which screen and when
//   bug_report_screenshots  the pictures attached to a report (bytes in the
//                           row, like documents); deleted with their report
//
// Postgres in production; a JSON file next to the dev store otherwise.

import fs from 'node:fs';
import path from 'node:path';

export async function installBugReportSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      severity TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'new',
      reporter_user_id INTEGER,
      reporter_name TEXT,
      view_id TEXT,
      view_label TEXT,
      page_url TEXT,
      user_agent TEXT,
      viewport TEXT,
      resolution_note TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS bug_report_screenshots (
      id SERIAL PRIMARY KEY,
      bug_report_id INTEGER NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_bug_report_screenshots_report ON bug_report_screenshots (bug_report_id)`);
}

// API field <-> column.
const REPORT_COLUMNS = {
  title: 'title',
  description: 'description',
  severity: 'severity',
  status: 'status',
  reporterUserId: 'reporter_user_id',
  reporterName: 'reporter_name',
  viewId: 'view_id',
  viewLabel: 'view_label',
  pageUrl: 'page_url',
  userAgent: 'user_agent',
  viewport: 'viewport',
  resolutionNote: 'resolution_note',
  resolvedAt: 'resolved_at',
};

const iso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

const toReport = (row, screenshots = []) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  severity: row.severity,
  status: row.status,
  reporterUserId: row.reporter_user_id,
  reporterName: row.reporter_name,
  viewId: row.view_id,
  viewLabel: row.view_label,
  pageUrl: row.page_url,
  userAgent: row.user_agent,
  viewport: row.viewport,
  resolutionNote: row.resolution_note,
  resolvedAt: iso(row.resolved_at),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  screenshots,
});

const toScreenshotMeta = (row) => ({
  id: row.id,
  filename: row.filename,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
});

const pick = (data) => Object.fromEntries(Object.entries(data).filter(([field]) => REPORT_COLUMNS[field]));

export function createPgBugReportStore(pool) {
  const screenshotsFor = async (ids) => {
    if (!ids.length) return new Map();
    const { rows } = await pool.query(
      `SELECT id, bug_report_id, filename, mime_type, size_bytes
         FROM bug_report_screenshots WHERE bug_report_id = ANY($1::int[]) ORDER BY id`,
      [ids]
    );
    const byReport = new Map();
    for (const row of rows) {
      if (!byReport.has(row.bug_report_id)) byReport.set(row.bug_report_id, []);
      byReport.get(row.bug_report_id).push(toScreenshotMeta(row));
    }
    return byReport;
  };

  return {
    async listReports() {
      const { rows } = await pool.query(`SELECT * FROM bug_reports ORDER BY created_at DESC`);
      const screenshots = await screenshotsFor(rows.map((row) => row.id));
      return rows.map((row) => toReport(row, screenshots.get(row.id) ?? []));
    },

    async getReport(id) {
      const { rows } = await pool.query(`SELECT * FROM bug_reports WHERE id = $1`, [id]);
      if (!rows[0]) return null;
      const screenshots = await screenshotsFor([id]);
      return toReport(rows[0], screenshots.get(id) ?? []);
    },

    // The report and its pictures in one transaction: a report is never left
    // without the screenshots its author attached.
    async createReport(input, files) {
      const data = pick(input);
      const fields = Object.keys(data);
      const client = await pool.connect();
      let id;
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO bug_reports (${fields.map((field) => REPORT_COLUMNS[field]).join(', ')})
           VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})
           RETURNING id`,
          fields.map((field) => data[field])
        );
        id = rows[0].id;
        for (const file of files) {
          await client.query(
            `INSERT INTO bug_report_screenshots (bug_report_id, filename, mime_type, size_bytes, data)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, file.filename, file.mimeType, file.buffer.length, file.buffer]
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      return this.getReport(id);
    },

    async updateReport(id, input) {
      const data = pick(input);
      const fields = Object.keys(data);
      if (!fields.length) return this.getReport(id);
      const { rowCount } = await pool.query(
        `UPDATE bug_reports
            SET ${fields.map((field, index) => `${REPORT_COLUMNS[field]} = $${index + 2}`).join(', ')}, updated_at = now()
          WHERE id = $1`,
        [id, ...fields.map((field) => data[field])]
      );
      return rowCount ? this.getReport(id) : null;
    },

    async deleteReport(id) {
      const { rowCount } = await pool.query(`DELETE FROM bug_reports WHERE id = $1`, [id]);
      return rowCount > 0;
    },

    async getScreenshot(reportId, screenshotId) {
      const { rows } = await pool.query(
        `SELECT filename, mime_type, data FROM bug_report_screenshots WHERE id = $1 AND bug_report_id = $2`,
        [screenshotId, reportId]
      );
      return rows[0] ? { filename: rows[0].filename, mimeType: rows[0].mime_type, buffer: rows[0].data } : null;
    },
  };
}

// Local development: one JSON file, screenshots inside it as base64.
export function createFileBugReportStore(dataDir) {
  const file = path.join(dataDir, 'bug-reports.json');
  const read = () => {
    try {
      return { reports: [], screenshots: [], nextId: 1, nextScreenshotId: 1, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      return { reports: [], screenshots: [], nextId: 1, nextScreenshotId: 1 };
    }
  };
  const write = (data) => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), 'utf8');
  };
  const withScreenshots = (data, report) => ({
    ...report,
    screenshots: data.screenshots.filter((shot) => shot.bugReportId === report.id).map(toScreenshotMeta),
  });
  const blankReport = {
    description: null, severity: 'medium', status: 'new', reporterUserId: null, reporterName: null, viewId: null,
    viewLabel: null, pageUrl: null, userAgent: null, viewport: null, resolutionNote: null, resolvedAt: null,
  };

  return {
    async listReports() {
      const data = read();
      return data.reports
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((report) => withScreenshots(data, report));
    },

    async getReport(id) {
      const data = read();
      const report = data.reports.find((item) => item.id === id);
      return report ? withScreenshots(data, report) : null;
    },

    async createReport(input, files) {
      const data = read();
      const now = new Date().toISOString();
      const report = { id: data.nextId, ...blankReport, ...pick(input), createdAt: now, updatedAt: now };
      data.nextId += 1;
      data.reports.push(report);
      // Stored under the column names, so toScreenshotMeta reads both stores.
      for (const shot of files) {
        data.screenshots.push({
          id: data.nextScreenshotId,
          bugReportId: report.id,
          filename: shot.filename,
          mime_type: shot.mimeType,
          size_bytes: shot.buffer.length,
          data: shot.buffer.toString('base64'),
        });
        data.nextScreenshotId += 1;
      }
      write(data);
      return withScreenshots(data, report);
    },

    async updateReport(id, input) {
      const data = read();
      const report = data.reports.find((item) => item.id === id);
      if (!report) return null;
      Object.assign(report, pick(input), { updatedAt: new Date().toISOString() });
      write(data);
      return withScreenshots(data, report);
    },

    async deleteReport(id) {
      const data = read();
      const next = data.reports.filter((report) => report.id !== id);
      const removed = next.length < data.reports.length;
      data.reports = next;
      data.screenshots = data.screenshots.filter((shot) => shot.bugReportId !== id);
      write(data);
      return removed;
    },

    async getScreenshot(reportId, screenshotId) {
      const shot = read().screenshots.find((item) => item.id === screenshotId && item.bugReportId === reportId);
      return shot ? { filename: shot.filename, mimeType: shot.mime_type, buffer: Buffer.from(shot.data, 'base64') } : null;
    },
  };
}

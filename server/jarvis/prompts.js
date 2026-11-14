// Saved questions for Jarvis ("Šablony" on the Jarvis screen): a question the
// user asks often, kept under a short title and sent with one click. Each
// user has their own; one marked shared is listed for the whole team (only its
// author changes or deletes it). The table is created in store.js
// (installJarvisSchema).

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod/v4';

const MAX_PROMPTS_PER_USER = 100;

const promptInput = z
  .object({
    title: z.string().trim().min(1, 'Vyplňte název.').max(80),
    text: z.string().trim().min(1, 'Vyplňte text otázky.').max(4000),
    shared: z.boolean().optional(),
  })
  .strict();

const toPrompt = (row, userId) => ({
  id: Number(row.id),
  userId: row.user_id,
  title: row.title,
  text: row.text,
  shared: Boolean(row.is_shared),
  mine: row.user_id === userId,
  updatedAt: row.updated_at,
});

export function createPgPromptStore(pool) {
  return {
    async list(userId) {
      const { rows } = await pool.query(
        `SELECT * FROM jarvis_prompts WHERE user_id = $1 OR is_shared ORDER BY (user_id = $1) DESC, lower(title)`,
        [userId]
      );
      return rows.map((row) => toPrompt(row, userId));
    },
    async count(userId) {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM jarvis_prompts WHERE user_id = $1`, [userId]);
      return rows[0].n;
    },
    async create(userId, { title, text, shared = false }) {
      const { rows } = await pool.query(
        `INSERT INTO jarvis_prompts (user_id, title, text, is_shared) VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, title, text, shared]
      );
      return toPrompt(rows[0], userId);
    },
    async update(id, userId, { title, text, shared }) {
      const { rows } = await pool.query(
        `UPDATE jarvis_prompts
            SET title = $3, text = $4, is_shared = COALESCE($5, is_shared), updated_at = now()
          WHERE id = $1 AND user_id = $2
          RETURNING *`,
        [id, userId, title, text, typeof shared === 'boolean' ? shared : null]
      );
      return rows[0] ? toPrompt(rows[0], userId) : null;
    },
    async remove(id, userId) {
      const { rowCount } = await pool.query(`DELETE FROM jarvis_prompts WHERE id = $1 AND user_id = $2`, [id, userId]);
      return rowCount > 0;
    },
  };
}

export function createFilePromptStore(dataDir) {
  const file = path.join(dataDir, 'jarvis-prompts.json');
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return [];
    }
  };
  const write = (rows) => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rows), 'utf8');
  };
  return {
    async list(userId) {
      return read()
        .filter((row) => row.user_id === userId || row.is_shared)
        .sort((a, b) => Number(b.user_id === userId) - Number(a.user_id === userId) || a.title.localeCompare(b.title, 'cs'))
        .map((row) => toPrompt(row, userId));
    },
    async count(userId) {
      return read().filter((row) => row.user_id === userId).length;
    },
    async create(userId, { title, text, shared = false }) {
      const rows = read();
      const now = new Date().toISOString();
      const row = { id: rows.reduce((max, item) => Math.max(max, item.id), 0) + 1, user_id: userId, title, text, is_shared: shared, created_at: now, updated_at: now };
      write([...rows, row]);
      return toPrompt(row, userId);
    },
    async update(id, userId, { title, text, shared }) {
      const rows = read();
      const row = rows.find((item) => item.id === id && item.user_id === userId);
      if (!row) return null;
      Object.assign(row, { title, text, updated_at: new Date().toISOString() });
      if (typeof shared === 'boolean') row.is_shared = shared;
      write(rows);
      return toPrompt(row, userId);
    },
    async remove(id, userId) {
      const rows = read();
      const next = rows.filter((row) => !(row.id === id && row.user_id === userId));
      write(next);
      return next.length < rows.length;
    },
  };
}

export function registerPromptRoutes(app, { authenticateToken, pool, dataDir }) {
  const store = pool ? createPgPromptStore(pool) : createFilePromptStore(dataDir);
  const fail = (res, message, error) => {
    console.error(`Jarvis prompts: ${message}`, error);
    res.status(500).json({ error: message });
  };
  const idOf = (req) => (/^\d{1,15}$/.test(req.params.id) ? Number(req.params.id) : null);

  app.get('/api/jarvis/prompts', authenticateToken, async (req, res) => {
    try {
      res.json(await store.list(Number(req.user.id)));
    } catch (error) {
      fail(res, 'Šablony se nepodařilo načíst.', error);
    }
  });

  app.post('/api/jarvis/prompts', authenticateToken, async (req, res) => {
    const parsed = promptInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Neplatná šablona.' });
    try {
      const userId = Number(req.user.id);
      if ((await store.count(userId)) >= MAX_PROMPTS_PER_USER) {
        return res.status(400).json({ error: `Uložit lze nejvýš ${MAX_PROMPTS_PER_USER} šablon.` });
      }
      res.status(201).json(await store.create(userId, parsed.data));
    } catch (error) {
      fail(res, 'Šablonu se nepodařilo uložit.', error);
    }
  });

  app.put('/api/jarvis/prompts/:id', authenticateToken, async (req, res) => {
    const id = idOf(req);
    if (id === null) return res.status(404).json({ error: 'Šablona nenalezena.' });
    const parsed = promptInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Neplatná šablona.' });
    try {
      const updated = await store.update(id, Number(req.user.id), parsed.data);
      if (!updated) return res.status(404).json({ error: 'Šablona nenalezena nebo není vaše.' });
      res.json(updated);
    } catch (error) {
      fail(res, 'Šablonu se nepodařilo uložit.', error);
    }
  });

  app.delete('/api/jarvis/prompts/:id', authenticateToken, async (req, res) => {
    const id = idOf(req);
    if (id === null) return res.status(404).json({ error: 'Šablona nenalezena.' });
    try {
      const removed = await store.remove(id, Number(req.user.id));
      res.status(removed ? 204 : 404).end();
    } catch (error) {
      fail(res, 'Šablonu se nepodařilo smazat.', error);
    }
  });
}

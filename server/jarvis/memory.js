// Jarvis's memory: short notes about each user that Jarvis keeps across
// conversations ("odpovídej stručně", "podepisuj se Martin Walter, obchodní
// ředitel", "staráme se hlavně o Jihomoravský kraj"). Every new question
// carries the user's notes in its <kontext> block (routes.js), never in the
// cached system prompt.
//
// Jarvis saves and drops notes with its remember / forget tools, which call
// the routes below with the agent token like every other tool; the user sees
// a card with "Zapomenout" under the answer and manages all notes in Jarvis ›
// Nastavení. Notes are private: only their owner reads or changes them. The
// table is created in store.js (installJarvisSchema).

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod/v4';

export const MAX_MEMORIES = 40;
export const MAX_MEMORY_LENGTH = 300;

const memoryInput = z
  .object({
    text: z.string().trim().min(1, 'Poznámka je prázdná.').max(MAX_MEMORY_LENGTH, `Poznámka je delší než ${MAX_MEMORY_LENGTH} znaků.`),
    conversationId: z.string().max(64).optional(),
  })
  .strict();

const toMemory = (row) => ({
  id: Number(row.id),
  text: row.text,
  source: row.source ?? 'user',
  conversationId: row.conversation_id ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalized = (text) => String(text).replace(/\s+/g, ' ').trim();

export function createPgMemoryStore(pool) {
  return {
    async list(userId) {
      const { rows } = await pool.query(`SELECT * FROM jarvis_memories WHERE user_id = $1 ORDER BY created_at, id`, [userId]);
      return rows.map(toMemory);
    },
    async create(userId, { text, source, conversationId }) {
      const { rows } = await pool.query(
        `INSERT INTO jarvis_memories (user_id, text, source, conversation_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [userId, normalized(text), source, conversationId ?? null]
      );
      return toMemory(rows[0]);
    },
    async update(id, userId, { text }) {
      const { rows } = await pool.query(
        `UPDATE jarvis_memories SET text = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, userId, normalized(text)]
      );
      return rows[0] ? toMemory(rows[0]) : null;
    },
    async remove(id, userId) {
      const { rows } = await pool.query(`DELETE FROM jarvis_memories WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId]);
      return rows[0] ? toMemory(rows[0]) : null;
    },
  };
}

export function createFileMemoryStore(dataDir) {
  const file = path.join(dataDir, 'jarvis-memories.json');
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
      return read().filter((row) => row.user_id === userId).map(toMemory);
    },
    async create(userId, { text, source, conversationId }) {
      const rows = read();
      const now = new Date().toISOString();
      const row = {
        id: rows.reduce((max, item) => Math.max(max, item.id), 0) + 1,
        user_id: userId,
        text: normalized(text),
        source,
        conversation_id: conversationId ?? null,
        created_at: now,
        updated_at: now,
      };
      write([...rows, row]);
      return toMemory(row);
    },
    async update(id, userId, { text }) {
      const rows = read();
      const row = rows.find((item) => item.id === id && item.user_id === userId);
      if (!row) return null;
      row.text = normalized(text);
      row.updated_at = new Date().toISOString();
      write(rows);
      return toMemory(row);
    },
    async remove(id, userId) {
      const rows = read();
      const row = rows.find((item) => item.id === id && item.user_id === userId);
      if (!row) return null;
      write(rows.filter((item) => item !== row));
      return toMemory(row);
    },
  };
}

/**
 * The lines the <kontext> block gets: every note with its id (forget needs
 * it), or a word that memory is off. Empty when there is nothing to say.
 */
export function memoryContextLines(memories, { enabled = true } = {}) {
  if (!enabled) return ['Paměť: uživatel ji má vypnutou – nic si neukládej (remember) a nepoužívej uložené poznámky.'];
  if (!memories.length) return [];
  return [
    'Paměť (tvoje poznámky o uživateli z dřívějších konverzací; řiď se jimi, id je pro forget):',
    ...memories.map((memory) => `- [${memory.id}] ${String(memory.text).replace(/[<>]/g, '').slice(0, MAX_MEMORY_LENGTH)}`),
  ];
}

export function registerMemoryRoutes(app, { authenticateToken, store }) {
  const idOf = (req) => (/^\d{1,15}$/.test(req.params.id) ? Number(req.params.id) : null);
  const fail = (res, message, error) => {
    console.error(`Jarvis memory: ${message}`, error);
    res.status(500).json({ error: message });
  };
  // The agent token marks Jarvis's own calls: a note it saved says so.
  const sourceOf = (req) => (req.user?.actorType === 'ai_agent' ? 'jarvis' : 'user');

  app.get('/api/jarvis/memories', authenticateToken, async (req, res) => {
    try {
      res.json(await store.list(Number(req.user.id)));
    } catch (error) {
      fail(res, 'Paměť se nepodařilo načíst.', error);
    }
  });

  app.post('/api/jarvis/memories', authenticateToken, async (req, res) => {
    const parsed = memoryInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Neplatná poznámka.' });
    try {
      const userId = Number(req.user.id);
      const existing = await store.list(userId);
      const same = existing.find((memory) => memory.text.toLowerCase() === normalized(parsed.data.text).toLowerCase());
      if (same) return res.json(same);
      if (existing.length >= MAX_MEMORIES) {
        return res.status(400).json({ error: `Paměť je plná (${MAX_MEMORIES} poznámek). Nějakou nejdřív smažte nebo nahraďte.` });
      }
      res.status(201).json(await store.create(userId, { ...parsed.data, source: sourceOf(req) }));
    } catch (error) {
      fail(res, 'Poznámku se nepodařilo uložit.', error);
    }
  });

  app.put('/api/jarvis/memories/:id', authenticateToken, async (req, res) => {
    const id = idOf(req);
    if (id === null) return res.status(404).json({ error: 'Poznámka nenalezena.' });
    const parsed = memoryInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Neplatná poznámka.' });
    try {
      const updated = await store.update(id, Number(req.user.id), parsed.data);
      if (!updated) return res.status(404).json({ error: 'Poznámka nenalezena.' });
      res.json(updated);
    } catch (error) {
      fail(res, 'Poznámku se nepodařilo uložit.', error);
    }
  });

  app.delete('/api/jarvis/memories/:id', authenticateToken, async (req, res) => {
    const id = idOf(req);
    if (id === null) return res.status(404).json({ error: 'Poznámka nenalezena.' });
    try {
      const removed = await store.remove(id, Number(req.user.id));
      if (!removed) return res.status(404).json({ error: 'Poznámka nenalezena.' });
      res.json(removed);
    } catch (error) {
      fail(res, 'Poznámku se nepodařilo smazat.', error);
    }
  });
}

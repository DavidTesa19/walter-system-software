// Jarvis conversations.
//
// Two things are kept per conversation:
//   messages    the exact Messages API history — thinking blocks, tool calls and
//               tool results included. It is only ever appended to: rewriting an
//               earlier turn would invalidate the prompt cache and the model's
//               earlier thinking.
//   transcript  what the chat panel shows (questions, answers, tool steps,
//               offered buttons), so the UI never has to reverse-engineer it.
//
// Postgres in production; a JSON file next to the dev store otherwise.

import fs from 'node:fs';
import path from 'node:path';

// The Jarvis screen lists, searches and groups these; pinned ones always come first.
const LIST_LIMIT = 200;

export async function installJarvisSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS jarvis_conversations (
      id UUID PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT,
      model TEXT,
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
      input_tokens BIGINT NOT NULL DEFAULT 0,
      output_tokens BIGINT NOT NULL DEFAULT 0,
      cache_read_tokens BIGINT NOT NULL DEFAULT 0,
      cache_write_tokens BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_jarvis_conversations_user
      ON jarvis_conversations (user_id, updated_at DESC)
  `);
  // 2026-11-14: conversations can be pinned on the Jarvis screen.
  await client.query(`ALTER TABLE jarvis_conversations ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false`);
  // Saved questions ("Šablony" on the Jarvis screen): a user's own, and the
  // ones colleagues shared with the team.
  await client.query(`
    CREATE TABLE IF NOT EXISTS jarvis_prompts (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      is_shared BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_jarvis_prompts_user ON jarvis_prompts (user_id)`);
}

const summary = (row) => ({
  id: row.id,
  title: row.title,
  pinned: Boolean(row.pinned),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createPgConversationStore(pool) {
  return {
    async list(userId) {
      const { rows } = await pool.query(
        `SELECT id, title, pinned, created_at, updated_at FROM jarvis_conversations
          WHERE user_id = $1 ORDER BY pinned DESC, updated_at DESC LIMIT ${LIST_LIMIT}`,
        [userId]
      );
      return rows.map(summary);
    },

    async get(id, userId) {
      const { rows } = await pool.query(
        `SELECT * FROM jarvis_conversations WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return rows[0] ?? null;
    },

    async create({ id, userId, title, model }) {
      await pool.query(
        `INSERT INTO jarvis_conversations (id, user_id, title, model) VALUES ($1, $2, $3, $4)`,
        [id, userId, title, model]
      );
    },

    async append(id, userId, { messages, transcript, usage }) {
      await pool.query(
        `UPDATE jarvis_conversations
            SET messages = messages || $3::jsonb,
                transcript = transcript || $4::jsonb,
                input_tokens = input_tokens + $5,
                output_tokens = output_tokens + $6,
                cache_read_tokens = cache_read_tokens + $7,
                cache_write_tokens = cache_write_tokens + $8,
                updated_at = now()
          WHERE id = $1 AND user_id = $2`,
        [id, userId, JSON.stringify(messages), JSON.stringify(transcript),
          usage.input, usage.output, usage.cacheRead, usage.cacheWrite]
      );
    },

    // A new title or pin. updated_at stays: renaming does not move it up the list.
    async update(id, userId, { title, pinned }) {
      const { rows } = await pool.query(
        `UPDATE jarvis_conversations
            SET title = COALESCE($3, title),
                pinned = COALESCE($4, pinned)
          WHERE id = $1 AND user_id = $2
          RETURNING id, title, pinned, created_at, updated_at`,
        [id, userId, title ?? null, typeof pinned === 'boolean' ? pinned : null]
      );
      return rows[0] ? summary(rows[0]) : null;
    },

    async remove(id, userId) {
      const { rowCount } = await pool.query(
        `DELETE FROM jarvis_conversations WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      return rowCount > 0;
    },
  };
}

// Local development: one JSON file, rewritten on every change.
export function createFileConversationStore(dataDir) {
  const file = path.join(dataDir, 'jarvis-conversations.json');
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
        .filter((row) => row.user_id === userId)
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, LIST_LIMIT)
        .map(summary);
    },

    async get(id, userId) {
      return read().find((row) => row.id === id && row.user_id === userId) ?? null;
    },

    async create({ id, userId, title, model }) {
      const now = new Date().toISOString();
      write([...read(), {
        id, user_id: userId, title, model, messages: [], transcript: [],
        input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
        created_at: now, updated_at: now,
      }]);
    },

    async append(id, userId, { messages, transcript, usage }) {
      const rows = read();
      const row = rows.find((item) => item.id === id && item.user_id === userId);
      if (!row) return;
      row.messages.push(...messages);
      row.transcript.push(...transcript);
      row.input_tokens += usage.input;
      row.output_tokens += usage.output;
      row.cache_read_tokens += usage.cacheRead;
      row.cache_write_tokens += usage.cacheWrite;
      row.updated_at = new Date().toISOString();
      write(rows);
    },

    async update(id, userId, { title, pinned }) {
      const rows = read();
      const row = rows.find((item) => item.id === id && item.user_id === userId);
      if (!row) return null;
      if (typeof title === 'string') row.title = title;
      if (typeof pinned === 'boolean') row.pinned = pinned;
      write(rows);
      return summary(row);
    },

    async remove(id, userId) {
      const rows = read();
      const next = rows.filter((row) => !(row.id === id && row.user_id === userId));
      write(next);
      return next.length < rows.length;
    },
  };
}

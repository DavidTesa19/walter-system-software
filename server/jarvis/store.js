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

const LIST_LIMIT = 50;

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
}

const summary = (row) => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function createPgConversationStore(pool) {
  return {
    async list(userId) {
      const { rows } = await pool.query(
        `SELECT id, title, created_at, updated_at FROM jarvis_conversations
          WHERE user_id = $1 ORDER BY updated_at DESC LIMIT ${LIST_LIMIT}`,
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
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
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

    async remove(id, userId) {
      const rows = read();
      const next = rows.filter((row) => !(row.id === id && row.user_id === userId));
      write(next);
      return next.length < rows.length;
    },
  };
}

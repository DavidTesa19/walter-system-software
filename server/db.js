import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pkg;

// Database connection configuration
// Uses PostgreSQL in production (Railway), JSON file in development
const USE_POSTGRES = process.env.DATABASE_URL ? true : false;

let pool = null;

if (USE_POSTGRES) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
  });

  console.log('✓ Using PostgreSQL database');
} else {
  console.log('✓ Using local JSON file database (development mode)');
}

// Initialize database tables
export async function initDatabase() {
  if (!USE_POSTGRES) return;

  const client = await pool.connect();
  try {
    // Create partners table
    await client.query(`
      CREATE TABLE IF NOT EXISTS partners (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        location VARCHAR(255),
        mobile VARCHAR(50),
        field VARCHAR(255),
        info TEXT,
        commission VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create clients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        location VARCHAR(255),
        mobile VARCHAR(50),
        info TEXT,
        field VARCHAR(255),
        date DATE,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create tipers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tipers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        location VARCHAR(255),
        mobile VARCHAR(50),
        field VARCHAR(255),
        info TEXT,
        commission VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table (for authentication)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        role VARCHAR(50) DEFAULT 'employee',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_palettes table (for user-specific themes)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_palettes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        mode VARCHAR(12) NOT NULL CHECK (mode IN ('light', 'dark')),
        colors JSONB NOT NULL,
        typography JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create employees table
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        position VARCHAR(255),
        department VARCHAR(255),
        email VARCHAR(255),
        mobile VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS future_functions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        priority VARCHAR(50),
        complexity VARCHAR(50),
        phase VARCHAR(120),
        info TEXT,
        status VARCHAR(50) DEFAULT 'Planned',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        filename VARCHAR(255) NOT NULL,
        mime_type VARCHAR(120) NOT NULL,
        size_bytes INTEGER NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        archived_at TIMESTAMP DEFAULT NULL
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_entity
        ON documents (entity_type, entity_id)
    `);

    // Create notes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        author VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_entity
        ON notes (entity_type, entity_id)
    `);

    // Create chat_rooms table for team chat
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by VARCHAR(255) NOT NULL,
        members JSONB DEFAULT '[]'::jsonb,
        last_activity TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create chat_messages table for team chat
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        username VARCHAR(255) NOT NULL,
        user_id INTEGER,
        reply_to_message_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room
        ON chat_messages (room_id, created_at)
    `);

    await client.query(
      'ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS reply_to_message_id INTEGER'
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_message_reactions (
        id SERIAL PRIMARY KEY,
        message_id INTEGER REFERENCES chat_messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_id, emoji)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
        ON chat_message_reactions (message_id)
    `);

    // Create chat_read_status table for tracking unread messages
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_read_status (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
        last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, room_id)
      )
    `);

    // Create color palettes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS color_palettes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        mode VARCHAR(12) NOT NULL CHECK (mode IN ('light', 'dark')),
        colors JSONB NOT NULL,
        typography JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Keep legacy databases in sync with new columns
    const columnMigrations = [
      "ALTER TABLE partners ADD COLUMN IF NOT EXISTS field VARCHAR(255)",
      "ALTER TABLE partners ADD COLUMN IF NOT EXISTS info TEXT",
      "ALTER TABLE partners ADD COLUMN IF NOT EXISTS commission VARCHAR(255)",
      "ALTER TABLE partners ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'",
      "ALTER TABLE clients ADD COLUMN IF NOT EXISTS info TEXT",
      "ALTER TABLE clients ADD COLUMN IF NOT EXISTS field VARCHAR(255)",
      "ALTER TABLE clients ADD COLUMN IF NOT EXISTS date DATE",
      "ALTER TABLE clients ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'",
      "ALTER TABLE tipers ADD COLUMN IF NOT EXISTS field VARCHAR(255)",
      "ALTER TABLE tipers ADD COLUMN IF NOT EXISTS info TEXT",
      "ALTER TABLE tipers ADD COLUMN IF NOT EXISTS commission VARCHAR(255)",
      "ALTER TABLE tipers ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'",
      "ALTER TABLE color_palettes ADD COLUMN IF NOT EXISTS typography JSONB NOT NULL DEFAULT '{}'::jsonb",
      "ALTER TABLE future_functions ADD COLUMN IF NOT EXISTS priority VARCHAR(50)",
      "ALTER TABLE future_functions ADD COLUMN IF NOT EXISTS complexity VARCHAR(50)",
      "ALTER TABLE future_functions ADD COLUMN IF NOT EXISTS phase VARCHAR(120)",
      "ALTER TABLE future_functions ADD COLUMN IF NOT EXISTS info TEXT",
      "ALTER TABLE future_functions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Planned'",
      "ALTER TABLE future_functions ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'employee'",
      "ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP DEFAULT NULL",
      "ALTER TABLE documents ADD COLUMN IF NOT EXISTS note_id INTEGER DEFAULT NULL"
    ];

    for (const sql of columnMigrations) {
      await client.query(sql);
    }

    // Set existing records without status to 'accepted' (legacy data)
    await client.query("UPDATE partners SET status = 'accepted' WHERE status IS NULL");
    await client.query("UPDATE clients SET status = 'accepted' WHERE status IS NULL");
    await client.query("UPDATE tipers SET status = 'accepted' WHERE status IS NULL");
  await client.query("UPDATE future_functions SET status = 'Planned' WHERE status IS NULL");
  await client.query("UPDATE future_functions SET archived = FALSE WHERE archived IS NULL");

    // Create analytics_events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        section VARCHAR(100),
        user_id INTEGER,
        username VARCHAR(255),
        source VARCHAR(100),
        duration_seconds INTEGER,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_events_type
        ON analytics_events (event_type, created_at)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_events_user
        ON analytics_events (user_id, created_at)
    `);

    await ensureDefaultPalettes(client);

    console.log('✓ Database tables initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureDefaultPalettes(client) {
  const { rows } = await client.query('SELECT COUNT(*)::INT AS count FROM color_palettes');
  const hasPalettes = rows[0]?.count > 0;

  const defaultPalettes = [
    {
      name: 'Walter Light',
      mode: 'light',
      colors: {
        primary: 'hsl(221, 83%, 55%)',
        accent: 'hsl(172, 66%, 45%)',
        background: 'hsl(210, 33%, 98%)',
        surface: 'hsl(0, 0%, 100%)',
        text: 'hsl(224, 33%, 16%)',
        muted: 'hsl(220, 12%, 46%)',
        border: 'hsl(214, 32%, 89%)'
      },
      typography: {
        heading: "'Inter', 'Segoe UI', system-ui, sans-serif",
        subheading: "'Poppins', 'Segoe UI', sans-serif",
        body: "'Inter', system-ui, sans-serif"
      },
      is_active: true
    },
    {
      name: 'Walter Dark',
      mode: 'dark',
      colors: {
        primary: 'hsl(217, 86%, 65%)',
        accent: 'hsl(162, 87%, 60%)',
        background: 'hsl(222, 47%, 11%)',
        surface: 'hsl(218, 39%, 14%)',
        text: 'hsl(210, 40%, 96%)',
        muted: 'hsl(215, 20%, 65%)',
        border: 'hsl(220, 23%, 28%)'
      },
      typography: {
        heading: "'Inter', 'Segoe UI', system-ui, sans-serif",
        subheading: "'Poppins', 'Segoe UI', sans-serif",
        body: "'Inter', system-ui, sans-serif"
      },
      is_active: true
    }
  ];

  if (!hasPalettes) {
    for (const palette of defaultPalettes) {
      await client.query(
        `INSERT INTO color_palettes (name, mode, colors, typography, is_active)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
         ON CONFLICT DO NOTHING`,
        [
          palette.name,
          palette.mode,
          JSON.stringify(palette.colors),
          JSON.stringify(palette.typography ?? {}),
          palette.is_active
        ]
      );
    }
    return;
  }

  const modes = ['light', 'dark'];
  for (const mode of modes) {
    const { rows: activeRows } = await client.query(
      'SELECT id FROM color_palettes WHERE mode = $1 AND is_active = true LIMIT 1',
      [mode]
    );

    if (activeRows.length === 0) {
      const { rows: firstRows } = await client.query(
        'SELECT id FROM color_palettes WHERE mode = $1 ORDER BY id LIMIT 1',
        [mode]
      );

      if (firstRows.length > 0) {
        await client.query(
          'UPDATE color_palettes SET is_active = (id = $1) WHERE mode = $2',
          [firstRows[0].id, mode]
        );
      } else {
        const fallback = defaultPalettes.find(p => p.mode === mode);
        if (fallback) {
          await client.query(
            `INSERT INTO color_palettes (name, mode, colors, is_active)
             VALUES ($1, $2, $3::jsonb, true)` ,
            [fallback.name, fallback.mode, JSON.stringify(fallback.colors)]
          );
        }
      }
    }
  }
}

function toDocumentResponse(row, { includeData = false } = {}) {
  if (!row) {
    return null;
  }

  const base = {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: typeof row.size_bytes === 'number' ? row.size_bytes : Number(row.size_bytes),
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? null,
    noteId: row.note_id ?? null
  };

  if (includeData) {
    base.data = row.data;
  }

  return base;
}

// Generic database operations
export const db = {
  // Execute raw query
  async query(text, params) {
    if (!USE_POSTGRES) return { rows: [] };
    return pool.query(text, params);
  },

  // Get all records from a table
  async getAll(table, filters = {}) {
    if (!USE_POSTGRES) return null; // Handled by JSON file logic
    
    let query = `SELECT * FROM ${table}`;
    const values = [];
    
    // Add WHERE clause for filters
    if (filters.status) {
      query += ` WHERE status = $1`;
      values.push(filters.status);
    }
    
    query += ` ORDER BY id`;
    
    const result = await pool.query(query, values);
    return result.rows;
  },

  // Get single record by ID
  async getById(table, id) {
    if (!USE_POSTGRES) return null;
    
    const result = await pool.query(
      `SELECT * FROM ${table} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  // Create new record (supports explicit id for undo-recreation)
  async create(table, data) {
    if (!USE_POSTGRES) return null;
    
    const hasExplicitId = data.id != null;
    const fields = Object.keys(data).filter(k => k !== 'id' || hasExplicitId);
    const values = fields.map(f => data[f]);
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${table} (${fields.join(', ')}, updated_at)
      VALUES (${placeholders}, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    const result = await pool.query(query, values);

    // Bump the serial sequence so future auto-IDs don't collide
    if (hasExplicitId) {
      try {
        await pool.query(
          `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT MAX(id) FROM ${table}), 1))`,
          [table]
        );
      } catch (_) { /* ignore if table has no serial sequence */ }
    }

    return result.rows[0];
  },

  // Update record
  async update(table, id, data) {
    if (!USE_POSTGRES) return null;
    
    // Filter out id and PostgreSQL metadata fields
    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at');
    const values = fields.map(f => data[f]);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    
    const query = `
      UPDATE ${table}
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${fields.length + 1}
      RETURNING *
    `;
    
    const result = await pool.query(query, [...values, id]);
    return result.rows[0] || null;
  },

  // Delete record
  async delete(table, id) {
    if (!USE_POSTGRES) return null;
    
    const result = await pool.query(
      `DELETE FROM ${table} WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  // Get database connection pool (for custom queries)
  getPool() {
    return pool;
  },

  // Check if using PostgreSQL
  isPostgres() {
    return USE_POSTGRES;
  },

  async getColorPalettes() {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      'SELECT * FROM color_palettes ORDER BY mode, id'
    );
    return result.rows;
  },

  async createColorPalette({ name, mode, colors, typography, is_active }) {
    if (!USE_POSTGRES) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (is_active) {
        await client.query('UPDATE color_palettes SET is_active = false WHERE mode = $1', [mode]);
      }

      const result = await client.query(
        `INSERT INTO color_palettes (name, mode, colors, typography, is_active)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
         RETURNING *`,
        [name, mode, JSON.stringify(colors), JSON.stringify(typography ?? {}), Boolean(is_active)]
      );

      if (!is_active) {
        await client.query(
          `UPDATE color_palettes
             SET is_active = true
           WHERE id = $1
             AND NOT EXISTS (
               SELECT 1 FROM color_palettes WHERE mode = $2 AND is_active = true
             )`,
          [result.rows[0].id, mode]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async updateColorPalette(id, { name, colors, typography, is_active }) {
    if (!USE_POSTGRES) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const current = await client.query(
        'SELECT mode FROM color_palettes WHERE id = $1',
        [id]
      );

      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const mode = current.rows[0].mode;

      if (is_active) {
        await client.query('UPDATE color_palettes SET is_active = false WHERE mode = $1', [mode]);
      }

      const result = await client.query(
        `UPDATE color_palettes
           SET name = COALESCE($2, name),
               colors = COALESCE($3::jsonb, colors),
               typography = COALESCE($4::jsonb, typography),
               is_active = COALESCE($5, is_active),
               updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [
          id,
          name ?? null,
          colors ? JSON.stringify(colors) : null,
          typography ? JSON.stringify(typography) : null,
          typeof is_active === 'boolean' ? is_active : null
        ]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      if (!is_active) {
        const { rows } = await client.query(
          'SELECT COUNT(*)::INT AS count FROM color_palettes WHERE mode = $1 AND is_active = true',
          [mode]
        );
        if (rows[0].count === 0) {
          await client.query(
            'UPDATE color_palettes SET is_active = true WHERE id = $1',
            [id]
          );
          result.rows[0].is_active = true;
        }
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteColorPalette(id, userId) {
    if (!USE_POSTGRES) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: toDelete } = await client.query(
        'SELECT id, mode, is_active FROM user_palettes WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (toDelete.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const palette = toDelete[0];

      await client.query('DELETE FROM user_palettes WHERE id = $1 AND user_id = $2', [id, userId]);

      if (palette.is_active) {
        const { rows } = await client.query(
          'SELECT id FROM user_palettes WHERE mode = $1 AND user_id = $2 ORDER BY id LIMIT 1',
          [palette.mode, userId]
        );
        if (rows.length > 0) {
          await client.query(
            'UPDATE user_palettes SET is_active = true WHERE id = $1 AND user_id = $2',
            [rows[0].id, userId]
          );
        }
      }

      await client.query('COMMIT');
      return palette;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async activateColorPalette(id, userId) {
    if (!USE_POSTGRES) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT mode FROM user_palettes WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const mode = rows[0].mode;

      await client.query(
        'UPDATE user_palettes SET is_active = false WHERE mode = $1 AND user_id = $2',
        [mode, userId]
      );

      const result = await client.query(
        'UPDATE user_palettes SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING *',
        [id, userId]
      );

      await client.query('COMMIT');
      return result.rows[0] ?? null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async getActivePalettes() {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `SELECT * FROM color_palettes
        WHERE is_active = true
        ORDER BY mode`
    );
    return result.rows;
  },

  async getActivePaletteByMode(mode) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      'SELECT * FROM color_palettes WHERE mode = $1 AND is_active = true LIMIT 1',
      [mode]
    );
    return result.rows[0] ?? null;
  },

  async getDocuments(entityType, entityId, { includeArchived = false } = {}) {
    if (!USE_POSTGRES) return null;

    const archivedFilter = includeArchived ? '' : ' AND archived_at IS NULL';
    const result = await pool.query(
      `SELECT id, entity_type, entity_id, filename, mime_type, size_bytes, created_at, archived_at
         FROM documents
        WHERE entity_type = $1 AND entity_id = $2${archivedFilter}
        ORDER BY created_at DESC`,
      [entityType, entityId]
    );

    return result.rows.map((row) => toDocumentResponse(row));
  },

  async getDocumentById(id, { includeData = false } = {}) {
    if (!USE_POSTGRES) return null;

    const columns = includeData
      ? 'id, entity_type, entity_id, filename, mime_type, size_bytes, created_at, data'
      : 'id, entity_type, entity_id, filename, mime_type, size_bytes, created_at';

    const result = await pool.query(
      `SELECT ${columns} FROM documents WHERE id = $1`,
      [id]
    );

    return toDocumentResponse(result.rows[0], { includeData });
  },

  async createDocument(entityType, entityId, { filename, mimeType, sizeBytes, buffer, noteId }) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `INSERT INTO documents (entity_type, entity_id, filename, mime_type, size_bytes, data, note_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, entity_type, entity_id, filename, mime_type, size_bytes, created_at, note_id`,
      [entityType, entityId, filename, mimeType, sizeBytes, buffer, noteId || null]
    );

    return toDocumentResponse(result.rows[0]);
  },

  async deleteDocument(id) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `DELETE FROM documents
        WHERE id = $1
    RETURNING id, entity_type, entity_id, filename, mime_type, size_bytes, created_at, archived_at`,
      [id]
    );

    return toDocumentResponse(result.rows[0]);
  },

  async archiveDocument(id) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `UPDATE documents
         SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND archived_at IS NULL
   RETURNING id, entity_type, entity_id, filename, mime_type, size_bytes, created_at, archived_at`,
      [id]
    );

    return toDocumentResponse(result.rows[0]);
  },

  async unarchiveDocument(id) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `UPDATE documents
         SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND archived_at IS NOT NULL
   RETURNING id, entity_type, entity_id, filename, mime_type, size_bytes, created_at, archived_at`,
      [id]
    );

    return toDocumentResponse(result.rows[0]);
  },

  async getNotes(entityType, entityId) {
    if (!USE_POSTGRES) return null;

    const notesResult = await pool.query(
      `SELECT id, entity_type, entity_id, content, author, created_at
         FROM notes
        WHERE entity_type = $1 AND entity_id = $2
        ORDER BY created_at DESC`,
      [entityType, entityId]
    );

    // Fetch all documents linked to these notes in one query
    const noteIds = notesResult.rows.map(r => r.id);
    let docsByNoteId = {};
    if (noteIds.length > 0) {
      const docsResult = await pool.query(
        `SELECT id, entity_type, entity_id, filename, mime_type, size_bytes, created_at, archived_at, note_id
           FROM documents
          WHERE note_id = ANY($1::int[])`,
        [noteIds]
      );
      for (const doc of docsResult.rows) {
        const nid = doc.note_id;
        if (!docsByNoteId[nid]) docsByNoteId[nid] = [];
        docsByNoteId[nid].push({
          id: doc.id,
          entityType: doc.entity_type,
          entityId: doc.entity_id,
          filename: doc.filename,
          mimeType: doc.mime_type,
          sizeBytes: Number(doc.size_bytes || 0),
          createdAt: doc.created_at,
          archivedAt: doc.archived_at ?? null,
          noteId: doc.note_id
        });
      }
    }

    return notesResult.rows.map(row => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      author: row.author,
      createdAt: row.created_at,
      attachments: docsByNoteId[row.id] || []
    }));
  },

  async createNote(entityType, entityId, { content, author }) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `INSERT INTO notes (entity_type, entity_id, content, author)
       VALUES ($1, $2, $3, $4)
       RETURNING id, entity_type, entity_id, content, author, created_at`,
      [entityType, entityId, content, author]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      author: row.author,
      createdAt: row.created_at,
      attachments: []
    };
  },

  async deleteNote(id) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `DELETE FROM notes WHERE id = $1 RETURNING id`,
      [id]
    );

    return result.rows[0] || null;
  },

  // Approve a pending record (change status to accepted)
  async approve(table, id) {
    if (!USE_POSTGRES) return null;
    
    const result = await pool.query(
      `UPDATE ${table} SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  // Archive a record (mark for removal)
  async archive(table, id) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `UPDATE ${table} SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  // Restore a record from archive (back to accepted)
  async restore(table, id) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `UPDATE ${table} SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  },

  // =========================================================================
  // ENTITY-COMMISSION OPERATIONS
  // =========================================================================

  /**
   * Generate next entity ID (P001, K001, T001)
   */
  async getNextEntityId(entityType) {
    if (!USE_POSTGRES) return null;

    const prefixMap = { partner: 'P', client: 'K', tiper: 'T' };
    const prefix = prefixMap[entityType];
    if (!prefix) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get and increment counter
      const { rows } = await client.query(
        `INSERT INTO entity_counters (entity_type, next_number)
         VALUES ($1, 1)
         ON CONFLICT (entity_type) DO UPDATE SET next_number = entity_counters.next_number + 1
         RETURNING next_number - 1 AS current_number`,
        [entityType]
      );
      
      // If this was an insert, current_number will be 0, we want 1
      let num = rows[0]?.current_number ?? 0;
      if (num === 0) {
        const { rows: updated } = await client.query(
          `UPDATE entity_counters SET next_number = 2 WHERE entity_type = $1 RETURNING next_number - 1 AS current_number`,
          [entityType]
        );
        num = updated[0]?.current_number ?? 1;
      }
      
      await client.query('COMMIT');
      return `${prefix}${String(num).padStart(3, '0')}`;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Get next commission number for an entity
   */
  async getNextCommissionNumber(entityTablePrefix, entityId) {
    if (!USE_POSTGRES) return null;

    const commissionTable = `${entityTablePrefix}_commissions`;
    const { rows } = await pool.query(
      `SELECT COUNT(*)::INT + 1 AS next_num FROM ${commissionTable} WHERE entity_code = $1`,
      [entityId]
    );
    return rows[0]?.next_num ?? 1;
  },

  // =========================================================================
  // PARTNER ENTITY OPERATIONS
  // =========================================================================

  async getPartnerEntities() {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('SELECT * FROM partner_entities ORDER BY entity_id');
    return rows;
  },

  async getPartnerEntityById(id) {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('SELECT * FROM partner_entities WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async getPartnerEntityByCode(entityCode) {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('SELECT * FROM partner_entities WHERE entity_id = $1', [entityCode]);
    return rows[0] || null;
  },

  async createPartnerEntity(data) {
    if (!USE_POSTGRES) return null;

    const entityId = await this.getNextEntityId('partner');
    const { rows } = await pool.query(
      `INSERT INTO partner_entities (entity_id, company_name, field, location, info, category, first_name, last_name, email, phone, website)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [entityId, data.company_name, data.field, data.location, data.info, data.category, data.first_name, data.last_name, data.email, data.phone, data.website]
    );
    return rows[0];
  },

  async updatePartnerEntity(id, data) {
    if (!USE_POSTGRES) return null;

    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'entity_id' && k !== 'created_at' && k !== 'updated_at');
    if (fields.length === 0) return this.getPartnerEntityById(id);

    const values = fields.map(f => data[f]);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `UPDATE partner_entities SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );
    return rows[0] || null;
  },

  // =========================================================================
  // PARTNER COMMISSION OPERATIONS
  // =========================================================================

  async getPartnerCommissions(filters = {}) {
    if (!USE_POSTGRES) return null;

    let query = `
      SELECT 
        c.*,
        e.entity_id as e_entity_id,
        e.company_name as e_company_name,
        e.field as e_field,
        e.location as e_location,
        e.info as e_info,
        e.category as e_category,
        e.first_name as e_first_name,
        e.last_name as e_last_name,
        e.email as e_email,
        e.phone as e_phone,
        e.website as e_website
      FROM partner_commissions c
      JOIN partner_entities e ON c.entity_id = e.id
    `;
    
    const values = [];
    if (filters.status) {
      query += ' WHERE c.status = $1';
      values.push(filters.status);
    }
    query += ' ORDER BY c.commission_id';

    const { rows } = await pool.query(query, values);
    return rows.map(row => ({
      // Commission data
      id: row.id,
      commission_id: row.commission_id,
      entity_id: row.entity_id,
      entity_code: row.entity_code,
      status: row.status,
      position: row.position,
      budget: row.budget,
      state: row.state,
      assigned_to: row.assigned_to,
      field: row.field,
      service_position: row.service_position,
      location: row.location,
      info: row.info,
      category: row.category,
      deadline: row.deadline,
      priority: row.priority,
      phone: row.phone,
      commission_value: row.commission_value,
      is_tipped: row.is_tipped,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // Entity data (prefixed)
      entity_company_name: row.e_company_name,
      entity_field: row.e_field,
      entity_location: row.e_location,
      entity_info: row.e_info,
      entity_category: row.e_category,
      entity_first_name: row.e_first_name,
      entity_last_name: row.e_last_name,
      entity_email: row.e_email,
      entity_phone: row.e_phone,
      entity_website: row.e_website
    }));
  },

  async getPartnerCommissionById(id) {
    if (!USE_POSTGRES) return null;

    const { rows } = await pool.query(
      `SELECT 
        c.*,
        e.entity_id as e_entity_id,
        e.company_name as e_company_name,
        e.field as e_field,
        e.location as e_location,
        e.info as e_info,
        e.category as e_category,
        e.first_name as e_first_name,
        e.last_name as e_last_name,
        e.email as e_email,
        e.phone as e_phone,
        e.website as e_website
      FROM partner_commissions c
      JOIN partner_entities e ON c.entity_id = e.id
      WHERE c.id = $1`,
      [id]
    );
    
    if (!rows[0]) return null;
    const row = rows[0];
    
    return {
      id: row.id,
      commission_id: row.commission_id,
      entity_id: row.entity_id,
      entity_code: row.entity_code,
      status: row.status,
      position: row.position,
      budget: row.budget,
      state: row.state,
      assigned_to: row.assigned_to,
      field: row.field,
      service_position: row.service_position,
      location: row.location,
      info: row.info,
      category: row.category,
      deadline: row.deadline,
      priority: row.priority,
      phone: row.phone,
      commission_value: row.commission_value,
      is_tipped: row.is_tipped,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      entity_company_name: row.e_company_name,
      entity_field: row.e_field,
      entity_location: row.e_location,
      entity_info: row.e_info,
      entity_category: row.e_category,
      entity_first_name: row.e_first_name,
      entity_last_name: row.e_last_name,
      entity_email: row.e_email,
      entity_phone: row.e_phone,
      entity_website: row.e_website
    };
  },

  async createPartnerCommission(entityInternalId, data) {
    if (!USE_POSTGRES) return null;

    // Get entity code
    const entity = await this.getPartnerEntityById(entityInternalId);
    if (!entity) throw new Error('Partner entity not found');

    const commissionNum = await this.getNextCommissionNumber('partner', entity.entity_id);
    const commissionId = `${entity.entity_id}-${String(commissionNum).padStart(3, '0')}`;

    const { rows } = await pool.query(
      `INSERT INTO partner_commissions 
        (commission_id, entity_id, entity_code, status, position, budget, state, assigned_to, field, service_position, location, info, category, deadline, priority, phone, commission_value, is_tipped, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [commissionId, entityInternalId, entity.entity_id, data.status || 'pending', data.position, data.budget, data.state, data.assigned_to, data.field, data.service_position, data.location, data.info, data.category, data.deadline, data.priority, data.phone, data.commission_value, data.is_tipped || false, data.notes]
    );
    return rows[0];
  },

  async updatePartnerCommission(id, data) {
    if (!USE_POSTGRES) return null;

    const fields = Object.keys(data).filter(k => 
      k !== 'id' && k !== 'commission_id' && k !== 'entity_id' && k !== 'entity_code' && 
      k !== 'created_at' && k !== 'updated_at' && !k.startsWith('entity_')
    );
    if (fields.length === 0) return this.getPartnerCommissionById(id);

    const values = fields.map(f => data[f]);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    await pool.query(
      `UPDATE partner_commissions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1}`,
      [...values, id]
    );
    return this.getPartnerCommissionById(id);
  },

  async deletePartnerCommission(id) {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('DELETE FROM partner_commissions WHERE id = $1 RETURNING *', [id]);
    return rows[0] || null;
  },

  // =========================================================================
  // CLIENT ENTITY OPERATIONS
  // =========================================================================

  async getClientEntities() {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('SELECT * FROM client_entities ORDER BY entity_id');
    return rows;
  },

  async getClientEntityById(id) {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('SELECT * FROM client_entities WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async getClientEntityByCode(entityCode) {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('SELECT * FROM client_entities WHERE entity_id = $1', [entityCode]);
    return rows[0] || null;
  },

  async createClientEntity(data) {
    if (!USE_POSTGRES) return null;

    const entityId = await this.getNextEntityId('client');
    const { rows } = await pool.query(
      `INSERT INTO client_entities (entity_id, company_name, field, service, location, info, category, budget, first_name, last_name, email, phone, website)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [entityId, data.company_name, data.field, data.service, data.location, data.info, data.category, data.budget, data.first_name, data.last_name, data.email, data.phone, data.website]
    );
    return rows[0];
  },

  async updateClientEntity(id, data) {
    if (!USE_POSTGRES) return null;

    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'entity_id' && k !== 'created_at' && k !== 'updated_at');
    if (fields.length === 0) return this.getClientEntityById(id);

    const values = fields.map(f => data[f]);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `UPDATE client_entities SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );
    return rows[0] || null;
  },

  // =========================================================================
  // CLIENT COMMISSION OPERATIONS
  // =========================================================================

  async getClientCommissions(filters = {}) {
    if (!USE_POSTGRES) return null;

    let query = `
      SELECT 
        c.*,
        e.entity_id as e_entity_id,
        e.company_name as e_company_name,
        e.field as e_field,
        e.service as e_service,
        e.location as e_location,
        e.info as e_info,
        e.category as e_category,
        e.budget as e_budget,
        e.first_name as e_first_name,
        e.last_name as e_last_name,
        e.email as e_email,
        e.phone as e_phone,
        e.website as e_website
      FROM client_commissions c
      JOIN client_entities e ON c.entity_id = e.id
    `;
    
    const values = [];
    if (filters.status) {
      query += ' WHERE c.status = $1';
      values.push(filters.status);
    }
    query += ' ORDER BY c.commission_id';

    const { rows } = await pool.query(query, values);
    return rows.map(row => ({
      id: row.id,
      commission_id: row.commission_id,
      entity_id: row.entity_id,
      entity_code: row.entity_code,
      status: row.status,
      service: row.service,
      budget: row.budget,
      state: row.state,
      assigned_to: row.assigned_to,
      field: row.field,
      location: row.location,
      info: row.info,
      category: row.category,
      deadline: row.deadline,
      priority: row.priority,
      phone: row.phone,
      commission_value: row.commission_value,
      is_tipped: row.is_tipped,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      entity_company_name: row.e_company_name,
      entity_field: row.e_field,
      entity_service: row.e_service,
      entity_location: row.e_location,
      entity_info: row.e_info,
      entity_category: row.e_category,
      entity_budget: row.e_budget,
      entity_first_name: row.e_first_name,
      entity_last_name: row.e_last_name,
      entity_email: row.e_email,
      entity_phone: row.e_phone,
      entity_website: row.e_website
    }));
  },

  async getClientCommissionById(id) {
    if (!USE_POSTGRES) return null;

    const { rows } = await pool.query(
      `SELECT 
        c.*,
        e.entity_id as e_entity_id,
        e.company_name as e_company_name,
        e.field as e_field,
        e.service as e_service,
        e.location as e_location,
        e.info as e_info,
        e.category as e_category,
        e.budget as e_budget,
        e.first_name as e_first_name,
        e.last_name as e_last_name,
        e.email as e_email,
        e.phone as e_phone,
        e.website as e_website
      FROM client_commissions c
      JOIN client_entities e ON c.entity_id = e.id
      WHERE c.id = $1`,
      [id]
    );
    
    if (!rows[0]) return null;
    const row = rows[0];
    
    return {
      id: row.id,
      commission_id: row.commission_id,
      entity_id: row.entity_id,
      entity_code: row.entity_code,
      status: row.status,
      service: row.service,
      budget: row.budget,
      state: row.state,
      assigned_to: row.assigned_to,
      field: row.field,
      location: row.location,
      info: row.info,
      category: row.category,
      deadline: row.deadline,
      priority: row.priority,
      phone: row.phone,
      commission_value: row.commission_value,
      is_tipped: row.is_tipped,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      entity_company_name: row.e_company_name,
      entity_field: row.e_field,
      entity_service: row.e_service,
      entity_location: row.e_location,
      entity_info: row.e_info,
      entity_category: row.e_category,
      entity_budget: row.e_budget,
      entity_first_name: row.e_first_name,
      entity_last_name: row.e_last_name,
      entity_email: row.e_email,
      entity_phone: row.e_phone,
      entity_website: row.e_website
    };
  },

  async createClientCommission(entityInternalId, data) {
    if (!USE_POSTGRES) return null;

    const entity = await this.getClientEntityById(entityInternalId);
    if (!entity) throw new Error('Client entity not found');

    const commissionNum = await this.getNextCommissionNumber('client', entity.entity_id);
    const commissionId = `${entity.entity_id}-${String(commissionNum).padStart(3, '0')}`;

    const { rows } = await pool.query(
      `INSERT INTO client_commissions 
        (commission_id, entity_id, entity_code, status, service, budget, state, assigned_to, field, location, info, category, deadline, priority, phone, commission_value, is_tipped, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [commissionId, entityInternalId, entity.entity_id, data.status || 'pending', data.service, data.budget, data.state, data.assigned_to, data.field, data.location, data.info, data.category, data.deadline, data.priority, data.phone, data.commission_value, data.is_tipped || false, data.notes]
    );
    return rows[0];
  },

  async updateClientCommission(id, data) {
    if (!USE_POSTGRES) return null;

    const fields = Object.keys(data).filter(k => 
      k !== 'id' && k !== 'commission_id' && k !== 'entity_id' && k !== 'entity_code' && 
      k !== 'created_at' && k !== 'updated_at' && !k.startsWith('entity_')
    );
    if (fields.length === 0) return this.getClientCommissionById(id);

    const values = fields.map(f => data[f]);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    await pool.query(
      `UPDATE client_commissions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1}`,
      [...values, id]
    );
    return this.getClientCommissionById(id);
  },

  async deleteClientCommission(id) {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('DELETE FROM client_commissions WHERE id = $1 RETURNING *', [id]);
    return rows[0] || null;
  },

  // =========================================================================
  // TIPER ENTITY OPERATIONS
  // =========================================================================

  async getTiperEntities() {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('SELECT * FROM tiper_entities ORDER BY entity_id');
    return rows;
  },

  async getTiperEntityById(id) {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('SELECT * FROM tiper_entities WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async getTiperEntityByCode(entityCode) {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('SELECT * FROM tiper_entities WHERE entity_id = $1', [entityCode]);
    return rows[0] || null;
  },

  async createTiperEntity(data) {
    if (!USE_POSTGRES) return null;

    const entityId = await this.getNextEntityId('tiper');
    const { rows } = await pool.query(
      `INSERT INTO tiper_entities (entity_id, first_name, last_name, field, location, info, category, email, phone, website)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [entityId, data.first_name, data.last_name, data.field, data.location, data.info, data.category, data.email, data.phone, data.website]
    );
    return rows[0];
  },

  async updateTiperEntity(id, data) {
    if (!USE_POSTGRES) return null;

    const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'entity_id' && k !== 'created_at' && k !== 'updated_at');
    if (fields.length === 0) return this.getTiperEntityById(id);

    const values = fields.map(f => data[f]);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `UPDATE tiper_entities SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1} RETURNING *`,
      [...values, id]
    );
    return rows[0] || null;
  },

  // =========================================================================
  // TIPER COMMISSION OPERATIONS
  // =========================================================================

  async getTiperCommissions(filters = {}) {
    if (!USE_POSTGRES) return null;

    let query = `
      SELECT 
        c.*,
        e.entity_id as e_entity_id,
        e.first_name as e_first_name,
        e.last_name as e_last_name,
        e.field as e_field,
        e.location as e_location,
        e.info as e_info,
        e.category as e_category,
        e.email as e_email,
        e.phone as e_phone,
        e.website as e_website
      FROM tiper_commissions c
      JOIN tiper_entities e ON c.entity_id = e.id
    `;
    
    const values = [];
    if (filters.status) {
      query += ' WHERE c.status = $1';
      values.push(filters.status);
    }
    query += ' ORDER BY c.commission_id';

    const { rows } = await pool.query(query, values);
    return rows.map(row => ({
      id: row.id,
      commission_id: row.commission_id,
      entity_id: row.entity_id,
      entity_code: row.entity_code,
      status: row.status,
      linked_entity_type: row.linked_entity_type,
      linked_commission_id: row.linked_commission_id,
      commission_value: row.commission_value,
      created_at: row.created_at,
      updated_at: row.updated_at,
      entity_first_name: row.e_first_name,
      entity_last_name: row.e_last_name,
      entity_field: row.e_field,
      entity_location: row.e_location,
      entity_info: row.e_info,
      entity_category: row.e_category,
      entity_email: row.e_email,
      entity_phone: row.e_phone,
      entity_website: row.e_website
    }));
  },

  async getTiperCommissionById(id) {
    if (!USE_POSTGRES) return null;

    const { rows } = await pool.query(
      `SELECT 
        c.*,
        e.entity_id as e_entity_id,
        e.first_name as e_first_name,
        e.last_name as e_last_name,
        e.field as e_field,
        e.location as e_location,
        e.info as e_info,
        e.category as e_category,
        e.email as e_email,
        e.phone as e_phone,
        e.website as e_website
      FROM tiper_commissions c
      JOIN tiper_entities e ON c.entity_id = e.id
      WHERE c.id = $1`,
      [id]
    );
    
    if (!rows[0]) return null;
    const row = rows[0];
    
    return {
      id: row.id,
      commission_id: row.commission_id,
      entity_id: row.entity_id,
      entity_code: row.entity_code,
      status: row.status,
      linked_entity_type: row.linked_entity_type,
      linked_commission_id: row.linked_commission_id,
      commission_value: row.commission_value,
      created_at: row.created_at,
      updated_at: row.updated_at,
      entity_first_name: row.e_first_name,
      entity_last_name: row.e_last_name,
      entity_field: row.e_field,
      entity_location: row.e_location,
      entity_info: row.e_info,
      entity_category: row.e_category,
      entity_email: row.e_email,
      entity_phone: row.e_phone,
      entity_website: row.e_website
    };
  },

  async createTiperCommission(entityInternalId, data) {
    if (!USE_POSTGRES) return null;

    const entity = await this.getTiperEntityById(entityInternalId);
    if (!entity) throw new Error('Tiper entity not found');

    const commissionNum = await this.getNextCommissionNumber('tiper', entity.entity_id);
    const commissionId = `${entity.entity_id}-${String(commissionNum).padStart(3, '0')}`;

    const { rows } = await pool.query(
      `INSERT INTO tiper_commissions 
        (commission_id, entity_id, entity_code, status, linked_entity_type, linked_commission_id, commission_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [commissionId, entityInternalId, entity.entity_id, data.status || 'pending', data.linked_entity_type, data.linked_commission_id, data.commission_value]
    );
    return rows[0];
  },

  async updateTiperCommission(id, data) {
    if (!USE_POSTGRES) return null;

    const fields = Object.keys(data).filter(k => 
      k !== 'id' && k !== 'commission_id' && k !== 'entity_id' && k !== 'entity_code' && 
      k !== 'created_at' && k !== 'updated_at' && !k.startsWith('entity_')
    );
    if (fields.length === 0) return this.getTiperCommissionById(id);

    const values = fields.map(f => data[f]);
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

    await pool.query(
      `UPDATE tiper_commissions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1}`,
      [...values, id]
    );
    return this.getTiperCommissionById(id);
  },

  async deleteTiperCommission(id) {
    if (!USE_POSTGRES) return null;
    const { rows } = await pool.query('DELETE FROM tiper_commissions WHERE id = $1 RETURNING *', [id]);
    return rows[0] || null;
  },

  // =========================================================================
  // COMBINED ENTITY + COMMISSION OPERATIONS
  // =========================================================================

  /**
   * Create a new partner with their first commission
   */
  async createPartnerWithCommission(entityData, commissionData) {
    if (!USE_POSTGRES) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create entity
      const entity = await this.createPartnerEntity(entityData);

      // Create first commission
      const commission = await this.createPartnerCommission(entity.id, commissionData);

      await client.query('COMMIT');
      return { entity, commission };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Create a new client with their first commission
   */
  async createClientWithCommission(entityData, commissionData) {
    if (!USE_POSTGRES) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const entity = await this.createClientEntity(entityData);
      const commission = await this.createClientCommission(entity.id, commissionData);

      await client.query('COMMIT');
      return { entity, commission };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Create a new tiper with their first commission
   */
  async createTiperWithCommission(entityData, commissionData) {
    if (!USE_POSTGRES) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const entity = await this.createTiperEntity(entityData);
      const commission = await this.createTiperCommission(entity.id, commissionData);

      await client.query('COMMIT');
      return { entity, commission };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

export default db;

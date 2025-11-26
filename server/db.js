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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_entity
        ON documents (entity_type, entity_id)
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
      "ALTER TABLE future_functions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Planned'"
    ];

    for (const sql of columnMigrations) {
      await client.query(sql);
    }

    // Set existing records without status to 'accepted' (legacy data)
    await client.query("UPDATE partners SET status = 'accepted' WHERE status IS NULL");
    await client.query("UPDATE clients SET status = 'accepted' WHERE status IS NULL");
    await client.query("UPDATE tipers SET status = 'accepted' WHERE status IS NULL");
  await client.query("UPDATE future_functions SET status = 'Planned' WHERE status IS NULL");

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
        heading: "'Playfair Display', 'Times New Roman', serif",
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
        heading: "'Playfair Display', 'Times New Roman', serif",
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
    createdAt: row.created_at
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

  // Create new record
  async create(table, data) {
    if (!USE_POSTGRES) return null;
    
    const fields = Object.keys(data).filter(k => k !== 'id');
    const values = fields.map(f => data[f]);
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${table} (${fields.join(', ')}, updated_at)
      VALUES (${placeholders}, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
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

  async deleteColorPalette(id) {
    if (!USE_POSTGRES) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: toDelete } = await client.query(
        'SELECT id, mode, is_active FROM color_palettes WHERE id = $1',
        [id]
      );

      if (toDelete.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const palette = toDelete[0];

      await client.query('DELETE FROM color_palettes WHERE id = $1', [id]);

      if (palette.is_active) {
        const { rows } = await client.query(
          'SELECT id FROM color_palettes WHERE mode = $1 ORDER BY id LIMIT 1',
          [palette.mode]
        );
        if (rows.length > 0) {
          await client.query(
            'UPDATE color_palettes SET is_active = true WHERE id = $1',
            [rows[0].id]
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

  async activateColorPalette(id) {
    if (!USE_POSTGRES) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT mode FROM color_palettes WHERE id = $1',
        [id]
      );

      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const mode = rows[0].mode;

      await client.query(
        'UPDATE color_palettes SET is_active = false WHERE mode = $1',
        [mode]
      );

      const result = await client.query(
        'UPDATE color_palettes SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [id]
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

  async getDocuments(entityType, entityId) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `SELECT id, entity_type, entity_id, filename, mime_type, size_bytes, created_at
         FROM documents
        WHERE entity_type = $1 AND entity_id = $2
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

  async createDocument(entityType, entityId, { filename, mimeType, sizeBytes, buffer }) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `INSERT INTO documents (entity_type, entity_id, filename, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, entity_type, entity_id, filename, mime_type, size_bytes, created_at`,
      [entityType, entityId, filename, mimeType, sizeBytes, buffer]
    );

    return toDocumentResponse(result.rows[0]);
  },

  async deleteDocument(id) {
    if (!USE_POSTGRES) return null;

    const result = await pool.query(
      `DELETE FROM documents
        WHERE id = $1
    RETURNING id, entity_type, entity_id, filename, mime_type, size_bytes, created_at`,
      [id]
    );

    return toDocumentResponse(result.rows[0]);
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
  }
};

export default db;

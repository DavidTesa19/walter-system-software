import pkg from 'pg';
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
        email VARCHAR(255),
        role VARCHAR(50),
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
      "ALTER TABLE tipers ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending'"
    ];

    for (const sql of columnMigrations) {
      await client.query(sql);
    }

    // Set existing records without status to 'accepted' (legacy data)
    await client.query("UPDATE partners SET status = 'accepted' WHERE status IS NULL");
    await client.query("UPDATE clients SET status = 'accepted' WHERE status IS NULL");
    await client.query("UPDATE tipers SET status = 'accepted' WHERE status IS NULL");

    console.log('✓ Database tables initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Generic database operations
export const db = {
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

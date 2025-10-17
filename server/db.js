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
  async getAll(table) {
    if (!USE_POSTGRES) return null; // Handled by JSON file logic
    
    const result = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
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
    
    const fields = Object.keys(data).filter(k => k !== 'id');
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
  }
};

export default db;

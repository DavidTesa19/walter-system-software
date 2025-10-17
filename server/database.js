import pg from 'pg';
const { Pool } = pg;

// Railway automatically provides these environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database schema
export async function initializeDatabase() {
  try {
    // Create partners table if it doesn't exist
    await pool.query(`
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
    
    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Get all partners
export async function getAllPartners() {
  try {
    const result = await pool.query('SELECT * FROM partners ORDER BY id');
    return result.rows;
  } catch (error) {
    console.error('Error getting partners:', error);
    throw error;
  }
}

// Get partner by ID
export async function getPartnerById(id) {
  try {
    const result = await pool.query('SELECT * FROM partners WHERE id = $1', [id]);
    return result.rows[0];
  } catch (error) {
    console.error('Error getting partner by ID:', error);
    throw error;
  }
}

// Create new partner
export async function createPartner(partner) {
  try {
    const { name, company, location, mobile } = partner;
    const result = await pool.query(
      'INSERT INTO partners (name, company, location, mobile) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, company, location, mobile]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error creating partner:', error);
    throw error;
  }
}

// Update partner
export async function updatePartner(id, partner) {
  try {
    const { name, company, location, mobile } = partner;
    const result = await pool.query(
      'UPDATE partners SET name = $1, company = $2, location = $3, mobile = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [name, company, location, mobile, id]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error updating partner:', error);
    throw error;
  }
}

// Delete partner
export async function deletePartner(id) {
  try {
    await pool.query('DELETE FROM partners WHERE id = $1', [id]);
    return true;
  } catch (error) {
    console.error('Error deleting partner:', error);
    throw error;
  }
}

// Migrate data from JSON to PostgreSQL
export async function migrateJsonData(jsonData) {
  try {
    if (jsonData.partners && Array.isArray(jsonData.partners)) {
      for (const partner of jsonData.partners) {
        await pool.query(
          'INSERT INTO partners (name, company, location, mobile) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [partner.name, partner.company, partner.location, partner.mobile]
        );
      }
      console.log(`Migrated ${jsonData.partners.length} partners to PostgreSQL`);
    }
  } catch (error) {
    console.error('Error migrating JSON data:', error);
    throw error;
  }
}

export default pool;
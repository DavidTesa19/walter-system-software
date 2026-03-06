import pkg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const DATABASE_URL = process.env.DATABASE_URL || process.env.RAILWAY_DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL (or RAILWAY_DATABASE_URL) is not set. Please set it in your .env file.");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node create-pg-user.js <username> <password> [role]');
  process.exit(1);
}

const [username, password, role = 'salesman'] = args;

async function createPgUser() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    console.log(`Connecting to database...`);
    const client = await pool.connect();
    
    try {
      // Check if user exists
      const res = await client.query('SELECT * FROM users WHERE username = $1', [username]);
      
      if (res.rows.length > 0) {
        console.log(`Updating existing user: ${username}`);
        await client.query(
          'UPDATE users SET password_hash = $1, role = $2, updated_at = NOW() WHERE username = $3',
          [password_hash, role, username]
        );
      } else {
        console.log(`Creating new user: ${username}`);
        await client.query(
          'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
          [username, password_hash, role]
        );
      }
      
      console.log('✅ User saved successfully to PostgreSQL database');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

createPgUser();

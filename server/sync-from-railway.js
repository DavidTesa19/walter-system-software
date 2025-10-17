import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Railway database connection
const DATABASE_URL = process.env.RAILWAY_DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: RAILWAY_DATABASE_URL environment variable not set');
  console.log('Usage: RAILWAY_DATABASE_URL="your-railway-db-url" node sync-from-railway.js');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function syncFromRailway() {
  try {
    console.log('🔄 Connecting to Railway database...');
    
    // Fetch all partners from Railway
    const result = await pool.query('SELECT * FROM partners ORDER BY id');
    const partners = result.rows;
    
    console.log(`✅ Found ${partners.length} partners in Railway database`);
    
    // Prepare data structure
    const data = {
      partners: partners.map(p => ({
        id: p.id,
        name: p.name,
        company: p.company,
        location: p.location,
        mobile: p.mobile
      })),
      clients: [],
      tipers: [],
      users: [],
      employees: []
    };
    
    // Write to local db.json
    const dbPath = path.join(__dirname, 'db.json');
    const dataPath = path.join(__dirname, 'data', 'db.json');
    
    // Backup existing local data
    if (fs.existsSync(dbPath)) {
      const backupPath = path.join(__dirname, `db.backup.${Date.now()}.json`);
      fs.copyFileSync(dbPath, backupPath);
      console.log(`📦 Backed up existing data to: ${path.basename(backupPath)}`);
    }
    
    // Write to both locations
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    console.log(`✅ Updated: ${dbPath}`);
    
    if (fs.existsSync(path.dirname(dataPath))) {
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
      console.log(`✅ Updated: ${dataPath}`);
    }
    
    console.log('\n✨ Sync completed successfully!');
    console.log(`📊 Total partners synced: ${partners.length}`);
    
  } catch (error) {
    console.error('❌ Error syncing from Railway:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

syncFromRailway();

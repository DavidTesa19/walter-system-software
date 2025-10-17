/**
 * Production Data Sync Script
 * 
 * Downloads data from your Railway PostgreSQL database to local JSON file
 * Use this to test locally with real production data
 * 
 * IMPORTANT: This ONLY downloads FROM production TO local
 *            It will NEVER upload local changes to production
 * 
 * Usage:
 *   1. Set RAILWAY_DATABASE_URL in .env file
 *   2. Run: node sync-from-production.js
 */

import fs from 'fs';
import path from 'path';
import pkg from 'pg';
const { Pool } = pkg;

const OUTPUT_FILE = path.resolve(process.cwd(), 'db.json');

async function syncFromProduction() {
  console.log('📥 Syncing data FROM production TO local...\n');

  // Check if RAILWAY_DATABASE_URL is set
  const dbUrl = process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ ERROR: RAILWAY_DATABASE_URL environment variable not set');
    console.log('Please set your Railway PostgreSQL connection string:');
    console.log('RAILWAY_DATABASE_URL=postgresql://user:pass@host:port/database');
    process.exit(1);
  }

  // Connect to production database
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Connecting to production database...');
    await pool.query('SELECT 1'); // Test connection
    console.log('✓ Connected to production database\n');

    const data = {
      partners: [],
      clients: [],
      tipers: [],
      users: [],
      employees: []
    };

    // Fetch data from each table
    const tables = ['partners', 'clients', 'tipers', 'users', 'employees'];
    
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
        data[table] = result.rows.map(row => {
          // Remove PostgreSQL metadata fields
          const { created_at, updated_at, ...cleanData } = row;
          return cleanData;
        });
        console.log(`✓ ${table}: ${result.rows.length} records`);
      } catch (error) {
        if (error.code === '42P01') {
          // Table doesn't exist
          console.log(`⊘ ${table}: Table doesn't exist (skipped)`);
        } else {
          throw error;
        }
      }
    }

    // Write to local JSON file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n✓ Data saved to: ${OUTPUT_FILE}`);

    const totalRecords = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`📊 Total records synced: ${totalRecords}`);

    console.log(`\n💡 Your local db.json now contains production data`);
    console.log(`   You can now test locally with real data`);
    console.log(`   Local changes will NOT affect production`);

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }

  process.exit(0);
}

// Run sync
syncFromProduction();

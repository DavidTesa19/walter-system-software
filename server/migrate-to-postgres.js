/**
 * Migration Script: JSON to PostgreSQL
 * 
 * This script migrates your local JSON database to Railway PostgreSQL
 * Run this ONCE after setting up your Railway database
 * 
 * Usage:
 *   1. Set DATABASE_URL in .env file
 *   2. Run: node migrate-to-postgres.js
 */

import fs from 'fs';
import path from 'path';
import db, { initDatabase } from './db.js';

const JSON_FILE = path.resolve(process.cwd(), 'db.json');

async function migrate() {
  console.log('🚀 Starting migration from JSON to PostgreSQL...\n');

  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL environment variable not set');
    console.log('Please set your Railway PostgreSQL connection string:');
    console.log('DATABASE_URL=postgresql://user:pass@host:port/database');
    process.exit(1);
  }

  // Read JSON file
  let jsonData;
  try {
    const raw = fs.readFileSync(JSON_FILE, 'utf8');
    jsonData = JSON.parse(raw);
    console.log('✓ Loaded JSON data from:', JSON_FILE);
  } catch (error) {
    console.error('❌ Failed to read JSON file:', error.message);
    process.exit(1);
  }

  // Initialize database tables
  try {
    await initDatabase();
    console.log('✓ Database tables initialized\n');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error.message);
    process.exit(1);
  }

  // Migrate each table
  const tables = ['partners', 'clients', 'tipers', 'users', 'employees'];
  let totalRecords = 0;

  for (const table of tables) {
    const records = jsonData[table] || [];
    
    if (records.length === 0) {
      console.log(`⊘ ${table}: No records to migrate`);
      continue;
    }

    console.log(`📦 Migrating ${table}...`);
    let successCount = 0;
    let errorCount = 0;

    for (const record of records) {
      try {
        // Remove id field - PostgreSQL will auto-generate
        const { id, ...data } = record;
        await db.create(table, data);
        successCount++;
      } catch (error) {
        console.error(`  ❌ Failed to migrate record:`, error.message);
        errorCount++;
      }
    }

    console.log(`  ✓ ${successCount} records migrated successfully`);
    if (errorCount > 0) {
      console.log(`  ⚠ ${errorCount} records failed`);
    }
    totalRecords += successCount;
  }

  console.log(`\n🎉 Migration complete!`);
  console.log(`📊 Total records migrated: ${totalRecords}`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Verify data in Railway dashboard`);
  console.log(`   2. Deploy your backend to Railway`);
  console.log(`   3. Update frontend API URL to Railway backend URL`);
  
  process.exit(0);
}

// Run migration
migrate().catch(error => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});

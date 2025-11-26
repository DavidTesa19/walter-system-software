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
import pkg from 'pg';

const { Pool } = pkg;
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

  // Create a pool for direct queries (since db.js helper might not cover everything)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  // Migrate each table
  const tableMappings = [
    { table: 'partners', jsonKey: 'partners' },
    { table: 'clients', jsonKey: 'clients' },
    { table: 'tipers', jsonKey: 'tipers' },
    { table: 'employees', jsonKey: 'employees' },
    { table: 'future_functions', jsonKey: 'futureFunctions' }
  ];
  let totalRecords = 0;

  // Migrate users separately to handle palettes
  const users = jsonData.users || [];
  if (users.length > 0) {
    console.log(`📦 Migrating users...`);
    let successCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        // Insert user
        const { id, palettes, ...userData } = user;
        // We keep the ID for users to maintain relationships if possible, 
        // but usually Postgres auto-increments. 
        // However, for migration, it's safer to let Postgres generate ID and map it?
        // Or force ID? Let's try to force ID if possible, or just let it auto-gen.
        // If we let it auto-gen, we lose the link to palettes if we don't track the new ID.
        
        // Let's try to insert with ID if possible, or just insert and get the new ID.
        // Since we are migrating from scratch, we can probably just insert.
        
        // Check if user exists
        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [userData.username]);
        let userId;
        
        if (existing.rows.length > 0) {
          userId = existing.rows[0].id;
          console.log(`  ⚠ User ${userData.username} already exists, skipping creation.`);
        } else {
          const result = await pool.query(
            `INSERT INTO users (username, password_hash, role, created_at) 
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [userData.username, userData.password_hash, userData.role, userData.created_at]
          );
          userId = result.rows[0].id;
          successCount++;
        }

        // Migrate palettes for this user
        if (palettes && Array.isArray(palettes)) {
          for (const palette of palettes) {
            await pool.query(
              `INSERT INTO user_palettes (user_id, name, mode, colors, typography, is_active)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [userId, palette.name, palette.mode, JSON.stringify(palette.colors), JSON.stringify(palette.typography), palette.is_active]
            );
          }
          console.log(`    ✓ Migrated ${palettes.length} palettes for ${userData.username}`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to migrate user ${user.username}:`, error.message);
        errorCount++;
      }
    }
    console.log(`  ✓ ${successCount} users migrated successfully`);
    totalRecords += successCount;
  }

  for (const { table, jsonKey } of tableMappings) {
    const records = jsonData[jsonKey] || [];
    
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

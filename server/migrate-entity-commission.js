/**
 * Database Migration: Entity-Commission Structure
 * 
 * This migration transforms the flat partners/clients/tipers tables into a 
 * two-level structure with entities (subjects) and commissions (zakázky).
 * 
 * New Structure:
 * - partner_entities, client_entities, tiper_entities: The people/companies
 * - partner_commissions, client_commissions, tiper_commissions: Individual jobs
 * 
 * ID System:
 * - Entity IDs: P001, K001, T001
 * - Commission IDs: P001-001 (Partner 1, Commission 1)
 */

import pkg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting Entity-Commission migration...\n');
    
    await client.query('BEGIN');
    
    // =========================================================================
    // CREATE NEW ENTITY TABLES
    // =========================================================================
    
    console.log('📦 Creating entity tables...');
    
    // Partner Entities
    await client.query(`
      CREATE TABLE IF NOT EXISTS partner_entities (
        id SERIAL PRIMARY KEY,
        entity_id VARCHAR(10) UNIQUE NOT NULL,
        
        -- Skupina 1: Identifikace
        company_name VARCHAR(255) NOT NULL,
        field VARCHAR(255),
        
        -- Skupina 2: Lokalita a Info
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(255),
        
        -- Skupina 3: Kontaktní osoba
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(100),
        website VARCHAR(255),
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ partner_entities table created');
    
    // Client Entities
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_entities (
        id SERIAL PRIMARY KEY,
        entity_id VARCHAR(10) UNIQUE NOT NULL,
        
        -- Skupina 1: Identifikace
        company_name VARCHAR(255) NOT NULL,
        field VARCHAR(255),
        service VARCHAR(255),
        
        -- Skupina 2: Lokalita a Info
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(255),
        budget VARCHAR(255),
        
        -- Skupina 3: Kontaktní osoba
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(100),
        website VARCHAR(255),
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ client_entities table created');
    
    // Tiper Entities
    await client.query(`
      CREATE TABLE IF NOT EXISTS tiper_entities (
        id SERIAL PRIMARY KEY,
        entity_id VARCHAR(10) UNIQUE NOT NULL,
        
        -- Skupina 1: Identifikace
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255),
        field VARCHAR(255),
        
        -- Skupina 2: Lokalita a Info
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(255),
        
        -- Skupina 3: Kontakt
        email VARCHAR(255),
        phone VARCHAR(100),
        website VARCHAR(255),
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ tiper_entities table created');
    
    // =========================================================================
    // CREATE NEW COMMISSION TABLES
    // =========================================================================
    
    console.log('\n📋 Creating commission tables...');
    
    // Partner Commissions
    await client.query(`
      CREATE TABLE IF NOT EXISTS partner_commissions (
        id SERIAL PRIMARY KEY,
        commission_id VARCHAR(15) UNIQUE NOT NULL,
        entity_id INTEGER REFERENCES partner_entities(id) ON DELETE CASCADE,
        entity_code VARCHAR(10) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        
        -- Header fields
        position VARCHAR(255),
        budget VARCHAR(255),
        state VARCHAR(100),
        assigned_to VARCHAR(255),
        
        -- Skupina 1
        field VARCHAR(255),
        service_position VARCHAR(255),
        
        -- Skupina 2
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(255),
        
        -- Skupina 3
        deadline DATE,
        priority VARCHAR(100),
        phone VARCHAR(100),
        
        -- Skupina 4
        commission_value VARCHAR(255),
        is_tipped BOOLEAN DEFAULT false,
        notes TEXT,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ partner_commissions table created');
    
    // Client Commissions
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_commissions (
        id SERIAL PRIMARY KEY,
        commission_id VARCHAR(15) UNIQUE NOT NULL,
        entity_id INTEGER REFERENCES client_entities(id) ON DELETE CASCADE,
        entity_code VARCHAR(10) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        
        -- Header fields
        service VARCHAR(255),
        budget VARCHAR(255),
        state VARCHAR(100),
        assigned_to VARCHAR(255),
        
        -- Skupina 1
        field VARCHAR(255),
        
        -- Skupina 2
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(255),
        
        -- Skupina 3
        deadline DATE,
        priority VARCHAR(100),
        phone VARCHAR(100),
        
        -- Skupina 4
        commission_value VARCHAR(255),
        is_tipped BOOLEAN DEFAULT false,
        notes TEXT,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ client_commissions table created');
    
    // Tiper Commissions
    await client.query(`
      CREATE TABLE IF NOT EXISTS tiper_commissions (
        id SERIAL PRIMARY KEY,
        commission_id VARCHAR(15) UNIQUE NOT NULL,
        entity_id INTEGER REFERENCES tiper_entities(id) ON DELETE CASCADE,
        entity_code VARCHAR(10) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        
        -- Reference to linked commission
        linked_entity_type VARCHAR(20),
        linked_commission_id VARCHAR(15),
        
        -- Skupina 3
        commission_value VARCHAR(255),
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ tiper_commissions table created');
    
    // =========================================================================
    // CREATE INDEXES
    // =========================================================================
    
    console.log('\n🔍 Creating indexes...');
    
    await client.query('CREATE INDEX IF NOT EXISTS idx_partner_entities_entity_id ON partner_entities(entity_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_client_entities_entity_id ON client_entities(entity_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tiper_entities_entity_id ON tiper_entities(entity_id)');
    
    await client.query('CREATE INDEX IF NOT EXISTS idx_partner_commissions_entity_id ON partner_commissions(entity_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_partner_commissions_status ON partner_commissions(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_client_commissions_entity_id ON client_commissions(entity_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_client_commissions_status ON client_commissions(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tiper_commissions_entity_id ON tiper_commissions(entity_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tiper_commissions_status ON tiper_commissions(status)');
    
    console.log('  ✓ Indexes created');
    
    // =========================================================================
    // MIGRATE EXISTING DATA
    // =========================================================================
    
    console.log('\n📊 Migrating existing data...');
    
    // Check if old tables have data
    const { rows: partners } = await client.query('SELECT * FROM partners ORDER BY id');
    const { rows: clients } = await client.query('SELECT * FROM clients ORDER BY id');
    const { rows: tipers } = await client.query('SELECT * FROM tipers ORDER BY id');
    
    // Migrate Partners
    if (partners.length > 0) {
      console.log(`  Migrating ${partners.length} partners...`);
      
      for (let i = 0; i < partners.length; i++) {
        const partner = partners[i];
        const entityCode = `P${String(i + 1).padStart(3, '0')}`;
        const commissionId = `${entityCode}-001`;
        
        // Insert entity
        const { rows: [entity] } = await client.query(`
          INSERT INTO partner_entities (entity_id, company_name, field, location, info, first_name, phone)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          entityCode,
          partner.company || partner.name || 'Bez názvu',
          partner.field,
          partner.location,
          partner.info,
          partner.name,
          partner.mobile
        ]);
        
        // Insert commission
        await client.query(`
          INSERT INTO partner_commissions (commission_id, entity_id, entity_code, status, commission_value, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          commissionId,
          entity.id,
          entityCode,
          partner.status || 'pending',
          partner.commission,
          null
        ]);
      }
      console.log('  ✓ Partners migrated');
    }
    
    // Migrate Clients
    if (clients.length > 0) {
      console.log(`  Migrating ${clients.length} clients...`);
      
      for (let i = 0; i < clients.length; i++) {
        const clientData = clients[i];
        const entityCode = `K${String(i + 1).padStart(3, '0')}`;
        const commissionId = `${entityCode}-001`;
        
        // Insert entity
        const { rows: [entity] } = await client.query(`
          INSERT INTO client_entities (entity_id, company_name, field, location, info, first_name, phone)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          entityCode,
          clientData.company || clientData.name || 'Bez názvu',
          clientData.field,
          clientData.location,
          clientData.info,
          clientData.name,
          clientData.mobile
        ]);
        
        // Insert commission
        await client.query(`
          INSERT INTO client_commissions (commission_id, entity_id, entity_code, status, deadline, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          commissionId,
          entity.id,
          entityCode,
          clientData.status || 'pending',
          clientData.date,
          null
        ]);
      }
      console.log('  ✓ Clients migrated');
    }
    
    // Migrate Tipers
    if (tipers.length > 0) {
      console.log(`  Migrating ${tipers.length} tipers...`);
      
      for (let i = 0; i < tipers.length; i++) {
        const tiper = tipers[i];
        const entityCode = `T${String(i + 1).padStart(3, '0')}`;
        const commissionId = `${entityCode}-001`;
        
        // Split name into first/last
        const nameParts = (tiper.name || 'Bez jména').split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || null;
        
        // Insert entity
        const { rows: [entity] } = await client.query(`
          INSERT INTO tiper_entities (entity_id, first_name, last_name, field, location, info, phone)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          entityCode,
          firstName,
          lastName,
          tiper.field,
          tiper.location,
          tiper.info,
          tiper.mobile
        ]);
        
        // Insert commission
        await client.query(`
          INSERT INTO tiper_commissions (commission_id, entity_id, entity_code, status, commission_value)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          commissionId,
          entity.id,
          entityCode,
          tiper.status || 'pending',
          tiper.commission
        ]);
      }
      console.log('  ✓ Tipers migrated');
    }
    
    // =========================================================================
    // CREATE ENTITY COUNTERS TABLE
    // =========================================================================
    
    console.log('\n🔢 Creating entity counters...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS entity_counters (
        entity_type VARCHAR(20) PRIMARY KEY,
        next_number INTEGER DEFAULT 1
      )
    `);
    
    // Initialize counters based on migrated data
    await client.query(`
      INSERT INTO entity_counters (entity_type, next_number)
      VALUES 
        ('partner', $1),
        ('client', $2),
        ('tiper', $3)
      ON CONFLICT (entity_type) DO UPDATE SET next_number = EXCLUDED.next_number
    `, [
      partners.length + 1,
      clients.length + 1,
      tipers.length + 1
    ]);
    
    console.log('  ✓ Entity counters created');
    
    await client.query('COMMIT');
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\nSummary:');
    console.log(`  - Partner entities: ${partners.length}`);
    console.log(`  - Client entities: ${clients.length}`);
    console.log(`  - Tiper entities: ${tipers.length}`);
    console.log('\nNote: Old tables (partners, clients, tipers) are preserved for backup.');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrate().catch(console.error);

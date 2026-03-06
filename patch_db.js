const fs = require('fs');
let content = fs.readFileSync('server/db.js', 'utf8');

const tableCreationStr = `

    // Create partner_entities and partner_commissions
    await client.query(\`
      CREATE TABLE IF NOT EXISTS partner_entities (
        id SERIAL PRIMARY KEY,
        entity_id VARCHAR(50) UNIQUE NOT NULL,
        company_name VARCHAR(255),
        field VARCHAR(255),
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(100),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        website VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`);

    await client.query(\`
      CREATE TABLE IF NOT EXISTS partner_commissions (
        id SERIAL PRIMARY KEY,
        commission_id VARCHAR(50) UNIQUE NOT NULL,
        entity_id INTEGER REFERENCES partner_entities(id) ON DELETE CASCADE,
        entity_code VARCHAR(50),
        status VARCHAR(50) DEFAULT 'pending',
        position VARCHAR(255),
        budget VARCHAR(100),
        state VARCHAR(100),
        assigned_to VARCHAR(255),
        field VARCHAR(255),
        service_position VARCHAR(255),
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(100),
        deadline VARCHAR(100),
        priority VARCHAR(50),
        phone VARCHAR(50),
        commission_value VARCHAR(100),
        is_tipped BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`);

    // Create client_entities and client_commissions
    await client.query(\`
      CREATE TABLE IF NOT EXISTS client_entities (
        id SERIAL PRIMARY KEY,
        entity_id VARCHAR(50) UNIQUE NOT NULL,
        company_name VARCHAR(255),
        field VARCHAR(255),
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(100),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        website VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`);

    await client.query(\`
      CREATE TABLE IF NOT EXISTS client_commissions (
        id SERIAL PRIMARY KEY,
        commission_id VARCHAR(50) UNIQUE NOT NULL,
        entity_id INTEGER REFERENCES client_entities(id) ON DELETE CASCADE,
        entity_code VARCHAR(50),
        status VARCHAR(50) DEFAULT 'pending',
        position VARCHAR(255),
        budget VARCHAR(100),
        state VARCHAR(100),
        assigned_to VARCHAR(255),
        field VARCHAR(255),
        service_position VARCHAR(255),
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(100),
        deadline VARCHAR(100),
        priority VARCHAR(50),
        phone VARCHAR(50),
        commission_value VARCHAR(100),
        is_tipped BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`);

    // Create tiper_entities and tiper_commissions
    await client.query(\`
      CREATE TABLE IF NOT EXISTS tiper_entities (
        id SERIAL PRIMARY KEY,
        entity_id VARCHAR(50) UNIQUE NOT NULL,
        company_name VARCHAR(255),
        field VARCHAR(255),
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(100),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        website VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`);

    await client.query(\`
      CREATE TABLE IF NOT EXISTS tiper_commissions (
        id SERIAL PRIMARY KEY,
        commission_id VARCHAR(50) UNIQUE NOT NULL,
        entity_id INTEGER REFERENCES tiper_entities(id) ON DELETE CASCADE,
        entity_code VARCHAR(50),
        status VARCHAR(50) DEFAULT 'pending',
        position VARCHAR(255),
        budget VARCHAR(100),
        state VARCHAR(100),
        assigned_to VARCHAR(255),
        field VARCHAR(255),
        service_position VARCHAR(255),
        location VARCHAR(255),
        info TEXT,
        category VARCHAR(100),
        deadline VARCHAR(100),
        priority VARCHAR(50),
        phone VARCHAR(50),
        commission_value VARCHAR(100),
        is_tipped BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`);
`;

if (!content.includes('CREATE TABLE IF NOT EXISTS partner_entities')) {
  content = content.replace("await ensureDefaultPalettes(client);", tableCreationStr + "\n    await ensureDefaultPalettes(client);");
}

fs.writeFileSync('server/db.js', content);

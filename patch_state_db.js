const fs = require('fs');

let dbContent = fs.readFileSync('server/db.js', 'utf8');

const migrationAdditions = [
  \"\\\"ALTER TABLE client_entities ADD COLUMN IF NOT EXISTS state VARCHAR(100)\\\"\",
  \"\\\"ALTER TABLE partner_entities ADD COLUMN IF NOT EXISTS state VARCHAR(100)\\\"\",
  \"\\\"ALTER TABLE tiper_entities ADD COLUMN IF NOT EXISTS state VARCHAR(100)\\\"\",
  \"\\\"ALTER TABLE project_client_entities ADD COLUMN IF NOT EXISTS state VARCHAR(100)\\\"\",
  \"\\\"ALTER TABLE project_partner_entities ADD COLUMN IF NOT EXISTS state VARCHAR(100)\\\"\",
  \"\\\"ALTER TABLE project_tiper_entities ADD COLUMN IF NOT EXISTS state VARCHAR(100)\\\"\"
];

if (!dbContent.includes('ALTER TABLE client_entities ADD COLUMN IF NOT EXISTS state VARCHAR(100)')) {
  dbContent = dbContent.replace(
    'const columnMigrations = [', 
    'const columnMigrations = [\\n      ' + migrationAdditions.join(',\\n      ') + ','
  );
}

const entities = ['client_entities', 'partner_entities', 'tiper_entities', 'project_client_entities', 'project_partner_entities', 'project_tiper_entities'];

entities.forEach(ent => {
    let re = new RegExp('(CREATE TABLE IF NOT EXISTS ' + ent + ' \\\\[\\\\s\\\\S]*?)(assigned_user_ids INTEGER\\\\[\\\\] DEFAULT \\'\\\\{\\\\}')');
    dbContent = dbContent.replace(re, '\ VARCHAR(100),\\n          \');
});

fs.writeFileSync('server/db.js', dbContent);
console.log('Patched db.js');

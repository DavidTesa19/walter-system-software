const fs = require('fs');
let content = fs.readFileSync('server/server.js', 'utf8');

const ensureEmptyArrays = `
    const collections = [
      'users', 'partners', 'clients', 'tipers', 'employees', 'futureFunctions',
      'documents', 'partner_entities', 'partner_commissions',
      'client_entities', 'client_commissions', 'tiper_entities', 'tiper_commissions'
    ];
    collections.forEach(col => {
      if (!db[col]) db[col] = [];
    });
`;

if (!content.includes('client_entities')) {
  // Wait, I just added it to defaultData, but what if they read existing db.json without these?
}

// Let's replace function readDb()
content = content.replace(/function readDb\(\) \{\s*try \{\s*const raw = fs\.readFileSync\(DATA_FILE, "utf8"\);\s*const db = JSON\.parse\(raw\);/, 
`function readDb() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const db = JSON.parse(raw);
    
    // Ensure all collections exist
    const collections = [
      'users', 'partners', 'clients', 'tipers', 'employees', 'futureFunctions',
      'documents', 'partner_entities', 'partner_commissions',
      'client_entities', 'client_commissions', 'tiper_entities', 'tiper_commissions',
      'notes'
    ];
    collections.forEach(col => {
      if (!db[col]) db[col] = [];
    });
`
);

fs.writeFileSync('server/server.js', content);

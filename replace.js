const fs = require('fs');
let content = fs.readFileSync('server/server.js', 'utf8');

if (content.includes('function readDb() {') && !content.includes('client_entities')) {
  let parts = content.split('function readDb() {');
  let rest = parts[1].replace(/try \{\s*const raw = fs\.readFileSync\(DATA_FILE, "utf8"\);\s*const db = JSON\.parse\(raw\);/, 
  `try {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const db = JSON.parse(raw);
      
      const collections = [
        'users', 'partners', 'clients', 'tipers', 'employees', 'futureFunctions',
        'documents', 'partner_entities', 'partner_commissions',
        'client_entities', 'client_commissions', 'tiper_entities', 'tiper_commissions',
        'notes'
      ];
      collections.forEach(col => {
        if (!db[col]) db[col] = [];
      });`
  );
  content = parts[0] + 'function readDb() {' + rest;
}

const defaultDataReg = /const defaultData = {[\s\S]*?color_palettes: cloneDefaultPalettes\(\)\s*};/;
if (defaultDataReg.test(content)) {
  content = content.replace(defaultDataReg, `const defaultData = {
          users: [],
          partners: [],
          clients: [],
          tipers: [],
          employees: [],
          futureFunctions: [],
          documents: [],
          partner_entities: [],
          partner_commissions: [],
          client_entities: [],
          client_commissions: [],
          tiper_entities: [],
          tiper_commissions: [],
          color_palettes: cloneDefaultPalettes()
        };`);
}

fs.writeFileSync('server/server.js', content);

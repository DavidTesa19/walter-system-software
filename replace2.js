const fs = require('fs');
let content = fs.readFileSync('server/server.js', 'utf8');

const targetStr = `  function readDb() {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const db = JSON.parse(raw);`;

const newStr = `  function readDb() {
    try {
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
      });`;

content = content.replace(targetStr, newStr);

fs.writeFileSync('server/server.js', content);

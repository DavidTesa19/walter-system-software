const fs = require('fs');
let content = fs.readFileSync('server/server.js', 'utf8');

content = content.replace(
  /const defaultData = {[\s\S]*?color_palettes: cloneDefaultPalettes\(\)\n\s*};/,
  `const defaultData = {
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
      };`
);

fs.writeFileSync('server/server.js', content);

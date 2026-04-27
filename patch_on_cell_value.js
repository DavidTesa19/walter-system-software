const fs = require('fs');
const files = [
  'client/src/usersGrid/sections/ClientsSectionNew.tsx',
  'client/src/usersGrid/sections/PartnersSectionNew.tsx',
  'client/src/usersGrid/sections/TipersSectionNew.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  content = content.replace(
    /const entityFields = \['name', 'company', 'field', 'location', 'mobile', 'email'\];\s+if \(entityFields\.includes\(field\) && row\.entity\) \{\s+await handleUpdateEntity\(row\.entity\.id, \{ \[field\]: newValue \} \);\s+\} else if \(!row\.entityOnly\) \{\s+await handleUpdateCommission\(row\.id, \{ \[field\]: newValue \} \);\s+\}/,
    \const entityFields = ['name', 'company', 'field', 'location', 'mobile', 'email'];

        if (entityFields.includes(field) && row.entity) {
          await handleUpdateEntity(row.entity.id, { [field]: newValue });
        } else if (field === 'state' && row.entityOnly && row.entity) {
          await handleUpdateEntity(row.entity.id, { state: newValue });
        } else if (!row.entityOnly) {
          await handleUpdateCommission(row.id, { [field]: newValue });
        }\
  );

  fs.writeFileSync(file, content);
}
console.log('Patched');

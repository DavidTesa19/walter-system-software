const fs = require('fs');
const content = fs.readFileSync('server/server-postgres.js', 'utf8');

const routes = `
// ============================================
// ENTITY & COMMISSION ENDPOINTS (DUAL MODE)
// ============================================

const createEntityCommissionRoutes = (entityTypes) => {
  for (const type of entityTypes) {
    const Type = type.charAt(0).toUpperCase() + type.slice(1);
    const entitiesPath = \`/api/\${type}-entities\`;
    const commissionsPath = \`/api/\${type}-commissions\`;

    // --- \${Type.toUpperCase()} ENTITIES ---

    app.get(entitiesPath, authenticateToken, async (req, res) => {
      try {
        const getEntities = db[\`get\${Type}Entities\`].bind(db);
        const records = await getEntities();
        res.json(records);
      } catch (error) {
        console.error(\`Error fetching \${type} entities:\`, error);
        res.status(500).json({ error: \`Failed to fetch \${type} entities\` });
      }
    });

    app.get(\`\${entitiesPath}/:id\`, authenticateToken, async (req, res) => {
      try {
        const id = Number(req.params.id);
        const getEntityById = db[\`get\${Type}EntityById\`].bind(db);
        const entity = await getEntityById(id);
        if (!entity) return res.status(404).json({ error: "Not found" });
        res.json(entity);
      } catch (error) {
        console.error(\`Error fetching \${type} entity:\`, error);
        res.status(500).json({ error: \`Failed to fetch \${type} entity\` });
      }
    });

    app.put(\`\${entitiesPath}/:id\`, authenticateToken, async (req, res) => {
      try {
        const id = Number(req.params.id);
        const updateEntity = db[\`update\${Type}Entity\`].bind(db);
        const updated = await updateEntity(id, req.body);
        if (!updated) return res.status(404).json({ error: "Not found" });
        res.json(updated);
      } catch (error) {
        console.error(\`Error updating \${type} entity:\`, error);
        res.status(500).json({ error: \`Failed to update \${type} entity\` });
      }
    });

    // Create entity with commission
    app.post(\`\${entitiesPath}/with-commission\`, authenticateToken, async (req, res) => {
      try {
        const { entity, commission } = req.body;
        if (!entity) {
          return res.status(400).json({ error: "entity data is required" });
        }
        const createWithCommission = db[\`create\${Type}WithCommission\`].bind(db);
        const result = await createWithCommission(entity, commission || {});
        res.status(201).json(result);
      } catch (error) {
        console.error(\`Error creating \${type} with commission:\`, error);
        res.status(500).json({ error: error.message || \`Failed to create \${type} with commission\` });
      }
    });

    // --- \${Type.toUpperCase()} COMMISSIONS ---

    app.get(commissionsPath, authenticateToken, async (req, res) => {
      try {
        const getCommissions = db[\`get\${Type}Commissions\`].bind(db);
        const records = await getCommissions(req.query);
        res.json(records);
      } catch (error) {
        console.error(\`Error fetching \${type} commissions:\`, error);
        res.status(500).json({ error: \`Failed to fetch \${type} commissions\` });
      }
    });

    app.get(\`\${commissionsPath}/:id\`, authenticateToken, async (req, res) => {
      try {
        const id = Number(req.params.id);
        const getCommissionById = db[\`get\${Type}CommissionById\`].bind(db);
        const commission = await getCommissionById(id);
        if (!commission) return res.status(404).json({ error: "Not found" });
        res.json(commission);
      } catch (error) {
        console.error(\`Error fetching \${type} commission:\`, error);
        res.status(500).json({ error: \`Failed to fetch \${type} commission\` });
      }
    });

    app.post(commissionsPath, authenticateToken, async (req, res) => {
      try {
        const createCommission = db[\`create\${Type}Commission\`].bind(db);
        const newCommission = await createCommission(req.body);
        res.status(201).json(newCommission);
      } catch (error) {
        console.error(\`Error creating \${type} commission:\`, error);
        res.status(500).json({ error: \`Failed to create \${type} commission\` });
      }
    });

    app.put(\`\${commissionsPath}/:id\`, authenticateToken, async (req, res) => {
      try {
        const id = Number(req.params.id);
        const updateCommission = db[\`update\${Type}Commission\`].bind(db);
        const updated = await updateCommission(id, req.body);
        if (!updated) return res.status(404).json({ error: "Not found" });
        res.json(updated);
      } catch (error) {
        console.error(\`Error updating \${type} commission:\`, error);
        res.status(500).json({ error: \`Failed to update \${type} commission\` });
      }
    });

    app.delete(\`\${commissionsPath}/:id\`, authenticateToken, async (req, res) => {
      try {
        const id = Number(req.params.id);
        const deleteCommission = db[\`delete\${Type}Commission\`].bind(db);
        const success = await deleteCommission(id);
        if (!success) return res.status(404).json({ error: "Not found" });
        res.status(204).end();
      } catch (error) {
        console.error(\`Error deleting \${type} commission:\`, error);
        res.status(500).json({ error: \`Failed to delete \${type} commission\` });
      }
    });
  }
};

createEntityCommissionRoutes(['partner', 'client', 'tiper']);

`;

const targetString = "createCrudRoutes('partners');";
if (content.includes(routes)) {
  console.log("Already added.");
} else if (content.includes(targetString)) {
  const newContent = content.replace(targetString, routes + targetString);
  fs.writeFileSync('server/server-postgres.js', newContent);
  console.log("Routes successfully injected!");
} else {
  console.log("Could not find target string to replace.");
}

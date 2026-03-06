const fs = require('fs');
let content = fs.readFileSync('server/db.js', 'utf8');

const crudStr = `
    // =========================================================================
    // CLIENT ENTITY OPERATIONS
    // =========================================================================

    async getClientEntities() {
      if (!USE_POSTGRES) return null;
      const { rows } = await pool.query('SELECT * FROM client_entities ORDER BY entity_id');
      return rows;
    },

    async getClientEntityById(id) {
      if (!USE_POSTGRES) return null;
      const { rows } = await pool.query('SELECT * FROM client_entities WHERE id = $1', [id]);
      return rows[0] || null;
    },

    async getClientEntityByCode(entityCode) {
      if (!USE_POSTGRES) return null;
      const { rows } = await pool.query('SELECT * FROM client_entities WHERE entity_id = $1', [entityCode]);
      return rows[0] || null;
    },

    async createClientEntity(data) {
      if (!USE_POSTGRES) return null;

      const entityId = await this.getNextEntityId('client');
      const { rows } = await pool.query(
        `INSERT INTO client_entities (entity_id, company_name, field, location, info, category, first_name, last_name, email, phone, website)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [entityId, data.company_name, data.field, data.location, data.info, data.category, data.first_name, data.last_name, data.email, data.phone, data.website]
      );
      return rows[0];
    },

    async updateClientEntity(id, data) {
      if (!USE_POSTGRES) return null;

      const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'entity_id' && k !== 'created_at' && k !== 'updated_at');
      if (fields.length === 0) return this.getClientEntityById(id);

      const values = fields.map(f => data[f]);
      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

      const { rows } = await pool.query(
        `UPDATE client_entities SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, id]
      );
      return rows[0] || null;
    },

    // =========================================================================
    // CLIENT COMMISSION OPERATIONS
    // =========================================================================

    async getClientCommissions(filters = {}) {
      if (!USE_POSTGRES) return null;

      let query = `
        SELECT
          c.*,
          e.entity_id as e_entity_id,
          e.company_name as e_company_name,
          e.field as e_field,
          e.location as e_location,
          e.info as e_info,
          e.category as e_category,
          e.first_name as e_first_name,
          e.last_name as e_last_name,
          e.email as e_email,
          e.phone as e_phone,
          e.website as e_website
        FROM client_commissions c
        JOIN client_entities e ON c.entity_id = e.id
      `;

      const values = [];
      if (filters.status) {
        query += ` WHERE c.status = $1`;
        values.push(filters.status);
      }
      
      query += ' ORDER BY c.created_at DESC';
      
      const { rows } = await pool.query(query, values);
      return rows;
    },

    async getClientCommissionById(id) {
      if (!USE_POSTGRES) return null;
      
      const { rows } = await pool.query(`
        SELECT
          c.*,
          e.entity_id as e_entity_id,
          e.company_name as e_company_name,
          e.field as e_field,
          e.location as e_location,
          e.info as e_info,
          e.category as e_category,
          e.first_name as e_first_name,
          e.last_name as e_last_name,
          e.email as e_email,
          e.phone as e_phone,
          e.website as e_website
        FROM client_commissions c
        JOIN client_entities e ON c.entity_id = e.id
        WHERE c.id = $1`,
        [id]
      );
      return rows[0] || null;
    },

    async getClientCommissionsByEntityId(entityId) {
      if (!USE_POSTGRES) return null;
      const { rows } = await pool.query('SELECT * FROM client_commissions WHERE entity_id = $1 ORDER BY created_at DESC', [entityId]);
      return rows;
    },

    async createClientCommission(entityInternalId, data) {
      if (!USE_POSTGRES) return null;

      // Get entity to use its code
      const entity = await this.getClientEntityById(entityInternalId);
      if (!entity) throw new Error('Client entity not found');

      const commissionId = await this.getNextCommissionId('client');
      
      const { rows } = await pool.query(
        `INSERT INTO client_commissions 
          (commission_id, entity_id, entity_code, status, position, budget, state, assigned_to, field, service_position, location, info, category, deadline, priority, phone, commission_value, is_tipped, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING *`,
        [commissionId, entityInternalId, entity.entity_id, data.status || 'pending', data.position, data.budget, data.state, data.assigned_to, data.field, data.service_position, data.location, data.info, data.category, data.deadline, data.priority, data.phone, data.commission_value, data.is_tipped || false, data.notes]
      );
      return rows[0];
    },

    async updateClientCommission(id, data) {
      if (!USE_POSTGRES) return null;

      const fields = Object.keys(data).filter(k => 
        k !== 'id' && k !== 'commission_id' && k !== 'entity_id' && k !== 'entity_code' &&
        k !== 'created_at' && k !== 'updated_at' && !k.startsWith('e_')
      );
      if (fields.length === 0) return this.getClientCommissionById(id);

      const values = fields.map(f => data[f]);
      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

      const { rows } = await pool.query(
        `UPDATE client_commissions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, id]
      );
      return rows[0] || null;
    },

    // =========================================================================
    // TIPER ENTITY OPERATIONS
    // =========================================================================

    async getTiperEntities() {
      if (!USE_POSTGRES) return null;
      const { rows } = await pool.query('SELECT * FROM tiper_entities ORDER BY entity_id');
      return rows;
    },

    async getTiperEntityById(id) {
      if (!USE_POSTGRES) return null;
      const { rows } = await pool.query('SELECT * FROM tiper_entities WHERE id = $1', [id]);
      return rows[0] || null;
    },

    async getTiperEntityByCode(entityCode) {
      if (!USE_POSTGRES) return null;
      const { rows } = await pool.query('SELECT * FROM tiper_entities WHERE entity_id = $1', [entityCode]);
      return rows[0] || null;
    },

    async createTiperEntity(data) {
      if (!USE_POSTGRES) return null;

      const entityId = await this.getNextEntityId('tiper');
      const { rows } = await pool.query(
        `INSERT INTO tiper_entities (entity_id, company_name, field, location, info, category, first_name, last_name, email, phone, website)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [entityId, data.company_name, data.field, data.location, data.info, data.category, data.first_name, data.last_name, data.email, data.phone, data.website]
      );
      return rows[0];
    },

    async updateTiperEntity(id, data) {
      if (!USE_POSTGRES) return null;

      const fields = Object.keys(data).filter(k => k !== 'id' && k !== 'entity_id' && k !== 'created_at' && k !== 'updated_at');
      if (fields.length === 0) return this.getTiperEntityById(id);

      const values = fields.map(f => data[f]);
      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

      const { rows } = await pool.query(
        `UPDATE tiper_entities SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, id]
      );
      return rows[0] || null;
    },

    // =========================================================================
    // TIPER COMMISSION OPERATIONS
    // =========================================================================

    async getTiperCommissions(filters = {}) {
      if (!USE_POSTGRES) return null;

      let query = `
        SELECT
          c.*,
          e.entity_id as e_entity_id,
          e.company_name as e_company_name,
          e.field as e_field,
          e.location as e_location,
          e.info as e_info,
          e.category as e_category,
          e.first_name as e_first_name,
          e.last_name as e_last_name,
          e.email as e_email,
          e.phone as e_phone,
          e.website as e_website
        FROM tiper_commissions c
        JOIN tiper_entities e ON c.entity_id = e.id
      `;

      const values = [];
      if (filters.status) {
        query += ` WHERE c.status = $1`;
        values.push(filters.status);
      }
      
      query += ' ORDER BY c.created_at DESC';
      
      const { rows } = await pool.query(query, values);
      return rows;
    },

    async getTiperCommissionById(id) {
      if (!USE_POSTGRES) return null;
      
      const { rows } = await pool.query(`
        SELECT
          c.*,
          e.entity_id as e_entity_id,
          e.company_name as e_company_name,
          e.field as e_field,
          e.location as e_location,
          e.info as e_info,
          e.category as e_category,
          e.first_name as e_first_name,
          e.last_name as e_last_name,
          e.email as e_email,
          e.phone as e_phone,
          e.website as e_website
        FROM tiper_commissions c
        JOIN tiper_entities e ON c.entity_id = e.id
        WHERE c.id = $1`,
        [id]
      );
      return rows[0] || null;
    },

    async getTiperCommissionsByEntityId(entityId) {
      if (!USE_POSTGRES) return null;
      const { rows } = await pool.query('SELECT * FROM tiper_commissions WHERE entity_id = $1 ORDER BY created_at DESC', [entityId]);
      return rows;
    },

    async createTiperCommission(entityInternalId, data) {
      if (!USE_POSTGRES) return null;

      // Get entity to use its code
      const entity = await this.getTiperEntityById(entityInternalId);
      if (!entity) throw new Error('Tiper entity not found');

      const commissionId = await this.getNextCommissionId('tiper');
      
      const { rows } = await pool.query(
        `INSERT INTO tiper_commissions 
          (commission_id, entity_id, entity_code, status, position, budget, state, assigned_to, field, service_position, location, info, category, deadline, priority, phone, commission_value, is_tipped, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING *`,
        [commissionId, entityInternalId, entity.entity_id, data.status || 'pending', data.position, data.budget, data.state, data.assigned_to, data.field, data.service_position, data.location, data.info, data.category, data.deadline, data.priority, data.phone, data.commission_value, data.is_tipped || false, data.notes]
      );
      return rows[0];
    },

    async updateTiperCommission(id, data) {
      if (!USE_POSTGRES) return null;

      const fields = Object.keys(data).filter(k => 
        k !== 'id' && k !== 'commission_id' && k !== 'entity_id' && k !== 'entity_code' &&
        k !== 'created_at' && k !== 'updated_at' && !k.startsWith('e_')
      );
      if (fields.length === 0) return this.getTiperCommissionById(id);

      const values = fields.map(f => data[f]);
      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');

      const { rows } = await pool.query(
        `UPDATE tiper_commissions SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${fields.length + 1} RETURNING *`,
        [...values, id]
      );
      return rows[0] || null;
    }
  }; // End of outer object
`;

if (!content.includes('getClientEntities')) {
  content = content.replace(/};\s*$/g, crudStr + "\n");
}

fs.writeFileSync('server/db.js', content);

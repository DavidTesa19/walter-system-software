/**
 * Entity-Commission JSON Storage Utilities
 * 
 * This file provides utilities for working with the entity-commission structure
 * in JSON file storage (development mode).
 */

/**
 * Generate entity ID from prefix and number
 */
export function generateEntityId(prefix, num) {
  return `${prefix}${String(num).padStart(3, '0')}`;
}

/**
 * Generate commission ID from entity ID and commission number
 */
export function generateCommissionId(entityId, commissionNum) {
  return `${entityId}-${String(commissionNum).padStart(3, '0')}`;
}

/**
 * Get next entity number for a type
 */
export function getNextEntityNumber(db, entityType) {
  const counters = db.entity_counters || {};
  return counters[entityType] || 1;
}

/**
 * Increment entity counter and return new number
 */
export function incrementEntityCounter(db, entityType) {
  if (!db.entity_counters) {
    db.entity_counters = { partner: 1, client: 1, tiper: 1 };
  }
  const current = db.entity_counters[entityType] || 1;
  db.entity_counters[entityType] = current + 1;
  return current;
}

/**
 * Get next commission number for an entity
 */
export function getNextCommissionNumber(commissions, entityCode) {
  const existing = commissions.filter(c => c.entity_code === entityCode);
  return existing.length + 1;
}

/**
 * Ensure entity-commission collections exist in the database
 */
export function ensureEntityCommissionCollections(db) {
  if (!db.partner_entities) db.partner_entities = [];
  if (!db.client_entities) db.client_entities = [];
  if (!db.tiper_entities) db.tiper_entities = [];
  if (!db.partner_commissions) db.partner_commissions = [];
  if (!db.client_commissions) db.client_commissions = [];
  if (!db.tiper_commissions) db.tiper_commissions = [];
  if (!db.entity_counters) db.entity_counters = { partner: 1, client: 1, tiper: 1 };
  return db;
}

/**
 * Get next internal ID for a collection
 */
export function getNextId(collection) {
  return collection.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

// =============================================================================
// PARTNER ENTITY OPERATIONS
// =============================================================================

export function getPartnerEntities(db) {
  ensureEntityCommissionCollections(db);
  return [...db.partner_entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

export function getPartnerEntityById(db, id) {
  ensureEntityCommissionCollections(db);
  return db.partner_entities.find(e => e.id === id) || null;
}

export function getPartnerEntityByCode(db, entityCode) {
  ensureEntityCommissionCollections(db);
  return db.partner_entities.find(e => e.entity_id === entityCode) || null;
}

export function createPartnerEntity(db, data) {
  ensureEntityCommissionCollections(db);
  const num = incrementEntityCounter(db, 'partner');
  const entityId = generateEntityId('P', num);
  const id = getNextId(db.partner_entities);
  
  const entity = {
    id,
    entity_id: entityId,
    company_name: data.company_name || 'Nová společnost',
    field: data.field || null,
    location: data.location || null,
    info: data.info || null,
    category: data.category || null,
    first_name: data.first_name || null,
    last_name: data.last_name || null,
    email: data.email || null,
    phone: data.phone || null,
    website: data.website || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  db.partner_entities.push(entity);
  return entity;
}

export function updatePartnerEntity(db, id, data) {
  ensureEntityCommissionCollections(db);
  const idx = db.partner_entities.findIndex(e => e.id === id);
  if (idx === -1) return null;
  
  const updated = {
    ...db.partner_entities[idx],
    ...data,
    id,
    entity_id: db.partner_entities[idx].entity_id, // Preserve entity_id
    updated_at: new Date().toISOString()
  };
  
  db.partner_entities[idx] = updated;
  return updated;
}

// =============================================================================
// PARTNER COMMISSION OPERATIONS
// =============================================================================

export function getPartnerCommissions(db, filters = {}) {
  ensureEntityCommissionCollections(db);
  
  let commissions = db.partner_commissions;
  
  if (filters.status) {
    commissions = commissions.filter(c => c.status === filters.status);
  }
  
  // Join with entity data
  return commissions.map(commission => {
    const entity = db.partner_entities.find(e => e.id === commission.entity_id);
    return {
      ...commission,
      entity_company_name: entity?.company_name || null,
      entity_field: entity?.field || null,
      entity_location: entity?.location || null,
      entity_info: entity?.info || null,
      entity_category: entity?.category || null,
      entity_first_name: entity?.first_name || null,
      entity_last_name: entity?.last_name || null,
      entity_email: entity?.email || null,
      entity_phone: entity?.phone || null,
      entity_website: entity?.website || null
    };
  }).sort((a, b) => a.commission_id.localeCompare(b.commission_id));
}

export function getPartnerCommissionById(db, id) {
  ensureEntityCommissionCollections(db);
  const commission = db.partner_commissions.find(c => c.id === id);
  if (!commission) return null;
  
  const entity = db.partner_entities.find(e => e.id === commission.entity_id);
  return {
    ...commission,
    entity_company_name: entity?.company_name || null,
    entity_field: entity?.field || null,
    entity_location: entity?.location || null,
    entity_info: entity?.info || null,
    entity_category: entity?.category || null,
    entity_first_name: entity?.first_name || null,
    entity_last_name: entity?.last_name || null,
    entity_email: entity?.email || null,
    entity_phone: entity?.phone || null,
    entity_website: entity?.website || null
  };
}

export function createPartnerCommission(db, entityInternalId, data) {
  ensureEntityCommissionCollections(db);
  
  const entity = getPartnerEntityById(db, entityInternalId);
  if (!entity) throw new Error('Partner entity not found');
  
  const commissionNum = getNextCommissionNumber(db.partner_commissions, entity.entity_id);
  const commissionId = generateCommissionId(entity.entity_id, commissionNum);
  const id = getNextId(db.partner_commissions);
  
  const commission = {
    id,
    commission_id: commissionId,
    entity_id: entityInternalId,
    entity_code: entity.entity_id,
    status: data.status || 'pending',
    position: data.position || null,
    budget: data.budget || null,
    state: data.state || null,
    assigned_to: data.assigned_to || null,
    field: data.field || null,
    service_position: data.service_position || null,
    location: data.location || null,
    info: data.info || null,
    category: data.category || null,
    deadline: data.deadline || null,
    priority: data.priority || null,
    phone: data.phone || null,
    commission_value: data.commission_value || null,
    is_tipped: data.is_tipped || false,
    notes: data.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  db.partner_commissions.push(commission);
  return getPartnerCommissionById(db, id);
}

export function updatePartnerCommission(db, id, data) {
  ensureEntityCommissionCollections(db);
  const idx = db.partner_commissions.findIndex(c => c.id === id);
  if (idx === -1) return null;
  
  // Filter out entity_ prefixed fields (they're read-only)
  const commissionData = {};
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('entity_') && key !== 'id' && key !== 'commission_id' && key !== 'entity_id' && key !== 'entity_code') {
      commissionData[key] = value;
    }
  }
  
  const updated = {
    ...db.partner_commissions[idx],
    ...commissionData,
    id,
    commission_id: db.partner_commissions[idx].commission_id,
    entity_id: db.partner_commissions[idx].entity_id,
    entity_code: db.partner_commissions[idx].entity_code,
    updated_at: new Date().toISOString()
  };
  
  db.partner_commissions[idx] = updated;
  return getPartnerCommissionById(db, id);
}

export function deletePartnerCommission(db, id) {
  ensureEntityCommissionCollections(db);
  const idx = db.partner_commissions.findIndex(c => c.id === id);
  if (idx === -1) return null;
  
  const [removed] = db.partner_commissions.splice(idx, 1);
  return removed;
}

// =============================================================================
// CLIENT ENTITY OPERATIONS
// =============================================================================

export function getClientEntities(db) {
  ensureEntityCommissionCollections(db);
  return [...db.client_entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

export function getClientEntityById(db, id) {
  ensureEntityCommissionCollections(db);
  return db.client_entities.find(e => e.id === id) || null;
}

export function getClientEntityByCode(db, entityCode) {
  ensureEntityCommissionCollections(db);
  return db.client_entities.find(e => e.entity_id === entityCode) || null;
}

export function createClientEntity(db, data) {
  ensureEntityCommissionCollections(db);
  const num = incrementEntityCounter(db, 'client');
  const entityId = generateEntityId('K', num);
  const id = getNextId(db.client_entities);
  
  const entity = {
    id,
    entity_id: entityId,
    company_name: data.company_name || 'Nová společnost',
    field: data.field || null,
    service: data.service || null,
    location: data.location || null,
    info: data.info || null,
    category: data.category || null,
    budget: data.budget || null,
    first_name: data.first_name || null,
    last_name: data.last_name || null,
    email: data.email || null,
    phone: data.phone || null,
    website: data.website || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  db.client_entities.push(entity);
  return entity;
}

export function updateClientEntity(db, id, data) {
  ensureEntityCommissionCollections(db);
  const idx = db.client_entities.findIndex(e => e.id === id);
  if (idx === -1) return null;
  
  const updated = {
    ...db.client_entities[idx],
    ...data,
    id,
    entity_id: db.client_entities[idx].entity_id,
    updated_at: new Date().toISOString()
  };
  
  db.client_entities[idx] = updated;
  return updated;
}

// =============================================================================
// CLIENT COMMISSION OPERATIONS
// =============================================================================

export function getClientCommissions(db, filters = {}) {
  ensureEntityCommissionCollections(db);
  
  let commissions = db.client_commissions;
  
  if (filters.status) {
    commissions = commissions.filter(c => c.status === filters.status);
  }
  
  return commissions.map(commission => {
    const entity = db.client_entities.find(e => e.id === commission.entity_id);
    return {
      ...commission,
      entity_company_name: entity?.company_name || null,
      entity_field: entity?.field || null,
      entity_service: entity?.service || null,
      entity_location: entity?.location || null,
      entity_info: entity?.info || null,
      entity_category: entity?.category || null,
      entity_budget: entity?.budget || null,
      entity_first_name: entity?.first_name || null,
      entity_last_name: entity?.last_name || null,
      entity_email: entity?.email || null,
      entity_phone: entity?.phone || null,
      entity_website: entity?.website || null
    };
  }).sort((a, b) => a.commission_id.localeCompare(b.commission_id));
}

export function getClientCommissionById(db, id) {
  ensureEntityCommissionCollections(db);
  const commission = db.client_commissions.find(c => c.id === id);
  if (!commission) return null;
  
  const entity = db.client_entities.find(e => e.id === commission.entity_id);
  return {
    ...commission,
    entity_company_name: entity?.company_name || null,
    entity_field: entity?.field || null,
    entity_service: entity?.service || null,
    entity_location: entity?.location || null,
    entity_info: entity?.info || null,
    entity_category: entity?.category || null,
    entity_budget: entity?.budget || null,
    entity_first_name: entity?.first_name || null,
    entity_last_name: entity?.last_name || null,
    entity_email: entity?.email || null,
    entity_phone: entity?.phone || null,
    entity_website: entity?.website || null
  };
}

export function createClientCommission(db, entityInternalId, data) {
  ensureEntityCommissionCollections(db);
  
  const entity = getClientEntityById(db, entityInternalId);
  if (!entity) throw new Error('Client entity not found');
  
  const commissionNum = getNextCommissionNumber(db.client_commissions, entity.entity_id);
  const commissionId = generateCommissionId(entity.entity_id, commissionNum);
  const id = getNextId(db.client_commissions);
  
  const commission = {
    id,
    commission_id: commissionId,
    entity_id: entityInternalId,
    entity_code: entity.entity_id,
    status: data.status || 'pending',
    service: data.service || null,
    budget: data.budget || null,
    state: data.state || null,
    assigned_to: data.assigned_to || null,
    field: data.field || null,
    location: data.location || null,
    info: data.info || null,
    category: data.category || null,
    deadline: data.deadline || null,
    priority: data.priority || null,
    phone: data.phone || null,
    commission_value: data.commission_value || null,
    is_tipped: data.is_tipped || false,
    notes: data.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  db.client_commissions.push(commission);
  return getClientCommissionById(db, id);
}

export function updateClientCommission(db, id, data) {
  ensureEntityCommissionCollections(db);
  const idx = db.client_commissions.findIndex(c => c.id === id);
  if (idx === -1) return null;
  
  const commissionData = {};
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('entity_') && key !== 'id' && key !== 'commission_id' && key !== 'entity_id' && key !== 'entity_code') {
      commissionData[key] = value;
    }
  }
  
  const updated = {
    ...db.client_commissions[idx],
    ...commissionData,
    id,
    commission_id: db.client_commissions[idx].commission_id,
    entity_id: db.client_commissions[idx].entity_id,
    entity_code: db.client_commissions[idx].entity_code,
    updated_at: new Date().toISOString()
  };
  
  db.client_commissions[idx] = updated;
  return getClientCommissionById(db, id);
}

export function deleteClientCommission(db, id) {
  ensureEntityCommissionCollections(db);
  const idx = db.client_commissions.findIndex(c => c.id === id);
  if (idx === -1) return null;
  
  const [removed] = db.client_commissions.splice(idx, 1);
  return removed;
}

// =============================================================================
// TIPER ENTITY OPERATIONS
// =============================================================================

export function getTiperEntities(db) {
  ensureEntityCommissionCollections(db);
  return [...db.tiper_entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

export function getTiperEntityById(db, id) {
  ensureEntityCommissionCollections(db);
  return db.tiper_entities.find(e => e.id === id) || null;
}

export function getTiperEntityByCode(db, entityCode) {
  ensureEntityCommissionCollections(db);
  return db.tiper_entities.find(e => e.entity_id === entityCode) || null;
}

export function createTiperEntity(db, data) {
  ensureEntityCommissionCollections(db);
  const num = incrementEntityCounter(db, 'tiper');
  const entityId = generateEntityId('T', num);
  const id = getNextId(db.tiper_entities);
  
  const entity = {
    id,
    entity_id: entityId,
    first_name: data.first_name || 'Nový',
    last_name: data.last_name || 'Tipař',
    field: data.field || null,
    location: data.location || null,
    info: data.info || null,
    category: data.category || null,
    email: data.email || null,
    phone: data.phone || null,
    website: data.website || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  db.tiper_entities.push(entity);
  return entity;
}

export function updateTiperEntity(db, id, data) {
  ensureEntityCommissionCollections(db);
  const idx = db.tiper_entities.findIndex(e => e.id === id);
  if (idx === -1) return null;
  
  const updated = {
    ...db.tiper_entities[idx],
    ...data,
    id,
    entity_id: db.tiper_entities[idx].entity_id,
    updated_at: new Date().toISOString()
  };
  
  db.tiper_entities[idx] = updated;
  return updated;
}

// =============================================================================
// TIPER COMMISSION OPERATIONS
// =============================================================================

export function getTiperCommissions(db, filters = {}) {
  ensureEntityCommissionCollections(db);
  
  let commissions = db.tiper_commissions;
  
  if (filters.status) {
    commissions = commissions.filter(c => c.status === filters.status);
  }
  
  return commissions.map(commission => {
    const entity = db.tiper_entities.find(e => e.id === commission.entity_id);
    return {
      ...commission,
      entity_first_name: entity?.first_name || null,
      entity_last_name: entity?.last_name || null,
      entity_field: entity?.field || null,
      entity_location: entity?.location || null,
      entity_info: entity?.info || null,
      entity_category: entity?.category || null,
      entity_email: entity?.email || null,
      entity_phone: entity?.phone || null,
      entity_website: entity?.website || null
    };
  }).sort((a, b) => a.commission_id.localeCompare(b.commission_id));
}

export function getTiperCommissionById(db, id) {
  ensureEntityCommissionCollections(db);
  const commission = db.tiper_commissions.find(c => c.id === id);
  if (!commission) return null;
  
  const entity = db.tiper_entities.find(e => e.id === commission.entity_id);
  return {
    ...commission,
    entity_first_name: entity?.first_name || null,
    entity_last_name: entity?.last_name || null,
    entity_field: entity?.field || null,
    entity_location: entity?.location || null,
    entity_info: entity?.info || null,
    entity_category: entity?.category || null,
    entity_email: entity?.email || null,
    entity_phone: entity?.phone || null,
    entity_website: entity?.website || null
  };
}

export function createTiperCommission(db, entityInternalId, data) {
  ensureEntityCommissionCollections(db);
  
  const entity = getTiperEntityById(db, entityInternalId);
  if (!entity) throw new Error('Tiper entity not found');
  
  const commissionNum = getNextCommissionNumber(db.tiper_commissions, entity.entity_id);
  const commissionId = generateCommissionId(entity.entity_id, commissionNum);
  const id = getNextId(db.tiper_commissions);
  
  const commission = {
    id,
    commission_id: commissionId,
    entity_id: entityInternalId,
    entity_code: entity.entity_id,
    status: data.status || 'pending',
    linked_entity_type: data.linked_entity_type || null,
    linked_commission_id: data.linked_commission_id || null,
    commission_value: data.commission_value || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  db.tiper_commissions.push(commission);
  return getTiperCommissionById(db, id);
}

export function updateTiperCommission(db, id, data) {
  ensureEntityCommissionCollections(db);
  const idx = db.tiper_commissions.findIndex(c => c.id === id);
  if (idx === -1) return null;
  
  const commissionData = {};
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('entity_') && key !== 'id' && key !== 'commission_id' && key !== 'entity_id' && key !== 'entity_code') {
      commissionData[key] = value;
    }
  }
  
  const updated = {
    ...db.tiper_commissions[idx],
    ...commissionData,
    id,
    commission_id: db.tiper_commissions[idx].commission_id,
    entity_id: db.tiper_commissions[idx].entity_id,
    entity_code: db.tiper_commissions[idx].entity_code,
    updated_at: new Date().toISOString()
  };
  
  db.tiper_commissions[idx] = updated;
  return getTiperCommissionById(db, id);
}

export function deleteTiperCommission(db, id) {
  ensureEntityCommissionCollections(db);
  const idx = db.tiper_commissions.findIndex(c => c.id === id);
  if (idx === -1) return null;
  
  const [removed] = db.tiper_commissions.splice(idx, 1);
  return removed;
}

// =============================================================================
// COMBINED OPERATIONS
// =============================================================================

export function createPartnerWithCommission(db, entityData, commissionData) {
  const entity = createPartnerEntity(db, entityData);
  const commission = createPartnerCommission(db, entity.id, commissionData);
  return { entity, commission };
}

export function createClientWithCommission(db, entityData, commissionData) {
  const entity = createClientEntity(db, entityData);
  const commission = createClientCommission(db, entity.id, commissionData);
  return { entity, commission };
}

export function createTiperWithCommission(db, entityData, commissionData) {
  const entity = createTiperEntity(db, entityData);
  const commission = createTiperCommission(db, entity.id, commissionData);
  return { entity, commission };
}

// =============================================================================
// MIGRATION FROM OLD STRUCTURE
// =============================================================================

/**
 * Migrate old flat structure to new entity-commission structure
 */
export function migrateOldData(db) {
  // Skip if already migrated
  if (db.partner_entities && db.partner_entities.length > 0) {
    return false;
  }
  
  ensureEntityCommissionCollections(db);
  
  // Migrate partners
  if (Array.isArray(db.partners)) {
    db.partners.forEach((partner, index) => {
      const entityId = generateEntityId('P', index + 1);
      const entity = {
        id: index + 1,
        entity_id: entityId,
        company_name: partner.company || partner.name || 'Bez názvu',
        field: partner.field || null,
        location: partner.location || null,
        info: partner.info || null,
        category: null,
        first_name: partner.name || null,
        last_name: null,
        email: null,
        phone: partner.mobile || null,
        website: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.partner_entities.push(entity);
      
      const commission = {
        id: index + 1,
        commission_id: generateCommissionId(entityId, 1),
        entity_id: entity.id,
        entity_code: entityId,
        status: partner.status || 'pending',
        position: null,
        budget: null,
        state: null,
        assigned_to: null,
        field: null,
        service_position: null,
        location: null,
        info: null,
        category: null,
        deadline: null,
        priority: null,
        phone: null,
        commission_value: partner.commission || null,
        is_tipped: false,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.partner_commissions.push(commission);
    });
    db.entity_counters.partner = db.partners.length + 1;
  }
  
  // Migrate clients
  if (Array.isArray(db.clients)) {
    db.clients.forEach((client, index) => {
      const entityId = generateEntityId('K', index + 1);
      const entity = {
        id: index + 1,
        entity_id: entityId,
        company_name: client.company || client.name || 'Bez názvu',
        field: client.field || null,
        service: null,
        location: client.location || null,
        info: client.info || null,
        category: null,
        budget: null,
        first_name: client.name || null,
        last_name: null,
        email: null,
        phone: client.mobile || null,
        website: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.client_entities.push(entity);
      
      const commission = {
        id: index + 1,
        commission_id: generateCommissionId(entityId, 1),
        entity_id: entity.id,
        entity_code: entityId,
        status: client.status || 'pending',
        service: null,
        budget: null,
        state: null,
        assigned_to: null,
        field: null,
        location: null,
        info: null,
        category: null,
        deadline: client.date || null,
        priority: null,
        phone: null,
        commission_value: null,
        is_tipped: false,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.client_commissions.push(commission);
    });
    db.entity_counters.client = db.clients.length + 1;
  }
  
  // Migrate tipers
  if (Array.isArray(db.tipers)) {
    db.tipers.forEach((tiper, index) => {
      const entityId = generateEntityId('T', index + 1);
      const nameParts = (tiper.name || 'Bez jména').split(' ');
      const entity = {
        id: index + 1,
        entity_id: entityId,
        first_name: nameParts[0] || 'Bez',
        last_name: nameParts.slice(1).join(' ') || 'jména',
        field: tiper.field || null,
        location: tiper.location || null,
        info: tiper.info || null,
        category: null,
        email: null,
        phone: tiper.mobile || null,
        website: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.tiper_entities.push(entity);
      
      const commission = {
        id: index + 1,
        commission_id: generateCommissionId(entityId, 1),
        entity_id: entity.id,
        entity_code: entityId,
        status: tiper.status || 'pending',
        linked_entity_type: null,
        linked_commission_id: null,
        commission_value: tiper.commission || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      db.tiper_commissions.push(commission);
    });
    db.entity_counters.tiper = db.tipers.length + 1;
  }
  
  return true;
}

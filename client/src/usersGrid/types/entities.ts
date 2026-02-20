// ============================================================================
// ENTITY TYPES (Subjects) - The people/companies
// ============================================================================

/**
 * Base entity interface - common fields for all entities
 */
export interface BaseEntity {
  id: number;
  entity_id: string;  // P001, K001, T001
  created_at?: string;
  updated_at?: string;
}

/**
 * Partner Entity - Partner information
 */
export interface PartnerEntity extends BaseEntity {
  name: string;
  company: string | null;
  field: string | null;
  location: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  info: string | null;
}

/**
 * Client Entity - Client information
 */
export interface ClientEntity extends BaseEntity {
  name: string;
  company: string | null;
  field: string | null;
  location: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  info: string | null;
}

/**
 * Tiper Entity - Tipař information
 */
export interface TiperEntity extends BaseEntity {
  name: string;
  company: string | null;
  field: string | null;
  location: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  info: string | null;
}

// ============================================================================
// COMMISSION TYPES (Zakázky) - Individual jobs linked to entities
// ============================================================================

/**
 * Base commission interface - common fields for all commissions
 */
export interface BaseCommission {
  id: number;
  commission_id: string;      // P001-001, K001-001, etc.
  status: 'pending' | 'accepted' | 'archived';
  created_at?: string;
  updated_at?: string;
  
  // Common fields
  assigned_to: string | null;
  priority: string | null;
  next_step: string | null;
  notes: string | null;
  last_contact: string | null;
}

/**
 * Partner Commission - Partner zakázka
 */
export interface PartnerCommission extends BaseCommission {
  partner_entity_id: number;
  
  // Project info
  project_name: string | null;
  commission_type: string | null;
  
  // Financial
  commission_value: string | null;
  commission_rate: string | null;
  payment_terms: string | null;
  
  // Dates
  start_date: string | null;
  end_date: string | null;
}

/**
 * Client Commission - Client zakázka
 */
export interface ClientCommission extends BaseCommission {
  client_entity_id: number;
  
  // Project info
  project_name: string | null;
  service_type: string | null;
  
  // Financial
  contract_value: string | null;
  payment_status: string | null;
  payment_terms: string | null;
  
  // Dates
  start_date: string | null;
  end_date: string | null;
  
  // Client specific
  satisfaction: string | null;
}

/**
 * Tiper Commission - Tipař zakázka (tip)
 */
export interface TiperCommission extends BaseCommission {
  tiper_entity_id: number;
  
  // Tip info
  tip_description: string | null;
  referred_contact: string | null;
  
  // Financial
  tip_value: string | null;
  reward_amount: string | null;
  reward_status: string | null;
  
  // Dates
  tip_date: string | null;
  conversion_date: string | null;
  
  // Result
  tip_result: string | null;
}

// ============================================================================
// GRID ROW TYPES - Combined view for display in grids
// ============================================================================

/**
 * Partner Grid Row - Commission with entity info for grid display
 */
export interface PartnerGridRow extends PartnerCommission {
  // Entity info (from join)
  entity_id: string;
  name: string;
  company: string;
  field: string;
  location: string;
  mobile: string;
  email: string;
  entity: PartnerEntity | null;
}

/**
 * Client Grid Row - Commission with entity info for grid display
 */
export interface ClientGridRow extends ClientCommission {
  // Entity info (from join)
  entity_id: string;
  name: string;
  company: string;
  field: string;
  location: string;
  mobile: string;
  email: string;
  entity: ClientEntity | null;
}

/**
 * Tiper Grid Row - Commission with entity info for grid display
 */
export interface TiperGridRow extends TiperCommission {
  // Entity info (from join)
  entity_id: string;
  name: string;
  company: string;
  field: string;
  location: string;
  mobile: string;
  email: string;
  entity: TiperEntity | null;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type EntityType = 'partner' | 'client' | 'tiper';
export type EntityPrefix = 'P' | 'K' | 'T';

export const ENTITY_PREFIX_MAP: Record<EntityType, EntityPrefix> = {
  partner: 'P',
  client: 'K',
  tiper: 'T'
};

/**
 * Generate entity ID from prefix and number
 */
export function generateEntityId(prefix: EntityPrefix, num: number): string {
  return `${prefix}${String(num).padStart(3, '0')}`;
}

/**
 * Generate commission ID from entity ID and commission number
 */
export function generateCommissionId(entityId: string, commissionNum: number): string {
  return `${entityId}-${String(commissionNum).padStart(3, '0')}`;
}

/**
 * Parse commission ID to get entity ID and commission number
 */
export function parseCommissionId(commissionId: string): { entityId: string; commissionNum: number } | null {
  const match = commissionId.match(/^([PKT]\d{3})-(\d{3})$/);
  if (!match) return null;
  return {
    entityId: match[1],
    commissionNum: parseInt(match[2], 10)
  };
}

/**
 * Parse entity ID to get prefix and number
 */
export function parseEntityId(entityId: string): { prefix: EntityPrefix; num: number } | null {
  const match = entityId.match(/^([PKT])(\d{3})$/);
  if (!match) return null;
  return {
    prefix: match[1] as EntityPrefix,
    num: parseInt(match[2], 10)
  };
}

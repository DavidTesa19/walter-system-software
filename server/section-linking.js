/**
 * Shared configuration for linking Veřejné ("public") and Growth Club ("growth")
 * subject/commission records together as a synced pair.
 *
 * A linked pair shares a `link_id` (a random UUID) across the two rows that
 * represent "the same" real-world client/partner/tiper (or their commission)
 * in both sections. Core descriptive fields are kept in sync between the
 * pair; workflow status, assignment, ids and timestamps stay independent
 * per section. Neveřejné (projects) is intentionally not part of this —
 * linking only ever happens between 'public' and 'growth'.
 */

export const LINKABLE_ENTITY_TYPES = ["client", "partner", "tiper"];

export const otherNamespace = (namespace) => (namespace === "public" ? "growth" : "public");

export const isLinkableNamespace = (namespace) => namespace === "public" || namespace === "growth";

export const ENTITY_TABLES = {
  client: { public: "client_entities", growth: "growth_client_entities" },
  partner: { public: "partner_entities", growth: "growth_partner_entities" },
  tiper: { public: "tiper_entities", growth: "growth_tiper_entities" },
};

export const COMMISSION_TABLES = {
  client: { public: "client_commissions", growth: "growth_client_commissions" },
  partner: { public: "partner_commissions", growth: "growth_partner_commissions" },
  tiper: { public: "tiper_commissions", growth: "growth_tiper_commissions" },
};

export const ENTITY_CORE_FIELDS = {
  client: ["company_name", "field", "service", "location", "region", "info", "category", "budget", "first_name", "last_name", "email", "phone", "website"],
  partner: ["company_name", "field", "location", "region", "info", "category", "first_name", "last_name", "email", "phone", "website"],
  tiper: ["company_name", "field", "location", "region", "info", "category", "first_name", "last_name", "email", "phone", "website"],
};

export const COMMISSION_CORE_FIELDS = {
  client: ["project_name", "position", "budget", "state", "field", "service_position", "location", "info", "category", "deadline", "priority", "phone", "commission_value", "is_tipped", "notes"],
  partner: ["position", "budget", "state", "field", "service_position", "location", "info", "category", "deadline", "priority", "phone", "commission_value", "is_tipped", "notes"],
  tiper: ["position", "budget", "state", "field", "service_position", "location", "info", "category", "deadline", "priority", "phone", "commission_value", "is_tipped", "notes"],
};

export const resolveTable = (kind, type, namespace) => {
  const map = kind === "entity" ? ENTITY_TABLES : COMMISSION_TABLES;
  return map[type]?.[namespace] ?? null;
};

export const coreFieldsFor = (kind, type) =>
  (kind === "entity" ? ENTITY_CORE_FIELDS[type] : COMMISSION_CORE_FIELDS[type]) ?? [];

export const pickCoreFields = (kind, type, source = {}) => {
  const fields = coreFieldsFor(kind, type);
  const picked = {};
  for (const field of fields) {
    if (source[field] !== undefined) {
      picked[field] = source[field];
    }
  }
  return picked;
};

export const isValidSectionLinkRequest = ({ kind, type, namespace, id }) =>
  (kind === "entity" || kind === "commission") &&
  LINKABLE_ENTITY_TYPES.includes(type) &&
  isLinkableNamespace(namespace) &&
  (id !== undefined && id !== null && id !== "");

export const LINK_COLUMN_TABLES = [
  "client_entities",
  "growth_client_entities",
  "partner_entities",
  "growth_partner_entities",
  "tiper_entities",
  "growth_tiper_entities",
  "client_commissions",
  "growth_client_commissions",
  "partner_commissions",
  "growth_partner_commissions",
  "tiper_commissions",
  "growth_tiper_commissions",
];

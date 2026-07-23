/**
 * Shared configuration for linking the two (or three) SIDES of a single
 * commission together as a "deal", within one section (Veřejné / Growth Club /
 * Neveřejné).
 *
 * A commission belongs to exactly one subject (its owner entity). A real job,
 * though, has up to three participants:
 *   - the CLIENT  — who needs / buys the commission
 *   - the PARTNER — who provides / fulfils it
 *   - the TIPAŘ   — who recommended it and takes a share (optional)
 *
 * When the user attaches a counterparty to a commission, a fresh mirror
 * commission is created under that counterparty subject and both rows are
 * stamped with the same random `deal_id`. Every commission sharing a `deal_id`
 * (at most one per subject type) forms one deal. Core descriptive fields are
 * kept in sync across the deal members; ids, status, assignment and timestamps
 * stay independent per side. Linking never crosses sections — a deal_id is only
 * ever matched within the same namespace.
 */

import {
  COMMISSION_TABLES,
  ENTITY_TABLES,
  COMMISSION_CORE_FIELDS,
  isLinkableNamespace,
} from "./section-linking.js";

export const DEAL_TYPES = ["client", "partner", "tiper"];

export const DEAL_TYPE_LABELS = {
  client: "Klient",
  partner: "Partner",
  tiper: "Tipař",
};

export const isDealType = (type) => DEAL_TYPES.includes(type);

export const otherDealTypes = (type) => DEAL_TYPES.filter((t) => t !== type);

export const resolveCommissionTable = (type, namespace) =>
  COMMISSION_TABLES[type]?.[namespace] ?? null;

export const resolveEntityTable = (type, namespace) =>
  ENTITY_TABLES[type]?.[namespace] ?? null;

export const dealCoreFields = (type) => COMMISSION_CORE_FIELDS[type] ?? [];

// Human-friendly display name for a subject entity, used to label deal slots in
// the UI. Company name wins, then first+last, then the entity code.
export const entityDisplayName = (entity) => {
  if (!entity) return null;
  const fullName = [entity.first_name, entity.last_name]
    .filter((part) => part != null && String(part).trim() !== "")
    .join(" ")
    .trim();
  const company = entity.company_name != null ? String(entity.company_name).trim() : "";
  return company || fullName || entity.entity_id || null;
};

export const isValidDealRequest = ({ namespace, type, id }) =>
  isLinkableNamespace(namespace) &&
  isDealType(type) &&
  id !== undefined &&
  id !== null &&
  id !== "";

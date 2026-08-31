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
 * kept in sync across the deal members; ids, assignment and timestamps stay
 * independent per side. The mirror is created in the same approval state as its
 * source (so linking an active commission puts an active one on the other
 * side's Zakázky grid) but the two states are independent from then on.
 *
 * A deal is NOT confined to one section. Each of its three sides may live in a
 * different namespace — a Growth Club client can be joined to a Veřejné partner
 * and a Neveřejné tipař — so a `deal_id` has to be matched across every
 * namespace, and the mirror commission is created in the *target subject's*
 * section, not the source's. The one-per-subject-type rule still holds: a deal
 * has at most one client, one partner and one tipař, wherever they live.
 */

import {
  COMMISSION_TABLES,
  ENTITY_TABLES,
  COMMISSION_CORE_FIELDS,
  LINKABLE_NAMESPACES,
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

// Every section a deal side may live in. A deal is looked up across all of them,
// so the search order here is also the order slots resolve in when (through bad
// data) two sections somehow hold the same type for one deal.
export const DEAL_NAMESPACES = LINKABLE_NAMESPACES;

export const DEAL_NAMESPACE_LABELS = {
  public: "Veřejné",
  growth: "Growth Club",
  projects: "Neveřejné",
};

export const dealNamespaceLabel = (namespace) => DEAL_NAMESPACE_LABELS[namespace] ?? namespace;

// The counterparty side of an attach/detach: which subject type, and which
// section it lives in. `targetNamespace` is optional for backwards compatibility
// — an older client that omits it means "the same section as the source".
export const resolveDealTarget = ({ type, namespace, targetType, targetNamespace }) => {
  // A deal holds at most one side per subject type, and the source commission
  // already occupies its own type's slot — in any section.
  if (!isDealType(targetType) || targetType === type) return null;
  const resolvedNamespace = targetNamespace ?? namespace;
  if (!isLinkableNamespace(resolvedNamespace)) return null;
  return { targetType, targetNamespace: resolvedNamespace };
};

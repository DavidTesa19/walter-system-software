/**
 * SUBJECT IDENTITY — one real-world subject acting in several roles.
 *
 * A subject is stored once per ROLE: the same company can exist as a row in
 * `client_entities`, another in `partner_entities` and a third in
 * `tiper_entities`. Until now those rows knew nothing about each other, so a
 * subject's profile could only ever show the commissions of the one role whose
 * section the panel happened to be open in.
 *
 * `subject_id` (a random UUID on every entity table) fixes that: every entity
 * row carrying the same `subject_id` is the same real-world subject wearing a
 * different hat. It is the cross-TYPE twin of `link_id`, which pairs the same
 * row across SECTIONS (Veřejné / Growth Club / Neveřejné), and of `deal_id`,
 * which groups the participants of one commission.
 *
 *   link_id     same subject, same role,      other section
 *   subject_id  same subject, other role,     any section
 *   deal_id     other subjects, one commission
 *
 * The identity group is the transitive closure over BOTH `subject_id` and
 * `link_id`: a Veřejné client that is mirrored into Growth Club and is also
 * registered as a Veřejné partner forms one group of three entity rows, and the
 * profile panel lists the commissions of all of them.
 *
 * A group needs at least two members to mean anything; below that the
 * `subject_id` is cleared from whatever is left, exactly as `deal_id` is.
 */

import {
  ENTITY_TABLES,
  LINKABLE_NAMESPACES,
  isLinkableNamespace,
} from "./section-linking.js";

/** The roles a subject can act in. Same three values as DEAL_TYPES. */
export const SUBJECT_ROLES = ["client", "partner", "tiper"];

export const SUBJECT_ROLE_LABELS = {
  client: "Klient",
  partner: "Partner",
  tiper: "Tipař",
};

/** Accusative, for "Propojit ___" / "Vytvořit ___". */
export const SUBJECT_ROLE_AS_LABELS = {
  client: "klienta",
  partner: "partnera",
  tiper: "tipaře",
};

export const SUBJECT_NAMESPACES = LINKABLE_NAMESPACES;

export const SUBJECT_NAMESPACE_LABELS = {
  public: "Veřejné",
  growth: "Growth Club",
  projects: "Neveřejné",
};

export const subjectNamespaceLabel = (namespace) =>
  SUBJECT_NAMESPACE_LABELS[namespace] ?? namespace;

export const isSubjectRole = (role) => SUBJECT_ROLES.includes(role);

export const otherSubjectRoles = (role) => SUBJECT_ROLES.filter((r) => r !== role);

export const isValidSubjectRequest = ({ namespace, type, id }) =>
  isLinkableNamespace(namespace) &&
  isSubjectRole(type) &&
  id !== undefined &&
  id !== null &&
  id !== "";

/** Every entity table that carries a `subject_id`. */
export const SUBJECT_ID_TABLES = SUBJECT_ROLES.flatMap((role) =>
  SUBJECT_NAMESPACES.map((namespace) => ENTITY_TABLES[role][namespace])
);

/** Stable key for one entity row across the nine tables. */
export const subjectIdentityKey = (type, namespace, id) => `${type}:${namespace}:${id}`;

/**
 * The subject fields kept in sync across a subject's roles once they are
 * linked as the same real-world subject — contacts and location. Obor and
 * Zaměření (`field`, `field_specialization`, `company_structure`) are
 * deliberately left out: the obor a subject works in as a partner is rarely
 * the obor it is a client or a tipař for, so each role keeps its own (same
 * rule `companyStructureWithoutFields` in subject-structure.js applies when a
 * role is first created from another).
 */
export const SUBJECT_SHARED_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "website",
  "region",
  "location",
  "region_structure",
  "location_geo",
];

/** Narrow a payload down to the subject's shared fields, present keys only. */
export const pickSubjectSharedFields = (source = {}) => {
  const picked = {};
  for (const field of SUBJECT_SHARED_FIELDS) {
    if (source[field] !== undefined) picked[field] = source[field];
  }
  return picked;
};

/**
 * Below this many entity rows a `subject_id` no longer groups anything, so it
 * is cleared from whatever is left. Mirrors MIN_DEAL_MEMBERS.
 */
export const MIN_SUBJECT_IDENTITIES = 2;

/**
 * The commission fields the profile panel's role tables render. Kept here so
 * the two server backends cannot drift on what a role table row contains.
 */
export const subjectCommissionSummary = (row) => ({
  id: row.id,
  commissionId: row.commission_id,
  status: row.status,
  state: row.state ?? null,
  position: row.position ?? null,
  servicePosition: row.service_position ?? null,
  projectName: row.project_name ?? null,
  assignedTo: row.assigned_to ?? null,
  assignedUserIds: row.assigned_user_ids ?? [],
  dealId: row.deal_id ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
});

// Cross-type creation: when adding a subject in one section (Partneři / Klienti
// / Tipaři) the user can tick "Vytvořit i jako ..." to create the same subject
// as one or both of the other two types at the same time. The copies are
// independent records (same as the profile panel's "Zkopírovat jako ..."), not
// linked, and are created in the same namespace as the primary record.

import { apiPost } from "../utils/api";

export type SubjectType = "partner" | "client" | "tiper";

export const SUBJECT_TYPES: SubjectType[] = ["partner", "client", "tiper"];

// Nominative label (for headings) and accusative label (for "Vytvořit i jako ___").
export const SUBJECT_TYPE_LABEL: Record<SubjectType, string> = {
  partner: "Partner",
  client: "Klient",
  tiper: "Tipař",
};

export const SUBJECT_TYPE_AS_LABEL: Record<SubjectType, string> = {
  partner: "Partnera",
  client: "Klienta",
  tiper: "Tipaře",
};

// "k partnerům" / "ke klientům" / "k tipařům" — dative plural with the
// preposition, for error messages ("Chyba při kopírování ... k ___.").
export const SUBJECT_TYPE_TO_DATIVE_PLURAL: Record<SubjectType, string> = {
  partner: "k partnerům",
  client: "ke klientům",
  tiper: "k tipařům",
};

export const subjectEntityApiBase = (type: SubjectType, systemNamespace?: string): string =>
  systemNamespace ? `/api/${systemNamespace}/${type}-entities` : `/api/${type}-entities`;

// A cross-type copy is the same subject acting in a different role, and the
// obor it works in as a partner is rarely the obor it is a client or a tipař
// for. Both Obor and Zaměření are therefore left empty on every copy for the
// user to fill in, while the rest of the profile carries over.
const withoutFieldValues = (payload: Record<string, unknown>): Record<string, unknown> => ({
  ...payload,
  field: null,
  field_specialization: null,
});

export interface CrossTypeCreateArgs {
  targets: SubjectType[];
  systemNamespace?: string;
  entityPayload: Record<string, unknown>;
  // When provided the copy is created together with a commission; otherwise the
  // copy is entity-only.
  commissionPayload?: Record<string, unknown> | null;
}

/**
 * Create independent copies of a just-created subject in the given other types.
 * Never throws — returns the list of types that failed so the caller can warn
 * the user without rolling back the primary record.
 */
export const createSubjectInOtherTypes = async ({
  targets,
  systemNamespace,
  entityPayload,
  commissionPayload,
}: CrossTypeCreateArgs): Promise<SubjectType[]> => {
  const failed: SubjectType[] = [];
  const copyPayload = withoutFieldValues(entityPayload);

  for (const type of targets) {
    const base = subjectEntityApiBase(type, systemNamespace);
    try {
      if (commissionPayload) {
        await apiPost(`${base}/with-commission`, { entity: copyPayload, commission: commissionPayload });
      } else {
        await apiPost(base, copyPayload);
      }
    } catch (error) {
      console.error(`Error creating subject as ${type}:`, error);
      failed.push(type);
    }
  }

  return failed;
};

// -----------------------------------------------------------------------------
// Copying an EXISTING subject (from the profile panel) into another type. Used
// by the "Vytvořit i jako ..." toggles shown alongside a subject's profile —
// the same action as the create-time checkboxes, just run after the fact.
// -----------------------------------------------------------------------------

// Shape shared by PartnerEntity / ClientEntity / TiperEntity for the fields
// that carry over into a copy. Obor (`field`) and Zaměření
// (`field_specialization`) are deliberately absent — see withoutFieldValues.
export interface CrossTypeEntitySnapshot {
  status: string;
  name?: string | null;
  company?: string | null;
  tier?: string | null;
  mobile?: string | null;
  email?: string | null;
  website?: string | null;
  region?: string | null;
  location?: string | null;
  location_geo?: string | null;
  info?: string | null;
  assigned_user_ids?: number[] | null;
}

// Shape shared by PartnerCommission / ClientCommission / TiperCommission for
// the fields that carry over into a copy.
export interface CrossTypeCommissionSnapshot {
  status: string;
  position?: string | null;
  service_position?: string | null;
  assigned_user_ids?: number[] | null;
  budget?: string | null;
  commission_value?: string | null;
  priority?: string | null;
  state?: string | null;
  deadline?: string | null;
  notes?: string | null;
}

const emptyToNull = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
};

/**
 * Copy an existing subject (and optionally its selected commission) into
 * another subject type, mirroring the payload the create-time "Vytvořit i
 * jako ..." option sends. Returns the new record's entity_id.
 */
export const copySubjectToOtherType = async (
  target: SubjectType,
  systemNamespace: string | undefined,
  entity: CrossTypeEntitySnapshot,
  commission?: CrossTypeCommissionSnapshot | null
): Promise<string> => {
  const base = subjectEntityApiBase(target, systemNamespace);

  const entityPayload = withoutFieldValues({
    status: entity.status,
    first_name: emptyToNull(entity.name),
    company_name: emptyToNull(entity.company),
    tier: emptyToNull(entity.tier),
    phone: emptyToNull(entity.mobile),
    email: emptyToNull(entity.email),
    website: emptyToNull(entity.website),
    region: emptyToNull(entity.region),
    location: emptyToNull(entity.location),
    location_geo: emptyToNull(entity.location_geo),
    info: emptyToNull(entity.info),
    assigned_user_ids: entity.assigned_user_ids ?? [],
  });

  if (commission) {
    const commissionPayload = {
      status: commission.status,
      position: emptyToNull(commission.position),
      service_position: emptyToNull(commission.service_position),
      assigned_user_ids: commission.assigned_user_ids ?? [],
      budget: emptyToNull(commission.budget),
      commission_value: emptyToNull(commission.commission_value),
      priority: emptyToNull(commission.priority),
      state: emptyToNull(commission.state),
      deadline: emptyToNull(commission.deadline),
      notes: emptyToNull(commission.notes),
    };

    const response = await apiPost<{ entity: { entity_id: string } }>(`${base}/with-commission`, {
      entity: entityPayload,
      commission: commissionPayload,
    });
    return response?.entity?.entity_id ?? "";
  }

  const response = await apiPost<{ entity_id: string }>(base, entityPayload);
  return response?.entity_id ?? "";
};

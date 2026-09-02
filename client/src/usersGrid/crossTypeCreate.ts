// Cross-type creation: when adding a subject in one section (Partneři / Klienti
// / Tipaři) the user can tick "Vytvořit i jako ..." to create the same subject
// as one or both of the other two types at the same time. Each copy is a record
// of its own, in the same namespace as the primary, and the caller binds it to
// the primary as the SAME subject in another role (see subjectLink.ts) — that is
// what makes all three roles' commissions visible from one profile panel.

import { apiPost } from "../utils/api";
import { serializeCompanyStructure } from "./hierarchy";
import { parseMultiValue } from "./multiValue";

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
  // The Společnost → Obor → Zaměření tree carries the obors too, so it is
  // rebuilt from the companies alone; the copy keeps who the subject is and
  // drops what it does.
  company_structure: emptyCompanyStructure(payload.company_name),
});

// The companies the copy keeps, with no obor attached to any of them.
const emptyCompanyStructure = (companyName: unknown): string | null =>
  serializeCompanyStructure(parseMultiValue(companyName).map((company) => ({ company, fields: [] })));

export interface CrossTypeCreateArgs {
  targets: SubjectType[];
  systemNamespace?: string;
  entityPayload: Record<string, unknown>;
  // When provided the copy is created together with a commission; otherwise the
  // copy is entity-only.
  commissionPayload?: Record<string, unknown> | null;
}

export interface CrossTypeCreateResult {
  /** Types whose copy could not be created. */
  failed: SubjectType[];
  /** The copies that were created, for binding them to the primary subject. */
  created: Array<{ type: SubjectType; entityInternalId: number }>;
}

/**
 * Create copies of a just-created subject in the given other types. Never
 * throws — a type that fails lands in `failed` so the caller can warn the user
 * without rolling back the primary record, and the ones that succeeded come
 * back in `created` for the caller to link as the same subject.
 */
export const createSubjectInOtherTypes = async ({
  targets,
  systemNamespace,
  entityPayload,
  commissionPayload,
}: CrossTypeCreateArgs): Promise<CrossTypeCreateResult> => {
  const failed: SubjectType[] = [];
  const created: Array<{ type: SubjectType; entityInternalId: number }> = [];
  const copyPayload = withoutFieldValues(entityPayload);

  for (const type of targets) {
    const base = subjectEntityApiBase(type, systemNamespace);
    try {
      const entityInternalId = commissionPayload
        ? (await apiPost<{ entity?: { id?: number } }>(`${base}/with-commission`, { entity: copyPayload, commission: commissionPayload }))?.entity?.id
        : (await apiPost<{ id?: number }>(base, copyPayload))?.id;
      if (typeof entityInternalId === "number") created.push({ type, entityInternalId });
    } catch (error) {
      console.error(`Error creating subject as ${type}:`, error);
      failed.push(type);
    }
  }

  return { failed, created };
};

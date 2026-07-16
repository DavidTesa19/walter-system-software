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

export const subjectEntityApiBase = (type: SubjectType, systemNamespace?: string): string =>
  systemNamespace ? `/api/${systemNamespace}/${type}-entities` : `/api/${type}-entities`;

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

  for (const type of targets) {
    const base = subjectEntityApiBase(type, systemNamespace);
    try {
      if (commissionPayload) {
        await apiPost(`${base}/with-commission`, { entity: entityPayload, commission: commissionPayload });
      } else {
        await apiPost(base, entityPayload);
      }
    } catch (error) {
      console.error(`Error creating subject as ${type}:`, error);
      failed.push(type);
    }
  }

  return failed;
};

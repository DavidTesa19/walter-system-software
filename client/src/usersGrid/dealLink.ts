import { apiGet, apiPost } from "../utils/api";
import type { LinkableNamespace } from "./sectionLink";
import { formatMultiValue, parseMultiValue, parseSpecializationMap } from "./multiValue";

// Deal linking connects the two (client + partner) or three (+ tiper) SIDES of a
// single commission within one section. Picking a counterparty subject creates a
// fresh mirror commission under it, joined to the same deal. See server/deal-linking.js.

export type DealType = "client" | "partner" | "tiper";

export const DEAL_TYPES: DealType[] = ["client", "partner", "tiper"];

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  client: "Klient",
  partner: "Partner",
  tiper: "Tipař",
};

export interface DealSlot {
  type: DealType;
  commissionInternalId: number;
  commissionId: string;
  status: string;
  entityInternalId: number | null;
  entityCode: string | null;
  name: string | null;
}

export interface DealStatus {
  dealId: string | null;
  slots: Record<DealType, DealSlot | null>;
}

// A selectable counterparty subject, enriched with the profile fields the
// picker needs for searching, filtering (Obor / Zaměření / Kraj / Status) and
// the hover info card. Multi-value columns are pre-parsed into value lists.
export interface DealSubjectOption {
  id: number;
  entityCode: string;
  label: string;
  /** Display name: company first, then person name (same source as `label`). */
  name: string;
  /** Person name (first + last, or the legacy `name` column). */
  personName: string;
  company: string;
  obory: string[];
  /** "Obor (Zaměření)" display pairs for the info card. */
  oboryDisplay: string[];
  zamereni: string[];
  kraje: string[];
  lokality: string[];
  status: string;
  email: string;
  phone: string;
  website: string;
  info: string;
  /** Precomputed lowercase, diacritics-free "code + name" haystack for the
   *  picker's search bar. Deliberately excludes Obor/Zaměření/Kraj/contacts —
   *  those have their own filters. */
  searchText: string;
}

/** Lowercase + strip diacritics, so "rican" matches "Říčan". */
export const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const entityApiBase = (type: DealType, namespace: LinkableNamespace): string => {
  const prefix = namespace === "public" ? "" : `/${namespace}`;
  return `/api${prefix}/${type}-entities`;
};

const str = (value: unknown): string => String(value ?? "").trim();

// The entity rows arrive under DB column names in some namespaces and the
// client-side names in others, and a missing value can be "" as well as null.
const pick = (...values: unknown[]): unknown => values.find((value) => str(value) !== "");

const buildSubjectOption = (row: Record<string, unknown>): DealSubjectOption => {
  // Společnost is a multi-value column — format it so a JSON array string never
  // leaks into the label.
  const company = formatMultiValue(pick(row.company_name, row.company));
  const personName =
    [row.first_name, row.last_name]
      .filter((part) => part != null && String(part).trim() !== "")
      .map((part) => String(part).trim())
      .join(" ")
      .trim() || str(row.name);
  const name = company || personName;
  const entityCode = String(row.entity_id ?? row.id ?? "");
  const obory = parseMultiValue(row.field);
  const specMap = parseSpecializationMap(row.field_specialization);
  const legacySpec = str(row.field_specialization);
  // Records written before the obor -> specialization map existed stored a bare
  // string; keep those filterable too (matching formatSpecialization).
  const zamereni = Array.from(
    new Set(
      Object.keys(specMap).length === 0 && legacySpec && !legacySpec.startsWith("{")
        ? [legacySpec]
        : Object.values(specMap)
    )
  );
  const kraje = parseMultiValue(row.region);
  const lokality = parseMultiValue(row.location);
  const email = str(row.email);
  const phone = str(pick(row.phone, row.mobile));
  const website = str(row.website);

  return {
    id: Number(row.id),
    entityCode,
    label: name ? `${entityCode} — ${name}` : entityCode,
    name,
    personName,
    company,
    obory,
    oboryDisplay: obory.map((obor) => (specMap[obor] ? `${obor} (${specMap[obor]})` : obor)),
    zamereni,
    kraje,
    lokality,
    status: str(row.status),
    email,
    phone,
    website,
    info: str(row.info),
    // The picker's search bar matches on name only (code + company/person name
    // — the two things shown in the option's title line), not on Obor/Kraj/
    // contacts, which have their own dedicated filters.
    searchText: normalizeSearchText([entityCode, company, personName].filter(Boolean).join(" ")),
  };
};

export const getDealStatus = (
  namespace: LinkableNamespace,
  type: DealType,
  commissionId: number
): Promise<DealStatus> =>
  apiGet<DealStatus>(`/api/deal-link/status?namespace=${namespace}&type=${type}&id=${commissionId}`);

export const attachDeal = (
  namespace: LinkableNamespace,
  type: DealType,
  commissionId: number,
  targetType: DealType,
  targetEntityId: number
): Promise<DealStatus> =>
  apiPost<DealStatus>("/api/deal-link/attach", {
    namespace,
    type,
    id: commissionId,
    targetType,
    targetEntityId,
  });

export const detachDeal = (
  namespace: LinkableNamespace,
  type: DealType,
  commissionId: number,
  targetType: DealType
): Promise<DealStatus> =>
  apiPost<DealStatus>("/api/deal-link/detach", {
    namespace,
    type,
    id: commissionId,
    targetType,
  });

// Load the selectable subjects of a given type in a section, for the counterparty
// picker. Archived subjects are excluded.
export const fetchSubjectOptions = async (
  namespace: LinkableNamespace,
  type: DealType
): Promise<DealSubjectOption[]> => {
  const rows = await apiGet<Array<Record<string, unknown>>>(entityApiBase(type, namespace));
  return (rows || [])
    .filter((row) => row.status !== "archived")
    .map(buildSubjectOption)
    .sort((a, b) => a.entityCode.localeCompare(b.entityCode));
};

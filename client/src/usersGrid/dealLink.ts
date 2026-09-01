import { apiGet, apiPost } from "../utils/api";
import { linkableNamespaceLabel, type LinkableNamespace } from "./sectionLink";
import { formatMultiValue, parseMultiValue, parseSpecializationMap } from "./multiValue";

// Deal linking connects the participants of a single commission — its clients,
// its partners and its tipaři. Picking a subject creates a fresh mirror
// commission under it, joined to the same deal.
//
// A deal takes ANY NUMBER of participants of EACH type: two clients splitting
// one job, three partners fulfilling it together. Each subject joins a deal
// once. Participants may sit in any section — a Growth Club client can be
// joined to a Veřejné partner — so every one carries the namespace it lives in.
// See server/deal-linking.js.

export type DealType = "client" | "partner" | "tiper";

export const DEAL_TYPES: DealType[] = ["client", "partner", "tiper"];

export const DEAL_NAMESPACES: LinkableNamespace[] = ["public", "growth", "projects"];

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  client: "Klient",
  partner: "Partner",
  tiper: "Tipař",
};

/** Accusative, for "Připojit ___" — the label alone reads as a heading. */
export const DEAL_TYPE_AS_LABELS: Record<DealType, string> = {
  client: "klienta",
  partner: "partnera",
  tiper: "tipaře",
};

export interface DealSlot {
  type: DealType;
  /** The section this side's commission lives in. */
  namespace: LinkableNamespace;
  namespaceLabel: string;
  commissionInternalId: number;
  commissionId: string;
  status: string;
  entityInternalId: number | null;
  entityCode: string | null;
  name: string | null;
}

export interface DealStatus {
  dealId: string | null;
  /**
   * The deal's participants, grouped by type. The commission the panel is open
   * on always leads its own type's list.
   */
  slots: Record<DealType, DealSlot[]>;
}

/**
 * Read a status payload into the list-per-type shape.
 *
 * A server that predates multi-party deals answers with one slot (or null) per
 * type instead of a list; normalising here means a client deployed ahead of its
 * backend still renders the single participant it gets rather than breaking.
 */
const normalizeDealStatus = (raw: unknown): DealStatus => {
  const status = (raw ?? {}) as { dealId?: string | null; slots?: Partial<Record<DealType, unknown>> };
  const slots = {} as Record<DealType, DealSlot[]>;

  for (const type of DEAL_TYPES) {
    const value = status.slots?.[type];
    slots[type] = Array.isArray(value)
      ? (value as DealSlot[])
      : value
        ? [value as DealSlot]
        : [];
  }

  return { dealId: status.dealId ?? null, slots };
};

// A selectable counterparty subject, enriched with the profile fields the
// picker needs for searching, filtering (Obor / Zaměření / Kraj / Status) and
// the hover info card. Multi-value columns are pre-parsed into value lists.
export interface DealSubjectOption {
  id: number;
  /** Internal ids repeat across sections, so lists key on `${namespace}:${id}`. */
  key: string;
  /** The section this subject lives in. */
  namespace: LinkableNamespace;
  namespaceLabel: string;
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

const buildSubjectOption = (
  row: Record<string, unknown>,
  namespace: LinkableNamespace
): DealSubjectOption => {
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
    key: `${namespace}:${row.id}`,
    namespace,
    namespaceLabel: linkableNamespaceLabel(namespace),
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

export const getDealStatus = async (
  namespace: LinkableNamespace,
  type: DealType,
  commissionId: number
): Promise<DealStatus> =>
  normalizeDealStatus(
    await apiGet<unknown>(`/api/deal-link/status?namespace=${namespace}&type=${type}&id=${commissionId}`)
  );

export const attachDeal = async (
  namespace: LinkableNamespace,
  type: DealType,
  commissionId: number,
  targetType: DealType,
  targetNamespace: LinkableNamespace,
  targetEntityId: number
): Promise<DealStatus> =>
  normalizeDealStatus(
    await apiPost<unknown>("/api/deal-link/attach", {
      namespace,
      type,
      id: commissionId,
      targetType,
      targetNamespace,
      targetEntityId,
    })
  );

/**
 * Drop one participant from the deal. A type can hold several of them, so the
 * one to remove is named by its own commission (id + section), not by type.
 */
export const detachDeal = async (
  namespace: LinkableNamespace,
  type: DealType,
  commissionId: number,
  targetType: DealType,
  targetCommissionId: number,
  targetNamespace: LinkableNamespace
): Promise<DealStatus> =>
  normalizeDealStatus(
    await apiPost<unknown>("/api/deal-link/detach", {
      namespace,
      type,
      id: commissionId,
      targetType,
      targetCommissionId,
      targetNamespace,
    })
  );

// Load the selectable subjects of a given type in one section, for the
// counterparty picker. Archived subjects are excluded.
export const fetchSubjectOptions = async (
  namespace: LinkableNamespace,
  type: DealType
): Promise<DealSubjectOption[]> => {
  const rows = await apiGet<Array<Record<string, unknown>>>(entityApiBase(type, namespace));
  return (rows || [])
    .filter((row) => row.status !== "archived")
    .map((row) => buildSubjectOption(row, namespace))
    .sort((a, b) => a.entityCode.localeCompare(b.entityCode));
};

// Every selectable subject of a type, across all three sections — a deal side
// may be picked from any of them. A section that fails to load contributes
// nothing rather than sinking the whole picker.
export const fetchSubjectOptionsAcrossSections = async (
  type: DealType
): Promise<DealSubjectOption[]> => {
  const perNamespace = await Promise.all(
    DEAL_NAMESPACES.map((namespace) =>
      fetchSubjectOptions(namespace, type).catch((error) => {
        console.error(`Error loading ${type} subjects from ${namespace}:`, error);
        return [] as DealSubjectOption[];
      })
    )
  );
  return perNamespace.flat().sort((a, b) => a.entityCode.localeCompare(b.entityCode));
};

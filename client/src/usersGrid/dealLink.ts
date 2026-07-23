import { apiGet, apiPost } from "../utils/api";
import type { LinkableNamespace } from "./sectionLink";

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

export interface DealSubjectOption {
  id: number;
  entityCode: string;
  label: string;
}

const entityApiBase = (type: DealType, namespace: LinkableNamespace): string => {
  const prefix = namespace === "public" ? "" : `/${namespace}`;
  return `/api${prefix}/${type}-entities`;
};

const subjectLabel = (row: Record<string, unknown>): string => {
  const company = String(row.company_name ?? row.company ?? "").trim();
  const fullName =
    [row.first_name, row.last_name]
      .filter((part) => part != null && String(part).trim() !== "")
      .map((part) => String(part).trim())
      .join(" ")
      .trim() || String(row.name ?? "").trim();
  const name = company || fullName;
  const code = String(row.entity_id ?? row.id ?? "");
  return name ? `${code} — ${name}` : code;
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
    .map((row) => ({
      id: Number(row.id),
      entityCode: String(row.entity_id ?? row.id ?? ""),
      label: subjectLabel(row),
    }))
    .sort((a, b) => a.entityCode.localeCompare(b.entityCode));
};

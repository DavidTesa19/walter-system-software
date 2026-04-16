export type ApprovalStatus = "accepted" | "pending" | "archived";

type ApprovalStatusMeta = {
  key: ApprovalStatus;
  label: string;
  color: string;
};

export const APPROVAL_STATUS_META: Record<ApprovalStatus, ApprovalStatusMeta> = {
  accepted: {
    key: "accepted",
    label: "Schváleno",
    color: "#84cc16",
  },
  pending: {
    key: "pending",
    label: "Ke schválení",
    color: "#f59e0b",
  },
  archived: {
    key: "archived",
    label: "Archiv",
    color: "#64748b",
  },
};

export const getApprovalStatusMeta = (value?: string | null): ApprovalStatusMeta | null => {
  const normalized = `${value ?? ""}`.trim().toLowerCase();

  if (normalized === "accepted" || normalized === "pending" || normalized === "archived") {
    return APPROVAL_STATUS_META[normalized];
  }

  return null;
};
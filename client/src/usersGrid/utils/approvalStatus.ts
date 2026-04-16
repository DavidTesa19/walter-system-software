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

const APPROVAL_STATUS_ORDER = new Map<ApprovalStatus, number>([
  ["accepted", 0],
  ["pending", 1],
  ["archived", 2],
]);

export const compareApprovalStatuses = (left?: string | null, right?: string | null): number => {
  const leftMeta = getApprovalStatusMeta(left);
  const rightMeta = getApprovalStatusMeta(right);

  if (!leftMeta && !rightMeta) {
    return `${left ?? ""}`.localeCompare(`${right ?? ""}`, "cs");
  }

  if (!leftMeta) {
    return 1;
  }

  if (!rightMeta) {
    return -1;
  }

  const leftRank = APPROVAL_STATUS_ORDER.get(leftMeta.key) ?? Number.MAX_SAFE_INTEGER;
  const rightRank = APPROVAL_STATUS_ORDER.get(rightMeta.key) ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return leftMeta.label.localeCompare(rightMeta.label, "cs");
};
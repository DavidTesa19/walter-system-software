export type WorkflowStatusOption = {
  value: string;
  label: string;
  dotColor: string;
};

export const WORKFLOW_STATUS_OPTIONS: readonly WorkflowStatusOption[] = [
  { value: "Uzavřeno", label: "Uzavřeno", dotColor: "#16a34a" },
  { value: "Podepsáno", label: "Podepsáno", dotColor: "#a3e635" },
  { value: "Před podpisem", label: "Před podpisem", dotColor: "#eab308" },
  { value: "Aktuální", label: "Aktuální", dotColor: "#22d3ee" },
  { value: "Probíhá", label: "Probíhá", dotColor: "#f59e0b" },
  { value: "Plánováno", label: "Plánováno", dotColor: "#3b82f6" },
  { value: "Odloženo", label: "Odloženo", dotColor: "#6b7280" },
  { value: "Zrušeno", label: "Zrušeno", dotColor: "#dc2626" },
] as const;

const WORKFLOW_STATUS_ALIASES: Record<string, string> = {
  "not started": "Plánováno",
  "in process": "Probíhá",
  "in progress": "Probíhá",
  done: "Uzavřeno",
  completed: "Uzavřeno",
  closed: "Uzavřeno",
  current: "Aktuální",
  active: "Aktuální",
  signed: "Podepsáno",
  approved: "Podepsáno",
  cancelled: "Zrušeno",
  canceled: "Zrušeno",
  postponed: "Odloženo",
};

export const DEFAULT_WORKFLOW_STATUS = "Plánováno";
export const WORKFLOW_STATUS_VALUES = WORKFLOW_STATUS_OPTIONS.map((option) => option.value);
const WORKFLOW_STATUS_ORDER = new Map(WORKFLOW_STATUS_VALUES.map((value, index) => [value, index]));

export const getNormalizedWorkflowStatus = (value?: string | null): string => {
  const trimmed = `${value ?? ""}`.trim();
  if (!trimmed) {
    return DEFAULT_WORKFLOW_STATUS;
  }

  const directMatch = WORKFLOW_STATUS_OPTIONS.find((option) => option.value === trimmed);
  if (directMatch) {
    return directMatch.value;
  }

  const alias = WORKFLOW_STATUS_ALIASES[trimmed.toLowerCase()];
  return alias ?? trimmed;
};

export const getWorkflowStatusOption = (value?: string | null): WorkflowStatusOption => {
  const normalized = getNormalizedWorkflowStatus(value);
  return WORKFLOW_STATUS_OPTIONS.find((option) => option.value === normalized) ?? {
    value: normalized,
    label: normalized,
    dotColor: "#64748b",
  };
};

export const compareWorkflowStatuses = (left?: string | null, right?: string | null): number => {
  const leftValue = getNormalizedWorkflowStatus(left);
  const rightValue = getNormalizedWorkflowStatus(right);
  const leftRank = WORKFLOW_STATUS_ORDER.get(leftValue) ?? Number.MAX_SAFE_INTEGER;
  const rightRank = WORKFLOW_STATUS_ORDER.get(rightValue) ?? Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return leftValue.localeCompare(rightValue, "cs");
};

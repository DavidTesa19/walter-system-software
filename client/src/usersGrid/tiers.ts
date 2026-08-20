// Úroveň (tier) — a subject-level grade shared by all three subject types
// (Partneři / Klienti / Tipaři) in every namespace. Stored as the bare label in
// the entity's `tier` column; empty/null means the subject has no tier yet.

export type TierOption = {
  value: string;
  label: string;
  dotColor: string;
};

// Listed lowest to highest — this is also the dropdown order.
export const TIER_OPTIONS: readonly TierOption[] = [
  { value: "Bronze", label: "Bronze", dotColor: "#cd7f32" },
  { value: "Silver", label: "Silver", dotColor: "#9fadbd" },
  { value: "Gold", label: "Gold", dotColor: "#f2b705" },
  { value: "VIP", label: "VIP", dotColor: "#a855f7" },
] as const;

export const TIER_VALUES = TIER_OPTIONS.map((option) => option.value);

export const TIER_COLOR_MAP: Record<string, string> = Object.fromEntries(
  TIER_OPTIONS.map((option) => [option.value, option.dotColor])
);

/** Shown for the "no tier" choice in the cell editor and the profile panel. */
export const TIER_EMPTY_LABEL = "Bez úrovně";

/** Cell-editor option list — the blank choice first so a tier can be cleared. */
export const TIER_EDITOR_VALUES = ["", ...TIER_VALUES];

export const TIER_EDITOR_LABEL_MAP: Record<string, string> = {
  "": TIER_EMPTY_LABEL,
  ...Object.fromEntries(TIER_OPTIONS.map((option) => [option.value, option.label])),
};

const TIER_ALIASES: Record<string, string> = {
  bronz: "Bronze",
  bronzová: "Bronze",
  stříbro: "Silver",
  stribro: "Silver",
  stříbrná: "Silver",
  zlato: "Gold",
  zlatá: "Gold",
  vip: "VIP",
};

const TIER_ORDER = new Map(TIER_VALUES.map((value, index) => [value, index]));

/**
 * Map a stored value onto a known tier. Unknown, non-empty values are kept as
 * they are so nothing a record already holds is silently dropped.
 */
export const getNormalizedTier = (value?: string | null): string => {
  const trimmed = `${value ?? ""}`.trim();
  if (!trimmed) return "";

  const direct = TIER_OPTIONS.find((option) => option.value.toLowerCase() === trimmed.toLowerCase());
  if (direct) return direct.value;

  return TIER_ALIASES[trimmed.toLowerCase()] ?? trimmed;
};

export const getTierOption = (value?: string | null): TierOption | null => {
  const normalized = getNormalizedTier(value);
  if (!normalized) return null;

  return TIER_OPTIONS.find((option) => option.value === normalized) ?? {
    value: normalized,
    label: normalized,
    dotColor: "#64748b",
  };
};

/** Bronze → Silver → Gold → VIP, with untiered subjects last. */
export const compareTiers = (left?: string | null, right?: string | null): number => {
  const leftValue = getNormalizedTier(left);
  const rightValue = getNormalizedTier(right);
  const leftRank = leftValue ? (TIER_ORDER.get(leftValue) ?? TIER_VALUES.length) : Number.MAX_SAFE_INTEGER;
  const rightRank = rightValue ? (TIER_ORDER.get(rightValue) ?? TIER_VALUES.length) : Number.MAX_SAFE_INTEGER;

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return leftValue.localeCompare(rightValue, "cs");
};

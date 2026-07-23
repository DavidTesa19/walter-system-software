// Multi-value subject fields (Obor, Společnost, Kraj, Lokalita).
//
// These fields live in a single text column on the entity row. To stay fully
// backward compatible we keep the storage format minimal:
//   • empty              -> null / "" in the column
//   • exactly one value  -> the plain string, exactly as before
//   • two or more values -> a JSON array string, e.g. '["Praha","Zahraničí"]'
//
// This module is the single source of truth for reading and writing that
// representation. Every place that displays, filters, edits or persists one of
// these fields goes through the helpers here so the behaviour stays consistent.

/**
 * Read the stored representation into a clean list of values.
 * Accepts a JSON-array string, a plain string, an already-parsed array, or
 * null/undefined. Values are trimmed and blanks dropped.
 */
export const parseMultiValue = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter(Boolean);
  }

  if (typeof raw !== "string") {
    return [];
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  // Only attempt JSON parsing when it actually looks like a JSON array, so an
  // ordinary free-text value never gets misinterpreted.
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value).trim()).filter(Boolean);
      }
    } catch {
      // Not valid JSON — fall through and treat the whole string as one value.
    }
  }

  return [trimmed];
};

/**
 * Turn an edited list of values back into the storage representation.
 * Trims, drops blanks and de-duplicates (order preserved). Returns null when
 * empty, the bare string for a single value, or a JSON array string otherwise.
 */
export const serializeMultiValue = (values: string[]): string | null => {
  const unique: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }

  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  return JSON.stringify(unique);
};

/** Human-readable, comma-separated rendering for grid cells and displays. */
export const formatMultiValue = (raw: unknown, separator = ", "): string =>
  parseMultiValue(raw).join(separator);

/**
 * "Match any" filtering: does the stored value contain the given target?
 * The empty-string target matches a subject with no values at all (the
 * "(Žádný)" checkbox in the column filter).
 */
export const multiValueMatches = (raw: unknown, target: string): boolean => {
  const values = parseMultiValue(raw);
  if (target === "") {
    return values.length === 0;
  }
  return values.includes(target);
};

/**
 * "Match any" against a whole selected filter set. A subject passes when any of
 * its values is selected, or (when it has none) when the blank option is
 * selected.
 */
export const passesMultiValueFilter = (raw: unknown, filterSet: Set<string>): boolean => {
  const values = parseMultiValue(raw);
  if (values.length === 0) {
    return filterSet.has("");
  }
  return values.some((value) => filterSet.has(value));
};

// ---------------------------------------------------------------------------
// Specialization ("Zaměření") — a single specialization chosen per Obor value.
//
// Stored in its own text column (`field_specialization`) as a JSON object that
// maps each obor value to its chosen specialization, e.g.
//   '{"Lobbying":"Energetika","IT":"Kyberbezpečnost"}'
// Empty maps are stored as null. Keys line up with the entity's obor values;
// orphaned keys (obor no longer selected) are ignored on display.
// ---------------------------------------------------------------------------

export type SpecializationMap = Record<string, string>;

/** Read the stored representation into a clean obor -> specialization map. */
export const parseSpecializationMap = (raw: unknown): SpecializationMap => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: SpecializationMap = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const k = String(key).trim();
      const v = String(value ?? "").trim();
      if (k && v) out[k] = v;
    }
    return out;
  }

  if (typeof raw !== "string") {
    return {};
  }

  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith("{")) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parseSpecializationMap(parsed);
    }
  } catch {
    // Not valid JSON — treat as empty.
  }
  return {};
};

/** Turn an obor -> specialization map back into the storage representation. */
export const serializeSpecializationMap = (map: SpecializationMap): string | null => {
  const clean: SpecializationMap = {};
  for (const [key, value] of Object.entries(map || {})) {
    const k = String(key).trim();
    const v = String(value ?? "").trim();
    if (k && v) clean[k] = v;
  }
  return Object.keys(clean).length === 0 ? null : JSON.stringify(clean);
};

/**
 * Human-readable specialization rendering for grid cells: the specialization
 * values whose obor is still selected, ordered by the obor list. When the obor
 * list is unknown, every stored specialization is shown.
 */
export const formatSpecialization = (specRaw: unknown, oborRaw: unknown, separator = ", "): string => {
  const map = parseSpecializationMap(specRaw);
  const obors = parseMultiValue(oborRaw);
  const values = obors.length > 0
    ? obors.map((obor) => map[obor]).filter(Boolean)
    : Object.values(map);
  const seen: string[] = [];
  for (const value of values) {
    if (!seen.includes(value)) seen.push(value);
  }
  return seen.join(separator);
};

/**
 * ag-grid valueGetter for the specialization column. Reads the chosen
 * specialization map off the joined entity and the obor list off the row.
 */
export const makeSpecializationValueGetter =
  (specSource: (data: any) => unknown, oborKey: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (params: any): string =>
    formatSpecialization(specSource(params?.data), params?.data?.[oborKey]);

// ---------------------------------------------------------------------------
// ag-grid column helpers — shared so every section renders/sorts/filters the
// multi-value columns identically.
// ---------------------------------------------------------------------------

// The helpers below feed ag-grid column callbacks. ag-grid's param types are
// generic over the row type (which has no index signature), so `any` is the
// pragmatic fit here — matching how the sections already type these callbacks.

/** valueFormatter: show the joined values instead of the raw JSON. */
export const multiValueFormatter = (params: { value: unknown }): string =>
  formatMultiValue(params.value);

/** Sort by the joined human text rather than the raw storage string. */
export const multiValueComparator = (left: unknown, right: unknown): number =>
  formatMultiValue(left).localeCompare(formatMultiValue(right), "cs");

/** filterValueGetter for a column so the built-in filter/search sees the joined text. */
export const makeMultiValueFilterGetter =
  (key: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (params: any): string =>
    formatMultiValue(params?.data?.[key]);

/**
 * editable predicate for inline grid editing: only allow it while a cell holds
 * at most one value. Multi-valued cells are edited in the profile panel (which
 * has the add/remove UI), so inline editing can never silently drop the extras.
 */
export const makeSingleValueEditable =
  (key: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (params: any): boolean =>
    parseMultiValue(params?.data?.[key]).length <= 1;

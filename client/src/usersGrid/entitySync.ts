// Keeping the grid in step with the subject (entity) record.
//
// Every grid row carries the joined subject under `row.entity` plus a set of
// flat mirror properties (`name`, `company`, `field`, …) that ag-grid columns
// bind to. The mirrors are rebuilt on each fetch, so an edit made in the
// profile panel — or in another cell — would otherwise only reach the table
// after the refetch lands, which is what made the table and the profile
// disagree. These helpers apply the edit to both halves immediately; the
// refetch still reconciles with whatever the server actually stored.

import { fromAssignmentDraftValue } from "./assignmentUtils";

/** Subject columns an edit may touch, in the grid's own key naming. */
export const ENTITY_PATCH_KEYS = [
  "name",
  "company",
  "field",
  "field_specialization",
  "tier",
  "service",
  "budget",
  "region",
  "location",
  "location_geo",
  "mobile",
  "email",
  "website",
  "info",
  "status",
  "assigned_to",
  "assigned_user_ids",
] as const;

/** Subject values the grid rows also mirror as a flat row property. */
const MIRRORED_KEYS = ["name", "company", "field", "tier", "region", "location", "mobile", "email"] as const;

/**
 * Narrow an update payload down to the subject fields, normalising the values
 * to the shape the entity record stores them in.
 */
export const buildEntityPatch = (updates: Record<string, unknown>): Record<string, unknown> => {
  const patch: Record<string, unknown> = {};

  for (const key of ENTITY_PATCH_KEYS) {
    if (!(key in updates)) continue;
    patch[key] = key === "assigned_user_ids"
      ? fromAssignmentDraftValue(updates[key])
      : (updates[key] as string | null) ?? null;
  }

  return patch;
};

/**
 * The flat row properties to overwrite alongside `row.entity`.
 *
 * `mirrorAssignment` is only true for the subject grids, where the Přiřazení
 * column shows the subject's own assignment; the zakázky grids show the
 * commission's, which an entity edit must not overwrite.
 */
export const buildRowMirror = (
  patch: Record<string, unknown>,
  options: { mirrorAssignment: boolean }
): Record<string, unknown> => {
  const mirror: Record<string, unknown> = {};

  for (const key of MIRRORED_KEYS) {
    if (key in patch) mirror[key] = (patch[key] as string | null) ?? "";
  }

  if (options.mirrorAssignment) {
    if ("assigned_user_ids" in patch) mirror.assigned_user_ids = patch.assigned_user_ids;
    if ("assigned_to" in patch) mirror.assigned_to = patch.assigned_to;
  }

  return mirror;
};

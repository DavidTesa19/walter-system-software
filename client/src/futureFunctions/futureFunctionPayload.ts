import type { FutureFunction } from "./futureFunction.interface";

// Rows handed to the grid carry these display-only fields for the activity dots
// (see withActivity in FutureFunctionsGrid). They must never round-trip into a
// create/update payload — the future_functions table has no matching columns, so
// sending them turns the write into an UPDATE against columns that do not exist
// and the whole save fails.
//
// The grid and the detail panel both hand the same row objects back to the API,
// so the rule lives here rather than in either of them.
export const ACTIVITY_DISPLAY_KEYS = [
  "activity_scope",
  "activity_item_id",
  "activity_latest_at",
  "activity_created_at",
  "activity_updated_by_user_id",
  "activity_created_by_user_id",
  "activity_field_activity",
] as const satisfies readonly (keyof FutureFunction)[];

export const stripActivityFields = (row: FutureFunction): FutureFunction => {
  const clean = { ...row };
  for (const key of ACTIVITY_DISPLAY_KEYS) {
    delete clean[key];
  }
  return clean;
};

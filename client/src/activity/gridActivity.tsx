import type { ColDef } from "ag-grid-community";
import ActivityCellRenderer from "./ActivityCellRenderer";
import type { FieldActivityMap } from "./activityUtils";

export const ACTIVITY_COLUMN_ID = "activity";

// Row data fields the activity system reads off each grid row.
export type ActivityRowFields = {
  activity_scope?: string | null;
  activity_item_id?: string | number | null;
  activity_latest_at?: string | null;
  activity_created_at?: string | null;
  activity_updated_by_user_id?: number | null;
  activity_created_by_user_id?: number | null;
  activity_field_activity?: FieldActivityMap | null;
};

// Pinned-left column holding the per-row change dot (green = new, amber = edited).
// Clicking the dot confirms the row as seen.
export const buildActivityColumn = <T,>(): ColDef<T> => ({
  headerName: "",
  colId: ACTIVITY_COLUMN_ID,
  pinned: "left",
  width: 34,
  minWidth: 34,
  maxWidth: 34,
  suppressMovable: true,
  lockPosition: true,
  sortable: false,
  filter: false,
  resizable: false,
  editable: false,
  menuTabs: [],
  cellClass: "activity-cell",
  headerClass: "activity-cell",
  cellRenderer: ActivityCellRenderer,
});

/*
 * `makeActivityCellClassRules` used to live here, marking individual changed
 * cells so a per-cell dot could be drawn on them. Both the dot and these rules
 * have been removed — change state is shown by the row dot in the pinned
 * activity column above. The rules also cost a resolver call for every cell on
 * every render, which was pure overhead once the dot was gone.
 */

/**
 * Rename the keys of a server field-activity map (which uses DB column names) into
 * the grid's field names, so per-cell dots can be looked up by column field.
 */
export const remapFieldActivity = (
  map: FieldActivityMap | null | undefined,
  keyMap: Record<string, string>,
): FieldActivityMap => {
  if (!map || typeof map !== "object") {
    return {};
  }
  const result: FieldActivityMap = {};
  for (const [key, value] of Object.entries(map)) {
    result[keyMap[key] ?? key] = value;
  }
  return result;
};

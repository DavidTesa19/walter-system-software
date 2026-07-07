import type { CellClassParams, ColDef } from "ag-grid-community";
import ActivityCellRenderer from "./ActivityCellRenderer";
import type { FieldActivityMap, FieldActivityState } from "./activityUtils";

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

/**
 * Build cellClassRules (for defaultColDef) that light up individual cells whose
 * field changed since the viewer last confirmed the row. Reads the field-activity
 * map carried on the row and defers the seen/actor decision to the activity context.
 */
export const makeActivityCellClassRules = (
  getFieldActivity: (
    scope: string,
    itemId: string | number,
    entry: FieldActivityMap[string] | null | undefined,
  ) => FieldActivityState,
): NonNullable<ColDef["cellClassRules"]> => {
  const resolve = (params: CellClassParams): FieldActivityState => {
    const field = params.colDef?.field;
    const data = params.data as ActivityRowFields | undefined;
    if (!field || !data?.activity_scope || data.activity_item_id === null || data.activity_item_id === undefined) {
      return "none";
    }
    const entry = data.activity_field_activity ? data.activity_field_activity[field] : undefined;
    return getFieldActivity(data.activity_scope, data.activity_item_id, entry);
  };

  return {
    "cell-activity--added": (params) => resolve(params) === "added",
    "cell-activity--updated": (params) => resolve(params) === "updated",
    "cell-activity--removed": (params) => resolve(params) === "removed",
  };
};

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

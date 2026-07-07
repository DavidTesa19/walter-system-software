import type { ICellRendererParams } from "ag-grid-community";
import { useActivity } from "./ActivityContext";
import ActivityIndicator from "./ActivityIndicator";

type ActivityRowData = {
  activity_scope?: string | null;
  activity_item_id?: string | number | null;
  activity_latest_at?: string | null;
  activity_created_at?: string | null;
  activity_updated_by_user_id?: number | null;
  activity_created_by_user_id?: number | null;
};

const ActivityCellRenderer = <T extends ActivityRowData>({ data, api, node }: ICellRendererParams<T>) => {
  const { getItemActivity, markItemSeen } = useActivity();

  const scope = data?.activity_scope;
  const itemId = data?.activity_item_id;
  if (!scope || itemId === null || itemId === undefined) {
    return null;
  }

  const state = getItemActivity(
    scope,
    itemId,
    data?.activity_latest_at ?? null,
    data?.activity_created_at ?? null,
    data?.activity_updated_by_user_id ?? null,
    data?.activity_created_by_user_id ?? null,
  );

  if (state === "none") {
    return null;
  }

  const title = state === "new" ? "Nový záznam – klikněte pro potvrzení" : "Nedávno změněno – klikněte pro potvrzení";

  const handleClick = () => {
    markItemSeen(scope, itemId, data?.activity_latest_at ?? null);
    // Refresh this row so the per-cell dots clear immediately alongside the row dot.
    if (node) {
      api.refreshCells({ force: true, rowNodes: [node] });
    }
  };

  return (
    <button type="button" className="activity-dot-button" onClick={handleClick} title={title} aria-label={title}>
      <ActivityIndicator state={state} title={title} />
    </button>
  );
};

export default ActivityCellRenderer;

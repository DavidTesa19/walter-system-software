import type { ICellRendererParams } from "ag-grid-community";
import { useActivity } from "./ActivityContext";
import ActivityIndicator from "./ActivityIndicator";

type ActivityRowData = {
  activity_scope?: string | null;
  activity_item_id?: string | number | null;
  activity_latest_at?: string | null;
  activity_created_at?: string | null;
};

const ActivityCellRenderer = <T extends ActivityRowData>({ data }: ICellRendererParams<T>) => {
  const { getItemActivity } = useActivity();

  const scope = data?.activity_scope;
  const itemId = data?.activity_item_id;
  if (!scope || itemId === null || itemId === undefined) {
    return null;
  }

  const state = getItemActivity(scope, itemId, data?.activity_latest_at ?? null, data?.activity_created_at ?? null);
  const title = state === "new" ? "Nový záznam" : state === "updated" ? "Nedávno změněno" : undefined;

  return <ActivityIndicator state={state} title={title} />;
};

export default ActivityCellRenderer;
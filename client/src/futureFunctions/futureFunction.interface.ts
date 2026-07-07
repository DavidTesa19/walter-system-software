import type { FieldActivityMap } from "../activity/activityUtils";

export interface FutureFunction {
  id: number;
  name: string;
  priority: string;
  complexity: string;
  phase: string;
  info: string;
  status: string;
  archived: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  completedAt?: string | null;
  // Change-tracking (populated by the server)
  created_by_user_id?: number | null;
  updated_by_user_id?: number | null;
  field_activity?: FieldActivityMap | null;
  // Per-row activity display fields (attached client-side)
  activity_scope?: string | null;
  activity_item_id?: string | number | null;
  activity_latest_at?: string | null;
  activity_created_at?: string | null;
  activity_updated_by_user_id?: number | null;
  activity_created_by_user_id?: number | null;
  activity_field_activity?: FieldActivityMap | null;
}

export interface FutureFunctionDraft {
  name: string;
  priority: string;
  complexity: string;
  phase: string;
  info: string;
  status: string;
  archived: boolean;
}

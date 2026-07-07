export type ActivityState = "none" | "new" | "updated";

const toUserId = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toMs = (value?: string | null): number => {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getLatestActivityTimestamp = (...values: Array<string | null | undefined>): string | null => {
  let latestValue: string | null = null;
  let latestMs = 0;

  for (const value of values) {
    const currentMs = toMs(value);
    if (currentMs > latestMs) {
      latestMs = currentMs;
      latestValue = value ?? null;
    }
  }

  return latestValue;
};

export const getActivityTimestampsFromRecord = (record: Record<string, unknown> | null | undefined) => {
  if (!record) {
    return { createdAt: null, latestAt: null };
  }

  const createdAt = getLatestActivityTimestamp(
    typeof record.created_at === "string" ? record.created_at : null,
    typeof record.createdAt === "string" ? record.createdAt : null
  );

  const latestAt = getLatestActivityTimestamp(
    typeof record.updated_at === "string" ? record.updated_at : null,
    typeof record.updatedAt === "string" ? record.updatedAt : null,
    typeof record.last_activity === "string" ? record.last_activity : null,
    typeof record.lastActivity === "string" ? record.lastActivity : null,
    createdAt
  );

  return { createdAt, latestAt };
};

export const getActivityActorUserIdsFromRecord = (record: Record<string, unknown> | null | undefined) => {
  if (!record) {
    return { createdByUserId: null, updatedByUserId: null };
  }

  return {
    createdByUserId: toUserId(record.created_by_user_id ?? record.createdByUserId),
    updatedByUserId: toUserId(record.updated_by_user_id ?? record.updatedByUserId),
  };
};

export const getRecordActivityState = (
  record: Record<string, unknown>,
  seenAt?: string | null,
  currentUserId?: number | null,
): ActivityState => {
  const { createdAt, latestAt } = getActivityTimestampsFromRecord(record);
  const { createdByUserId, updatedByUserId } = getActivityActorUserIdsFromRecord(record);
  const latestActorUserId = updatedByUserId ?? createdByUserId;

  if (currentUserId && latestActorUserId === currentUserId) {
    return "none";
  }

  return getActivityState({ createdAt, latestAt, seenAt });
};

export const getActivityState = ({
  createdAt,
  latestAt,
  seenAt,
}: {
  createdAt?: string | null;
  latestAt?: string | null;
  seenAt?: string | null;
}): ActivityState => {
  const latestMs = toMs(latestAt);
  if (latestMs === 0) {
    return "none";
  }

  const seenMs = toMs(seenAt);
  if (latestMs <= seenMs) {
    return "none";
  }

  const createdMs = toMs(createdAt);
  if (createdMs > seenMs) {
    return "new";
  }

  return "updated";
};

export const countUnseenRecords = (
  records: Array<Record<string, unknown>>,
  seenAt?: string | null,
  currentUserId?: number | null,
): number => {
  return records.reduce((count, record) => {
    return getRecordActivityState(record, seenAt, currentUserId) === "none" ? count : count + 1;
  }, 0);
};

// ===========================================================================
// PER-FIELD (CELL) ACTIVITY
// ===========================================================================

export type FieldActivityType = "added" | "updated" | "removed";
export type FieldActivityState = "none" | FieldActivityType;

export type FieldActivityEntry = {
  at?: string | null;
  by?: number | string | null;
  type?: FieldActivityType | null;
};

export type FieldActivityMap = Record<string, FieldActivityEntry>;

const toActorId = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Resolve the visible state of a single field change. A change is only surfaced
 * when it happened after the viewer last marked the record seen AND it was made
 * by someone other than the viewer (so your own edits never light up for you).
 */
export const getFieldActivityState = (
  entry: FieldActivityEntry | null | undefined,
  seenAt?: string | null,
  currentUserId?: number | null,
): FieldActivityState => {
  if (!entry || !entry.type) {
    return "none";
  }

  const changedMs = toMs(entry.at);
  if (changedMs === 0 || changedMs <= toMs(seenAt)) {
    return "none";
  }

  if (currentUserId && toActorId(entry.by) === currentUserId) {
    return "none";
  }

  return entry.type;
};

export const parseFieldActivityMap = (value: unknown): FieldActivityMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as FieldActivityMap;
};

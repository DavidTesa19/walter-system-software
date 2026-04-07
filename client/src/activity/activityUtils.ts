export type ActivityState = "none" | "new" | "updated";

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

export const countUnseenRecords = (records: Array<Record<string, unknown>>, seenAt?: string | null): number => {
  return records.reduce((count, record) => {
    const { createdAt, latestAt } = getActivityTimestampsFromRecord(record);
    return getActivityState({ createdAt, latestAt, seenAt }) === "none" ? count : count + 1;
  }, 0);
};

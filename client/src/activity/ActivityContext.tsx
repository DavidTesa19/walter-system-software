import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { canAccessGrowthSystem, canAccessProjectsSystem, canAccessStandardSystem, type UserAccessScope } from "../auth/AuthContext";
import type { AppView, GridView } from "../types/appView";
import { apiGet } from "../utils/api";
import {
  ADMIN_USERS_COLLECTION_KEY,
  ADMIN_USERS_RECORD_SCOPE,
  TEAMCHAT_COLLECTION_KEY,
  buildCommissionsCollectionKey,
  buildCommissionsRecordScope,
  buildSubjectsCollectionKey,
  buildSubjectsRecordScope,
  type ActivitySystem,
  type ActivityTable,
  FUTURE_FUNCTIONS_ACTIVE_COLLECTION_KEY,
  FUTURE_FUNCTIONS_ARCHIVE_COLLECTION_KEY,
  FUTURE_FUNCTIONS_RECORD_SCOPE,
} from "./activityKeys";
import {
  getActivityState,
  getActivityTimestampsFromRecord,
  getFieldActivityState,
  getRecordActivityState,
  type ActivityState,
  type FieldActivityEntry,
  type FieldActivityState,
} from "./activityUtils";

type StoredActivityState = {
  baselineAt: string;
  views: Record<string, string>;
  collections: Record<string, string>;
  items: Record<string, string>;
};

type ActivitySnapshot = {
  viewCounts: Partial<Record<AppView, number>>;
  collectionCounts: Record<string, number>;
};

// A batch of rows fetched from one endpoint, tagged with the item scope used to look
// up per-record seen state and the collection/view bucket(s) it contributes counts to.
// Bubble counts are recomputed from these on every render (see `snapshot` below), so a
// row/cell confirmation is reflected instantly without waiting for the next poll.
type RawActivityEntry = {
  scope: string;
  collectionKey?: string;
  view?: AppView;
  rows: Array<Record<string, unknown>>;
};

export type MarkItemSeenEntry = { scope: string; itemId: string | number; seenAt?: string | null };

interface ActivityContextValue {
  currentUserId?: number;
  getViewCount: (view: AppView) => number;
  getCollectionCount: (collectionKey: string) => number;
  getItemActivity: (
    scope: string,
    itemId: string | number,
    latestAt?: string | null,
    createdAt?: string | null,
    updatedByUserId?: number | null,
    createdByUserId?: number | null,
  ) => ActivityState;
  getFieldActivity: (scope: string, itemId: string | number, entry: FieldActivityEntry | null | undefined) => FieldActivityState;
  markViewSeen: (view: AppView) => void;
  markCollectionSeen: (collectionKey: string) => void;
  markItemSeen: (scope: string, itemId: string | number, seenAt?: string | null) => void;
  markItemsSeen: (entries: MarkItemSeenEntry[]) => void;
  refresh: () => Promise<void>;
}

const ActivityContext = createContext<ActivityContextValue | undefined>(undefined);

const STORAGE_VERSION = 1;
const STANDARD_TABLES: ActivityTable[] = ["clients", "partners", "tipers"];
const VIEW_STATUS: Record<GridView, string> = {
  active: "accepted",
  pending: "pending",
  archived: "archived",
};

const DEFAULT_STATE = (): StoredActivityState => ({
  baselineAt: new Date().toISOString(),
  views: {},
  collections: {},
  items: {},
});

const getStorageKey = (userId: number) => `walterActivityState:v${STORAGE_VERSION}:${userId}`;
const getItemKey = (scope: string, itemId: string | number) => `${scope}:${String(itemId)}`;

const readStoredState = (userId?: number): StoredActivityState => {
  if (!userId) {
    return DEFAULT_STATE();
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return DEFAULT_STATE();
    }

    const parsed = JSON.parse(raw) as Partial<StoredActivityState>;
    return {
      baselineAt: typeof parsed.baselineAt === "string" ? parsed.baselineAt : new Date().toISOString(),
      views: parsed.views && typeof parsed.views === "object" ? parsed.views : {},
      collections: parsed.collections && typeof parsed.collections === "object" ? parsed.collections : {},
      items: parsed.items && typeof parsed.items === "object" ? parsed.items : {},
    };
  } catch {
    return DEFAULT_STATE();
  }
};

const persistState = (userId: number | undefined, state: StoredActivityState) => {
  if (!userId) {
    return;
  }

  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(state));
  } catch {
    // Ignore storage errors.
  }
};

const queueTableCollections = (
  tasks: Array<Promise<void>>,
  entries: RawActivityEntry[],
  view: AppView,
  gridView: GridView,
  system: ActivitySystem,
  kind: "subjects" | "commissions",
  table: ActivityTable,
  endpoint: string,
) => {
  const collectionKey = kind === "subjects"
    ? buildSubjectsCollectionKey(system, gridView, table)
    : buildCommissionsCollectionKey(system, gridView, table);
  // Item scope intentionally excludes gridView: an entity/commission keeps its seen
  // state as it moves between active/pending/archived.
  const scope = kind === "subjects"
    ? buildSubjectsRecordScope(system, table)
    : buildCommissionsRecordScope(system, table);

  tasks.push(
    apiGet<Record<string, unknown>[]>(endpoint)
      .then((payload) => {
        entries.push({ scope, collectionKey, view, rows: Array.isArray(payload) ? payload : [] });
      })
      .catch(() => {
        entries.push({ scope, collectionKey, view, rows: [] });
      })
  );
};

// Per-record unseen count for one scope, using each record's own seen timestamp
// (rather than one cutoff for the whole batch) so individual row/cell confirmations
// are respected.
const countUnseenByScope = (
  rows: Array<Record<string, unknown>>,
  scope: string,
  items: Record<string, string>,
  baselineAt: string,
  currentUserId?: number | null,
): number => rows.reduce((count, row) => {
  const id = row.id;
  if (typeof id !== "number" && typeof id !== "string") {
    return count;
  }
  const seenAt = items[getItemKey(scope, id)] ?? baselineAt;
  return getRecordActivityState(row, seenAt, currentUserId) === "none" ? count : count + 1;
}, 0);

const isSameMoment = (left?: string | null, right?: string | null): boolean => {
  if (!left || !right) {
    return false;
  }

  return new Date(left).getTime() === new Date(right).getTime();
};

const countChangedRooms = (
  rooms: Array<Record<string, unknown>>,
  seenAt?: string | null,
  currentUsername?: string | null,
): number => {
  return rooms.reduce((count, room) => {
    const unreadCount = typeof room.unreadCount === "number" ? room.unreadCount : Number(room.unreadCount ?? 0);
    if (Number.isFinite(unreadCount) && unreadCount > 0) {
      return count + 1;
    }

    const { createdAt, latestAt } = getActivityTimestampsFromRecord(room);
    const createdBy = typeof room.created_by === "string"
      ? room.created_by
      : typeof room.createdBy === "string"
        ? room.createdBy
        : null;

    if (currentUsername && createdBy === currentUsername) {
      return count;
    }

    if (!isSameMoment(createdAt, latestAt)) {
      return count;
    }

    return getActivityState({ createdAt, latestAt, seenAt }) === "none" ? count : count + 1;
  }, 0);
};

interface ActivityProviderProps {
  userId?: number;
  username?: string;
  accessScope?: UserAccessScope;
  isAdmin: boolean;
  activeView: AppView;
  children: React.ReactNode;
}

export const ActivityProvider: React.FC<ActivityProviderProps> = ({ userId, username, accessScope, isAdmin, activeView, children }) => {
  const [activityState, setActivityState] = useState<StoredActivityState>(() => readStoredState(userId));
  const [rawEntries, setRawEntries] = useState<RawActivityEntry[]>([]);
  const [teamchatCounts, setTeamchatCounts] = useState<ActivitySnapshot>({ viewCounts: {}, collectionCounts: {} });

  useEffect(() => {
    setActivityState(readStoredState(userId));
  }, [userId]);

  useEffect(() => {
    persistState(userId, activityState);
  }, [activityState, userId]);

  const markViewSeen = useCallback((view: AppView) => {
    const now = new Date().toISOString();
    setActivityState((current) => ({
      ...current,
      views: {
        ...current.views,
        [view]: now,
      },
    }));
  }, []);

  const markCollectionSeen = useCallback((collectionKey: string) => {
    const now = new Date().toISOString();
    setActivityState((current) => ({
      ...current,
      collections: {
        ...current.collections,
        [collectionKey]: now,
      },
    }));
  }, []);

  const markItemSeen = useCallback((scope: string, itemId: string | number, seenAt?: string | null) => {
    const key = getItemKey(scope, itemId);
    const nextSeenAt = seenAt ?? new Date().toISOString();
    setActivityState((current) => ({
      ...current,
      items: {
        ...current.items,
        [key]: nextSeenAt,
      },
    }));
  }, []);

  const markItemsSeen = useCallback((entries: MarkItemSeenEntry[]) => {
    if (!entries.length) {
      return;
    }
    const now = new Date().toISOString();
    setActivityState((current) => {
      const items = { ...current.items };
      for (const entry of entries) {
        items[getItemKey(entry.scope, entry.itemId)] = entry.seenAt ?? now;
      }
      return { ...current, items };
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    markViewSeen(activeView);
  }, [activeView, markViewSeen, userId]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setRawEntries([]);
      setTeamchatCounts({ viewCounts: {}, collectionCounts: {} });
      return;
    }

    const entries: RawActivityEntry[] = [];
    const tasks: Array<Promise<void>> = [];

    const queueDomain = (system: ActivitySystem, namespacePrefix: string | null) => {
      const prefix = namespacePrefix ? `/api/${namespacePrefix}` : "/api";
      ([
        ["entities_active", "active", "subjects"],
        ["entities_pending", "pending", "subjects"],
        ["entities_archived", "archived", "subjects"],
      ] as const).forEach(([view, gridView]) => {
        STANDARD_TABLES.forEach((table) => {
          queueTableCollections(
            tasks,
            entries,
            (namespacePrefix ? (`${namespacePrefix}_${view.replace("entities_", "subjects_")}` as AppView) : (view as AppView)),
            gridView as GridView,
            system,
            "subjects",
            table,
            `${prefix}/${table.slice(0, -1)}-entities?status=${VIEW_STATUS[gridView as GridView]}`
          );
        });
      });

      ([
        [namespacePrefix ? `${namespacePrefix}_active` : "active", "active"],
        [namespacePrefix ? `${namespacePrefix}_pending` : "pending", "pending"],
        [namespacePrefix ? `${namespacePrefix}_archived` : "archived", "archived"],
      ] as const).forEach(([view, gridView]) => {
        STANDARD_TABLES.forEach((table) => {
          const endpointBase = namespacePrefix ? `${prefix}/${table.slice(0, -1)}-commissions` : `/${table}`;
          queueTableCollections(
            tasks,
            entries,
            view as AppView,
            gridView as GridView,
            system,
            "commissions",
            table,
            `${endpointBase}?status=${VIEW_STATUS[gridView as GridView]}`
          );
        });
      });
    };

    if (canAccessStandardSystem(accessScope)) {
      queueDomain("standard", null);
    }

    if (canAccessProjectsSystem(accessScope)) {
      queueDomain("projects", "projects");
    }

    if (canAccessGrowthSystem(accessScope)) {
      queueDomain("growth", "growth");
    }

    tasks.push(
      apiGet<Record<string, unknown>[]>("/future-functions")
        .then((payload) => {
          const rows = Array.isArray(payload) ? payload : [];
          const activeRows = rows.filter((row) => row.archived !== true);
          const archivedRows = rows.filter((row) => row.archived === true);
          entries.push({ scope: FUTURE_FUNCTIONS_RECORD_SCOPE, collectionKey: FUTURE_FUNCTIONS_ACTIVE_COLLECTION_KEY, rows: activeRows });
          entries.push({ scope: FUTURE_FUNCTIONS_RECORD_SCOPE, collectionKey: FUTURE_FUNCTIONS_ARCHIVE_COLLECTION_KEY, rows: archivedRows });
          entries.push({ scope: FUTURE_FUNCTIONS_RECORD_SCOPE, view: "future", rows });
        })
        .catch(() => {})
    );

    const nextTeamchatCounts: ActivitySnapshot = { viewCounts: {}, collectionCounts: {} };
    tasks.push(
      apiGet<Record<string, unknown>[]>(`/api/chat-rooms?includeUnread=true&userId=${userId}`)
        .then((payload) => {
          const rooms = Array.isArray(payload) ? payload : [];
          const collectionSeenAt = activityState.collections[TEAMCHAT_COLLECTION_KEY] ?? activityState.baselineAt;
          const viewSeenAt = activityState.views.teamchat ?? activityState.baselineAt;
          nextTeamchatCounts.collectionCounts[TEAMCHAT_COLLECTION_KEY] = countChangedRooms(rooms, collectionSeenAt, username);
          nextTeamchatCounts.viewCounts.teamchat = countChangedRooms(rooms, viewSeenAt, username);
        })
        .catch(() => {
          nextTeamchatCounts.collectionCounts[TEAMCHAT_COLLECTION_KEY] = 0;
        })
    );

    if (isAdmin) {
      tasks.push(
        apiGet<Record<string, unknown>[]>("/users")
          .then((payload) => {
            const rows = Array.isArray(payload) ? payload : [];
            entries.push({ scope: ADMIN_USERS_RECORD_SCOPE, collectionKey: ADMIN_USERS_COLLECTION_KEY, view: "admin_users", rows });
          })
          .catch(() => {})
      );
    }

    await Promise.all(tasks);
    setRawEntries(entries);
    setTeamchatCounts(nextTeamchatCounts);
  }, [accessScope, activityState.baselineAt, activityState.collections, activityState.views, isAdmin, userId, username]);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  // Bubble counts are derived, not fetched: confirming a row/cell (which updates
  // activityState.items) recomputes this instantly from the last-fetched rows,
  // without waiting for the next network poll.
  const snapshot = useMemo<ActivitySnapshot>(() => {
    if (!userId) {
      return { viewCounts: {}, collectionCounts: {} };
    }

    const viewCounts: Partial<Record<AppView, number>> = { ...teamchatCounts.viewCounts };
    const collectionCounts: Record<string, number> = { ...teamchatCounts.collectionCounts };

    for (const entry of rawEntries) {
      const count = countUnseenByScope(entry.rows, entry.scope, activityState.items, activityState.baselineAt, userId);
      if (entry.collectionKey) {
        collectionCounts[entry.collectionKey] = (collectionCounts[entry.collectionKey] ?? 0) + count;
      }
      if (entry.view) {
        viewCounts[entry.view] = (viewCounts[entry.view] ?? 0) + count;
      }
    }

    return { viewCounts, collectionCounts };
  }, [rawEntries, teamchatCounts, activityState.items, activityState.baselineAt, userId]);

  const value = useMemo<ActivityContextValue>(() => ({
    currentUserId: userId,
    getViewCount: (view) => snapshot.viewCounts[view] ?? 0,
    getCollectionCount: (collectionKey) => snapshot.collectionCounts[collectionKey] ?? 0,
    getItemActivity: (scope, itemId, latestAt, createdAt, updatedByUserId, createdByUserId) => {
      const latestActorUserId = updatedByUserId ?? createdByUserId ?? null;
      if (userId && latestActorUserId === userId) {
        return "none";
      }
      const seenAt = activityState.items[getItemKey(scope, itemId)] ?? activityState.baselineAt;
      return getActivityState({ latestAt, createdAt, seenAt });
    },
    getFieldActivity: (scope, itemId, entry) => {
      const seenAt = activityState.items[getItemKey(scope, itemId)] ?? activityState.baselineAt;
      return getFieldActivityState(entry, seenAt, userId);
    },
    markViewSeen,
    markCollectionSeen,
    markItemSeen,
    markItemsSeen,
    refresh,
  }), [activityState.baselineAt, activityState.items, markCollectionSeen, markItemSeen, markItemsSeen, markViewSeen, refresh, snapshot.collectionCounts, snapshot.viewCounts, userId]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
};

export const useActivity = (): ActivityContextValue => {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error("useActivity must be used within an ActivityProvider");
  }
  return context;
};

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { canAccessProjectsSystem, canAccessStandardSystem, type UserAccessScope } from "../auth/AuthContext";
import type { AppView, GridView } from "../types/appView";
import { apiGet } from "../utils/api";
import {
  ADMIN_USERS_COLLECTION_KEY,
  TEAMCHAT_COLLECTION_KEY,
  buildCommissionsCollectionKey,
  buildSubjectsCollectionKey,
  type ActivitySystem,
  type ActivityTable,
  FUTURE_FUNCTIONS_ACTIVE_COLLECTION_KEY,
  FUTURE_FUNCTIONS_ARCHIVE_COLLECTION_KEY,
} from "./activityKeys";
import { countUnseenRecords, getActivityState, getActivityTimestampsFromRecord, type ActivityState } from "./activityUtils";

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

interface ActivityContextValue {
  getViewCount: (view: AppView) => number;
  getCollectionCount: (collectionKey: string) => number;
  getItemActivity: (scope: string, itemId: string | number, latestAt?: string | null, createdAt?: string | null) => ActivityState;
  markViewSeen: (view: AppView) => void;
  markCollectionSeen: (collectionKey: string) => void;
  markItemSeen: (scope: string, itemId: string | number, seenAt?: string | null) => void;
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

const mergeCount = <K extends string>(target: Partial<Record<K, number>>, key: K, value: number) => {
  target[key] = (target[key] ?? 0) + value;
};

const queueTableCollections = (
  tasks: Array<Promise<void>>,
  snapshot: ActivitySnapshot,
  activityState: StoredActivityState,
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

  tasks.push(
    apiGet<Record<string, unknown>[]>(endpoint)
      .then((payload) => {
        const rows = Array.isArray(payload) ? payload : [];
        const collectionSeenAt = activityState.collections[collectionKey] ?? activityState.baselineAt;
        const viewSeenAt = activityState.views[view] ?? activityState.baselineAt;

        snapshot.collectionCounts[collectionKey] = countUnseenRecords(rows, collectionSeenAt);
        mergeCount(snapshot.viewCounts, view, countUnseenRecords(rows, viewSeenAt));
      })
      .catch(() => {
        snapshot.collectionCounts[collectionKey] = 0;
      })
  );
};

const countChangedRooms = (rooms: Array<Record<string, unknown>>, seenAt?: string | null): number => {
  return rooms.reduce((count, room) => {
    const unreadCount = typeof room.unreadCount === "number" ? room.unreadCount : Number(room.unreadCount ?? 0);
    if (Number.isFinite(unreadCount) && unreadCount > 0) {
      return count + 1;
    }

    const { createdAt, latestAt } = getActivityTimestampsFromRecord(room);
    return getActivityState({ createdAt, latestAt, seenAt }) === "none" ? count : count + 1;
  }, 0);
};

interface ActivityProviderProps {
  userId?: number;
  accessScope?: UserAccessScope;
  isAdmin: boolean;
  activeView: AppView;
  children: React.ReactNode;
}

export const ActivityProvider: React.FC<ActivityProviderProps> = ({ userId, accessScope, isAdmin, activeView, children }) => {
  const [activityState, setActivityState] = useState<StoredActivityState>(() => readStoredState(userId));
  const [snapshot, setSnapshot] = useState<ActivitySnapshot>({ viewCounts: {}, collectionCounts: {} });

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

  useEffect(() => {
    if (!userId) {
      return;
    }

    markViewSeen(activeView);
  }, [activeView, markViewSeen, userId]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSnapshot({ viewCounts: {}, collectionCounts: {} });
      return;
    }

    const nextSnapshot: ActivitySnapshot = { viewCounts: {}, collectionCounts: {} };
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
            nextSnapshot,
            activityState,
            (system === "projects" ? (`projects_${view.replace("entities_", "subjects_")}` as AppView) : (view as AppView)),
            gridView as GridView,
            system,
            "subjects",
            table,
            `${prefix}/${table.slice(0, -1)}-entities?status=${VIEW_STATUS[gridView as GridView]}`
          );
        });
      });

      ([
        [system === "projects" ? "projects_active" : "active", "active"],
        [system === "projects" ? "projects_pending" : "pending", "pending"],
        [system === "projects" ? "projects_archived" : "archived", "archived"],
      ] as const).forEach(([view, gridView]) => {
        STANDARD_TABLES.forEach((table) => {
          const endpointBase = system === "projects" ? `${prefix}/${table.slice(0, -1)}-commissions` : `/${table}`;
          queueTableCollections(
            tasks,
            nextSnapshot,
            activityState,
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

    tasks.push(
      apiGet<Record<string, unknown>[]>("/future-functions")
        .then((payload) => {
          const rows = Array.isArray(payload) ? payload : [];
          const activeRows = rows.filter((row) => row.archived !== true);
          const archivedRows = rows.filter((row) => row.archived === true);
          nextSnapshot.collectionCounts[FUTURE_FUNCTIONS_ACTIVE_COLLECTION_KEY] = countUnseenRecords(
            activeRows,
            activityState.collections[FUTURE_FUNCTIONS_ACTIVE_COLLECTION_KEY] ?? activityState.baselineAt
          );
          nextSnapshot.collectionCounts[FUTURE_FUNCTIONS_ARCHIVE_COLLECTION_KEY] = countUnseenRecords(
            archivedRows,
            activityState.collections[FUTURE_FUNCTIONS_ARCHIVE_COLLECTION_KEY] ?? activityState.baselineAt
          );
          nextSnapshot.viewCounts.future = countUnseenRecords(rows, activityState.views.future ?? activityState.baselineAt);
        })
        .catch(() => {
          nextSnapshot.collectionCounts[FUTURE_FUNCTIONS_ACTIVE_COLLECTION_KEY] = 0;
          nextSnapshot.collectionCounts[FUTURE_FUNCTIONS_ARCHIVE_COLLECTION_KEY] = 0;
        })
    );

    tasks.push(
      apiGet<Record<string, unknown>[]>(`/api/chat-rooms?includeUnread=true&userId=${userId}`)
        .then((payload) => {
          const rooms = Array.isArray(payload) ? payload : [];
          const collectionSeenAt = activityState.collections[TEAMCHAT_COLLECTION_KEY] ?? activityState.baselineAt;
          const viewSeenAt = activityState.views.teamchat ?? activityState.baselineAt;
          nextSnapshot.collectionCounts[TEAMCHAT_COLLECTION_KEY] = countChangedRooms(rooms, collectionSeenAt);
          nextSnapshot.viewCounts.teamchat = countChangedRooms(rooms, viewSeenAt);
        })
        .catch(() => {
          nextSnapshot.collectionCounts[TEAMCHAT_COLLECTION_KEY] = 0;
        })
    );

    if (isAdmin) {
      tasks.push(
        apiGet<Record<string, unknown>[]>("/users")
          .then((payload) => {
            const rows = Array.isArray(payload) ? payload : [];
            nextSnapshot.collectionCounts[ADMIN_USERS_COLLECTION_KEY] = countUnseenRecords(
              rows,
              activityState.collections[ADMIN_USERS_COLLECTION_KEY] ?? activityState.baselineAt
            );
            nextSnapshot.viewCounts.admin_users = countUnseenRecords(rows, activityState.views.admin_users ?? activityState.baselineAt);
          })
          .catch(() => {
            nextSnapshot.collectionCounts[ADMIN_USERS_COLLECTION_KEY] = 0;
          })
      );
    }

    await Promise.all(tasks);
    setSnapshot(nextSnapshot);
  }, [accessScope, activityState, isAdmin, userId]);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const value = useMemo<ActivityContextValue>(() => ({
    getViewCount: (view) => snapshot.viewCounts[view] ?? 0,
    getCollectionCount: (collectionKey) => snapshot.collectionCounts[collectionKey] ?? 0,
    getItemActivity: (scope, itemId, latestAt, createdAt) => {
      const seenAt = activityState.items[getItemKey(scope, itemId)] ?? activityState.baselineAt;
      return getActivityState({ latestAt, createdAt, seenAt });
    },
    markViewSeen,
    markCollectionSeen,
    markItemSeen,
    refresh,
  }), [activityState.baselineAt, activityState.items, markCollectionSeen, markItemSeen, markViewSeen, refresh, snapshot.collectionCounts, snapshot.viewCounts]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
};

export const useActivity = (): ActivityContextValue => {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error("useActivity must be used within an ActivityProvider");
  }
  return context;
};

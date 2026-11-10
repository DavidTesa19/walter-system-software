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
  markCollectionsSeen: (collectionKeys: string[]) => void;
  markItemSeen: (scope: string, itemId: string | number, seenAt?: string | null) => void;
  markItemsSeen: (entries: MarkItemSeenEntry[]) => void;
  refresh: () => Promise<void>;
}

const ActivityContext = createContext<ActivityContextValue | undefined>(undefined);

const STORAGE_VERSION = 1;
const REFRESH_MS = 60_000;
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

const GRID_VIEWS: GridView[] = ["active", "pending", "archived"];

// One table of one section (say Neveřejné partner subjects): one request for
// all three grid views, split here by each row's status. `?fields=activity`
// makes the server send only id, status, times and actors (server/
// list-fields.js) — the counts need nothing else, and this runs every minute
// for every list the user can open. A server without it sends whole rows,
// which work the same.
const queueTable = (
  tasks: Array<Promise<void>>,
  entries: RawActivityEntry[],
  system: ActivitySystem,
  namespacePrefix: string | null,
  kind: "subjects" | "commissions",
  table: ActivityTable,
) => {
  const prefix = namespacePrefix ? `/api/${namespacePrefix}` : "/api";
  // Always the modern `-commissions` endpoint — never the legacy
  // `/clients|partners|tipers` table. That one carries no created_at/updated_at,
  // so every row it returns reads as permanently "seen".
  const endpoint = `${prefix}/${table.slice(0, -1)}-${kind === "subjects" ? "entities" : "commissions"}?fields=activity`;
  // Item scope intentionally excludes gridView: an entity/commission keeps its seen
  // state as it moves between active/pending/archived.
  const scope = kind === "subjects"
    ? buildSubjectsRecordScope(system, table)
    : buildCommissionsRecordScope(system, table);

  const viewFor = (gridView: GridView): AppView => {
    if (kind === "subjects") {
      return (namespacePrefix ? `${namespacePrefix}_subjects_${gridView}` : `entities_${gridView}`) as AppView;
    }
    return (namespacePrefix ? `${namespacePrefix}_${gridView}` : gridView) as AppView;
  };

  tasks.push(
    apiGet<Record<string, unknown>[]>(endpoint)
      .then((payload) => (Array.isArray(payload) ? payload : []))
      .catch(() => [] as Array<Record<string, unknown>>)
      .then((rows) => {
        for (const gridView of GRID_VIEWS) {
          const status = VIEW_STATUS[gridView];
          entries.push({
            scope,
            collectionKey: kind === "subjects"
              ? buildSubjectsCollectionKey(system, gridView, table)
              : buildCommissionsCollectionKey(system, gridView, table),
            view: viewFor(gridView),
            rows: rows.filter((row) => row.status === status),
          });
        }
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
  const [chatRooms, setChatRooms] = useState<Array<Record<string, unknown>>>([]);

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

  // Bulk-confirm every row belonging to any of the given collections (a whole
  // table across all three grid views, a whole system, or several systems at
  // once), using the rows the provider already has on hand from its last
  // refresh — no need for the caller (e.g. the sidebar) to know which specific
  // records are unseen.
  const markCollectionsSeen = useCallback((collectionKeys: string[]) => {
    if (!collectionKeys.length) {
      return;
    }
    const keySet = new Set(collectionKeys);
    const entries: MarkItemSeenEntry[] = [];
    for (const entry of rawEntries) {
      if (!entry.collectionKey || !keySet.has(entry.collectionKey)) {
        continue;
      }
      for (const row of entry.rows) {
        const id = row.id;
        if (typeof id !== "number" && typeof id !== "string") {
          continue;
        }
        const { latestAt } = getActivityTimestampsFromRecord(row);
        entries.push({ scope: entry.scope, itemId: id, seenAt: latestAt });
      }
    }
    markItemsSeen(entries);
  }, [rawEntries, markItemsSeen]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    markViewSeen(activeView);
  }, [activeView, markViewSeen, userId]);

  // Stable on purpose: it used to depend on the seen-state, which changes on
  // every screen the user opens (markViewSeen), so each click in the menu
  // re-downloaded every list of every section. Counting against the seen-state
  // happens in `snapshot` below, from the rows fetched here.
  const refresh = useCallback(async () => {
    if (!userId) {
      setRawEntries([]);
      setChatRooms([]);
      return;
    }

    const entries: RawActivityEntry[] = [];
    const tasks: Array<Promise<void>> = [];

    const queueDomain = (system: ActivitySystem, namespacePrefix: string | null) => {
      STANDARD_TABLES.forEach((table) => {
        queueTable(tasks, entries, system, namespacePrefix, "subjects", table);
        queueTable(tasks, entries, system, namespacePrefix, "commissions", table);
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

    let rooms: Array<Record<string, unknown>> = [];
    tasks.push(
      apiGet<Record<string, unknown>[]>(`/api/chat-rooms?includeUnread=true&userId=${userId}`)
        .then((payload) => {
          rooms = Array.isArray(payload) ? payload : [];
        })
        .catch(() => {})
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
    setChatRooms(rooms);
  }, [accessScope, isAdmin, userId]);

  // Every minute while the app is on screen. A hidden tab (another tab, a
  // minimised window, the phone app in the background) does not poll; it
  // catches up as soon as it is shown again.
  useEffect(() => {
    let lastRun = 0;
    const run = () => {
      lastRun = Date.now();
      void refresh();
    };
    run();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun >= REFRESH_MS) run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Bubble counts are derived, not fetched: confirming a row/cell (which updates
  // activityState.items) recomputes this instantly from the last-fetched rows,
  // without waiting for the next network poll.
  const snapshot = useMemo<ActivitySnapshot>(() => {
    if (!userId) {
      return { viewCounts: {}, collectionCounts: {} };
    }

    const viewCounts: Partial<Record<AppView, number>> = {
      teamchat: countChangedRooms(chatRooms, activityState.views.teamchat ?? activityState.baselineAt, username),
    };
    const collectionCounts: Record<string, number> = {
      [TEAMCHAT_COLLECTION_KEY]: countChangedRooms(
        chatRooms,
        activityState.collections[TEAMCHAT_COLLECTION_KEY] ?? activityState.baselineAt,
        username,
      ),
    };

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
  }, [rawEntries, chatRooms, activityState.items, activityState.baselineAt, activityState.views, activityState.collections, userId, username]);

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
    markCollectionsSeen,
    markItemSeen,
    markItemsSeen,
    refresh,
  }), [activityState.baselineAt, activityState.items, markCollectionSeen, markCollectionsSeen, markItemSeen, markItemsSeen, markViewSeen, refresh, snapshot.collectionCounts, snapshot.viewCounts, userId]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
};

export const useActivity = (): ActivityContextValue => {
  const context = useContext(ActivityContext);
  if (!context) {
    throw new Error("useActivity must be used within an ActivityProvider");
  }
  return context;
};

import type { GridView } from "../types/appView";

export type ActivityTable = "clients" | "partners" | "tipers";
export type ActivitySystem = "standard" | "projects" | "growth";

export const getActivitySystem = (systemNamespace?: string): ActivitySystem => {
  if (systemNamespace === "projects") return "projects";
  if (systemNamespace === "growth") return "growth";
  return "standard";
};

export const buildSubjectsCollectionKey = (system: ActivitySystem, viewMode: GridView, table: ActivityTable): string =>
  `subjects:${system}:${viewMode}:${table}`;

export const buildCommissionsCollectionKey = (system: ActivitySystem, viewMode: GridView, table: ActivityTable): string =>
  `commissions:${system}:${viewMode}:${table}`;

export const buildSubjectsRecordScope = (system: ActivitySystem, table: ActivityTable): string =>
  `record:subjects:${system}:${table}`;

export const buildCommissionsRecordScope = (system: ActivitySystem, table: ActivityTable): string =>
  `record:commissions:${system}:${table}`;

export const ACTIVITY_TABLES: ActivityTable[] = ["clients", "partners", "tipers"];
export const ACTIVITY_GRID_VIEWS: GridView[] = ["active", "pending", "archived"];

// Every collection key for one system (optionally narrowed to one kind), across
// every table and every grid view. Used to bulk-confirm ("mark all as seen")
// at a coarser granularity than a single table/view — a whole subject or
// commission table, a whole system (Growth Club, Veřejné, Neveřejné), or,
// with every system's keys concatenated, the entire app.
export const buildCollectionKeysForSystem = (
  system: ActivitySystem,
  kind?: "subjects" | "commissions"
): string[] => {
  const kinds: Array<"subjects" | "commissions"> = kind ? [kind] : ["subjects", "commissions"];
  const keys: string[] = [];
  for (const k of kinds) {
    for (const table of ACTIVITY_TABLES) {
      for (const view of ACTIVITY_GRID_VIEWS) {
        keys.push(
          k === "subjects"
            ? buildSubjectsCollectionKey(system, view, table)
            : buildCommissionsCollectionKey(system, view, table)
        );
      }
    }
  }
  return keys;
};

export const ADMIN_USERS_COLLECTION_KEY = "users:admin";
export const ADMIN_USERS_RECORD_SCOPE = "record:users:admin";

export const FUTURE_FUNCTIONS_ACTIVE_COLLECTION_KEY = "future-functions:active";
export const FUTURE_FUNCTIONS_ARCHIVE_COLLECTION_KEY = "future-functions:archive";
export const FUTURE_FUNCTIONS_RECORD_SCOPE = "record:future-functions";

export const TEAMCHAT_COLLECTION_KEY = "teamchat:rooms";
export const TEAMCHAT_RECORD_SCOPE = "record:teamchat:rooms";

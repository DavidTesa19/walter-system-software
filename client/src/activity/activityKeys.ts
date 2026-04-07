import type { GridView } from "../types/appView";

export type ActivityTable = "clients" | "partners" | "tipers";
export type ActivitySystem = "standard" | "projects";

export const getActivitySystem = (systemNamespace?: string): ActivitySystem =>
  systemNamespace === "projects" ? "projects" : "standard";

export const buildSubjectsCollectionKey = (system: ActivitySystem, viewMode: GridView, table: ActivityTable): string =>
  `subjects:${system}:${viewMode}:${table}`;

export const buildCommissionsCollectionKey = (system: ActivitySystem, viewMode: GridView, table: ActivityTable): string =>
  `commissions:${system}:${viewMode}:${table}`;

export const buildSubjectsRecordScope = (system: ActivitySystem, table: ActivityTable): string =>
  `record:subjects:${system}:${table}`;

export const buildCommissionsRecordScope = (system: ActivitySystem, table: ActivityTable): string =>
  `record:commissions:${system}:${table}`;

export const ADMIN_USERS_COLLECTION_KEY = "users:admin";
export const ADMIN_USERS_RECORD_SCOPE = "record:users:admin";

export const FUTURE_FUNCTIONS_ACTIVE_COLLECTION_KEY = "future-functions:active";
export const FUTURE_FUNCTIONS_ARCHIVE_COLLECTION_KEY = "future-functions:archive";
export const FUTURE_FUNCTIONS_RECORD_SCOPE = "record:future-functions";

export const TEAMCHAT_COLLECTION_KEY = "teamchat:rooms";
export const TEAMCHAT_RECORD_SCOPE = "record:teamchat:rooms";

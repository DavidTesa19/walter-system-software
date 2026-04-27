import type { AppView, GridView } from "./appView";

export type SearchTable = "clients" | "partners" | "tipers" | "partner_entities" | "client_entities" | "tiper_entities";

export interface GlobalSearchResult {
  id: string;
  title: string;
  subtitle: string;
  matchText?: string;
  locationLabel: string;
  view: AppView;
  table?: SearchTable;
  recordId?: number;
  futureFunctionId?: number;
}

export interface GridSearchNavigationTarget {
  table: SearchTable;
  recordId: number;
  requestKey: string;
  viewMode: GridView;
}
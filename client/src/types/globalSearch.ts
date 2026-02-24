import type { AppView, GridView } from "./appView";

export type SearchTable = "clients" | "partners" | "tipers";

export interface GlobalSearchResult {
  id: string;
  title: string;
  subtitle: string;
  matchText?: string;
  locationLabel: string;
  view: AppView;
  table?: SearchTable;
  recordId?: number;
}

export interface GridSearchNavigationTarget {
  table: SearchTable;
  recordId: number;
  requestKey: string;
  viewMode: GridView;
}
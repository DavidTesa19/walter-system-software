import type { AppView, GridView } from "./appView";

export type SearchTable = "clients" | "partners" | "tipers" | "partner_entities" | "client_entities" | "tiper_entities";

export interface GlobalSearchResult {
  id: string;
  title: string;
  /**
   * Single line of context under the title, e.g. `Partneři › Aktuální subjekty`.
   * Kept to one line on purpose — the dropdown is narrow and every extra line
   * costs a result the user could have seen instead.
   */
  locationLabel: string;
  /** Labels of the fields the query hit, e.g. `['Jméno', 'E-mail']`. */
  matchedFields?: string[];
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
  /**
   * Set when the user picked the profile button on the search result rather
   * than the result itself: the grid scrolls to the row as usual and then opens
   * its profile panel.
   */
  openProfile?: boolean;
}

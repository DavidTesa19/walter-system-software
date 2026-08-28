import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { RowClassParams, RowClassRules } from "ag-grid-community";

/**
 * Class the grid puts on the row a global-search result pointed at. Styled in
 * `UsersGrid.css`.
 */
export const SEARCH_FOCUS_ROW_CLASS = "grid-row--search-focus";

/** How long the row stays marked before it goes back to looking like any other. */
const HIGHLIGHT_MS = 4500;

/**
 * The row is looked up by id, and a click on a search result usually lands
 * before the section has finished fetching its data — so retry for a while
 * rather than giving up on the first miss.
 */
const LOOKUP_RETRY_MS = 120;
const LOOKUP_MAX_ATTEMPTS = 30;

interface GridRowFocusOptions {
  /** Grid row id the search result points at, or null when nothing is targeted. */
  focusRecordId?: number | null;
  /**
   * Changes on every search result click, including a repeat click on the row
   * that is already highlighted, which is what re-triggers the highlight.
   */
  focusRequestKey?: string | null;
  isActive?: boolean;
}

/**
 * Scrolls the row a global search result points at into view and tints it for a
 * few seconds, so the hit is obvious without the user hunting for it.
 *
 * The highlighted id lives in a ref because `rowClassRules` has to stay
 * referentially stable — a new object on every render makes ag-Grid redo work it
 * does not need to. ag-Grid only re-evaluates the rules when it draws a row, so
 * the row is redrawn explicitly whenever the highlight goes on or off.
 */
export const useGridRowFocus = <TData extends { id: number }>(
  gridRef: React.RefObject<AgGridReact<TData> | null>,
  { focusRecordId, focusRequestKey, isActive = true }: GridRowFocusOptions
) => {
  const highlightedIdRef = useRef<number | null>(null);
  const handledKeyRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const redrawRow = useCallback(
    (rowId: number | null) => {
      if (rowId === null) return;
      const api = gridRef.current?.api;
      if (!api || api.isDestroyed()) return;
      const node = api.getRowNode(String(rowId));
      if (node) {
        api.redrawRows({ rowNodes: [node] });
      }
    },
    [gridRef]
  );

  const clearHighlight = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const previous = highlightedIdRef.current;
    highlightedIdRef.current = null;
    redrawRow(previous);
  }, [redrawRow]);

  useEffect(() => clearHighlight, [clearHighlight]);

  useEffect(() => {
    if (!isActive || !focusRequestKey || focusRecordId === null || focusRecordId === undefined) {
      return;
    }
    if (handledKeyRef.current === focusRequestKey) {
      return;
    }

    let attempts = 0;
    let retryTimer: number | null = null;

    const attempt = () => {
      retryTimer = null;
      const api = gridRef.current?.api;
      const node = api && !api.isDestroyed() ? api.getRowNode(String(focusRecordId)) : null;

      // No node yet (still loading), or the row exists but a filter is hiding
      // it so it has no place to scroll to.
      if (!api || node?.rowIndex === null || node?.rowIndex === undefined) {
        attempts += 1;
        if (attempts < LOOKUP_MAX_ATTEMPTS) {
          retryTimer = window.setTimeout(attempt, LOOKUP_RETRY_MS);
        }
        return;
      }

      handledKeyRef.current = focusRequestKey;
      api.ensureIndexVisible(node.rowIndex, "middle");

      clearHighlight();
      highlightedIdRef.current = focusRecordId;
      redrawRow(focusRecordId);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        clearHighlight();
      }, HIGHLIGHT_MS);
    };

    attempt();

    return () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [clearHighlight, focusRecordId, focusRequestKey, gridRef, isActive, redrawRow]);

  const rowClassRules = useMemo<RowClassRules<TData>>(
    () => ({
      [SEARCH_FOCUS_ROW_CLASS]: (params: RowClassParams<TData>) =>
        highlightedIdRef.current !== null && params.data?.id === highlightedIdRef.current
    }),
    []
  );

  return { rowClassRules };
};

export default useGridRowFocus;

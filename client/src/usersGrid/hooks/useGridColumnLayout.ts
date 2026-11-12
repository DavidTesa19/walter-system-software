import { useCallback, useEffect, useRef } from "react";
import type { AgGridReact } from "ag-grid-react";

// The three separately scrollable elements ag-Grid keeps at the same horizontal
// offset: the header, the rows, and the fake scrollbar under them.
const SCROLLER_SELECTORS = [
  ".ag-header-viewport",
  ".ag-center-cols-viewport",
  ".ag-body-horizontal-scroll-viewport",
] as const;

const SCROLLER_SELECTOR = SCROLLER_SELECTORS.join(",");

// The rows lead; the header and the fake scrollbar follow them.
const ROWS_SELECTOR = ".ag-center-cols-viewport";
const FOLLOWER_SELECTORS = [".ag-header-viewport", ".ag-body-horizontal-scroll-viewport"] as const;

// How long a horizontal scroll has to pause before the header is checked.
const SETTLE_MS = 120;

/**
 * Sizes a grid's columns and keeps its rows lined up under the header.
 *
 * ## Why the columns kept ending up at the wrong width
 *
 * The column defs declare `flex`, and this hook calls `sizeColumnsToFit()`.
 * Those are two different sizing mechanisms and they overwrite each other:
 *
 * - `sizeColumnsToFit()` spreads the viewport across the columns and writes an
 *   absolute width to each. As a side effect it clears `flex` — after a fit
 *   every column reports `flex: null`.
 * - Whenever a new `columnDefs` array reaches the grid, ag-Grid rebuilds its
 *   columns from those defs. `flex` comes back, and every width goes back to
 *   ag-Grid's 200px default, because none of the defs set `width`.
 *
 * These grids rebuild their columns often — the defs are rebuilt whenever the
 * data, the filters or the assigned-user options change — and the old hook only
 * re-fitted from a ResizeObserver and from `visibilitychange`, neither of which
 * fires on a column rebuild. So the columns sat at a uniform 200px until the
 * window happened to be resized. Eighteen columns at 200px is far wider than
 * the viewport, which left the grid horizontally scrolled and made every value
 * look like it was under the wrong heading.
 *
 * The fix is to re-fit on the event that actually invalidates the widths:
 * `gridColumnsChanged`, which ag-Grid fires exactly when it has rebuilt its
 * columns. `sizeColumnsToFit()` does not change the column list, so it cannot
 * retrigger that event; `fittingRef` is belt and braces against a nested fit.
 *
 * Note that `flex` on the column defs is effectively dead weight: the min
 * widths add up to more than the viewport on any normal screen, so a flex pass
 * and a fit both end up pinning every column to its own `minWidth`. Sizing is
 * left to `sizeColumnsToFit()` alone, which also fills the width on a monitor
 * wide enough for it to matter.
 *
 * ## Scroll position
 *
 * Once the grid does scroll horizontally, the header, the rows and the
 * scrollbar have to be kept at the same offset. ag-Grid syncs them, but it
 * ignores a scroll coming from one of them while another is still "in control"
 * (its own debounce window). Anything that scrolls one on its own — clicking
 * the filter button in a partly off-screen header cell focuses it, and the
 * browser scrolls it into view — can leave the header offset from the rows.
 *
 * So once scrolling pauses, the header and the scrollbar are put back on the
 * rows' offset. The rows are the source of truth and are never written. (This
 * used to copy whichever element scrolled onto the other two on every scroll
 * event. ag-Grid moves the header a frame behind the rows, so the header's own
 * scroll event then wrote that older offset back onto the rows: the table
 * jumped back a little on every frame of a horizontal scroll, which read as
 * lag.)
 *
 * Attach `containerRef` to the element wrapping `<AgGridReact>`, and pass
 * `onGridReady` and `onGridColumnsChanged` to the grid.
 */
export const useGridColumnLayout = <TData,>(gridRef: React.RefObject<AgGridReact<TData> | null>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Width we last fitted for, so a resize re-fits but a data refresh does not
  // keep undoing a column the user dragged wider.
  const fittedWidthRef = useRef<number | null>(null);
  const fittingRef = useRef(false);

  const fitColumns = useCallback(
    // `force` is for the cases where the widths are known to be invalid even
    // though the viewport has not moved — a column rebuild, or first render.
    (force = false) => {
      const api = gridRef.current?.api;
      const container = containerRef.current;
      if (!api || api.isDestroyed() || !container || fittingRef.current) return;

      const width = container.clientWidth;
      // Not laid out yet — the ResizeObserver below fits it once it is.
      if (width <= 0) return;
      if (!force && fittedWidthRef.current === width) return;

      fittedWidthRef.current = width;
      fittingRef.current = true;
      try {
        api.sizeColumnsToFit();
      } finally {
        fittingRef.current = false;
      }
    },
    [gridRef]
  );

  // Puts the header and the scrollbar on the rows' offset. Only writes when
  // one has drifted, so it settles instead of ping-ponging with ag-Grid.
  const alignToRows = useCallback(() => {
    const container = containerRef.current;
    const rows = container?.querySelector<HTMLElement>(ROWS_SELECTOR);
    if (!container || !rows) return;
    const { scrollLeft } = rows;
    for (const selector of FOLLOWER_SELECTORS) {
      const scroller = container.querySelector<HTMLElement>(selector);
      if (scroller && Math.abs(scroller.scrollLeft - scrollLeft) > 0.5) {
        scroller.scrollLeft = scrollLeft;
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scroll events don't bubble, but they can be caught on the way down, which
    // keeps working when ag-Grid rebuilds its containers (a domLayout change).
    // Nothing is read or written while scrolling: only a timer is reset, and
    // the check runs once the scroll has paused.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.matches?.(SCROLLER_SELECTOR)) return;
      clearTimeout(timer);
      timer = setTimeout(alignToRows, SETTLE_MS);
    };
    container.addEventListener("scroll", onScroll, { capture: true, passive: true });

    const observer = new ResizeObserver(() => fitColumns());
    observer.observe(container);

    return () => {
      clearTimeout(timer);
      container.removeEventListener("scroll", onScroll, { capture: true });
      observer.disconnect();
    };
  }, [fitColumns, alignToRows]);

  // ag-Grid has rebuilt its columns from the defs, so every width is back at
  // the 200px default and has to be fitted again.
  const onGridColumnsChanged = useCallback(() => fitColumns(true), [fitColumns]);
  const onGridReady = useCallback(() => fitColumns(true), [fitColumns]);

  return { containerRef, onGridReady, onGridColumnsChanged };
};

export default useGridColumnLayout;

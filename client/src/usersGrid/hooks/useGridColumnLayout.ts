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

/**
 * Keeps a grid's rows lined up under the header they belong to.
 *
 * Two separate things knock them apart, and both show up as "the columns are
 * moved" — values sitting one or two columns away from their heading:
 *
 * 1. **Column widths.** ag-Grid only runs its `flex` sizing pass from a
 *    ResizeObserver callback, and those are delivered as part of the browser's
 *    rendering steps. A grid that mounts while its tab is in the background
 *    never gets one, so every flex column is left at ag-Grid's 200px default —
 *    and it is never corrected afterwards, because the viewport width has not
 *    changed by the time the tab is looked at. Eighteen columns at 200px is
 *    two and a half screens wide, which turns an ordinary table into a
 *    horizontally scrolled one.
 * 2. **Scroll position.** Once the grid does scroll horizontally, the header,
 *    the rows and the scrollbar have to be kept at the same offset. ag-Grid
 *    syncs them, but it ignores a scroll coming from one of them while another
 *    is still "in control" (its own debounce window). Anything that scrolls one
 *    on its own — clicking the filter button in a partly off-screen header cell
 *    focuses it, and the browser scrolls it into view — can leave the header
 *    offset from the rows, so every value reads under the wrong column.
 *
 * So: size the columns to the viewport ourselves, without waiting for a frame
 * to be rendered, and force the scrollers back onto one offset whenever any of
 * them moves.
 *
 * Attach `containerRef` to the element wrapping `<AgGridReact>` and pass
 * `onGridReady` to the grid.
 */
export const useGridColumnLayout = <TData,>(gridRef: React.RefObject<AgGridReact<TData> | null>) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Width we last sized the columns for, so a resize re-fits but a data refresh
  // does not keep undoing a column the user dragged wider.
  const fittedWidthRef = useRef<number | null>(null);

  const fitColumns = useCallback(() => {
    const api = gridRef.current?.api;
    const container = containerRef.current;
    if (!api || api.isDestroyed() || !container) return;
    const width = container.clientWidth;
    // Not laid out yet — the ResizeObserver below fits it once it is.
    if (width <= 0) return;
    if (fittedWidthRef.current === width) return;
    fittedWidthRef.current = width;
    api.sizeColumnsToFit();
  }, [gridRef]);

  const syncScrollers = useCallback((source: HTMLElement) => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollLeft } = source;
    for (const selector of SCROLLER_SELECTORS) {
      const scroller = container.querySelector<HTMLElement>(selector);
      if (!scroller || scroller === source) continue;
      // Only write when it actually differs, so this settles instead of
      // ping-ponging with ag-Grid's own sync.
      if (Math.abs(scroller.scrollLeft - scrollLeft) > 0.5) {
        scroller.scrollLeft = scrollLeft;
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scroll events don't bubble, but they can be caught on the way down, which
    // keeps working when ag-Grid rebuilds its containers (a domLayout change).
    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.matches?.(SCROLLER_SELECTOR)) return;
      syncScrollers(target);
    };
    container.addEventListener("scroll", onScroll, { capture: true, passive: true });

    const observer = new ResizeObserver(() => fitColumns());
    observer.observe(container);

    // A tab that was in the background while the grid mounted gets its columns
    // sized the moment it is looked at.
    const onVisibilityChange = () => {
      if (!document.hidden) fitColumns();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      container.removeEventListener("scroll", onScroll, { capture: true });
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fitColumns, syncScrollers]);

  const onGridReady = useCallback(() => {
    fitColumns();
  }, [fitColumns]);

  return { containerRef, onGridReady };
};

export default useGridColumnLayout;

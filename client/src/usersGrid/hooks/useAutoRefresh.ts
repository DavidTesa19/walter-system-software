import { useEffect, useRef } from "react";

interface AutoRefreshOptions {
  // Only refresh while this section is the one on screen.
  enabled?: boolean;
  intervalMs?: number;
  // Return false to skip a refresh (e.g. something is mid-edit).
  canRefresh?: () => boolean;
}

const DEFAULT_INTERVAL_MS = 45000;

/**
 * Keeps a grid section in step with the server without anyone having to reload
 * the page, re-open a subject or re-save a record: refresh when the section
 * becomes the active one, when the window/tab regains focus, and on a slow
 * interval while it stays open.
 *
 * Refreshes are skipped while the document is hidden (a background tab has no
 * one to show fresh data to) and whenever `canRefresh` says something is
 * mid-edit, so an in-progress cell editor or modal is never replaced under the
 * user. Pass a refresh that fetches silently — this runs on a timer, and
 * flashing a loading overlay every interval would be worse than the staleness
 * it fixes.
 */
export const useAutoRefresh = (
  refresh: () => void,
  { enabled = true, intervalMs = DEFAULT_INTERVAL_MS, canRefresh }: AutoRefreshOptions = {}
) => {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const canRefreshRef = useRef(canRefresh);
  canRefreshRef.current = canRefresh;
  // The section fetches once on mount already; only later activations refresh.
  const hasRunRef = useRef(false);

  useEffect(() => {
    const isFirstRun = !hasRunRef.current;
    hasRunRef.current = true;

    if (!enabled) return;

    const run = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (canRefreshRef.current && !canRefreshRef.current()) return;
      refreshRef.current();
    };

    if (!isFirstRun) run();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") run();
    };

    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", handleVisibility);
    const timer = window.setInterval(run, intervalMs);

    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs]);
};

export default useAutoRefresh;

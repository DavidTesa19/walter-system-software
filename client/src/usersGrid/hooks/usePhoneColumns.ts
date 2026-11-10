import { useEffect, useMemo, useState } from "react";

// The same breakpoint as the phone layout in Sidebar.css.
export const PHONE_QUERY = "(max-width: 768px)";

// Columns that only hold a row button (approve/restore, delete, archive). On a
// computer they sit pinned on the left; on a phone four pinned columns took
// half of the 342 px grid and never scrolled away, so the record's name started
// off-screen. There these move to the far right end of the scrolled area. The
// profile button and the change dot stay pinned: opening a record is the main
// thing a phone is used for.
const ROW_BUTTON_COLUMNS = new Set(["approve", "delete", "archive"]);

export function fitColumnsForPhone<C extends object>(cols: C[], isPhone: boolean): C[] {
  if (!isPhone) return cols;
  return cols.map((col) => {
    const colId = (col as { colId?: string }).colId;
    if (!colId || !ROW_BUTTON_COLUMNS.has(colId)) return col;
    // `pinned: null` (not undefined) so a column that was pinned before a
    // resize is actually unpinned when the defs are applied again.
    return { ...col, pinned: null, lockPosition: "right" as const } as C;
  });
}

export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}

// columnDefs as given on a computer (same identity, no extra column rebuild),
// rearranged for a phone.
export function usePhoneColumns<C extends object>(cols: C[]): C[] {
  const isPhone = useIsPhone();
  return useMemo(() => fitColumnsForPhone(cols, isPhone), [cols, isPhone]);
}

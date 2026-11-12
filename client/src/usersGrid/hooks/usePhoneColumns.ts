import { useEffect, useMemo, useState } from "react";

// The same breakpoint as the phone layout in Sidebar.css.
export const PHONE_QUERY = "(max-width: 768px)";

// Columns that only hold a row button (approve/restore, archive, delete), in
// the order they appear at the end of the row: the destructive one last.
const ROW_BUTTON_ORDER = ["approve", "archive", "delete"];
const ROW_BUTTON_COLUMNS = new Set(ROW_BUTTON_ORDER);

const colIdOf = (col: object) => (col as { colId?: string }).colId;

// The row buttons belong at the end of the row, so a table starts with the
// profile button and then its first real column (ID).
//
// - On a computer they are pinned right: always in reach, however far the
//   table is scrolled. (They used to be pinned left, ahead of the data.)
// - On a phone, pinned columns never scroll away and four of them took half of
//   a 342 px grid, so there they are unpinned and locked to the far right end
//   of the scrolled area.
//
// The profile button stays pinned left: opening a record is the main thing a
// row is used for. Returns a new array only when there is something to move.
export function fitColumnsForPhone<C extends object>(cols: C[], isPhone: boolean): C[] {
  const buttons = cols.filter((col) => ROW_BUTTON_COLUMNS.has(colIdOf(col) ?? ""));
  if (buttons.length === 0) return cols;
  const rest = cols.filter((col) => !ROW_BUTTON_COLUMNS.has(colIdOf(col) ?? ""));
  buttons.sort((a, b) => ROW_BUTTON_ORDER.indexOf(colIdOf(a)!) - ROW_BUTTON_ORDER.indexOf(colIdOf(b)!));
  const moved = buttons.map(
    (col) =>
      // `pinned: null` (not undefined) so a column that was pinned before a
      // resize is actually unpinned when the defs are applied again.
      ({ ...col, pinned: isPhone ? null : "right", lockPosition: "right" as const }) as C,
  );
  return [...rest, ...moved];
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

// columnDefs with the row buttons moved to the end of the row (see above).
// Memoised on the defs, so it only rebuilds when they do.
export function usePhoneColumns<C extends object>(cols: C[]): C[] {
  const isPhone = useIsPhone();
  return useMemo(() => fitColumnsForPhone(cols, isPhone), [cols, isPhone]);
}

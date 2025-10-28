export interface GridSizes {
  row: number;
  headerOffset: number;
}

const defaultSizes: GridSizes = { row: 42, headerOffset: 80 };

export const measureGrid = (wrapper: HTMLDivElement | null): GridSizes => {
  if (!wrapper) {
    return defaultSizes;
  }

  const rows = wrapper.querySelectorAll<HTMLElement>(".ag-row");
  const header = wrapper.querySelector<HTMLElement>(".ag-header");
  const wrapperRect = wrapper.getBoundingClientRect();

  const rowHeight = rows.length > 0 ? rows[0].getBoundingClientRect().height : defaultSizes.row;
  const firstRowTop = rows.length > 0 ? rows[0].getBoundingClientRect().top : null;
  const headerHeight = header ? header.getBoundingClientRect().height : 44;

  const headerOffset =
    firstRowTop != null
      ? Math.max(0, firstRowTop - wrapperRect.top)
      : headerHeight + 32;

  return {
    row: rowHeight,
    headerOffset
  };
};

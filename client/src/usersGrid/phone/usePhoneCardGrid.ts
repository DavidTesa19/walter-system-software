import { useMemo } from 'react';
import { useIsPhone } from '../hooks/usePhoneColumns';
import PhoneCardRow, { PHONE_CARD_HEIGHT } from './PhoneCardRow';
import { usePhoneView } from './phoneView';

/**
 * The grid props that turn every row into a card on a phone in card view
 * (full-width rows, no header), plus a key: switching view remounts the grid,
 * since ag-Grid reads isFullWidthRow and the row height when it lays rows out.
 * On a computer, or in table view, nothing changes.
 */
export function usePhoneCardGrid() {
  const isPhone = useIsPhone();
  const view = usePhoneView();
  const cards = isPhone && view === 'cards';
  const props = useMemo(
    () =>
      cards
        ? {
            isFullWidthRow: () => true,
            fullWidthCellRenderer: PhoneCardRow,
            rowHeight: PHONE_CARD_HEIGHT,
            headerHeight: 0,
          }
        : {},
    [cards],
  );
  return { cards, gridKey: cards ? 'phone-cards' : 'grid', props };
}

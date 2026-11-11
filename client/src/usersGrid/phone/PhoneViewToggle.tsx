// Cards / table switch in a table screen's header; shown only on a phone
// (PhoneCardRow.css hides it above 768 px).

import { LayoutList, Table2 } from 'lucide-react';
import { BUTTON_ICON } from '../../ui/icons';
import { setPhoneView, usePhoneView } from './phoneView';

export default function PhoneViewToggle() {
  const view = usePhoneView();
  return (
    <div className="phone-view-toggle" role="group" aria-label="Zobrazení">
      <button
        type="button"
        className={view === 'cards' ? 'is-active' : undefined}
        aria-pressed={view === 'cards'}
        onClick={() => setPhoneView('cards')}
        title="Karty"
      >
        <LayoutList {...BUTTON_ICON} />
      </button>
      <button
        type="button"
        className={view === 'table' ? 'is-active' : undefined}
        aria-pressed={view === 'table'}
        onClick={() => setPhoneView('table')}
        title="Tabulka"
      >
        <Table2 {...BUTTON_ICON} />
      </button>
    </div>
  );
}

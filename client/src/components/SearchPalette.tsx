// Search from anywhere ("hledáček v horní liště"): Ctrl/⌘+K, the search button
// in the top bar (FloatingTools) or the phone's top bar opens a window at the
// top of the screen. It searches every record the user can see (the same
// runGlobalSearch as the sidebar's box) and the screens they can open, and
// Enter jumps to the highlighted result.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, LayoutGrid, Search, UserRound } from 'lucide-react';
import type { AppView } from '../types/appView';
import type { GlobalSearchResult } from '../types/globalSearch';
import { BUTTON_ICON, TAB_ICON } from '../ui/icons';
import './SearchPalette.css';

export const OPEN_SEARCH_EVENT = 'walter:open-search';
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
export const SEARCH_SHORTCUT = isMac ? '⌘K' : 'Ctrl K';

// Accents and case do not matter: "uko" finds "Úkoly".
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Item =
  | { kind: 'screen'; id: string; view: AppView; label: string }
  | { kind: 'record'; id: string; result: GlobalSearchResult };

interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
  screens: Array<{ view: AppView; label: string }>;
  onSearch: (query: string) => Promise<GlobalSearchResult[]>;
  onOpenRecord: (result: GlobalSearchResult, options?: { openProfile?: boolean }) => void;
  onOpenScreen: (view: AppView) => void;
}

export default function SearchPalette({ open, onClose, screens, onSearch, onOpenRecord, onOpenScreen }: SearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<GlobalSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setRecords([]);
    setHighlight(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Records: the server search, a quarter of a second after typing stops.
  useEffect(() => {
    const text = query.trim();
    if (!open || text.length < 2) {
      setRecords([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const request = ++requestRef.current;
      try {
        const results = await onSearch(text);
        if (request === requestRef.current) setRecords(results);
      } catch {
        if (request === requestRef.current) setRecords([]);
      } finally {
        if (request === requestRef.current) setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query, onSearch]);

  const items = useMemo<Item[]>(() => {
    const text = fold(query.trim());
    const matchingScreens = (text ? screens.filter((screen) => fold(screen.label).includes(text)) : screens.slice(0, 6))
      .slice(0, 5)
      .map((screen) => ({ kind: 'screen' as const, id: `screen-${screen.view}`, view: screen.view, label: screen.label }));
    const matchingRecords = records.map((result) => ({ kind: 'record' as const, id: result.id, result }));
    return [...matchingRecords, ...matchingScreens];
  }, [query, screens, records]);

  useEffect(() => {
    setHighlight((current) => Math.min(current, Math.max(items.length - 1, 0)));
  }, [items.length]);

  if (!open) return null;

  const choose = (item: Item | undefined, openProfile = false) => {
    if (!item) return;
    onClose();
    if (item.kind === 'screen') onOpenScreen(item.view);
    else onOpenRecord(item.result, { openProfile });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((current) => (items.length ? (current + 1) % items.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => (items.length ? (current - 1 + items.length) % items.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(items[highlight], event.shiftKey);
    }
  };

  const recordCount = items.filter((item) => item.kind === 'record').length;
  const text = query.trim();

  return (
    <div className="search-palette__backdrop" onMouseDown={onClose}>
      <div
        className="search-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Hledat v aplikaci"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="search-palette__field">
          <Search {...BUTTON_ICON} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(0);
            }}
            placeholder="Hledat klienty, zakázky, kontakty, obrazovky…"
            aria-label="Hledat"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="search-palette__results" role="listbox">
          {searching && recordCount === 0 && <div className="search-palette__status">Hledám…</div>}
          {!searching && text.length >= 2 && items.length === 0 && (
            <div className="search-palette__status">Nic nenalezeno pro „{text}“.</div>
          )}
          {items.map((item, index) => {
            const firstOfKind = index === 0 || items[index - 1].kind !== item.kind;
            const active = index === highlight;
            return (
              <div key={item.id}>
                {firstOfKind && (
                  <div className="search-palette__section">{item.kind === 'record' ? 'Záznamy' : text ? 'Obrazovky' : 'Přejít na'}</div>
                )}
                <div
                  role="option"
                  aria-selected={active}
                  className={`search-palette__item${active ? ' is-active' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                >
                  <button type="button" className="search-palette__main" onClick={() => choose(item)}>
                    {item.kind === 'screen' ? (
                      <>
                        <LayoutGrid {...TAB_ICON} />
                        <span className="search-palette__title">{item.label}</span>
                      </>
                    ) : (
                      <span className="search-palette__text">
                        <span className="search-palette__title">{item.result.title}</span>
                        <span className="search-palette__meta">
                          {[item.result.locationLabel, item.result.matchedFields?.join(', ')].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    )}
                    {active && <CornerDownLeft {...TAB_ICON} className="search-palette__enter" />}
                  </button>
                  {item.kind === 'record' && item.result.table && typeof item.result.recordId === 'number' && (
                    <button
                      type="button"
                      className="search-palette__profile"
                      onClick={() => choose(item, true)}
                      title="Otevřít profil (Shift+Enter)"
                      aria-label="Otevřít profil"
                    >
                      <UserRound {...TAB_ICON} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="search-palette__hint">
          <span><kbd>↑</kbd><kbd>↓</kbd> výběr</span>
          <span><kbd>Enter</kbd> otevřít</span>
          <span><kbd>Shift</kbd>+<kbd>Enter</kbd> profil</span>
        </div>
      </div>
    </div>
  );
}

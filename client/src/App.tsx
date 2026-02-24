import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import { UndoRedoProvider } from './utils/undoRedo';
import Login from './auth/Login';
import Sidebar from './components/Sidebar';
import Footer from './components/Footer';
import PaletteManager from './theme/PaletteManager';
import ActiveCommissionsView from './views/ActiveCommissionsView';
import PendingApprovalsView from './views/PendingApprovalsView';
import ArchivedCommissionsView from './views/ArchivedCommissionsView';
import FutureFunctionsView from './views/FutureFunctionsView';
import ChatbotView from './views/ChatbotView';
import TeamChatView from './views/TeamChatView';
import FullCalendarView from './views/FullCalendarView';
import AnalyticsView from './views/AnalyticsView';
import { trackEvent, trackSectionStart } from './utils/analytics';
import type { AppView } from './types/appView';
import type { GlobalSearchResult, GridSearchNavigationTarget, SearchTable } from './types/globalSearch';
import type { UserInterface } from './usersGrid/user.interface';
import type { FutureFunction } from './futureFunctions/futureFunction.interface';
import { apiGet } from './utils/api';
import './components/Sidebar.css';

type SearchField = keyof UserInterface;
type SearchStatus = 'accepted' | 'pending' | 'archived';

type SearchableRecord = {
  table: SearchTable;
  viewMode: 'active' | 'pending' | 'archived';
  row: UserInterface;
};

type SearchableFutureFunction = {
  row: FutureFunction;
  archived: boolean;
};

const FUTURE_FUNCTION_FIELDS: Array<{ key: keyof FutureFunction; label: string }> = [
  { key: 'name', label: 'Název' },
  { key: 'info', label: 'Popis / Info' },
  { key: 'priority', label: 'Priorita' },
  { key: 'complexity', label: 'Složitost' },
  { key: 'phase', label: 'Fáze' },
  { key: 'status', label: 'Stav' }
];

const SEARCH_FIELDS: Array<{ key: SearchField; label: string }> = [
  { key: 'name', label: 'Jméno' },
  { key: 'company', label: 'Společnost' },
  { key: 'field', label: 'Obor / Specializace' },
  { key: 'location', label: 'Lokalita' },
  { key: 'mobile', label: 'Kontakt' },
  { key: 'email', label: 'E-mail' },
  { key: 'website', label: 'Web' },
  { key: 'address', label: 'Adresa' },
  { key: 'commission', label: 'Provize' },
  { key: 'info', label: 'Info / Popis' },
  { key: 'notes', label: 'Poznámky' },
  { key: 'assigned_to', label: 'Odpovědná osoba' },
  { key: 'next_step', label: 'Další krok' },
  { key: 'priority', label: 'Priorita' },
  { key: 'status', label: 'Stav' }
];

const VIEW_LABELS: Record<AppView, string> = {
  active: 'Aktuální přehled',
  pending: 'Ke schválení',
  archived: 'Archiv',
  future: 'Budoucí funkce',
  palettes: 'Motivy',
  chatbot: 'AI Asistent',
  calendar: 'Kalendář',
  teamchat: 'Týmový chat',
  analytics: 'Analytika'
};

const TABLE_LABELS: Record<SearchTable, string> = {
  clients: 'Klienti',
  partners: 'Partneři',
  tipers: 'Tipaři'
};

const STATUS_TO_VIEW: Record<SearchStatus, 'active' | 'pending' | 'archived'> = {
  accepted: 'active',
  pending: 'pending',
  archived: 'archived'
};

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const getRowTitle = (row: UserInterface): string => {
  const name = row.name?.trim();
  const company = row.company?.trim();
  if (name && company) {
    return `${name} (${company})`;
  }
  if (name) {
    return name;
  }
  if (company) {
    return company;
  }
  return `Záznam #${row.id}`;
};

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [viewMode, setViewMode] = useState<AppView>('active');
  const [gridSearchTarget, setGridSearchTarget] = useState<GridSearchNavigationTarget | null>(null);
  const searchIndexCacheRef = useRef<{ records: SearchableRecord[]; futureFunctions: SearchableFutureFunction[]; fetchedAt: number } | null>(null);

  // Track section visits and time spent
  useEffect(() => {
    if (isAuthenticated) {
      trackEvent('section_visit', { section: viewMode });
      trackSectionStart(viewMode);
    }
  }, [viewMode, isAuthenticated]);

  const handleViewChange = useCallback((view: AppView) => {
    setViewMode(view);
  }, []);

  const buildSearchIndex = useCallback(async (): Promise<{ records: SearchableRecord[]; futureFunctions: SearchableFutureFunction[] }> => {
    const statuses: SearchStatus[] = ['accepted', 'pending', 'archived'];
    const tables: SearchTable[] = ['clients', 'partners', 'tipers'];
    const requests = tables.flatMap((table) =>
      statuses.map(async (status) => {
        const data = await apiGet<UserInterface[]>(`/${table}?status=${status}`);
        const rows = Array.isArray(data) ? data : [];
        return rows.map((row) => ({
          table,
          viewMode: STATUS_TO_VIEW[status],
          row
        }));
      })
    );

    const [settled, ffResult] = await Promise.all([
      Promise.allSettled(requests),
      apiGet<FutureFunction[]>('/future-functions').catch(() => [] as FutureFunction[])
    ]);

    const records = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    const ffRows = Array.isArray(ffResult) ? ffResult : [];
    const futureFunctions: SearchableFutureFunction[] = ffRows.map((row) => ({
      row,
      archived: row.archived
    }));

    return { records, futureFunctions };
  }, []);

  const runGlobalSearch = useCallback(async (query: string): Promise<GlobalSearchResult[]> => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return [];
    }

    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return [];
    }

    const cacheIsFresh =
      searchIndexCacheRef.current && Date.now() - searchIndexCacheRef.current.fetchedAt < 45_000;

    if (!cacheIsFresh) {
      const { records, futureFunctions } = await buildSearchIndex();
      searchIndexCacheRef.current = { records, futureFunctions, fetchedAt: Date.now() };
    }

    const records = searchIndexCacheRef.current?.records ?? [];
    const futureFunctions = searchIndexCacheRef.current?.futureFunctions ?? [];
    const results: GlobalSearchResult[] = [];

    (Object.entries(VIEW_LABELS) as Array<[AppView, string]>).forEach(([view, label]) => {
      const target = normalizeSearchText(`${label} ${view}`);
      if (tokens.every((token) => target.includes(token))) {
        results.push({
          id: `view-${view}`,
          title: label,
          subtitle: 'Sekce aplikace',
          locationLabel: `Navigace › ${label}`,
          view
        });
      }
    });

    records.forEach(({ table, viewMode, row }) => {
      if (typeof row.id !== 'number') {
        return;
      }

      const searchableParts = SEARCH_FIELDS.map(({ key }) => {
        const value = row[key];
        if (Array.isArray(value)) {
          return value.join(' ');
        }
        return value == null ? '' : String(value);
      }).filter(Boolean);

      const aggregate = normalizeSearchText(searchableParts.join(' '));
      if (!tokens.every((token) => aggregate.includes(token))) {
        return;
      }

      SEARCH_FIELDS.forEach(({ key, label }) => {
        const fieldValue = row[key];
        const asText = Array.isArray(fieldValue)
          ? fieldValue.join(', ')
          : fieldValue == null
            ? ''
            : String(fieldValue);

        if (!asText) {
          return;
        }

        const normalizedField = normalizeSearchText(asText);
        if (!tokens.some((token) => normalizedField.includes(token))) {
          return;
        }

        const tableLabel = TABLE_LABELS[table];
        const viewLabel = VIEW_LABELS[viewMode];

        results.push({
          id: `${table}-${viewMode}-${row.id}-${String(key)}`,
          title: getRowTitle(row),
          subtitle: `${tableLabel} • ${label}`,
          matchText: asText,
          locationLabel: `${tableLabel} › ${viewLabel}`,
          view: viewMode,
          table,
          recordId: row.id
        });
      });
    });

    // Search future functions
    futureFunctions.forEach(({ row, archived }) => {
      if (typeof row.id !== 'number') {
        return;
      }

      const searchableParts = FUTURE_FUNCTION_FIELDS.map(({ key }) => {
        const value = row[key];
        return value == null ? '' : String(value);
      }).filter(Boolean);

      const aggregate = normalizeSearchText(searchableParts.join(' '));
      if (!tokens.every((token) => aggregate.includes(token))) {
        return;
      }

      FUTURE_FUNCTION_FIELDS.forEach(({ key, label }) => {
        const fieldValue = row[key];
        const asText = fieldValue == null ? '' : String(fieldValue);
        if (!asText) {
          return;
        }

        const normalizedField = normalizeSearchText(asText);
        if (!tokens.some((token) => normalizedField.includes(token))) {
          return;
        }

        const archiveLabel = archived ? ' (archiv)' : '';

        results.push({
          id: `ff-${row.id}-${String(key)}`,
          title: row.name || `Funkce #${row.id}`,
          subtitle: `Budoucí funkce • ${label}${archiveLabel}`,
          matchText: asText,
          locationLabel: `Budoucí funkce${archiveLabel}`,
          view: 'future',
          futureFunctionId: row.id
        });
      });
    });

    return results.slice(0, 120);
  }, [buildSearchIndex]);

  const handleSearchNavigate = useCallback((result: GlobalSearchResult) => {
    setViewMode(result.view);

    if (result.table && typeof result.recordId === 'number') {
      setGridSearchTarget({
        table: result.table,
        recordId: result.recordId,
        requestKey: `${Date.now()}-${result.id}`,
        viewMode: result.view as 'active' | 'pending' | 'archived'
      });
      return;
    }

    setGridSearchTarget(null);
  }, []);

  if (!isAuthenticated) {
    return <Login />;
  }

  const isFullscreenView = viewMode === 'chatbot' || viewMode === 'teamchat' || viewMode === 'calendar';

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar
        activeView={viewMode}
        onViewChange={handleViewChange}
        onGlobalSearch={runGlobalSearch}
        onSearchNavigate={handleSearchNavigate}
      />
      <div className={`main-content ${isFullscreenView ? 'main-content--fullscreen' : ''}`}>
        {(() => {
          switch (viewMode) {
            case 'active':
              return <ActiveCommissionsView searchTarget={gridSearchTarget} />;
            case 'pending':
              return <PendingApprovalsView searchTarget={gridSearchTarget} />;
            case 'archived':
              return <ArchivedCommissionsView searchTarget={gridSearchTarget} />;
            case 'future':
              return <FutureFunctionsView />;
            case 'palettes':
              return <PaletteManager />;
            case 'chatbot':
              return <ChatbotView />;
            case 'teamchat':
              return <TeamChatView />;
            case 'calendar':
              return <FullCalendarView />;
            case 'analytics':
              return <AnalyticsView />;
            default:
              return null;
          }
        })()}
      </div>
      {!isFullscreenView && <Footer />}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ThemeProvider>
        <UndoRedoProvider>
          <AppContent />
        </UndoRedoProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};

export default App;

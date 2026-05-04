import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AuthProvider,
  canAccessProjectsSystem,
  canAccessStandardSystem,
  getDefaultViewForScope,
  isViewAllowedForRole,
  isViewAllowedForScope,
  useAuth,
} from './auth/AuthContext';
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
import EntitiesSystemView from './views/EntitiesSystemView';
import AdminUsersView from './views/AdminUsersView';
import ProjectsSectionView from './views/ProjectsSectionView';
import { trackEvent, trackSectionStart } from './utils/analytics';
import type { AppView } from './types/appView';
import type { GlobalSearchResult, GridSearchNavigationTarget, SearchTable } from './types/globalSearch';
import type { UserInterface } from './usersGrid/user.interface';
import type { FutureFunction } from './futureFunctions/futureFunction.interface';
import { apiGet } from './utils/api';
import { getStoredAppView, setStoredAppView } from './utils/navigationState';
import { ActivityProvider } from './activity/ActivityContext';
import './components/Sidebar.css';

type SearchField = keyof UserInterface;
type SearchStatus = 'accepted' | 'pending' | 'archived';

type SearchableRecord = {
  table: SearchTable;
  view: AppView;
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
  analytics: 'Analytika',
  admin_users: 'Správa uživatelů',
  entities_active: 'Aktuální subjekty',
  entities_pending: 'Subjekty ke schválení',
  entities_archived: 'Archiv subjektů',
  projects_active: 'Projekty - Zakázky - Aktivní',
  projects_pending: 'Projekty - Zakázky - Ke schválení',
  projects_archived: 'Projekty - Zakázky - Archiv',
  projects_subjects_active: 'Projekty - Subjekty - Aktivní',
  projects_subjects_pending: 'Projekty - Subjekty - Ke schválení',
  projects_subjects_archived: 'Projekty - Subjekty - Archiv'
};

const TABLE_LABELS: Record<SearchTable, string> = {
  clients: 'Klienti',
  partners: 'Partneři',
  tipers: 'Tipaři',
  partner_entities: 'Subjekty - Partneři',
  client_entities: 'Subjekty - Klienti',
  tiper_entities: 'Subjekty - Tipaři'
};

const STATUS_TO_STANDARD_VIEW: Record<SearchStatus, AppView> = {
  accepted: 'active',
  pending: 'pending',
  archived: 'archived'
};

const STATUS_TO_PROJECTS_VIEW: Record<SearchStatus, AppView> = {
  accepted: 'projects_active',
  pending: 'projects_pending',
  archived: 'projects_archived'
};

const STATUS_TO_ENTITIES_VIEW: Record<SearchStatus, AppView> = {
  accepted: 'entities_active',
  pending: 'entities_pending',
  archived: 'entities_archived'
};

const STATUS_TO_PROJECTS_SUBJECTS_VIEW: Record<SearchStatus, AppView> = {
  accepted: 'projects_subjects_active',
  pending: 'projects_subjects_active',
  archived: 'projects_subjects_archived'
};

const getGridViewFromAppView = (view: AppView): 'active' | 'pending' | 'archived' => {
  switch (view) {
    case 'pending':
    case 'projects_pending':
    case 'projects_subjects_pending':
    case 'entities_pending':
      return 'pending';
    case 'archived':
    case 'projects_archived':
    case 'projects_subjects_archived':
    case 'entities_archived':
      return 'archived';
    default:
      return 'active';
  }
};

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

// Normalize raw entity API response (first_name/last_name/company_name/phone) → UserInterface shape
const normalizeEntityRow = (raw: Record<string, unknown>): UserInterface => {
  const firstName = typeof raw.first_name === 'string' ? raw.first_name : '';
  const lastName = typeof raw.last_name === 'string' ? raw.last_name : '';
  const companyName = typeof raw.company_name === 'string' ? raw.company_name : '';
  const entityId = typeof raw.entity_id === 'string' ? raw.entity_id : '';
  const nameParts = [firstName, lastName].filter(Boolean).join(' ').trim();
  return {
    id: raw.id as number,
    name: nameParts || companyName || entityId,
    company: companyName,
    location: typeof raw.location === 'string' ? raw.location : '',
    mobile: typeof raw.phone === 'string' ? raw.phone : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    website: typeof raw.website === 'string' ? raw.website : '',
    field: typeof raw.field === 'string' ? raw.field : '',
    info: typeof raw.info === 'string' ? raw.info : '',
    assigned_to: typeof raw.assigned_to === 'string' ? raw.assigned_to : '',
    status: typeof raw.status === 'string' ? raw.status : '',
  } as UserInterface;
};

// Normalize raw projects commission API response → UserInterface shape
const normalizeProjectCommissionRow = (raw: Record<string, unknown>): UserInterface => {
  const firstName = typeof raw.entity_first_name === 'string' ? raw.entity_first_name : '';
  const lastName = typeof raw.entity_last_name === 'string' ? raw.entity_last_name : '';
  const companyName = typeof raw.entity_company_name === 'string' ? raw.entity_company_name : '';
  const commissionId = typeof raw.commission_id === 'string' ? raw.commission_id : '';
  const nameParts = [firstName, lastName].filter(Boolean).join(' ').trim();
  return {
    id: raw.id as number,
    commission_id: commissionId,
    name: nameParts || companyName || commissionId,
    company: companyName,
    location: (typeof raw.location === 'string' ? raw.location : '') || (typeof raw.entity_location === 'string' ? raw.entity_location : ''),
    mobile: typeof raw.phone === 'string' ? raw.phone : '',
    email: typeof raw.entity_email === 'string' ? raw.entity_email : '',
    website: typeof raw.entity_website === 'string' ? raw.entity_website : '',
    field: (typeof raw.field === 'string' ? raw.field : '') || (typeof raw.entity_field === 'string' ? raw.entity_field : ''),
    info: typeof raw.entity_info === 'string' ? raw.entity_info : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    assigned_to: typeof raw.assigned_to === 'string' ? raw.assigned_to : '',
    priority: typeof raw.priority === 'string' ? raw.priority : '',
    status: typeof raw.status === 'string' ? raw.status : '',
    commission: typeof raw.commission_value === 'string' ? raw.commission_value : '',
  } as UserInterface;
};

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
  const { isAuthenticated, user } = useAuth();
  const [viewMode, setViewMode] = useState<AppView>(() => getStoredAppView('active'));
  const [gridSearchTarget, setGridSearchTarget] = useState<GridSearchNavigationTarget | null>(null);
  const searchIndexCacheRef = useRef<{ records: SearchableRecord[]; futureFunctions: SearchableFutureFunction[]; fetchedAt: number } | null>(null);
  const accessScope = user?.accessScope;
  const isAdmin = user?.role === 'admin';
  const isViewAllowed = useCallback((view: AppView) => {
    if (!isViewAllowedForRole(user?.role, view)) {
      return false;
    }
    return isViewAllowedForScope(accessScope, view);
  }, [accessScope, user?.role]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    setStoredAppView(viewMode);
  }, [isAuthenticated, viewMode]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (isViewAllowed(viewMode)) {
      return;
    }

    setGridSearchTarget(null);
    setViewMode(getDefaultViewForScope(accessScope));
  }, [accessScope, isAuthenticated, isViewAllowed, viewMode]);

  useEffect(() => {
    searchIndexCacheRef.current = null;
  }, [accessScope]);

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
    const searchSources: Array<{
      table: SearchTable;
      endpoint: (status: SearchStatus) => string;
      view: (status: SearchStatus) => AppView;
      normalize?: (row: Record<string, unknown>) => UserInterface;
    }> = [];

    if (canAccessStandardSystem(accessScope)) {
      searchSources.push(
        { table: 'clients', endpoint: (status) => `/clients?status=${status}`, view: (status) => STATUS_TO_STANDARD_VIEW[status] },
        { table: 'partners', endpoint: (status) => `/partners?status=${status}`, view: (status) => STATUS_TO_STANDARD_VIEW[status] },
        { table: 'tipers', endpoint: (status) => `/tipers?status=${status}`, view: (status) => STATUS_TO_STANDARD_VIEW[status] },
        { table: 'partner_entities', endpoint: (status) => `/api/partner-entities?status=${status}`, view: (status) => STATUS_TO_ENTITIES_VIEW[status], normalize: normalizeEntityRow },
        { table: 'client_entities', endpoint: (status) => `/api/client-entities?status=${status}`, view: (status) => STATUS_TO_ENTITIES_VIEW[status], normalize: normalizeEntityRow },
        { table: 'tiper_entities', endpoint: (status) => `/api/tiper-entities?status=${status}`, view: (status) => STATUS_TO_ENTITIES_VIEW[status], normalize: normalizeEntityRow }
      );
    }

    if (canAccessProjectsSystem(accessScope)) {
      searchSources.push(
        { table: 'clients', endpoint: (status) => `/api/projects/client-commissions?status=${status}`, view: (status) => STATUS_TO_PROJECTS_VIEW[status], normalize: normalizeProjectCommissionRow },
        { table: 'partners', endpoint: (status) => `/api/projects/partner-commissions?status=${status}`, view: (status) => STATUS_TO_PROJECTS_VIEW[status], normalize: normalizeProjectCommissionRow },
        { table: 'tipers', endpoint: (status) => `/api/projects/tiper-commissions?status=${status}`, view: (status) => STATUS_TO_PROJECTS_VIEW[status], normalize: normalizeProjectCommissionRow },
        { table: 'partner_entities', endpoint: (status) => `/api/projects/partner-entities?status=${status}`, view: (status) => STATUS_TO_PROJECTS_SUBJECTS_VIEW[status], normalize: normalizeEntityRow },
        { table: 'client_entities', endpoint: (status) => `/api/projects/client-entities?status=${status}`, view: (status) => STATUS_TO_PROJECTS_SUBJECTS_VIEW[status], normalize: normalizeEntityRow },
        { table: 'tiper_entities', endpoint: (status) => `/api/projects/tiper-entities?status=${status}`, view: (status) => STATUS_TO_PROJECTS_SUBJECTS_VIEW[status], normalize: normalizeEntityRow }
      );
    }

    const requests = searchSources.flatMap((source) =>
      statuses.map(async (status) => {
        const data = await apiGet<Record<string, unknown>[]>(source.endpoint(status));
        const rows = Array.isArray(data) ? data : [];
        return rows.map((row) => ({
          table: source.table,
          view: source.view(status),
          row: source.normalize ? source.normalize(row) : (row as unknown as UserInterface)
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
  }, [accessScope]);

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
      if (!isViewAllowed(view)) {
        return;
      }

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

    records.forEach(({ table, view, row }) => {
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
        const viewLabel = VIEW_LABELS[view];

        results.push({
          id: `${table}-${view}-${row.id}-${String(key)}`,
          title: getRowTitle(row),
          subtitle: `${tableLabel} • ${label}`,
          matchText: asText,
          locationLabel: `${tableLabel} › ${viewLabel}`,
          view,
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
  }, [accessScope, buildSearchIndex, isViewAllowed]);

  const handleSearchNavigate = useCallback((result: GlobalSearchResult) => {
    setViewMode(result.view);

    if (result.table && typeof result.recordId === 'number') {
      setGridSearchTarget({
        table: result.table,
        recordId: result.recordId,
        requestKey: `${Date.now()}-${result.id}`,
        viewMode: getGridViewFromAppView(result.view)
      });
      return;
    }

    setGridSearchTarget(null);
  }, []);

  if (!isAuthenticated) {
    return <Login />;
  }

  const isFullscreenView = viewMode === 'chatbot' || viewMode === 'teamchat' || viewMode === 'calendar';
  const isTableScrollView = [
    'active',
    'pending',
    'archived',
    'future',
    'entities_active',
    'entities_pending',
    'entities_archived',
    'projects_active',
    'projects_pending',
    'projects_archived',
    'projects_subjects_active',
    'projects_subjects_pending',
    'projects_subjects_archived'
  ].includes(viewMode);
  const mainContentClassName = [
    'main-content',
    isFullscreenView ? 'main-content--fullscreen' : '',
    isTableScrollView ? 'main-content--table-scroll' : ''
  ].filter(Boolean).join(' ');

  return (
    <ActivityProvider userId={user?.id} accessScope={accessScope} isAdmin={isAdmin} activeView={viewMode}>
      <div style={{ display: 'flex' }}>
        <Sidebar
          activeView={viewMode}
          onViewChange={handleViewChange}
          onGlobalSearch={runGlobalSearch}
          onSearchNavigate={handleSearchNavigate}
        />
        <div className={mainContentClassName}>
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
              case 'admin_users':
                return <AdminUsersView />;
              case 'entities_active':
                return <EntitiesSystemView viewMode="active" searchTarget={gridSearchTarget} />;
              case 'entities_pending':
                return <EntitiesSystemView viewMode="pending" searchTarget={gridSearchTarget} />;
              case 'entities_archived':
                return <EntitiesSystemView viewMode="archived" searchTarget={gridSearchTarget} />;
              case 'projects_active':
              case 'projects_pending':
              case 'projects_archived':
                return <ProjectsSectionView kind="commissions" activeView={viewMode} onViewChange={handleViewChange} searchTarget={gridSearchTarget} />;
              case 'projects_subjects_active':
              case 'projects_subjects_pending':
              case 'projects_subjects_archived':
                return <ProjectsSectionView kind="subjects" activeView={viewMode} onViewChange={handleViewChange} searchTarget={gridSearchTarget} />;
              default:
                return null;
            }
          })()}
        </div>
        {!isFullscreenView && <Footer />}
      </div>
    </ActivityProvider>
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

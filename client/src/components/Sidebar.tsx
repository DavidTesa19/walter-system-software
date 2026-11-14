import {
  Activity, Briefcase, CalendarDays, ChartNoAxesColumnIncreasing, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck,
  Crown, ExternalLink, Files, Flag, Globe, Lightbulb, Lock, LogOut, MessagesSquare, Palette, ShieldCheck, Sparkles,
  SquareCheckBig, SquarePen, UserCog, UsersRound, Wallet,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { canAccessGrowthSystem, canAccessProjectsSystem, canAccessStandardSystem, isViewAllowedForRole, useAuth } from '../auth/AuthContext';
import ActivityIndicator from '../activity/ActivityIndicator';
import ActivityConfirmAllButton from '../activity/ActivityConfirmAllButton';
import { useActivity } from '../activity/ActivityContext';
import { buildCollectionKeysForSystem } from '../activity/activityKeys';
import { trackEvent } from '../utils/analytics';
import type { AppView } from '../types/appView';
import type { GlobalSearchResult } from '../types/globalSearch';
import WssLogo from '../assets/WssLogo';
import ThemeToggleButton from './ThemeToggleButton';
import InstallAppButton from './InstallAppButton';
import { openHelp } from '../help/openHelp';
import ZoomControl from '../zoom/ZoomControl';
import { BUTTON_ICON } from '../ui/icons';
import './Sidebar.css';

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onGlobalSearch: (query: string) => Promise<GlobalSearchResult[]>;
  onSearchNavigate: (result: GlobalSearchResult, options?: { openProfile?: boolean }) => void;
  /** Phones: the sidebar is a drawer, open when this is true (App.tsx). */
  mobileOpen?: boolean;
}

type SidebarGroupItem = {
  id: AppView;
  label: string;
  icon: React.ReactNode;
  activeViews?: AppView[];
  countViews?: AppView[];
  // Collection keys to mark seen when this item's "confirm all" control is
  // clicked — every table, every grid view (active/pending/archived) it
  // represents, so the bubble clears regardless of which one is on screen.
  confirmKeys?: string[];
};

// Small checkmark button shown next to a bubble count, so a whole table,
// group, or the entire app can be confirmed ("mark as seen") in one click
// without having to open every view that has something unseen in it.
const SidebarConfirmButton: React.FC<{ count: number; label: string; onConfirm: () => void }> = ({
  count,
  label,
  onConfirm,
}) => {
  if (count <= 0) {
    return null;
  }

  return (
    <button
      type="button"
      className="sidebar-confirm-btn"
      onClick={(event) => {
        event.stopPropagation();
        onConfirm();
      }}
      title={`Potvrdit vše: ${label}`}
      aria-label={`Potvrdit vše: ${label}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </button>
  );
};

type SidebarGroup = {
  id: string;
  label: string;
  icon: React.ReactNode;
  // Subjekty and Zakázky of the section, each one table screen.
  items: SidebarGroupItem[];
};

// The menu below the sections: blocks under a heading. A collapsible block's
// heading folds it away (remembered per device); the one holding the open
// screen always opens.
type SidebarBlock = {
  id: 'work' | 'analysis' | 'admin' | 'more';
  label: string;
  collapsible: boolean;
  items: SidebarGroupItem[];
};

// Lucide icons (lucide-react), one size and stroke for the whole menu.
const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;
const Icons = {
  Growth: () => <Crown {...ICON} />,
  Public: () => <Globe {...ICON} />,
  Private: () => <Lock {...ICON} />,
  Subjects: () => <UsersRound {...ICON} />,
  Commissions: () => <Briefcase {...ICON} />,
  Calendar: () => <CalendarDays {...ICON} />,
  TeamChat: () => <MessagesSquare {...ICON} />,
  Jarvis: () => <Sparkles {...ICON} />,
  Future: () => <Lightbulb {...ICON} />,
  Palettes: () => <Palette {...ICON} />,
  Analytics: () => <Activity {...ICON} />,
  DataQuality: () => <ClipboardCheck {...ICON} />,
  Pipeline: () => <ChartNoAxesColumnIncreasing {...ICON} />,
  Finance: () => <Wallet {...ICON} />,
  Documents: () => <Files {...ICON} />,
  Users: () => <UserCog {...ICON} />,
  Tasks: () => <SquareCheckBig {...ICON} />,
  Bug: () => <Flag {...ICON} />,
  Help: () => <CircleHelp {...ICON} />,
  Safety: () => <ShieldCheck {...ICON} />,
  Form: () => <SquarePen {...ICON} />,
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manažer',
  salesman: 'Obchodník',
  viewer: 'Jen čtení',
};
const SCOPE_LABELS: Record<string, string> = {
  all: 'všechny sekce',
  standard: 'Veřejné',
  projects: 'Neveřejné',
  growth: 'Growth Club',
};

const initialsOf = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

// Growth Club, Veřejné and Neveřejné open one at a time (an accordion): all
// three open made the menu long and hard to scan.
const MAJOR_GROUPS = ['growth', 'general', 'projects'];
const MAJOR_GROUP_VIEWS: Record<string, AppView[]> = {
  general: ['active', 'pending', 'archived', 'entities_active', 'entities_pending', 'entities_archived'],
  projects: ['projects_active', 'projects_pending', 'projects_archived', 'projects_subjects_active', 'projects_subjects_pending', 'projects_subjects_archived'],
  growth: ['growth_active', 'growth_pending', 'growth_archived', 'growth_subjects_active', 'growth_subjects_pending', 'growth_subjects_archived'],
};

const BLOCKS_KEY = 'walterSidebar.blocks';
const DEFAULT_BLOCKS: Record<string, boolean> = { analysis: false, admin: false, more: false };

const readBlocks = (): Record<string, boolean> => {
  try {
    const stored = JSON.parse(localStorage.getItem(BLOCKS_KEY) ?? '{}');
    return { ...DEFAULT_BLOCKS, ...(stored && typeof stored === 'object' ? stored : {}) };
  } catch {
    return { ...DEFAULT_BLOCKS };
  }
};

const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  mobileOpen = false
}) => {
  const { user, logout } = useAuth();
  const { getViewCount, markCollectionsSeen } = useActivity();
  const accessScope = user?.accessScope;
  const userRole = user?.role;
  const canAccessStandard = canAccessStandardSystem(accessScope);
  const canAccessProjects = canAccessProjectsSystem(accessScope);
  const canAccessGrowth = canAccessGrowthSystem(accessScope);

  const [openGroup, setOpenGroup] = useState<string | null>(
    () => MAJOR_GROUPS.find((id) => MAJOR_GROUP_VIEWS[id].includes(activeView)) ?? null
  );
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>(readBlocks);

  const toggleGroup = (groupId: string) => setOpenGroup((current) => (current === groupId ? null : groupId));
  const setBlockOpen = (blockId: string, open: boolean) =>
    setOpenBlocks((current) => {
      if (current[blockId] === open) return current;
      const next = { ...current, [blockId]: open };
      try {
        localStorage.setItem(BLOCKS_KEY, JSON.stringify(next));
      } catch {
        // Remembering the menu is a convenience only.
      }
      return next;
    });

  const sidebarGroups: SidebarGroup[] = [
    {
      id: 'growth',
      label: 'Growth Club',
      icon: <Icons.Growth />,
      items: [
        {
          id: 'growth_subjects_active',
          label: 'Subjekty',
          icon: <Icons.Subjects />,
          activeViews: ['growth_subjects_active', 'growth_subjects_pending', 'growth_subjects_archived'],
          countViews: ['growth_subjects_active', 'growth_subjects_pending', 'growth_subjects_archived'],
          confirmKeys: buildCollectionKeysForSystem('growth', 'subjects')
        },
        {
          id: 'growth_active',
          label: 'Zakázky',
          icon: <Icons.Commissions />,
          activeViews: ['growth_active', 'growth_pending', 'growth_archived'],
          countViews: ['growth_active', 'growth_pending', 'growth_archived'],
          confirmKeys: buildCollectionKeysForSystem('growth', 'commissions')
        }
      ]
    },
    {
      id: 'general',
      label: 'Veřejné',
      icon: <Icons.Public />,
      items: [
        {
          id: 'entities_active',
          label: 'Subjekty',
          icon: <Icons.Subjects />,
          activeViews: ['entities_active', 'entities_pending', 'entities_archived'],
          countViews: ['entities_active', 'entities_pending', 'entities_archived'],
          confirmKeys: buildCollectionKeysForSystem('standard', 'subjects')
        },
        {
          id: 'active',
          label: 'Zakázky',
          icon: <Icons.Commissions />,
          activeViews: ['active', 'pending', 'archived'],
          countViews: ['active', 'pending', 'archived'],
          confirmKeys: buildCollectionKeysForSystem('standard', 'commissions')
        }
      ]
    },
    {
      id: 'projects',
      label: 'Neveřejné',
      icon: <Icons.Private />,
      items: [
        {
          id: 'projects_subjects_active',
          label: 'Subjekty',
          icon: <Icons.Subjects />,
          activeViews: ['projects_subjects_active', 'projects_subjects_pending', 'projects_subjects_archived'],
          countViews: ['projects_subjects_active', 'projects_subjects_pending', 'projects_subjects_archived'],
          confirmKeys: buildCollectionKeysForSystem('projects', 'subjects')
        },
        {
          id: 'projects_active',
          label: 'Zakázky',
          icon: <Icons.Commissions />,
          activeViews: ['projects_active', 'projects_pending', 'projects_archived'],
          countViews: ['projects_active', 'projects_pending', 'projects_archived'],
          confirmKeys: buildCollectionKeysForSystem('projects', 'commissions')
        }
      ]
    }
  ];

  const sidebarBlocks: SidebarBlock[] = [
    {
      id: 'work',
      label: 'Práce',
      collapsible: false,
      items: [
        { id: 'jarvis', label: 'Jarvis', icon: <Icons.Jarvis /> },
        { id: 'calendar', label: 'Kalendář', icon: <Icons.Calendar /> },
        { id: 'tasks', label: 'Úkoly', icon: <Icons.Tasks /> },
        { id: 'teamchat', label: 'Týmový chat', icon: <Icons.TeamChat /> },
      ],
    },
    {
      id: 'analysis',
      label: 'Analýza',
      collapsible: true,
      items: [
        { id: 'pipeline', label: 'Analytika zakázek', icon: <Icons.Pipeline /> },
        { id: 'data_quality', label: 'Kvalita dat', icon: <Icons.DataQuality /> },
        { id: 'finance', label: 'Finance', icon: <Icons.Finance /> },
        { id: 'documents', label: 'Dokumenty', icon: <Icons.Documents /> },
        { id: 'analytics', label: 'Ostatní', icon: <Icons.Analytics /> },
      ],
    },
    {
      id: 'admin',
      label: 'Správa',
      collapsible: true,
      items: [
        { id: 'admin_users', label: 'Správa uživatelů', icon: <Icons.Users /> },
        { id: 'safety', label: 'Bezpečnost a zálohy', icon: <Icons.Safety /> },
      ],
    },
    {
      id: 'more',
      label: 'Další',
      collapsible: true,
      items: [
        { id: 'future', label: 'Budoucí funkce', icon: <Icons.Future /> },
        { id: 'bugs', label: 'Hlášení chyb', icon: <Icons.Bug /> },
        { id: 'palettes', label: 'Motivy', icon: <Icons.Palettes /> },
        { id: 'help', label: 'Nápověda', icon: <Icons.Help /> },
      ],
    },
  ];

  const visibleSidebarGroups = sidebarGroups.filter((group) => {
    if (group.id === 'general') return canAccessStandard;
    if (group.id === 'projects') return canAccessProjects;
    if (group.id === 'growth') return canAccessGrowth;
    return true;
  });

  const visibleBlocks = sidebarBlocks
    .map((block) => ({ ...block, items: block.items.filter((item) => isViewAllowedForRole(userRole, item.id)) }))
    // "Další" always shows: the public form link lives there.
    .filter((block) => block.items.length > 0 || block.id === 'more');

  // The section and block holding the open screen open by themselves.
  useEffect(() => {
    const group = MAJOR_GROUPS.find((id) => MAJOR_GROUP_VIEWS[id].includes(activeView));
    if (group) setOpenGroup(group);
    const block = sidebarBlocks.find((candidate) => candidate.collapsible && candidate.items.some((item) => item.id === activeView));
    if (block) setBlockOpen(block.id, true);
    // sidebarBlocks is rebuilt every render; only the screen matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  const isItemActive = (item: SidebarGroupItem) => (item.activeViews ?? [item.id]).includes(activeView);
  const getItemCount = (item: SidebarGroupItem) => (item.countViews ?? [item.id]).reduce((sum, view) => sum + getViewCount(view), 0);
  const getGroupCount = (group: SidebarGroup) => group.items.reduce((sum, item) => sum + getItemCount(item), 0);

  // Collection keys backing each level's "confirm all" control — a table (all
  // three grid views), a whole section, or, flattened across every visible
  // section, the entire app.
  const getItemConfirmKeys = (item: SidebarGroupItem) => item.confirmKeys ?? [];
  const getGroupConfirmKeys = (group: SidebarGroup) => group.items.flatMap(getItemConfirmKeys);
  const globalUnseenCount = visibleSidebarGroups.reduce((sum, group) => sum + getGroupCount(group), 0);
  const globalConfirmKeys = visibleSidebarGroups.flatMap(getGroupConfirmKeys);

  const renderItem = (item: SidebarGroupItem, className = '') => (
    <button
      key={item.id}
      type="button"
      className={`sidebar-button ${className} ${isItemActive(item) ? 'active' : ''}`}
      onClick={() => onViewChange(item.id)}
      aria-current={isItemActive(item) ? 'page' : undefined}
    >
      {item.icon}
      <span>{item.label}</span>
      <ActivityIndicator count={getItemCount(item)} muted={isItemActive(item)} title="Nepřečtené změny" />
    </button>
  );

  return (
    <div className={`sidebar${mobileOpen ? ' sidebar--open' : ''}`}>
      <div className="sidebar-header">
        <WssLogo className="sidebar-brand-logo" />
      </div>
      <nav className="sidebar-nav">
        {/* Search lives in the top bar (Ctrl/⌘+K, SearchPalette), not here. */}
        {globalUnseenCount > 0 && (
          <div className="sidebar-confirm-everything">
            <ActivityConfirmAllButton
              count={globalUnseenCount}
              onConfirm={() => markCollectionsSeen(globalConfirmKeys)}
            />
          </div>
        )}

        {visibleSidebarGroups.length > 0 && <div className="sidebar-heading">Sekce</div>}
        {visibleSidebarGroups.map((group) => {
          const expanded = openGroup === group.id;
          const containsActive = group.items.some(isItemActive);
          return (
            <div key={group.id} className="sidebar-group sidebar-group--major">
              <div className="sidebar-row">
                <button
                  type="button"
                  className={`sidebar-group-header ${expanded ? 'expanded' : ''} ${!expanded && containsActive ? 'has-active' : ''}`}
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={expanded}
                >
                  <div className="group-header-content">
                    {group.icon}
                    <span className="group-label">{group.label}</span>
                    <ActivityIndicator count={getGroupCount(group)} muted={expanded} title="Nepřečtené změny" />
                  </div>
                  <span className="group-chevron">
                    {expanded ? <ChevronDown size={15} strokeWidth={2} aria-hidden /> : <ChevronRight size={15} strokeWidth={2} aria-hidden />}
                  </span>
                </button>
                <SidebarConfirmButton
                  count={getGroupCount(group)}
                  label={group.label}
                  onConfirm={() => markCollectionsSeen(getGroupConfirmKeys(group))}
                />
              </div>

              {expanded && (
                <div className="sidebar-group-content">
                  {group.items.map((item) => (
                    <div key={item.id} className="sidebar-row">
                      {renderItem(item, 'sidebar-button--leaf')}
                      <SidebarConfirmButton
                        count={getItemCount(item)}
                        label={`${group.label} › ${item.label}`}
                        onConfirm={() => markCollectionsSeen(getItemConfirmKeys(item))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {visibleBlocks.map((block) => {
          const open = !block.collapsible || Boolean(openBlocks[block.id]);
          const containsActive = block.items.some(isItemActive);
          return (
            <div key={block.id} className={`sidebar-block sidebar-block--${block.id}`}>
              {block.collapsible ? (
                <button
                  type="button"
                  className={`sidebar-heading sidebar-heading--toggle${!open && containsActive ? ' has-active' : ''}`}
                  onClick={() => setBlockOpen(block.id, !open)}
                  aria-expanded={open}
                >
                  <span>{block.label}</span>
                  {open ? <ChevronDown size={13} strokeWidth={2.2} aria-hidden /> : <ChevronRight size={13} strokeWidth={2.2} aria-hidden />}
                </button>
              ) : (
                <div className="sidebar-heading">{block.label}</div>
              )}
              {open && (
                <div className="sidebar-block-items">
                  {block.items.map((item) => renderItem(item, item.id === 'jarvis' ? 'sidebar-button--jarvis' : ''))}
                  {block.id === 'more' && (
                    <a
                      href="https://form.waltersystem.cz"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sidebar-button sidebar-link"
                      onClick={() => trackEvent('form_link_click', { source: 'app' })}
                    >
                      <Icons.Form />
                      <span>Veřejný formulář</span>
                      <ExternalLink size={13} strokeWidth={2} aria-hidden className="sidebar-link-icon" />
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <InstallAppButton />
        {/* Phones have no footer bar: the theme switch lives here instead. */}
        <ThemeToggleButton variant="footer" className="sidebar-mobile-theme" />
        {/* …and so does the app zoom (also a two-finger pinch, appZoom.ts). */}
        <div className="sidebar-mobile-zoom">
          <ZoomControl />
        </div>
        {user && (
          <div className="sidebar-account">
            <span className="sidebar-avatar" aria-hidden="true">{initialsOf(user.username)}</span>
            <div className="user-info">
              <span className="user-name">{user.username}</span>
              <span className="user-role">
                {`${ROLE_LABELS[user.role] ?? user.role} · ${SCOPE_LABELS[user.accessScope] ?? user.accessScope}`}
              </span>
            </div>
            <button
              type="button"
              className="sidebar-help-button"
              onClick={openHelp}
              title="Nápověda k této obrazovce (?)"
              aria-label="Nápověda"
            >
              <CircleHelp {...BUTTON_ICON} />
            </button>
            <button
              type="button"
              className="sidebar-help-button sidebar-logout-button"
              onClick={logout}
              title="Odhlásit se"
              aria-label="Odhlásit se"
            >
              <LogOut {...BUTTON_ICON} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;

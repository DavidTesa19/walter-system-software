import {
  Archive, Bot, Briefcase, CalendarDays, Activity, ChartNoAxesColumnIncreasing, ChartPie, ChevronDown, ChevronRight, CircleHelp, ClipboardCheck,
  Crown, Ellipsis, Files, Flag, Globe, Hourglass, LayoutGrid, Lightbulb, ListChecks, Lock, MessagesSquare, Palette,
  ShieldCheck, SquareCheckBig, UserCog, UsersRound, Wallet,
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

type SidebarSection = {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: SidebarGroupItem[];
};

type SidebarGroup = {
  id: string;
  label: string;
  icon: React.ReactNode;
  sections: SidebarSection[];
};

type SidebarSingleItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: SidebarGroupItem[];
};

// Icons components for cleaner code
// Lucide icons (lucide-react), one size and stroke for the whole menu.
const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;
const Icons = {
  Tables: () => <LayoutGrid {...ICON} />,
  Growth: () => <Crown {...ICON} />,
  Public: () => <Globe {...ICON} />,
  Private: () => <Lock {...ICON} />,
  Subjects: () => <UsersRound {...ICON} />,
  Commissions: () => <Briefcase {...ICON} />,
  Active: () => <ListChecks {...ICON} />,
  Pending: () => <Hourglass {...ICON} />,
  Archived: () => <Archive {...ICON} />,
  Calendar: () => <CalendarDays {...ICON} />,
  TeamChat: () => <MessagesSquare {...ICON} />,
  Other: () => <Ellipsis {...ICON} />,
  Future: () => <Lightbulb {...ICON} />,
  Chatbot: () => <Bot {...ICON} />,
  Palettes: () => <Palette {...ICON} />,
  Analytics: () => <Activity {...ICON} />,
  Analysis: () => <ChartPie {...ICON} />,
  DataQuality: () => <ClipboardCheck {...ICON} />,
  Pipeline: () => <ChartNoAxesColumnIncreasing {...ICON} />,
  Finance: () => <Wallet {...ICON} />,
  Documents: () => <Files {...ICON} />,
  Users: () => <UserCog {...ICON} />,
  Tasks: () => <SquareCheckBig {...ICON} />,
  Bug: () => <Flag {...ICON} />,
  Help: () => <CircleHelp {...ICON} />,
  Safety: () => <ShieldCheck {...ICON} />,
  ChevronDown: () => <ChevronDown size={16} strokeWidth={2} aria-hidden />,
  ChevronRight: () => <ChevronRight size={16} strokeWidth={2} aria-hidden />,
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
  
  // State for expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    general: false,
    projects: false,
    growth: false,
    general_subjects: true,
    general_commissions: true,
    projects_subjects: true,
    projects_commissions: true,
    growth_subjects: true,
    growth_commissions: true,
    calendar: true,
    teamchat: true,
    tasks: true,
    other: false
  });

  // Growth Club, Veřejné and Neveřejné open one at a time (an accordion):
  // all three open made the menu long and hard to scan.
  const MAJOR_GROUPS = ['growth', 'general', 'projects'];
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const opening = !prev[groupId];
      const next = { ...prev, [groupId]: opening };
      if (opening && MAJOR_GROUPS.includes(groupId)) {
        MAJOR_GROUPS.filter(id => id !== groupId).forEach(id => {
          next[id] = false;
        });
      }
      return next;
    });
  };

  // Ensure the group containing the active view is expanded
  useEffect(() => {
    const groups = [
      {
        id: 'general',
        views: ['active', 'pending', 'archived', 'entities_active', 'entities_pending', 'entities_archived'],
        sections: [
          { id: 'general_subjects', views: ['entities_active', 'entities_pending', 'entities_archived'] },
          { id: 'general_commissions', views: ['active', 'pending', 'archived'] }
        ]
      },
      {
        id: 'projects',
        views: ['projects_active', 'projects_pending', 'projects_archived', 'projects_subjects_active', 'projects_subjects_pending', 'projects_subjects_archived'],
        sections: [
          { id: 'projects_subjects', views: ['projects_subjects_active', 'projects_subjects_pending', 'projects_subjects_archived'] },
          { id: 'projects_commissions', views: ['projects_active', 'projects_pending', 'projects_archived'] }
        ]
      },
      {
        id: 'growth',
        views: ['growth_active', 'growth_pending', 'growth_archived', 'growth_subjects_active', 'growth_subjects_pending', 'growth_subjects_archived'],
        sections: [
          { id: 'growth_subjects', views: ['growth_subjects_active', 'growth_subjects_pending', 'growth_subjects_archived'] },
          { id: 'growth_commissions', views: ['growth_active', 'growth_pending', 'growth_archived'] }
        ]
      },
      { id: 'calendar', views: ['calendar'] },
      { id: 'teamchat', views: ['teamchat'] },
      { id: 'tasks', views: ['tasks'] },
      { id: 'analysis', views: ['pipeline', 'data_quality', 'finance', 'documents', 'analytics'] },
      { id: 'other', views: ['future', 'bugs', 'chatbot', 'palettes', 'admin_users', 'safety', 'help'] }
    ];

    const activeGroup = groups.find(g => g.views.includes(activeView as string));
    if (activeGroup && !expandedGroups[activeGroup.id]) {
      setExpandedGroups(prev => {
        const next = { ...prev, [activeGroup.id]: true };
        if (MAJOR_GROUPS.includes(activeGroup.id)) {
          MAJOR_GROUPS.filter(id => id !== activeGroup.id).forEach(id => {
            next[id] = false;
          });
        }
        return next;
      });
    }

    const activeSection = groups
      .flatMap(group => group.sections ?? [])
      .find(section => section.views.includes(activeView as string));

    if (activeSection && !expandedGroups[activeSection.id]) {
      setExpandedGroups(prev => ({
        ...prev,
        [activeSection.id]: true
      }));
    }
  }, [activeView]);




  const sidebarGroups: SidebarGroup[] = [
    {
      id: 'growth',
      label: 'Growth Club',
      icon: <Icons.Growth />,
      sections: [
        {
          id: 'growth_subjects',
          label: 'Subjekty',
          icon: <Icons.Subjects />,
          items: [
            {
              id: 'growth_subjects_active',
              label: 'Subjekty',
              icon: <Icons.Subjects />,
              activeViews: ['growth_subjects_active', 'growth_subjects_pending', 'growth_subjects_archived'],
              countViews: ['growth_subjects_active', 'growth_subjects_pending', 'growth_subjects_archived'],
              confirmKeys: buildCollectionKeysForSystem('growth', 'subjects')
            }
          ]
        },
        {
          id: 'growth_commissions',
          label: 'Zakázky',
          icon: <Icons.Commissions />,
          items: [
            {
              id: 'growth_active',
              label: 'Zakázky',
              icon: <Icons.Commissions />,
              activeViews: ['growth_active', 'growth_pending', 'growth_archived'],
              countViews: ['growth_active', 'growth_pending', 'growth_archived'],
              confirmKeys: buildCollectionKeysForSystem('growth', 'commissions')
            }
          ]
        }
      ]
    },
    {
      id: 'general',
      label: 'Veřejné',
      icon: <Icons.Public />,
      sections: [
        {
          id: 'general_subjects',
          label: 'Subjekty',
          icon: <Icons.Subjects />,
          items: [
            {
              id: 'entities_active',
              label: 'Subjekty',
              icon: <Icons.Subjects />,
              activeViews: ['entities_active', 'entities_pending', 'entities_archived'],
              countViews: ['entities_active', 'entities_pending', 'entities_archived'],
              confirmKeys: buildCollectionKeysForSystem('standard', 'subjects')
            }
          ]
        },
        {
          id: 'general_commissions',
          label: 'Zakázky',
          icon: <Icons.Commissions />,
          items: [
            {
              id: 'active',
              label: 'Zakázky',
              icon: <Icons.Commissions />,
              activeViews: ['active', 'pending', 'archived'],
              countViews: ['active', 'pending', 'archived'],
              confirmKeys: buildCollectionKeysForSystem('standard', 'commissions')
            }
          ]
        }
      ]
    },
    {
      id: 'projects',
      label: 'Neveřejné',
      icon: <Icons.Private />,
      sections: [
        {
          id: 'projects_subjects',
          label: 'Subjekty',
          icon: <Icons.Subjects />,
          items: [
            {
              id: 'projects_subjects_active',
              label: 'Subjekty',
              icon: <Icons.Subjects />,
              activeViews: ['projects_subjects_active', 'projects_subjects_pending', 'projects_subjects_archived'],
              countViews: ['projects_subjects_active', 'projects_subjects_pending', 'projects_subjects_archived'],
              confirmKeys: buildCollectionKeysForSystem('projects', 'subjects')
            }
          ]
        },
        {
          id: 'projects_commissions',
          label: 'Zakázky',
          icon: <Icons.Commissions />,
          items: [
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
      ]
    }
  ];

  const WORK_ITEMS = ['calendar', 'tasks', 'teamchat'];
  const sidebarSingleItems: SidebarSingleItem[] = [
    {
      id: 'calendar',
      label: 'Kalendář',
      icon: <Icons.Calendar />,
      items: [{ id: 'calendar', label: 'Kalendář', icon: <Icons.Calendar /> }]
    },
    {
      id: 'tasks',
      label: 'Úkoly',
      icon: <Icons.Tasks />,
      items: [{ id: 'tasks', label: 'Úkoly', icon: <Icons.Tasks /> }]
    },
    {
      id: 'teamchat',
      label: 'Týmový chat',
      icon: <Icons.TeamChat />,
      items: [{ id: 'teamchat', label: 'Týmový chat', icon: <Icons.TeamChat /> }]
    },
    {
      id: 'analysis',
      label: 'Analýza',
      icon: <Icons.Analysis />,
      items: [
        { id: 'pipeline', label: 'Analytika zakázek', icon: <Icons.Pipeline /> },
        { id: 'data_quality', label: 'Kvalita dat', icon: <Icons.DataQuality /> },
        { id: 'finance', label: 'Finance', icon: <Icons.Finance /> },
        { id: 'documents', label: 'Dokumenty', icon: <Icons.Documents /> },
        { id: 'analytics', label: 'Ostatní', icon: <Icons.Analytics /> }
      ]
    },
    {
      id: 'other',
      label: 'Ostatní',
      icon: <Icons.Other />,
      items: [
        { id: 'future', label: 'Budoucí funkce', icon: <Icons.Future /> },
        { id: 'bugs', label: 'Hlášení chyb', icon: <Icons.Bug /> },
        { id: 'chatbot', label: 'AI Asistent', icon: <Icons.Chatbot /> },
        { id: 'palettes', label: 'Motivy', icon: <Icons.Palettes /> },
        { id: 'admin_users', label: 'Správa uživatelů', icon: <Icons.Users /> },
        { id: 'safety', label: 'Bezpečnost a zálohy', icon: <Icons.Safety /> },
        { id: 'help', label: 'Nápověda', icon: <Icons.Help /> }
      ]
    }
  ];

  const visibleSidebarGroups = sidebarGroups
    .map((group) => ({
      ...group,
      sections: group.sections.filter((section) => section.items.length > 0)
    }))
    .filter((group) => {
      if (group.sections.length === 0) {
        return false;
      }

      if (group.id === 'general') {
        return canAccessStandard;
      }

      if (group.id === 'projects') {
        return canAccessProjects;
      }

      if (group.id === 'growth') {
        return canAccessGrowth;
      }

      return true;
    });

  const visibleSidebarSingleItems = sidebarSingleItems
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        return isViewAllowedForRole(userRole, item.id as import('../types/appView').AppView);
      })
    }))
    .filter((group) => group.items.length > 0);

  const isItemActive = (item: SidebarGroupItem) => (item.activeViews ?? [item.id]).includes(activeView);
  const getItemCount = (item: SidebarGroupItem) => (item.countViews ?? [item.id]).reduce((sum, view) => sum + getViewCount(view), 0);
  const getSectionCount = (section: SidebarSection) => section.items.reduce((sum, item) => sum + getItemCount(item), 0);
  const getGroupCount = (group: SidebarGroup) => group.sections.reduce((sum, section) => sum + getSectionCount(section), 0);
  const getSingleGroupCount = (group: SidebarSingleItem) => group.items.reduce((sum, item) => sum + getItemCount(item), 0);

  // Collection keys backing each level's "confirm all" control — a table (all
  // three grid views), a whole section/group (every table it contains), or,
  // flattened across every visible group, the entire app.
  const getItemConfirmKeys = (item: SidebarGroupItem) => item.confirmKeys ?? [];
  const getSectionConfirmKeys = (section: SidebarSection) => section.items.flatMap(getItemConfirmKeys);
  const getGroupConfirmKeys = (group: SidebarGroup) => group.sections.flatMap(getSectionConfirmKeys);
  const globalUnseenCount = visibleSidebarGroups.reduce((sum, group) => sum + getGroupCount(group), 0);
  const globalConfirmKeys = visibleSidebarGroups.flatMap(getGroupConfirmKeys);

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
        {visibleSidebarGroups.map(group => (
          <div key={group.id} className="sidebar-group sidebar-group--major">
            <div className="sidebar-row">
              <button
                className={`sidebar-group-header ${expandedGroups[group.id] ? 'expanded' : ''}`}
                onClick={() => toggleGroup(group.id)}
              >
                <div className="group-header-content">
                  {group.icon}
                  <span className="group-label">{group.label}</span>
                  <ActivityIndicator count={getGroupCount(group)} muted={expandedGroups[group.id]} title="Nepřečtené změny" />
                </div>
                <span className="group-chevron">
                  {expandedGroups[group.id] ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                </span>
              </button>
              <SidebarConfirmButton
                count={getGroupCount(group)}
                label={group.label}
                onConfirm={() => markCollectionsSeen(getGroupConfirmKeys(group))}
              />
            </div>

            {expandedGroups[group.id] && (
              <div className="sidebar-group-content sidebar-group-content--sections">
                {group.sections.map(section => {
                  const isSingleSectionItem =
                    section.items.length === 1 && section.items[0].label === section.label;

                  if (isSingleSectionItem) {
                    const item = section.items[0];
                    return (
                      <div key={section.id} className="sidebar-row">
                        <button
                          className={`sidebar-button sidebar-button--leaf ${isItemActive(item) ? 'active' : ''}`}
                          onClick={() => onViewChange(item.id)}
                        >
                          {section.icon}
                          <span>{section.label}</span>
                          <ActivityIndicator count={getItemCount(item)} muted={isItemActive(item)} title="Nepřečtené změny" />
                        </button>
                        <SidebarConfirmButton
                          count={getItemCount(item)}
                          label={section.label}
                          onConfirm={() => markCollectionsSeen(getItemConfirmKeys(item))}
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={section.id} className="sidebar-section">
                      <div className="sidebar-row">
                        <button
                          className={`sidebar-section-header ${expandedGroups[section.id] ? 'expanded' : ''}`}
                          onClick={() => toggleGroup(section.id)}
                        >
                          <div className="group-header-content">
                            {section.icon}
                            <span className="group-label">{section.label}</span>
                            <ActivityIndicator count={getSectionCount(section)} muted={expandedGroups[section.id]} title="Nepřečtené změny" />
                          </div>
                          <span className="group-chevron">
                            {expandedGroups[section.id] ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                          </span>
                        </button>
                        <SidebarConfirmButton
                          count={getSectionCount(section)}
                          label={section.label}
                          onConfirm={() => markCollectionsSeen(getSectionConfirmKeys(section))}
                        />
                      </div>

                      {expandedGroups[section.id] && (
                        <div className="sidebar-section-content">
                          {section.items.map(item => (
                            <div key={item.id} className="sidebar-row">
                              <button
                                className={`sidebar-button sidebar-button--leaf ${isItemActive(item) ? 'active' : ''}`}
                                onClick={() => onViewChange(item.id)}
                              >
                                {item.icon}
                                <span>{item.label}</span>
                                <ActivityIndicator count={getItemCount(item)} muted={isItemActive(item)} title="Nepřečtené změny" />
                              </button>
                              <SidebarConfirmButton
                                count={getItemCount(item)}
                                label={item.label}
                                onConfirm={() => markCollectionsSeen(getItemConfirmKeys(item))}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {visibleSidebarSingleItems.map((group, index) => {
          const isSingleItem = group.items.length === 1 && group.items[0].id === group.id;
          // "Práce" before the first everyday screen, "Další" before the rest.
          const block = WORK_ITEMS.includes(group.id) ? 'Práce' : 'Další';
          const previous = visibleSidebarSingleItems[index - 1];
          const heading =
            !previous || (WORK_ITEMS.includes(previous.id) ? 'Práce' : 'Další') !== block ? (
              <div key={`heading-${block}`} className="sidebar-heading">{block}</div>
            ) : null;
          const rendered = (() => {

          if (isSingleItem) {
            const item = group.items[0];
            return (
              <button
                key={item.id}
                className={`sidebar-button ${isItemActive(item) ? 'active' : ''}`}
                onClick={() => onViewChange(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
                <ActivityIndicator count={getItemCount(item)} muted={isItemActive(item)} title="Nepřečtené změny" />
              </button>
            );
          }

          return (
            <div key={group.id} className="sidebar-group">
              <button
                className={`sidebar-group-header ${expandedGroups[group.id] ? 'expanded' : ''}`}
                onClick={() => toggleGroup(group.id)}
              >
                <div className="group-header-content">
                  {group.icon}
                  <span className="group-label">{group.label}</span>
                  <ActivityIndicator count={getSingleGroupCount(group)} muted={expandedGroups[group.id]} title="Nepřečtené změny" />
                </div>
                <span className="group-chevron">
                  {expandedGroups[group.id] ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                </span>
              </button>

              {expandedGroups[group.id] && (
                <div className="sidebar-group-content">
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      className={`sidebar-button sub-item ${isItemActive(item) ? 'active' : ''}`}
                      onClick={() => onViewChange(item.id)}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      <ActivityIndicator count={getItemCount(item)} muted={isItemActive(item)} title="Nepřečtené změny" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
          })();
          return (
            <React.Fragment key={group.id}>
              {heading}
              {rendered}
            </React.Fragment>
          );
        })}

        <div className="sidebar-separator"></div>






        <a
          href="https://form.waltersystem.cz"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-button sidebar-link"
          onClick={() => trackEvent('form_link_click', { source: 'app' })}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          <span>Veřejný formulář</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginLeft: 'auto' }}
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
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
            <div className="user-info">
              <span className="user-name">{user.username}</span>
              <span className="user-role">{`${user.role} • ${user.accessScope}`}</span>
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
          </div>
        )}
        <button
          className="sidebar-button logout-button"
          onClick={logout}
          title="Odhlásit se"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Odhlásit se</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

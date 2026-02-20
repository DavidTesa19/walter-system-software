import React, { useState, useEffect } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../auth/AuthContext';
import { trackEvent } from '../utils/analytics';
import type { AppView } from '../types/appView';
import './Sidebar.css';

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

type SidebarGroupItem = {
  id: AppView;
  label: string;
  icon: React.ReactNode;
};

type SidebarGroup = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  items: SidebarGroupItem[];
};

// Icons components for cleaner code
const Icons = {
  Tables: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <clipPath id="clip0_tables">
            <rect width="24" height="24" fill="white"/>
        </clipPath>
      </defs>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9"></line>
      <line x1="9" y1="21" x2="9" y2="9"></line>
    </svg>
  ),
  Active: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"></polyline>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
    </svg>
  ),
  Pending: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  ),
  Archived: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8"></polyline>
      <rect x="1" y="3" width="22" height="5"></rect>
      <line x1="10" y1="12" x2="14" y2="12"></line>
    </svg>
  ),
  Calendar: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  ),
  TeamChat: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  ),
  Other: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"></circle>
      <circle cx="19" cy="12" r="1"></circle>
      <circle cx="5" cy="12" r="1"></circle>
    </svg>
  ),
  Future: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="10" height="4" rx="1"></rect>
      <rect x="4" y="10" width="12" height="4" rx="1"></rect>
      <rect x="4" y="16" width="16" height="4" rx="1"></rect>
      <circle cx="18" cy="6" r="1"></circle>
      <circle cx="20" cy="18" r="1"></circle>
    </svg>
  ),
  Chatbot: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2-2z"></path>
    </svg>
  ),
  Palettes: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21c4.97 0 9-3.04 9-7 0-4-4.5-7-9-7S3 10 3 14c0 1.38.56 2.63 1.5 3.68.43.48.51 1.18.19 1.74l-.75 1.32a1 1 0 0 0 1.4 1.4l1.32-.75c.56-.32 1.26-.24 1.74.19A8.93 8.93 0 0 0 12 21Z" />
      <circle cx="8.5" cy="11.5" r="1.5" />
      <circle cx="12" cy="7" r="1.5" />
      <circle cx="15.5" cy="11.5" r="1.5" />
    </svg>
  ),
  Analytics: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Moon: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    </svg>
  ),
  Sun: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  )
};

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  
  // State for expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    tables: true,
    calendar: true,
    teamchat: true,
    other: true
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Ensure the group containing the active view is expanded
  useEffect(() => {
    const groups = [
      { id: 'tables', views: ['active', 'pending', 'archived'] },
      { id: 'calendar', views: ['calendar'] },
      { id: 'teamchat', views: ['teamchat'] },
      { id: 'other', views: ['future', 'chatbot', 'palettes', 'analytics'] }
    ];

    const activeGroup = groups.find(g => g.views.includes(activeView as string));
    if (activeGroup && !expandedGroups[activeGroup.id]) {
        setExpandedGroups(prev => ({
            ...prev,
            [activeGroup.id]: true
        }));
    }
  }, [activeView]);

  const sidebarGroups: SidebarGroup[] = [
    {
      id: 'tables',
      label: 'Tabulky',
      icon: <Icons.Tables />,
      items: [
        { id: 'active', label: 'Aktuální přehled', icon: <Icons.Active /> },
        { id: 'pending', label: 'Ke schválení', icon: <Icons.Pending /> },
        { id: 'archived', label: 'Archiv', icon: <Icons.Archived /> }
      ]
    },
    {
      id: 'calendar',
      label: 'Kalendář',
      icon: <Icons.Calendar />,
      items: [
        { id: 'calendar', label: 'Kalendář', icon: <Icons.Calendar /> }
      ]
    },
    {
      id: 'teamchat',
      label: 'Týmový chat',
      icon: <Icons.TeamChat />,
      items: [
        { id: 'teamchat', label: 'Týmový chat', icon: <Icons.TeamChat /> }
      ]
    },
    {
      id: 'other',
      label: 'Ostatní',
      icon: <Icons.Other />,
      items: [
        { id: 'future', label: 'Budoucí funkce', icon: <Icons.Future /> },
        { id: 'chatbot', label: 'AI Asistent', icon: <Icons.Chatbot /> },
        { id: 'palettes', label: 'Motivy', icon: <Icons.Palettes /> },
        { id: 'analytics', label: 'Analytika', icon: <Icons.Analytics /> }
      ]
    }
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Walter System</h2>
      </div>
      <nav className="sidebar-nav">
        {sidebarGroups.map(group => {
            const isSingleItem = group.items.length === 1 && group.items[0].id === group.id;

            if (isSingleItem) {
                const item = group.items[0];
                return (
                    <button
                        key={item.id}
                        className={`sidebar-button ${activeView === item.id ? 'active' : ''}`}
                        onClick={() => onViewChange(item.id)}
                    >
                        {item.icon}
                        <span>{item.label}</span>
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
                                    className={`sidebar-button sub-item ${activeView === item.id ? 'active' : ''}`}
                                    onClick={() => onViewChange(item.id)}
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            );
        })}

        <div className="sidebar-separator"></div>






        <button
          className="sidebar-button theme-toggle"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Přepínání na tmavý režim' : 'Přepínání na světlý režim'}
        >
          {theme === 'light' ? (
            <>
              <Icons.Moon />
              <span>Tmavý režim</span>
            </>
          ) : (
            <>
              <Icons.Sun />
              <span>Světlý režim</span>
            </>
          )}
        </button>
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
        {user && (
          <div className="user-info">
            <span className="user-name">{user.username}</span>
            <span className="user-role">{user.role}</span>
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

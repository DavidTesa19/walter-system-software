import React from 'react';
import './Sidebar.css';

interface SidebarProps {
  activeView: 'active' | 'pending';
  onViewChange: (view: 'active' | 'pending') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Walter System</h2>
      </div>
      <nav className="sidebar-nav">
        <button
          className={`sidebar-button ${activeView === 'active' ? 'active' : ''}`}
          onClick={() => onViewChange('active')}
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
            <polyline points="9 11 12 14 22 4"></polyline>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
          <span>Active Collaborations</span>
        </button>
        <button
          className={`sidebar-button ${activeView === 'pending' ? 'active' : ''}`}
          onClick={() => onViewChange('pending')}
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
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>Pending Approval</span>
        </button>
      </nav>
    </div>
  );
};

export default Sidebar;

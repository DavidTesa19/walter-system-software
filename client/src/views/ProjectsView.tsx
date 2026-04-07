import React, { useEffect, useState } from 'react';
import EntitiesSystemView from '../entitiesSystem/EntitiesSystemView';
import type { GridSearchNavigationTarget } from '../types/globalSearch';
import type { GridView } from '../types/appView';
import UsersGrid from '../usersGrid/UsersGrid';
import {
  PROJECTS_COMMISSIONS_TABLE_STORAGE_KEY,
  PROJECTS_SUBJECTS_TABLE_STORAGE_KEY
} from '../utils/tableViewState';
import './ProjectsView.css';

type ProjectsSubsection = 'subjects' | 'commissions';

const PROJECTS_SUBSECTION_STORAGE_KEY = 'walterProjects.activeSubsection';

const VIEW_LABELS: Record<GridView, string> = {
  active: 'Aktivní',
  pending: 'Ke schválení',
  archived: 'Archiv'
};

const getStoredProjectsSubsection = (): ProjectsSubsection => {
  try {
    const storedValue = localStorage.getItem(PROJECTS_SUBSECTION_STORAGE_KEY);
    return storedValue === 'subjects' || storedValue === 'commissions' ? storedValue : 'subjects';
  } catch {
    return 'subjects';
  }
};

const setStoredProjectsSubsection = (section: ProjectsSubsection) => {
  try {
    localStorage.setItem(PROJECTS_SUBSECTION_STORAGE_KEY, section);
  } catch {
    // Ignore storage access errors.
  }
};

interface ProjectsViewProps {
  viewMode: GridView;
  searchTarget?: GridSearchNavigationTarget | null;
}

const ProjectsView: React.FC<ProjectsViewProps> = ({ viewMode, searchTarget }) => {
  const [activeSubsection, setActiveSubsection] = useState<ProjectsSubsection>(() => getStoredProjectsSubsection());

  useEffect(() => {
    setStoredProjectsSubsection(activeSubsection);
  }, [activeSubsection]);

  useEffect(() => {
    if (searchTarget) {
      setActiveSubsection('commissions');
    }
  }, [searchTarget]);

  const titleSuffix = VIEW_LABELS[viewMode];

  return (
    <div className="projects-view">
      <div className="projects-view__subsections">
        <button
          type="button"
          className={`projects-view__subsection-btn ${activeSubsection === 'subjects' ? 'active' : ''}`}
          onClick={() => setActiveSubsection('subjects')}
        >
          Subjekty
        </button>
        <button
          type="button"
          className={`projects-view__subsection-btn ${activeSubsection === 'commissions' ? 'active' : ''}`}
          onClick={() => setActiveSubsection('commissions')}
        >
          Komise
        </button>
      </div>

      {activeSubsection === 'subjects' ? (
        <EntitiesSystemView
          viewMode={viewMode}
          systemNamespace="projects"
          storageKey={PROJECTS_SUBJECTS_TABLE_STORAGE_KEY}
          title={`Projects - Subjekty - ${titleSuffix}`}
        />
      ) : (
        <UsersGrid
          viewMode={viewMode}
          searchTarget={searchTarget}
          systemNamespace="projects"
          storageKey={PROJECTS_COMMISSIONS_TABLE_STORAGE_KEY}
          title={`Projects - Komise - ${titleSuffix}`}
        />
      )}
    </div>
  );
};

export default ProjectsView;
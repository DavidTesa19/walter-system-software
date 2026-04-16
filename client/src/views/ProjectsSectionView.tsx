import React, { useCallback, useEffect, useMemo, useState } from "react";
import EntitiesSystemView from "../entitiesSystem/EntitiesSystemView";
import type { AppView, GridView } from "../types/appView";
import type { GridSearchNavigationTarget, SearchTable } from "../types/globalSearch";
import { apiGet } from "../utils/api";
import {
  PROJECTS_COMMISSIONS_TABLE_STORAGE_KEY,
  PROJECTS_SUBJECTS_TABLE_STORAGE_KEY,
} from "../utils/tableViewState";
import UsersGrid from "../usersGrid/UsersGrid";
import { useUndoRedo } from "../utils/undoRedo";
import "./ProjectsSectionView.css";

type ProjectsSectionKind = "subjects" | "commissions";
type ProjectStatus = "accepted" | "pending" | "archived";
type ProjectActiveStatusView = "active" | "pending";

type SummaryEntry = {
  key: ProjectStatus;
  label: string;
  count: number;
  color: string;
  viewMode: GridView;
  interactive: boolean;
};

interface ProjectsSectionViewProps {
  kind: ProjectsSectionKind;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  searchTarget?: GridSearchNavigationTarget | null;
}

const PROJECT_TABLES: SearchTable[] = ["clients", "partners", "tipers"];

const SECTION_STORAGE_KEYS: Record<ProjectsSectionKind, string> = {
  subjects: "walterProjectsSubjects.lastActiveStatusView",
  commissions: "walterProjectsCommissions.lastActiveStatusView",
};

const STATUS_META: Record<ProjectStatus, { label: string; color: string }> = {
  accepted: { label: "Schváleno", color: "#84cc16" },
  pending: { label: "Ke schválení", color: "#f59e0b" },
  archived: { label: "Archiv", color: "#64748b" },
};

const getStoredLastActiveStatus = (kind: ProjectsSectionKind): ProjectActiveStatusView => {
  try {
    const value = localStorage.getItem(SECTION_STORAGE_KEYS[kind]);
    return value === "pending" ? "pending" : "active";
  } catch {
    return "active";
  }
};

const setStoredLastActiveStatus = (
  kind: ProjectsSectionKind,
  viewMode: ProjectActiveStatusView
): void => {
  try {
    localStorage.setItem(SECTION_STORAGE_KEYS[kind], viewMode);
  } catch {
    // Ignore storage access errors.
  }
};

const getProjectsRouteForView = (
  kind: ProjectsSectionKind,
  viewMode: GridView | ProjectActiveStatusView
): AppView => {
  if (kind === "subjects") {
    return viewMode === "archived" ? "projects_subjects_archived" : "projects_subjects_active";
  }

  if (viewMode === "archived") {
    return "projects_archived";
  }

  return viewMode === "pending" ? "projects_pending" : "projects_active";
};

const getGridViewFromRoute = (kind: ProjectsSectionKind, activeView: AppView): GridView => {
  if (kind === "subjects") {
    return activeView === "projects_subjects_archived" ? "archived" : "active";
  }

  if (activeView === "projects_archived") {
    return "archived";
  }

  if (activeView === "projects_pending") {
    return "pending";
  }

  return "active";
};

const getProjectsEndpoint = (
  kind: ProjectsSectionKind,
  table: SearchTable,
  status: ProjectStatus
): string => {
  const resourceName = table.slice(0, -1);
  const suffix = kind === "subjects" ? "entities" : "commissions";
  return `/api/projects/${resourceName}-${suffix}?status=${status}`;
};

const ProjectsSectionView: React.FC<ProjectsSectionViewProps> = ({
  kind,
  activeView,
  onViewChange,
  searchTarget,
}) => {
  const isCommissionsSection = kind === "commissions";
  const { signal } = useUndoRedo();
  const currentGridView = useMemo(() => getGridViewFromRoute(kind, activeView), [activeView, kind]);
  const [lastActiveStatusView, setLastActiveStatusView] = useState<ProjectActiveStatusView>(() =>
    getStoredLastActiveStatus(kind)
  );
  const [summaryCounts, setSummaryCounts] = useState<Record<ProjectStatus, number>>({
    accepted: 0,
    pending: 0,
    archived: 0,
  });

  useEffect(() => {
    if (kind === "subjects" && activeView === "projects_subjects_pending") {
      onViewChange("projects_subjects_active");
    }
  }, [activeView, kind, onViewChange]);

  useEffect(() => {
    if (!isCommissionsSection || currentGridView === "archived") {
      return;
    }

    const nextView = currentGridView === "pending" ? "pending" : "active";
    setLastActiveStatusView(nextView);
    setStoredLastActiveStatus(kind, nextView);
  }, [currentGridView, isCommissionsSection, kind]);

  const fetchSummaryCounts = useCallback(async () => {
    const requests = PROJECT_TABLES.flatMap((table) =>
      (["accepted", "pending", "archived"] as ProjectStatus[]).map(async (status) => {
        const data = await apiGet<unknown[]>(getProjectsEndpoint(kind, table, status));
        return {
          status,
          count: Array.isArray(data) ? data.length : 0,
        };
      })
    );

    const settled = await Promise.allSettled(requests);
    const nextCounts: Record<ProjectStatus, number> = {
      accepted: 0,
      pending: 0,
      archived: 0,
    };

    settled.forEach((result) => {
      if (result.status !== "fulfilled") {
        return;
      }

      nextCounts[result.value.status] += result.value.count;
    });

    setSummaryCounts(nextCounts);
  }, [kind]);

  useEffect(() => {
    void fetchSummaryCounts();
  }, [fetchSummaryCounts, currentGridView, signal.revision]);

  const handleShowActive = useCallback(() => {
    const nextView = isCommissionsSection ? lastActiveStatusView : "active";
    onViewChange(getProjectsRouteForView(kind, nextView));
  }, [isCommissionsSection, kind, lastActiveStatusView, onViewChange]);

  const handleShowArchive = useCallback(() => {
    onViewChange(getProjectsRouteForView(kind, "archived"));
  }, [kind, onViewChange]);

  const handleSelectStatusView = useCallback(
    (entry: SummaryEntry) => {
      if (!entry.interactive) {
        return;
      }

      if (entry.viewMode === "archived") {
        handleShowArchive();
        return;
      }

      if (entry.viewMode === "pending") {
        setLastActiveStatusView("pending");
        setStoredLastActiveStatus(kind, "pending");
      } else {
        setLastActiveStatusView("active");
        setStoredLastActiveStatus(kind, "active");
      }

      onViewChange(getProjectsRouteForView(kind, entry.viewMode));
    },
    [handleShowArchive, kind, onViewChange]
  );

  const summaryRows = useMemo(
    () => [
      {
        label: "Aktivní",
        total: summaryCounts.accepted + summaryCounts.pending,
        entries: [
          {
            key: "accepted" as const,
            label: STATUS_META.accepted.label,
            count: summaryCounts.accepted,
            color: STATUS_META.accepted.color,
            viewMode: "active" as const,
            interactive: true,
          },
          {
            key: "pending" as const,
            label: STATUS_META.pending.label,
            count: summaryCounts.pending,
            color: STATUS_META.pending.color,
            viewMode: "pending" as const,
            interactive: isCommissionsSection,
          },
        ].filter((entry) => entry.count > 0),
      },
      {
        label: "Archiv",
        total: summaryCounts.archived,
        entries: summaryCounts.archived > 0
          ? [
              {
                key: "archived" as const,
                label: STATUS_META.archived.label,
                count: summaryCounts.archived,
                color: STATUS_META.archived.color,
                viewMode: "archived" as const,
                interactive: true,
              },
            ]
          : [],
      },
    ],
    [isCommissionsSection, summaryCounts]
  );

  const title = kind === "subjects" ? "Projekty - Subjekty" : "Projekty - Zakázky";

  return (
    <div className="projects-section-view">
      <div className="projects-section-view__mode-bar">
        <div className="navigation-tabs projects-section-view__mode-tabs">
          <button
            type="button"
            className={`nav-tab${currentGridView !== "archived" ? " active" : ""}`}
            onClick={handleShowActive}
          >
            📋 Aktivní
          </button>
          <button
            type="button"
            className={`nav-tab${currentGridView === "archived" ? " active" : ""}`}
            onClick={handleShowArchive}
          >
            📦 Archiv
          </button>
        </div>
      </div>

      <div className="projects-section-view__summary" aria-label={`${title} přehled stavů`}>
        {summaryRows.map(({ label, total, entries }) => (
          <div key={label} className="projects-section-view__summary-row">
            <span className="projects-section-view__summary-label">
              {label} ({total})
            </span>
            {entries.map((entry) => {
              const isActiveEntry = currentGridView === entry.viewMode;
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={[
                    "projects-section-view__status-chip",
                    isActiveEntry ? "projects-section-view__status-chip--active" : "",
                    entry.interactive ? "" : "projects-section-view__status-chip--disabled",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleSelectStatusView(entry)}
                  disabled={!entry.interactive}
                >
                  <span
                    className="projects-section-view__status-dot"
                    style={{ backgroundColor: entry.color }}
                    aria-hidden="true"
                  />
                  {entry.label}: {entry.count}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {kind === "subjects" ? (
        <EntitiesSystemView
          viewMode={currentGridView === "archived" ? "archived" : "active"}
          systemNamespace="projects"
          storageKey={PROJECTS_SUBJECTS_TABLE_STORAGE_KEY}
          title={title}
        />
      ) : (
        <UsersGrid
          viewMode={currentGridView}
          searchTarget={searchTarget}
          systemNamespace="projects"
          storageKey={PROJECTS_COMMISSIONS_TABLE_STORAGE_KEY}
          title={title}
        />
      )}
    </div>
  );
};

export default ProjectsSectionView;
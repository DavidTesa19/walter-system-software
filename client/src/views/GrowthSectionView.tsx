import React, { useCallback } from "react";
import EntitiesSystemView from "../entitiesSystem/EntitiesSystemView";
import UsersGrid from "../usersGrid/UsersGrid";
import type { AppView, GridView } from "../types/appView";
import type { GridSearchNavigationTarget } from "../types/globalSearch";
import {
  GROWTH_COMMISSIONS_TABLE_STORAGE_KEY,
  GROWTH_SUBJECTS_TABLE_STORAGE_KEY,
} from "../utils/tableViewState";
import { getGeneralViewFor } from "./sectionToggle";
import { useAuth, canAccessStandardSystem, canAccessGrowthSystem } from "../auth/AuthContext";
import "./GrowthSectionView.css";

type GrowthSectionKind = "subjects" | "commissions";

interface GrowthSectionViewProps {
  kind: GrowthSectionKind;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  searchTarget?: GridSearchNavigationTarget | null;
}

const ROUTES: Record<GrowthSectionKind, Record<GridView, AppView>> = {
  subjects: {
    active: "growth_subjects_active",
    pending: "growth_subjects_pending",
    archived: "growth_subjects_archived",
  },
  commissions: {
    active: "growth_active",
    pending: "growth_pending",
    archived: "growth_archived",
  },
};

const getGridViewFromRoute = (kind: GrowthSectionKind, activeView: AppView): GridView => {
  if (kind === "subjects") {
    if (activeView === "growth_subjects_pending") return "pending";
    if (activeView === "growth_subjects_archived") return "archived";
    return "active";
  }

  if (activeView === "growth_pending") return "pending";
  if (activeView === "growth_archived") return "archived";
  return "active";
};

const MODE_TABS: Array<{ key: GridView; label: string; icon: string }> = [
  { key: "active", label: "Aktivní", icon: "📋" },
  { key: "pending", label: "Ke schválení", icon: "⏳" },
  { key: "archived", label: "Archiv", icon: "📦" },
];

const GrowthSectionView: React.FC<GrowthSectionViewProps> = ({
  kind,
  activeView,
  onViewChange,
  searchTarget,
}) => {
  const { user } = useAuth();
  const currentGridView = getGridViewFromRoute(kind, activeView);
  const canToggleSection = canAccessStandardSystem(user?.accessScope) && canAccessGrowthSystem(user?.accessScope);

  const handleSelect = useCallback(
    (view: GridView) => {
      onViewChange(ROUTES[kind][view]);
    },
    [kind, onViewChange]
  );

  const handleSwitchToGeneral = useCallback(() => {
    onViewChange(getGeneralViewFor(kind, currentGridView));
  }, [kind, currentGridView, onViewChange]);

  return (
    <div className="growth-section-view">
      <div className="growth-section-view__mode-bar">
        <div className="navigation-tabs growth-section-view__mode-tabs">
          {MODE_TABS.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              className={`nav-tab${currentGridView === key ? " active" : ""}`}
              onClick={() => handleSelect(key)}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        {canToggleSection ? (
          <button
            type="button"
            className="section-toggle-btn"
            onClick={handleSwitchToGeneral}
            title="Přepnout na Veřejné, se stejným výběrem tabulky a filtru"
            aria-label="Přepnout na Veřejné"
          >
            🌐
          </button>
        ) : null}
      </div>

      {kind === "subjects" ? (
        <EntitiesSystemView
          viewMode={currentGridView}
          systemNamespace="growth"
          storageKey={GROWTH_SUBJECTS_TABLE_STORAGE_KEY}
          title="Growth Club - Subjekty"
          searchTarget={searchTarget}
        />
      ) : (
        <UsersGrid
          viewMode={currentGridView}
          searchTarget={searchTarget}
          systemNamespace="growth"
          storageKey={GROWTH_COMMISSIONS_TABLE_STORAGE_KEY}
          title="Growth Club - Zakázky"
        />
      )}
    </div>
  );
};

export default GrowthSectionView;

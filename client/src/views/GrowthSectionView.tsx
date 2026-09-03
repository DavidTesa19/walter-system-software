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
import ActivityIndicator from "../activity/ActivityIndicator";
import { useActivity } from "../activity/ActivityContext";
import { ACTIVITY_TABLES, buildCommissionsCollectionKey, buildSubjectsCollectionKey } from "../activity/activityKeys";
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
  const { getCollectionCount } = useActivity();
  const currentGridView = getGridViewFromRoute(kind, activeView);
  const canToggleSection = canAccessStandardSystem(user?.accessScope) && canAccessGrowthSystem(user?.accessScope);

  // Unseen count for a whole mode tab (Aktivní / Ke schválení / Archiv), summed
  // across Klienti/Partneři/Tipaři — otherwise a change sitting in "Ke
  // schválení" or "Archiv" is invisible until the user happens to click over.
  const getModeCount = useCallback(
    (view: GridView) =>
      ACTIVITY_TABLES.reduce(
        (sum, table) =>
          sum +
          getCollectionCount(
            kind === "subjects"
              ? buildSubjectsCollectionKey("growth", view, table)
              : buildCommissionsCollectionKey("growth", view, table)
          ),
        0
      ),
    [getCollectionCount, kind]
  );

  const handleSelect = useCallback(
    (view: GridView) => {
      onViewChange(ROUTES[kind][view]);
    },
    [kind, onViewChange]
  );

  const handleSwitchToGeneral = useCallback(() => {
    onViewChange(getGeneralViewFor(kind, currentGridView));
  }, [kind, currentGridView, onViewChange]);

  const sectionToggle = canToggleSection ? (
    <button
      type="button"
      className="section-toggle-btn"
      onClick={handleSwitchToGeneral}
      title="Přepnout na Veřejné, se stejným výběrem tabulky a filtru"
      aria-label="Přepnout na Veřejné"
    >
      🌐
    </button>
  ) : null;

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
              <span className="nav-tab__content">
                <span>{icon} {label}</span>
                <ActivityIndicator count={getModeCount(key)} muted={currentGridView === key} title="Nepřečtené změny" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {kind === "subjects" ? (
        <EntitiesSystemView
          viewMode={currentGridView}
          systemNamespace="growth"
          storageKey={GROWTH_SUBJECTS_TABLE_STORAGE_KEY}
          title="Growth Club - Subjekty"
          searchTarget={searchTarget}
          sectionToggle={sectionToggle}
        />
      ) : (
        <UsersGrid
          viewMode={currentGridView}
          searchTarget={searchTarget}
          systemNamespace="growth"
          storageKey={GROWTH_COMMISSIONS_TABLE_STORAGE_KEY}
          title="Growth Club - Zakázky"
          sectionToggle={sectionToggle}
        />
      )}
    </div>
  );
};

export default GrowthSectionView;

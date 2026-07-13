import React, { useCallback } from "react";
import EntitiesSystemView from "../entitiesSystem/EntitiesSystemView";
import UsersGrid from "../usersGrid/UsersGrid";
import type { AppView, GridView } from "../types/appView";
import type { GridSearchNavigationTarget } from "../types/globalSearch";
import { getGrowthViewFor } from "./sectionToggle";
import { useAuth, canAccessStandardSystem, canAccessGrowthSystem } from "../auth/AuthContext";
import "./GeneralSectionView.css";

type GeneralSectionKind = "subjects" | "commissions";

interface GeneralSectionViewProps {
  kind: GeneralSectionKind;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  searchTarget?: GridSearchNavigationTarget | null;
}

const ROUTES: Record<GeneralSectionKind, Record<GridView, AppView>> = {
  subjects: {
    active: "entities_active",
    pending: "entities_pending",
    archived: "entities_archived",
  },
  commissions: {
    active: "active",
    pending: "pending",
    archived: "archived",
  },
};

const getGridViewFromRoute = (kind: GeneralSectionKind, activeView: AppView): GridView => {
  if (kind === "subjects") {
    if (activeView === "entities_pending") return "pending";
    if (activeView === "entities_archived") return "archived";
    return "active";
  }

  if (activeView === "pending") return "pending";
  if (activeView === "archived") return "archived";
  return "active";
};

const MODE_TABS: Array<{ key: GridView; label: string; icon: string }> = [
  { key: "active", label: "Aktivní", icon: "📋" },
  { key: "pending", label: "Ke schválení", icon: "⏳" },
  { key: "archived", label: "Archiv", icon: "📦" },
];

const GeneralSectionView: React.FC<GeneralSectionViewProps> = ({
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

  const handleSwitchToGrowth = useCallback(() => {
    onViewChange(getGrowthViewFor(kind, currentGridView));
  }, [kind, currentGridView, onViewChange]);

  return (
    <div className="general-section-view">
      <div className="general-section-view__mode-bar">
        <div className="navigation-tabs general-section-view__mode-tabs">
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
            onClick={handleSwitchToGrowth}
            title="Přepnout na Growth Club, se stejným výběrem tabulky a filtru"
          >
            🚀 Přepnout na Growth Club
          </button>
        ) : null}
      </div>

      {kind === "subjects" ? (
        <EntitiesSystemView viewMode={currentGridView} searchTarget={searchTarget} />
      ) : (
        <UsersGrid viewMode={currentGridView} searchTarget={searchTarget} />
      )}
    </div>
  );
};

export default GeneralSectionView;

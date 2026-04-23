import "ag-grid-community/styles/ag-theme-quartz.css";
import "./UsersGrid.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import ActivityIndicator from "../activity/ActivityIndicator";
import { useActivity } from "../activity/ActivityContext";
import { buildCommissionsCollectionKey, getActivitySystem } from "../activity/activityKeys";
import type { GridView } from "../types/appView";
import type { GridSearchNavigationTarget } from "../types/globalSearch";
import ClientsSectionNew from "./sections/ClientsSectionNew";
import PartnersSectionNew from "./sections/PartnersSectionNew";
import TipersSectionNew from "./sections/TipersSectionNew";
import type { AddHandler } from "./sections/SectionTypes";
import { useUndoRedo } from "../utils/undoRedo";
import {
  getStoredTableView,
  setStoredTableView,
  USERS_GRID_TABLE_STORAGE_KEY,
  type SubjectTableType
} from "../utils/tableViewState";

ModuleRegistry.registerModules([AllCommunityModule]);

type TableType = SubjectTableType;

interface UsersGridProps {
  viewMode: GridView;
  searchTarget?: GridSearchNavigationTarget | null;
  systemNamespace?: string;
  storageKey?: string;
  title?: string;
}

const NAV_CONFIG: Record<TableType, { label: string; icon: string; addLabel: string }> = {
  clients: { label: "Klienti", icon: "👥", addLabel: "Klienta" },
  partners: { label: "Partneři", icon: "🏢", addLabel: "Partnera" },
  tipers: { label: "Tipaři", icon: "💡", addLabel: "Tipaře" }
};

const UsersGrid: React.FC<UsersGridProps> = ({
  viewMode,
  searchTarget,
  systemNamespace,
  storageKey = USERS_GRID_TABLE_STORAGE_KEY,
  title = "Walter System"
}) => {
  const [activeTable, setActiveTable] = useState<TableType>(() => getStoredTableView(storageKey));
  const { getCollectionCount, markCollectionSeen } = useActivity();
  const addHandlerRef = useRef<AddHandler | null>(null);
  const [isAddDisabled, setIsAddDisabled] = useState(false);
  const { canUndo, canRedo, isBusy, undo, redo } = useUndoRedo();

  useEffect(() => {
    if (!searchTarget || searchTarget.viewMode !== viewMode) {
      return;
    }
    setActiveTable(searchTarget.table);
  }, [searchTarget, viewMode]);

  useEffect(() => {
    setStoredTableView(storageKey, activeTable);
  }, [activeTable, storageKey]);

  useEffect(() => {
    markCollectionSeen(buildCommissionsCollectionKey(getActivitySystem(systemNamespace), viewMode, activeTable));
  }, [activeTable, markCollectionSeen, systemNamespace, viewMode]);

  const registerAddHandler = useCallback((handler: AddHandler) => {
    addHandlerRef.current = handler;
  }, []);

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsAddDisabled(loading);
  }, []);

  useEffect(() => {
    addHandlerRef.current = null;
    setIsAddDisabled(false);
  }, [activeTable]);

  const handleAddClick = useCallback(() => {
    void addHandlerRef.current?.();
  }, []);

  const renderActiveSection = () => {
    if (activeTable === "clients") {
      return (
        <ClientsSectionNew
          viewMode={viewMode}
          isActive
          systemNamespace={systemNamespace}
          sectionKind="commissions"
          onRegisterAddHandler={registerAddHandler}
          onLoadingChange={handleLoadingChange}
          focusRecordId={
            searchTarget?.viewMode === viewMode && searchTarget.table === "clients"
              ? searchTarget.recordId
              : null
          }
          focusRequestKey={
            searchTarget?.viewMode === viewMode && searchTarget.table === "clients"
              ? searchTarget.requestKey
              : null
          }
        />
      );
    }

    if (activeTable === "partners") {
      return (
        <PartnersSectionNew
          viewMode={viewMode}
          isActive
          systemNamespace={systemNamespace}
          sectionKind="commissions"
          onRegisterAddHandler={registerAddHandler}
          onLoadingChange={handleLoadingChange}
          focusRecordId={
            searchTarget?.viewMode === viewMode && searchTarget.table === "partners"
              ? searchTarget.recordId
              : null
          }
          focusRequestKey={
            searchTarget?.viewMode === viewMode && searchTarget.table === "partners"
              ? searchTarget.requestKey
              : null
          }
        />
      );
    }

    return (
      <TipersSectionNew
        viewMode={viewMode}
        isActive
        systemNamespace={systemNamespace}
        sectionKind="commissions"
        onRegisterAddHandler={registerAddHandler}
        onLoadingChange={handleLoadingChange}
        focusRecordId={
          searchTarget?.viewMode === viewMode && searchTarget.table === "tipers"
            ? searchTarget.recordId
            : null
        }
        focusRequestKey={
          searchTarget?.viewMode === viewMode && searchTarget.table === "tipers"
            ? searchTarget.requestKey
            : null
        }
      />
    );
  };

  const { addLabel } = NAV_CONFIG[activeTable];

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">{title}</h1>
        <div className="navigation-tabs">
          {(
            Object.entries(NAV_CONFIG) as Array<
              [TableType, { label: string; icon: string; addLabel: string }]
            >
          ).map(([key, { label, icon }]) => (
            <button
              key={key}
              onClick={() => setActiveTable(key)}
              className={`nav-tab ${activeTable === key ? "active" : ""}`}
            >
              <span className="nav-tab__content">
                <span>{icon} {label}</span>
                <ActivityIndicator
                  count={getCollectionCount(buildCommissionsCollectionKey(getActivitySystem(systemNamespace), viewMode, key))}
                  muted={activeTable === key}
                  title="Nepřečtené změny"
                />
              </span>
            </button>
          ))}
        </div>
        <div className="header-actions">
          <button
            className="undo-redo-btn"
            onClick={undo}
            disabled={!canUndo || isBusy}
            title="Zpět (Ctrl+Z)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 10h10a5 5 0 0 1 0 10H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 6l-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="undo-redo-btn"
            onClick={redo}
            disabled={!canRedo || isBusy}
            title="Znovu (Ctrl+Y)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 10H11a5 5 0 0 0 0 10h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="add-user-btn" onClick={handleAddClick} disabled={isAddDisabled}>
            + Přidat {addLabel}
          </button>
        </div>
      </div>

      <div className="table-section">{renderActiveSection()}</div>
    </div>
  );
};

export default UsersGrid;

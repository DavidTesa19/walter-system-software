import "ag-grid-community/styles/ag-theme-quartz.css";
import "../usersGrid/UsersGrid.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import ActivityIndicator from "../activity/ActivityIndicator";
import { useActivity } from "../activity/ActivityContext";
import { buildSubjectsCollectionKey, getActivitySystem } from "../activity/activityKeys";
import type { GridView } from "../types/appView";
import type { GridSearchNavigationTarget } from "../types/globalSearch";
import PartnersSectionNew from "../usersGrid/sections/PartnersSectionNew";
import ClientsSectionNew from "../usersGrid/sections/ClientsSectionNew";
import TipersSectionNew from "../usersGrid/sections/TipersSectionNew";
import type { AddHandler } from "../usersGrid/sections/SectionTypes";
import { useUndoRedo } from "../utils/undoRedo";
import {
  ENTITIES_SYSTEM_TABLE_STORAGE_KEY,
  getStoredTableView,
  setStoredTableView,
  type SubjectTableType
} from "../utils/tableViewState";

ModuleRegistry.registerModules([AllCommunityModule]);

type TableType = SubjectTableType;

const NAV_CONFIG: Record<TableType, { label: string; icon: string; addLabel: string }> = {
  clients: { label: "Klienti", icon: "👥", addLabel: "Klienta" },
  partners: { label: "Partneři", icon: "🏢", addLabel: "Partnera" },
  tipers: { label: "Tipaři", icon: "💡", addLabel: "Tipaře" }
};

const VIEW_MODE_CONFIG: Record<GridView, { label: string }> = {
  active: { label: "Aktivní" },
  pending: { label: "Ke schválení" },
  archived: { label: "Archiv" }
};

interface EntitiesSystemViewProps {
  viewMode: GridView;
  systemNamespace?: string;
  storageKey?: string;
  title?: string;
  searchTarget?: GridSearchNavigationTarget | null;
}

const EntitiesSystemView: React.FC<EntitiesSystemViewProps> = ({
  viewMode,
  systemNamespace,
  storageKey = ENTITIES_SYSTEM_TABLE_STORAGE_KEY,
  title,
  searchTarget
}) => {
  const [activeTable, setActiveTable] = useState<TableType>(() => getStoredTableView(storageKey));
  const { getCollectionCount, markCollectionSeen } = useActivity();
  const addHandlerRef = useRef<AddHandler | null>(null);
  const [isAddDisabled, setIsAddDisabled] = useState(false);
  const { canUndo, canRedo, isBusy, undo, redo } = useUndoRedo();

  const registerAddHandler = useCallback((handler: AddHandler) => {
    addHandlerRef.current = handler;
  }, []);

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsAddDisabled(loading);
  }, []);

  useEffect(() => {
    addHandlerRef.current = null;
    setIsAddDisabled(false);
  }, [activeTable, viewMode]);

  useEffect(() => {
    setStoredTableView(storageKey, activeTable);
  }, [activeTable, storageKey]);

  useEffect(() => {
    markCollectionSeen(buildSubjectsCollectionKey(getActivitySystem(systemNamespace), viewMode, activeTable));
  }, [activeTable, markCollectionSeen, systemNamespace, viewMode]);

  useEffect(() => {
    if (!searchTarget || searchTarget.viewMode !== viewMode) {
      return;
    }
    if (searchTarget.table === 'partner_entities') {
      setActiveTable('partners');
    } else if (searchTarget.table === 'client_entities') {
      setActiveTable('clients');
    } else if (searchTarget.table === 'tiper_entities') {
      setActiveTable('tipers');
    }
  }, [searchTarget, viewMode]);

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
          sectionKind="subjects"
          onRegisterAddHandler={registerAddHandler}
          onLoadingChange={handleLoadingChange}
          focusRecordId={
            searchTarget?.viewMode === viewMode && searchTarget.table === 'client_entities'
              ? searchTarget.recordId
              : null
          }
          focusRequestKey={
            searchTarget?.viewMode === viewMode && searchTarget.table === 'client_entities'
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
          sectionKind="subjects"
          onRegisterAddHandler={registerAddHandler}
          onLoadingChange={handleLoadingChange}
          focusRecordId={
            searchTarget?.viewMode === viewMode && searchTarget.table === 'partner_entities'
              ? searchTarget.recordId
              : null
          }
          focusRequestKey={
            searchTarget?.viewMode === viewMode && searchTarget.table === 'partner_entities'
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
        sectionKind="subjects"
        onRegisterAddHandler={registerAddHandler}
        onLoadingChange={handleLoadingChange}
        focusRecordId={
          searchTarget?.viewMode === viewMode && searchTarget.table === 'tiper_entities'
            ? searchTarget.recordId
            : null
        }
        focusRequestKey={
          searchTarget?.viewMode === viewMode && searchTarget.table === 'tiper_entities'
            ? searchTarget.requestKey
            : null
        }
      />
    );
  };

  const { addLabel } = NAV_CONFIG[activeTable];
  const resolvedTitle = title ?? `Subjekty & Zakázky - ${VIEW_MODE_CONFIG[viewMode].label}`;

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">{resolvedTitle}</h1>
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
                  count={getCollectionCount(buildSubjectsCollectionKey(getActivitySystem(systemNamespace), viewMode, key))}
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

export default EntitiesSystemView;

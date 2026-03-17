import "ag-grid-community/styles/ag-theme-quartz.css";
import "../usersGrid/UsersGrid.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import type { GridView } from "../types/appView";
import PartnersSectionNew from "../usersGrid/sections/PartnersSectionNew";
import ClientsSectionNew from "../usersGrid/sections/ClientsSectionNew";
import TipersSectionNew from "../usersGrid/sections/TipersSectionNew";
import type { AddHandler } from "../usersGrid/sections/SectionTypes";
import { useUndoRedo } from "../utils/undoRedo";

ModuleRegistry.registerModules([AllCommunityModule]);

type TableType = "clients" | "partners" | "tipers";

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
}

const EntitiesSystemView: React.FC<EntitiesSystemViewProps> = ({ viewMode }) => {
  const [activeTable, setActiveTable] = useState<TableType>("clients");
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

  const handleAddClick = useCallback(() => {
    void addHandlerRef.current?.();
  }, []);

  const renderActiveSection = () => {
    if (activeTable === "clients") {
      return (
        <ClientsSectionNew
          viewMode={viewMode}
          isActive
          onRegisterAddHandler={registerAddHandler}
          onLoadingChange={handleLoadingChange}
        />
      );
    }

    if (activeTable === "partners") {
      return (
        <PartnersSectionNew
          viewMode={viewMode}
          isActive
          onRegisterAddHandler={registerAddHandler}
          onLoadingChange={handleLoadingChange}
        />
      );
    }

    return (
      <TipersSectionNew
        viewMode={viewMode}
        isActive
        onRegisterAddHandler={registerAddHandler}
        onLoadingChange={handleLoadingChange}
      />
    );
  };

  const { addLabel } = NAV_CONFIG[activeTable];

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">Subjekty & Komise - {VIEW_MODE_CONFIG[viewMode].label}</h1>
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
              {icon} {label}
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

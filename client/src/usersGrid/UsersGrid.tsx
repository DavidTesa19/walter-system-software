import "ag-grid-community/styles/ag-theme-quartz.css";
import "./UsersGrid.css";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import type { GridView } from "../types/appView";
import ClientsSection from "./sections/ClientsSection";
import PartnersSection from "./sections/PartnersSection";
import TipersSection from "./sections/TipersSection";
import type { AddHandler } from "./sections/SectionTypes";

ModuleRegistry.registerModules([AllCommunityModule]);

type TableType = "clients" | "partners" | "tipers";

interface UsersGridProps {
  viewMode: GridView;
}

const NAV_CONFIG: Record<TableType, { label: string; icon: string; addLabel: string }> = {
  clients: { label: "Klienti", icon: "👥", addLabel: "Klienta" },
  partners: { label: "Partneři", icon: "🏢", addLabel: "Partnera" },
  tipers: { label: "Tipaři", icon: "💡", addLabel: "Tipaře" }
};

const UsersGrid: React.FC<UsersGridProps> = ({ viewMode }) => {
  const [activeTable, setActiveTable] = useState<TableType>("clients");
  const addHandlerRef = useRef<AddHandler | null>(null);
  const [isAddDisabled, setIsAddDisabled] = useState(false);

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
        <ClientsSection
          viewMode={viewMode}
          isActive
          onRegisterAddHandler={registerAddHandler}
          onLoadingChange={handleLoadingChange}
        />
      );
    }

    if (activeTable === "partners") {
      return (
        <PartnersSection
          viewMode={viewMode}
          isActive
          onRegisterAddHandler={registerAddHandler}
          onLoadingChange={handleLoadingChange}
        />
      );
    }

    return (
      <TipersSection
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
        <h1 className="page-title">Walter System</h1>
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
        <button className="add-user-btn" onClick={handleAddClick} disabled={isAddDisabled}>
          + Přidat {addLabel}
        </button>
      </div>

      <div className="table-section">{renderActiveSection()}</div>

      <div className="instructions">
        <p>
          <strong>Instrukce:</strong>
        </p>
        <ul>
          <li>Použijte záložky výše pro přepínání mezi tabulkami Klientů, Partnerů a Tipařů</li>
          <li>Klikněte na jakoukoliv buňku pro úpravu (kromě ID)</li>
          <li>Stiskněte Enter nebo klikněte mimo pro uložení změn</li>
          <li>Klikněte na ikonu koše pro smazání položky</li>
          <li>Klikněte na ikonu profilu pro otevření detailního profilu záznamu</li>
          <li>Klikněte "Přidat Klienta/Partnera/Tipaře" pro vytvoření nového záznamu</li>
        </ul>
      </div>
    </div>
  );
};

export default UsersGrid;

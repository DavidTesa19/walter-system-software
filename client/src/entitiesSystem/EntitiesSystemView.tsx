import React, { useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import type { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "../usersGrid/UsersGrid.css";
import "./EntitiesSystemView.css";

ModuleRegistry.registerModules([AllCommunityModule]);

type EntityType = "partners" | "clients" | "tipers";
type Mode = "entities" | "commissions";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3004";

const ENTITY_CONFIG: Record<EntityType, { label: string; icon: string; addLabel: string }> = {
  partners: { label: "Partneři", icon: "🏢", addLabel: "Partnera" },
  clients: { label: "Klienti", icon: "👥", addLabel: "Klienta" },
  tipers: { label: "Tipaři", icon: "💡", addLabel: "Tipaře" }
};

const MODE_CONFIG: Record<Mode, { label: string; description: string }> = {
  entities: {
    label: "Subjekty",
    description: "Samostatná evidence partnerů, klientů a tipařů bez navázaných komisí."
  },
  commissions: {
    label: "Komise",
    description: "Seznam všech komisí navázaných na vybraný subjekt."
  }
};

const EntitiesSystemView: React.FC = () => {
  const [entityType, setEntityType] = useState<EntityType>("partners");
  const [mode, setMode] = useState<Mode>("entities");
  const [rowData, setRowData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchData();
  }, [entityType, mode]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Endpoint typically like GET /api/partner-entities or GET /api/partner-commissions
      const response = await fetch(`${API_BASE}/api/${entityType.slice(0, -1)}-${mode}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('walter_auth_token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setRowData(data);
      } else {
        console.error("Failed to fetch data:", response.statusText);
        setRowData([]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setRowData([]);
    } finally {
      setLoading(false);
    }
  };

  const getColumnDefs = (): ColDef[] => {
    if (mode === "entities") {
      return [
        { field: "entity_id", headerName: "ID subjektu", minWidth: 140 },
        { field: "first_name", headerName: "Jméno", flex: 1, minWidth: 140 },
        { field: "last_name", headerName: "Příjmení", flex: 1, minWidth: 140 },
        { field: "company_name", headerName: "Společnost", flex: 1.1, minWidth: 180 },
        { field: "category", headerName: "Kategorie", flex: 1, minWidth: 140 },
        { field: "field", headerName: "Obor", flex: 1, minWidth: 140 },
        { field: "location", headerName: "Lokalita", flex: 1, minWidth: 140 },
        { field: "email", headerName: "E-mail", flex: 1.2, minWidth: 180 },
        { field: "phone", headerName: "Telefon", flex: 1, minWidth: 140 },
        { field: "info", headerName: "Info", flex: 1.4, minWidth: 200 },
      ];
    } else {
      return [
        { field: "commission_id", headerName: "ID komise", minWidth: 140 },
        { field: "entity_first_name", headerName: "Jméno subjektu", flex: 1, minWidth: 150 },
        { field: "entity_last_name", headerName: "Příjmení subjektu", flex: 1, minWidth: 160 },
        { field: "entity_company_name", headerName: "Společnost", flex: 1.1, minWidth: 180 },
        { field: "position", headerName: "Pozice", flex: 1, minWidth: 150 },
        { field: "commission_value", headerName: "Hodnota", flex: 1, minWidth: 130 },
        { field: "priority", headerName: "Priorita", flex: 1, minWidth: 120 },
        { field: "status", headerName: "Stav", flex: 1, minWidth: 120 },
        { field: "assigned_to", headerName: "Přiřazeno", flex: 1, minWidth: 150 },
        { field: "deadline", headerName: "Termín", flex: 1, minWidth: 130 },
      ];
    }
  };

  const { label: entityLabel, addLabel } = ENTITY_CONFIG[entityType];
  const modeLabel = MODE_CONFIG[mode].label;
  const rowLabel = rowData.length === 1 ? "záznam" : rowData.length >= 2 && rowData.length <= 4 ? "záznamy" : "záznamů";

  return (
    <div className="page-container entities-system-page">
      <div className="header-section entities-system-header">
        <h1 className="page-title">Subjekty & Komise</h1>

        <div className="entities-system-tab-groups">
          <div className="navigation-tabs">
            {(Object.entries(ENTITY_CONFIG) as Array<[EntityType, { label: string; icon: string; addLabel: string }]>)
              .map(([key, { label, icon }]) => (
                <button
                  key={key}
                  onClick={() => setEntityType(key)}
                  className={`nav-tab ${entityType === key ? "active" : ""}`}
                >
                  {icon} {label}
                </button>
              ))}
          </div>

          <div className="navigation-tabs entities-system-mode-tabs">
            {(Object.entries(MODE_CONFIG) as Array<[Mode, { label: string; description: string }]>)
              .map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`nav-tab ${mode === key ? "active" : ""}`}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>

        <div className="header-actions">
          <button
            className="undo-redo-btn"
            onClick={() => void fetchData()}
            disabled={loading}
            title="Obnovit data"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 11A8 8 0 1 0 8.7 18.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20 4V11H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="add-user-btn entities-system-add-btn" disabled>
            {mode === "entities" ? `+ Přidat ${addLabel}` : "+ Přidat komisi"}
          </button>
        </div>
      </div>

      <div className="table-section entities-system-table-section">
        <div className="entities-system-summary-card">
          <div>
            <h2 className="table-title entities-system-table-title">{entityLabel} · {modeLabel}</h2>
            <p className="entities-system-description">{MODE_CONFIG[mode].description}</p>
          </div>
          <div className="entities-system-summary-metrics">
            <span className="entities-system-count">{rowData.length} {rowLabel}</span>
          </div>
        </div>

        <div className="entities-grid-shell">
          <div className="entities-grid-container ag-theme-quartz">
            {loading ? (
              <div className="entities-system-loading">Načítání...</div>
            ) : (
              <AgGridReact
                rowData={rowData}
                columnDefs={getColumnDefs()}
                defaultColDef={{
                  sortable: true,
                  filter: true,
                  resizable: true
                }}
                animateRows
                domLayout="autoHeight"
                rowSelection="single"
                overlayNoRowsTemplate="<span class='entities-system-empty'>Zatím zde nejsou žádná data.</span>"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntitiesSystemView;

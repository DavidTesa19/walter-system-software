import React, { useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import type { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./EntitiesSystemView.css";

ModuleRegistry.registerModules([AllCommunityModule]);

type EntityType = "partners" | "clients" | "tipers";
type Mode = "entities" | "commissions";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3004";

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
        { field: "first_name", headerName: "First Name", flex: 1 },
        { field: "last_name", headerName: "Last Name", flex: 1 },
        { field: "company_name", headerName: "Company", flex: 1 },
        { field: "info", headerName: "Info", flex: 1 },
        { field: "category", headerName: "Category", flex: 1 },
        { field: "status", headerName: "Status", flex: 1 },
      ];
    } else {
      // Commissions mode
      return [
        { field: "entity_first_name", headerName: "Entity First Name", flex: 1 },
        { field: "entity_last_name", headerName: "Entity Last Name", flex: 1 },
        { field: "entity_company_name", headerName: "Entity Company", flex: 1 },
        { field: "position", headerName: "Position", flex: 1 },
        { field: "commission_value", headerName: "Value", flex: 1 },
        { field: "status", headerName: "Status", flex: 1 },
      ];
    }
  };

  return (
    <div className="entities-system-container">
      <div className="entities-system-header">
        <h2 className="entities-system-title">Subjekt / Commissions Settings</h2>
        
        <div className="entities-system-controls">
          <div className="entities-control-group">
            <button
              className={`entities-control-btn ${entityType === "partners" ? "active" : ""}`}
              onClick={() => setEntityType("partners")}
            >
              Partners
            </button>
            <button
              className={`entities-control-btn ${entityType === "clients" ? "active" : ""}`}
              onClick={() => setEntityType("clients")}
            >
              Clients
            </button>
            <button
              className={`entities-control-btn ${entityType === "tipers" ? "active" : ""}`}
              onClick={() => setEntityType("tipers")}
            >
              Tipers
            </button>
          </div>

          <div className="entities-control-group">
            <button
              className={`entities-control-btn ${mode === "entities" ? "active" : ""}`}
              onClick={() => setMode("entities")}
            >
              Entities Details
            </button>
            <button
              className={`entities-control-btn ${mode === "commissions" ? "active" : ""}`}
              onClick={() => setMode("commissions")}
            >
              Commissions Setting
            </button>
          </div>
        </div>
      </div>

      <div className="entities-grid-container ag-theme-quartz">
        {loading ? (
          <div style={{ padding: "20px", textAlign: "center" }}>Loading...</div>
        ) : (
          <AgGridReact
            rowData={rowData}
            columnDefs={getColumnDefs()}
            domLayout="autoHeight"
            rowSelection="single"
          />
        )}
      </div>
    </div>
  );
};

export default EntitiesSystemView;

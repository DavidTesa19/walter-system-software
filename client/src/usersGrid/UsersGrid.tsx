import "ag-grid-community/styles/ag-theme-quartz.css";
import "./UsersGrid.css";
import { AgGridReact} from "ag-grid-react";
import { useEffect, useState } from "react";
import type { UserInterface } from "./user.interface";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);



const UsersGrid = () => {
  const [rowData, setRowData] = useState<UserInterface[]>([]);
  const [colDefs] = useState<ColDef<UserInterface>[]>([
    { field: "id" },
    { field: "name", filter: true },
    { field: "company", filter: true },
    { 
      field: "country.name", 
      headerName: "Country",
      filter: true 
    },
    { field: "mobile" },
  ]);

  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3004";

  useEffect(() => {
    fetch(`${API_BASE}/users`)
      .then((result) => result.json())
      .then((rowData) => setRowData(rowData));
  }, []);

  return (
    <div className="page-container">
      <h1 className="page-title">Walter System</h1>
      <div className="grid-wrapper ag-theme-quartz" style={{ height: 500, width: "100%" }}>
        <AgGridReact
          rowData={rowData}
          columnDefs={colDefs}
        />
      </div>
    </div>
  );
};

export default UsersGrid;

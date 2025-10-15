import "ag-grid-community/styles/ag-theme-quartz.css";
import "./UsersGrid.css";
import { AgGridReact} from "ag-grid-react";
import { useEffect, useState, useCallback, useRef } from "react";
import type { UserInterface } from "./user.interface";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);



type TableType = 'users' | 'employees';

const UsersGrid = () => {
  const [activeTable, setActiveTable] = useState<TableType>('users');
  const [usersData, setUsersData] = useState<UserInterface[]>([]);
  const [employeesData, setEmployeesData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const gridRef = useRef<AgGridReact>(null);
  
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3004";
  
  // Get current data based on active table
  const currentData = activeTable === 'users' ? usersData : employeesData;
  const setCurrentData = activeTable === 'users' ? setUsersData : setEmployeesData;
  const currentEndpoint = activeTable === 'users' ? 'users' : 'employees';

  // Delete button component
  const DeleteButton = (props: any) => {
    const handleDelete = async () => {
        try {
          const response = await fetch(`${API_BASE}/${currentEndpoint}/${props.data.id}`, {
            method: 'DELETE',
          });
          
          if (response.ok) {
            fetchCurrentData(); // Refresh the grid
          } else {
            alert(`Failed to delete ${activeTable.slice(0, -1)}`);
          }
        } catch (error) {
          console.error(`Error deleting ${activeTable.slice(0, -1)}:`, error);
          alert(`Error deleting ${activeTable.slice(0, -1)}`);
        }
    };

    return (
      <button 
        onClick={handleDelete}
        className="delete-btn"
        title="Delete user"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 3L3 9M3 3L9 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  };

  const [colDefs] = useState<ColDef<UserInterface>[]>([
    { 
      headerName: "", 
      cellRenderer: DeleteButton,
      width: 80,
      pinned: 'left',
      sortable: false,
      filter: false,
      resizable: false,
      suppressSizeToFit: true
    },
    { 
      field: "id", 
      headerName: "ID",
      flex: 0.5,
      minWidth: 70,
      editable: false 
    },
    { 
      field: "name", 
      headerName: "Jméno",
      filter: true,
      editable: true,
      flex: 2,
      minWidth: 120
    },
    { 
      field: "company", 
      headerName: "Společnost",
      filter: true,
      editable: true,
      flex: 2.5,
      minWidth: 150
    },
    { 
      field: "location", 
      headerName: "Lokace",
      filter: true,
      editable: true,
      flex: 1.5,
      minWidth: 100
    },
    { 
      field: "mobile", 
      headerName: "Telefon",
      editable: true,
      flex: 1.5,
      minWidth: 120
    },
  ]);

  const fetchCurrentData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/${currentEndpoint}`);
      const data = await response.json();
      setCurrentData(data);
    } catch (error) {
      console.error(`Error fetching ${activeTable}:`, error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, currentEndpoint, activeTable, setCurrentData]);
  
  // Fetch data for both tables
  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersResponse, employeesResponse] = await Promise.all([
        fetch(`${API_BASE}/users`),
        fetch(`${API_BASE}/employees`)
      ]);
      
      const users = await usersResponse.json();
      const employees = await employeesResponse.json();
      
      setUsersData(users);
      setEmployeesData(employees);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);
  
  // Fetch current table data when active table changes
  useEffect(() => {
    if (usersData.length === 0 && employeesData.length === 0) {
      return; // Initial load will handle this
    }
    fetchCurrentData();
  }, [activeTable, fetchCurrentData]);

  // Handle cell value changes (editing)
  const onCellValueChanged = useCallback(async (params: any) => {
    try {
      const updatedItem = { ...params.data };
      
      const response = await fetch(`${API_BASE}/${currentEndpoint}/${updatedItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedItem),
      });

      if (!response.ok) {
        alert(`Failed to update ${activeTable.slice(0, -1)}`);
        fetchCurrentData(); // Revert changes by refreshing
      }
    } catch (error) {
      console.error(`Error updating ${activeTable.slice(0, -1)}:`, error);
      alert(`Error updating ${activeTable.slice(0, -1)}`);
      fetchCurrentData(); // Revert changes by refreshing
    }
  }, [API_BASE, currentEndpoint, activeTable, fetchCurrentData]);

  // Add new item to current table
  const handleAddItem = async () => {
    const newItem = {
      name: activeTable === 'users' ? "Nový Uživatel" : "Nový Zaměstnanec",
      company: "Nová Společnost",
      location: "Nová Lokace",
      mobile: "000 000 000"
    };

    try {
      const response = await fetch(`${API_BASE}/${currentEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newItem),
      });

      if (response.ok) {
        fetchCurrentData(); // Refresh the grid
      } else {
        alert(`Failed to add ${activeTable.slice(0, -1)}`);
      }
    } catch (error) {
      console.error(`Error adding ${activeTable.slice(0, -1)}:`, error);
      alert(`Error adding ${activeTable.slice(0, -1)}`);
    }
  };

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">Walter System</h1>
        <div className="navigation-tabs">
          <button 
            onClick={() => setActiveTable('users')}
            className={`nav-tab ${activeTable === 'users' ? 'active' : ''}`}
          >
            🏢 Partneři
          </button>
          <button 
            onClick={() => setActiveTable('employees')}
            className={`nav-tab ${activeTable === 'employees' ? 'active' : ''}`}
          >
            👥 Klienti
          </button>
        </div>
        <button 
          onClick={handleAddItem} 
          className="add-user-btn"
          disabled={isLoading}
        >
          + Přidat {activeTable === 'users' ? 'Partnera' : 'Klienta'}
        </button>
      </div>
      
      <div className="table-section">
        <h2 className="table-title">
          {activeTable === 'users' ? '🏢 Partneři' : '👥 Klienti'}
        </h2>
        
        <div className="grid-wrapper ag-theme-quartz" style={{ height: 500, width: "100%" }}>
          <AgGridReact
            ref={gridRef}
            rowData={currentData}
            columnDefs={colDefs}
            onCellValueChanged={onCellValueChanged}
            defaultColDef={{
              resizable: true,
              sortable: true,
            }}
            suppressRowClickSelection={true}
            loading={isLoading}
          />
        </div>
      </div>
      
      <div className="instructions">
        <p><strong>Instructions:</strong></p>
        <ul>
          <li>Use the tabs above to switch between Users and Employees tables</li>
          <li>Click on any cell to edit (except ID)</li>
          <li>Press Enter or click outside to save changes</li>
          <li>Click the trash icon to delete an item</li>
          <li>Click "Add User/Employee" to create a new entry</li>
        </ul>
      </div>
    </div>
  );
};

export default UsersGrid;

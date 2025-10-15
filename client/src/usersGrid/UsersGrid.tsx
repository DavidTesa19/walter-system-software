import "ag-grid-community/styles/ag-theme-quartz.css";
import "./UsersGrid.css";
import { AgGridReact} from "ag-grid-react";
import { useEffect, useState, useCallback, useRef } from "react";
import type { UserInterface } from "./user.interface";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);



const UsersGrid = () => {
  const [rowData, setRowData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const gridRef = useRef<AgGridReact>(null);
  
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3004";

  // Delete button component
  const DeleteButton = (props: any) => {
    const handleDelete = async () => {
        try {
          const response = await fetch(`${API_BASE}/users/${props.data.id}`, {
            method: 'DELETE',
          });
          
          if (response.ok) {
            fetchUsers(); // Refresh the grid
          } else {
            alert('Failed to delete user');
          }
        } catch (error) {
          console.error('Error deleting user:', error);
          alert('Error deleting user');
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
      resizable: false
    },
    { 
      field: "id", 
      headerName: "ID",
      width: 70,
      editable: false 
    },
    { 
      field: "name", 
      headerName: "Jméno",
      filter: true,
      editable: true,
      width: 150
    },
    { 
      field: "company", 
      headerName: "Společnost",
      filter: true,
      editable: true,
      width: 200
    },
    { 
      field: "location", 
      headerName: "Lokace",
      filter: true,
      editable: true,
      width: 130,
    },
    { 
      field: "mobile", 
      headerName: "Telefon",
      editable: true,
      width: 150
    },
  ]);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/users`);
      const users = await response.json();
      setRowData(users);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Handle cell value changes (editing)
  const onCellValueChanged = useCallback(async (params: any) => {
    try {
      const updatedUser = { ...params.data };
      
      const response = await fetch(`${API_BASE}/users/${updatedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedUser),
      });

      if (!response.ok) {
        alert('Failed to update user');
        fetchUsers(); // Revert changes by refreshing
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error updating user');
      fetchUsers(); // Revert changes by refreshing
    }
  }, [API_BASE, fetchUsers]);

  // Add new user
  const handleAddUser = async () => {
    const newUser = {
      name: "Uživatel",
      company: "Společnost",
      location: "Lokace",
      mobile: "000 000 000"
    };

    try {
      const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser),
      });

      if (response.ok) {
        fetchUsers(); // Refresh the grid
      } else {
        alert('Failed to add user');
      }
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Error adding user');
    }
  };

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">Walter System</h1>
        <button 
          onClick={handleAddUser} 
          className="add-user-btn"
          disabled={isLoading}
        >
          + Add User
        </button>
      </div>
      
      <div className="grid-wrapper ag-theme-quartz" style={{ height: 500, width: "100%" }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
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
      
      <div className="instructions">
        <p><strong>Instructions:</strong></p>
        <ul>
          <li>Click on any cell to edit (except ID)</li>
          <li>Press Enter or click outside to save changes</li>
          <li>Click the trash icon to delete a user</li>
          <li>Click "Add User" to create a new user</li>
        </ul>
      </div>
    </div>
  );
};

export default UsersGrid;

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
  const usersGridRef = useRef<AgGridReact>(null);
  const employeesGridRef = useRef<AgGridReact>(null);
  
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3004";

  // Fetch users data
  const fetchUsersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/users`);
      const data = await response.json();
      setUsersData(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  // Fetch employees data
  const fetchEmployeesData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/employees`);
      const data = await response.json();
      setEmployeesData(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  // Users Delete button component
  const UsersDeleteButton = (props: any) => {
    const handleDelete = async () => {
        try {
          const response = await fetch(`${API_BASE}/users/${props.data.id}`, {
            method: 'DELETE',
          });
          
          if (response.ok) {
            fetchUsersData(); // Refresh the users grid
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

  // Employees Delete button component
  const EmployeesDeleteButton = (props: any) => {
    const handleDelete = async () => {
        try {
          const response = await fetch(`${API_BASE}/employees/${props.data.id}`, {
            method: 'DELETE',
          });
          
          if (response.ok) {
            fetchEmployeesData(); // Refresh the employees grid
          } else {
            alert('Failed to delete employee');
          }
        } catch (error) {
          console.error('Error deleting employee:', error);
          alert('Error deleting employee');
        }
    };

    return (
      <button 
        onClick={handleDelete}
        className="delete-btn"
        title="Delete employee"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 3L3 9M3 3L9 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  };

  // Users column definitions
  const usersColDefs: ColDef<UserInterface>[] = [
    { 
      headerName: "", 
      cellRenderer: UsersDeleteButton,
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
  ];

  // Employees column definitions
  const employeesColDefs: ColDef<UserInterface>[] = [
    { 
      headerName: "", 
      cellRenderer: EmployeesDeleteButton,
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
  ];

  // Initialize data on component mount
  useEffect(() => {
    fetchUsersData();
    fetchEmployeesData();
  }, [fetchUsersData, fetchEmployeesData]);

  // Handle cell value changes for users
  const onUsersCellValueChanged = useCallback(async (params: any) => {
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
        fetchUsersData(); // Revert changes by refreshing
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error updating user');
      fetchUsersData(); // Revert changes by refreshing
    }
  }, [API_BASE, fetchUsersData]);

  // Handle cell value changes for employees
  const onEmployeesCellValueChanged = useCallback(async (params: any) => {
    try {
      const updatedEmployee = { ...params.data };
      
      const response = await fetch(`${API_BASE}/employees/${updatedEmployee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedEmployee),
      });

      if (!response.ok) {
        alert('Failed to update employee');
        fetchEmployeesData(); // Revert changes by refreshing
      }
    } catch (error) {
      console.error('Error updating employee:', error);
      alert('Error updating employee');
      fetchEmployeesData(); // Revert changes by refreshing
    }
  }, [API_BASE, fetchEmployeesData]);

  // Add new user
  const handleAddUser = async () => {
    const newUser = {
      name: "Nový Uživatel",
      company: "Nová Společnost",
      location: "Nová Lokace",
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
        fetchUsersData(); // Refresh the grid
      } else {
        alert('Failed to add user');
      }
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Error adding user');
    }
  };

  // Add new employee
  const handleAddEmployee = async () => {
    const newEmployee = {
      name: "Nový Zaměstnanec",
      company: "Nová Společnost",
      location: "Nová Lokace",
      mobile: "000 000 000"
    };

    try {
      const response = await fetch(`${API_BASE}/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newEmployee),
      });

      if (response.ok) {
        fetchEmployeesData(); // Refresh the grid
      } else {
        alert('Failed to add employee');
      }
    } catch (error) {
      console.error('Error adding employee:', error);
      alert('Error adding employee');
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
          onClick={activeTable === 'users' ? handleAddUser : handleAddEmployee} 
          className="add-user-btn"
          disabled={isLoading}
        >
          + Přidat {activeTable === 'users' ? 'Partnera' : 'Klienta'}
        </button>
      </div>
      
      <div className="table-section">
        <h2 className="table-title">
          {activeTable === 'users' ? '' : ''}
        </h2>
        
        {/* Users Table */}
        {activeTable === 'users' && (
          <div className="grid-wrapper ag-theme-quartz" style={{ height: 500, width: "100%" }}>
            <AgGridReact
              ref={usersGridRef}
              rowData={usersData}
              columnDefs={usersColDefs}
              onCellValueChanged={onUsersCellValueChanged}
              defaultColDef={{
                resizable: true,
                sortable: true,
              }}
              suppressRowClickSelection={true}
              loading={isLoading}
            />
          </div>
        )}
        
        {/* Employees Table */}
        {activeTable === 'employees' && (
          <div className="grid-wrapper ag-theme-quartz" style={{ height: 500, width: "100%" }}>
            <AgGridReact
              ref={employeesGridRef}
              rowData={employeesData}
              columnDefs={employeesColDefs}
              onCellValueChanged={onEmployeesCellValueChanged}
              defaultColDef={{
                resizable: true,
                sortable: true,
              }}
              suppressRowClickSelection={true}
              loading={isLoading}
            />
          </div>
        )}
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

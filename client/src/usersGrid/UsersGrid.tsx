import "ag-grid-community/styles/ag-theme-quartz.css";
import "./UsersGrid.css";
import { AgGridReact} from "ag-grid-react";
import { useEffect, useState, useCallback, useRef } from "react";
import type { UserInterface } from "./user.interface";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);



type TableType = 'partners' | 'clients' | 'tipers';

const UsersGrid = () => {
  const [activeTable, setActiveTable] = useState<TableType>('clients');
  const [partnersData, setPartnersData] = useState<UserInterface[]>([]);
  const [clientsData, setClientsData] = useState<UserInterface[]>([]);
  const [tipersData, setTipersData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const partnersGridRef = useRef<AgGridReact>(null);
  const clientsGridRef = useRef<AgGridReact>(null);
  const tipersGridRef = useRef<AgGridReact>(null);
  
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3004";

  // Fetch partners data
  const fetchPartnersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/partners`);
      const data = await response.json();
      setPartnersData(data);
    } catch (error) {
      console.error('Error fetching partners:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  // Fetch clients data
  const fetchClientsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/clients`);
      const data = await response.json();
      setClientsData(data);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  const fetchTipersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/tipers`);
      const data = await response.json();
      setTipersData(data);
    } catch (error) {
      console.error('Error fetching tipers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE]);

  // Partners Delete button component
  const PartnersDeleteButton = (props: any) => {
    const handleDelete = async () => {
        try {
          const response = await fetch(`${API_BASE}/partners/${props.data.id}`, {
            method: 'DELETE',
          });
          
          if (response.ok) {
            fetchPartnersData(); // Refresh the partners grid
          } else {
            alert('Failed to delete partner');
          }
        } catch (error) {
          console.error('Error deleting partner:', error);
          alert('Error deleting partner');
        }
    };

    return (
      <button 
        onClick={handleDelete}
        className="delete-btn"
        title="Delete partner"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 3L3 9M3 3L9 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  };

  // Clients Delete button component
  const ClientsDeleteButton = (props: any) => {
    const handleDelete = async () => {
        try {
          const response = await fetch(`${API_BASE}/clients/${props.data.id}`, {
            method: 'DELETE',
          });
          
          if (response.ok) {
            fetchClientsData(); // Refresh the clients grid
          } else {
            alert('Failed to delete client');
          }
        } catch (error) {
          console.error('Error deleting client:', error);
          alert('Error deleting client');
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

  // Tipers Delete button component
  const TipersDeleteButton = (props: any) => {
    const handleDelete = async () => {
        try {
          const response = await fetch(`${API_BASE}/tipers/${props.data.id}`, {
            method: 'DELETE',
          });
          
          if (response.ok) {
            fetchTipersData(); // Refresh the tipers grid
          } else {
            alert('Failed to delete tiper');
          }
        } catch (error) {
          console.error('Error deleting tiper:', error);
          alert('Error deleting tiper');
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

  // Partners column definitions
  const partnersColDefs: ColDef<UserInterface>[] = [
    { 
      headerName: "", 
      cellRenderer: PartnersDeleteButton,
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
      headerName: "Lokalita",
      filter: true,
      editable: true,
      flex: 1.5,
      minWidth: 100
    },
    { 
      field: "mobile", 
      headerName: "Kontakt",
      editable: true,
      filter: true,
      flex: 1.5,
      minWidth: 120
    },
  ];

  // Clients column definitions
  const clientsColDefs: ColDef<UserInterface>[] = [
    { 
      headerName: "", 
      cellRenderer: ClientsDeleteButton,
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
      headerName: "Lokalita",
      filter: true,
      editable: true,
      flex: 1.5,
      minWidth: 100
    },
    { 
      field: "mobile", 
      headerName: "Kontakt",
      editable: true,
      filter: true,
      flex: 1.5,
      minWidth: 120
    },
  ];

  // Tipers column definitions
  const tipersColDefs: ColDef<UserInterface>[] = [
    { 
      headerName: "", 
      cellRenderer: TipersDeleteButton,
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
      headerName: "Lokalita",
      filter: true,
      editable: true,
      flex: 1.5,
      minWidth: 100
    },
    { 
      field: "mobile", 
      headerName: "Kontakt",
      editable: true,
      filter: true,
      flex: 1.5,
      minWidth: 120
    },
  ];

  // Initialize data on component mount
  useEffect(() => {
    fetchPartnersData();
    fetchClientsData();
    fetchTipersData();
  }, [fetchPartnersData, fetchClientsData, fetchTipersData]);

  // Handle cell value changes for users
  const onPartnersCellValueChanged = useCallback(async (params: any) => {
    try {
      const updatedUser = { ...params.data };
      
      const response = await fetch(`${API_BASE}/partners/${updatedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedUser),
      });

      if (!response.ok) {
        alert('Failed to update partner');
        fetchPartnersData(); // Revert changes by refreshing
      }
    } catch (error) {
      console.error('Error updating partner:', error);
      alert('Error updating partner');
      fetchPartnersData(); // Revert changes by refreshing
    }
  }, [API_BASE, fetchPartnersData]);

  // Handle cell value changes for clients
  const onClientsCellValueChanged = useCallback(async (params: any) => {
    try {
      const updatedClient = { ...params.data };
      
      const response = await fetch(`${API_BASE}/clients/${updatedClient.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedClient),
      });

      if (!response.ok) {
        alert('Failed to update client');
        fetchClientsData(); // Revert changes by refreshing
      }
    } catch (error) {
      console.error('Error updating client:', error);
      alert('Error updating client');
      fetchClientsData(); // Revert changes by refreshing
    }
  }, [API_BASE, fetchClientsData]);

  // Handle cell value changes for tipers
  const onTipersCellValueChanged = useCallback(async (params: any) => {
    try {
      const updatedTiper = { ...params.data };
      
      const response = await fetch(`${API_BASE}/tipers/${updatedTiper.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedTiper),
      });

      if (!response.ok) {
        alert('Failed to update tiper');
        fetchTipersData(); // Revert changes by refreshing
      }
    } catch (error) {
      console.error('Error updating tiper:', error);
      alert('Error updating tiper');
      fetchTipersData(); // Revert changes by refreshing
    }
  }, [API_BASE, fetchTipersData]);

  // Add new partner
  const handleAddPartner = async () => {
    const newPartner = {
      name: "Nový Partner",
      company: "Nová Společnost",
      location: "Nová Lokalita",
      mobile: "000 000 000"
    };

    try {
      const response = await fetch(`${API_BASE}/partners`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPartner),
      });

      if (response.ok) {
        fetchPartnersData(); // Refresh the grid
      } else {
        alert('Failed to add partner');
      }
    } catch (error) {
      console.error('Error adding partner:', error);
      alert('Error adding partner');
    }
  };

  // Add new client
  const handleAddClient = async () => {
    const newClient = {
      name: "Nový Klient",
      company: "Nová Společnost",
      location: "Nová Lokalita",
      mobile: "000 000 000"
    };

    try {
      const response = await fetch(`${API_BASE}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newClient),
      });

      if (response.ok) {
        fetchClientsData(); // Refresh the grid
      } else {
        alert('Failed to add client');
      }
    } catch (error) {
      console.error('Error adding client:', error);
      alert('Error adding client');
    }
  };

  // Add new tiper
  const handleAddTiper = async () => {
    const newTiper = {
      name: "Nový Tiper",
      company: "Nová Společnost",
      location: "Nová Lokalita",
      mobile: "000 000 000"
    };

    try {
      const response = await fetch(`${API_BASE}/tipers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTiper),
      });

      if (response.ok) {
        fetchTipersData(); // Refresh the grid
      } else {
        alert('Failed to add tiper');
      }
    } catch (error) {
      console.error('Error adding tiper:', error);
      alert('Error adding tiper');
    }
  };

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">Walter System</h1>
        <div className="navigation-tabs">
          <button 
            onClick={() => setActiveTable('clients')}
            className={`nav-tab ${activeTable === 'clients' ? 'active' : ''}`}
          >
            👥 Klienti
          </button>
          <button 
            onClick={() => setActiveTable('partners')}
            className={`nav-tab ${activeTable === 'partners' ? 'active' : ''}`}
          >
            🏢 Partneři
          </button>
          <button 
            onClick={() => setActiveTable('tipers')}
            className={`nav-tab ${activeTable === 'tipers' ? 'active' : ''}`}
          >
            💡 Tipeři
          </button>
        </div>
        <button 
          onClick={
            activeTable === 'clients' ? handleAddClient : 
            activeTable === 'partners' ? handleAddPartner : 
            handleAddTiper
          } 
          className="add-user-btn"
          disabled={isLoading}
        >
          + Přidat {
            activeTable === 'clients' ? 'Klienta' : 
            activeTable === 'partners' ? 'Partnera' : 
            'Tipera'
          }
        </button>
      </div>
      
      <div className="table-section">
        <h2 className="table-title">
          {
            activeTable === 'clients' ? ' ' : 
            activeTable === 'partners' ? ' ' : 
            ''
          }
        </h2>
        
        {/* Clients Table */}
        {activeTable === 'clients' && (
          <div className="grid-wrapper ag-theme-quartz" style={{ height: 500, width: "100%" }}>
            <AgGridReact
              ref={clientsGridRef}
              rowData={clientsData}
              columnDefs={clientsColDefs}
              onCellValueChanged={onClientsCellValueChanged}
              defaultColDef={{
                resizable: true,
                sortable: true,
              }}
              suppressRowClickSelection={true}
              loading={isLoading}
            />
          </div>
        )}
        
        {/* Partners Table */}
        {activeTable === 'partners' && (
          <div className="grid-wrapper ag-theme-quartz" style={{ height: 500, width: "100%" }}>
            <AgGridReact
              ref={partnersGridRef}
              rowData={partnersData}
              columnDefs={partnersColDefs}
              onCellValueChanged={onPartnersCellValueChanged}
              defaultColDef={{
                resizable: true,
                sortable: true,
              }}
              suppressRowClickSelection={true}
              loading={isLoading}
            />
          </div>
        )}
        
        {/* Clients Table */}
        {activeTable === 'clients' && (
          <div className="grid-wrapper ag-theme-quartz" style={{ height: 500, width: "100%" }}>
            <AgGridReact
              ref={clientsGridRef}
              rowData={clientsData}
              columnDefs={clientsColDefs}
              onCellValueChanged={onClientsCellValueChanged}
              defaultColDef={{
                resizable: true,
                sortable: true,
              }}
              suppressRowClickSelection={true}
              loading={isLoading}
            />
          </div>
        )}
        
        {/* Tipers Table */}
        {activeTable === 'tipers' && (
          <div className="grid-wrapper ag-theme-quartz" style={{ height: 500, width: "100%" }}>
            <AgGridReact
              ref={tipersGridRef}
              rowData={tipersData}
              columnDefs={tipersColDefs}
              onCellValueChanged={onTipersCellValueChanged}
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
        <p><strong>Instrukce:</strong></p>
        <ul>
          <li>....</li>
          <li>....</li>
          <li>....</li>
          <li>....</li>
          <li>....</li>
        </ul>
      </div>
    </div>
  );
};

export default UsersGrid;

import "ag-grid-community/styles/ag-theme-quartz.css";
import "./UsersGrid.css";
import { AgGridReact} from "ag-grid-react";
import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import type { UserInterface } from "./user.interface";
import type { ColDef, ICellEditorParams } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

// Date picker cell editor component
const DatePickerEditor = forwardRef((props: ICellEditorParams, ref) => {
  const [value, setValue] = useState(props.value || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => {
    return {
      getValue() {
        return value;
      },
      afterGuiAttached() {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.showPicker?.();
        }
      }
    };
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  // Convert existing date string to YYYY-MM-DD format for input
  const formatDateForInput = (dateStr: string) => {
    if (!dateStr) return '';
    
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // Try to parse other formats and convert to YYYY-MM-DD
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    
    return '';
  };

  // Format the current value for display in the input
  const inputValue = formatDateForInput(value);

  return (
    <input
      ref={inputRef}
      type="date"
      value={inputValue}
      onChange={handleChange}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        outline: 'none',
        padding: '4px 8px',
        fontSize: '14px'
      }}
    />
  );
});

// Date cell renderer component
const DateCellRenderer = (params: any) => {
  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Get the position of the clicked icon
    const iconRect = (e.target as HTMLElement).closest('svg')?.getBoundingClientRect();
    if (!iconRect) return;
    
    // Create a date input element positioned next to the icon
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.style.position = 'fixed';
    dateInput.style.top = `${iconRect.bottom + 5}px`;
    dateInput.style.left = `${iconRect.left - 100}px`; // Offset to center it better
    dateInput.style.zIndex = '10000';
    dateInput.style.border = '2px solid #007acc';
    dateInput.style.borderRadius = '4px';
    dateInput.style.padding = '8px';
    dateInput.style.backgroundColor = 'white';
    dateInput.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    dateInput.style.fontSize = '14px';
    dateInput.style.outline = 'none';
    
    // Set current value if exists
    if (params.value) {
      const formatDateForInput = (dateStr: string) => {
        if (!dateStr) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return dateStr;
        }
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
        return '';
      };
      dateInput.value = formatDateForInput(params.value);
    }
    
    // Add to DOM
    document.body.appendChild(dateInput);
    
    // Focus and show picker
    dateInput.focus();
    
    // Use setTimeout to ensure the input is ready
    setTimeout(() => {
      if (dateInput.showPicker) {
        dateInput.showPicker();
      }
    }, 10);
    
    // Handle date selection
    const handleChange = () => {
      if (dateInput.value) {
        // Update the cell value directly
        params.setValue(dateInput.value);
      }
      cleanup();
    };
    
    // Handle clicking outside to close
    const handleClickOutside = (event: MouseEvent) => {
      if (!dateInput.contains(event.target as Node)) {
        cleanup();
      }
    };
    
    // Handle escape key
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        cleanup();
      }
    };
    
    const cleanup = () => {
      if (document.body.contains(dateInput)) {
        dateInput.removeEventListener('change', handleChange);
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
        document.body.removeChild(dateInput);
      }
    };
    
    dateInput.addEventListener('change', handleChange);
    
    // Add event listeners after a short delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 100);
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    
    // If it's in YYYY-MM-DD format, convert to readable format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const date = new Date(dateStr + 'T00:00:00');
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('cs-CZ');
      }
    }
    
    // Try to parse and format other date formats
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('cs-CZ');
    }
    
    return dateStr;
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '4px 8px'
      }}
    >
      <span>{formatDisplayDate(params.value)}</span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ 
          marginLeft: '4px', 
          opacity: 0.6, 
          cursor: 'pointer',
          padding: '2px',
          borderRadius: '2px'
        }}
        onClick={handleIconClick}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.backgroundColor = '#f0f0f0';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.6';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <path
          d="M8 2V5M16 2V5M3.5 9.09H20.5M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.6947 13.7H15.7037M11.9955 13.7H12.0045M8.29431 13.7H8.30329M15.6947 17.3H15.7037M11.9955 17.3H12.0045M8.29431 17.3H8.30329"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

type TableType = 'clients' | 'partners' | 'tipers';

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
      flex: 1.5,
      minWidth: 120
    },
    { 
      field: "company", 
      headerName: "Společnost",
      filter: true,
      editable: true,
      flex: 1.5,
      minWidth: 150
    },
    { 
      field: "location", 
      headerName: "Lokalita",
      filter: true,
      editable: true,
      flex: 1,
      minWidth: 100
    },
    { 
      field: "mobile", 
      headerName: "Kontakt",
      editable: true,
      filter: true,
      flex: 1,
      minWidth: 120
    }, 
    {
      field: "commission", 
      headerName: "Odměna/Provize",
      editable: true,
      filter: true,
      flex: 1.2,
      minWidth: 120
    },
    {
      field: "info", 
      headerName: "Info o společnosti",
      editable: true,
      filter: true,
      flex: 2.5,
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
      flex: 1.25,
      minWidth: 100
    },
    { 
      field: "location", 
      headerName: "Lokalita",
      filter: true,
      editable: true,
      flex: 1,
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
    { 
      field: "field", 
      headerName: "Obor",
      editable: true,
      filter: true,
      flex: 1,
      minWidth: 120
    },
    { 
      field: "info", 
      headerName: "Popis/Požadavky",
      editable: true,
      filter: true,
      flex: 2,
      minWidth: 120
    },
    { 
      field: "date", 
      headerName: "Datum",
      editable: true,
      filter: true,
      flex: 1.5,
      minWidth: 120,
      cellRenderer: DateCellRenderer,
      cellEditor: DatePickerEditor
    },
    { 
      field: "status", 
      headerName: "Stav",
      editable: true,
      filter: true,
      flex: 1,
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
      flex: 1.5,
      minWidth: 120
    },
    { 
      field: "field", 
      headerName: "Specializace/Obor",
      editable: true,
      filter: true,
      flex: 2,
      minWidth: 120
    },
    { 
      field: "location", 
      headerName: "Lokalita",
      filter: true,
      editable: true,
      flex: 1,
      minWidth: 100
    },
    { 
      field: "mobile", 
      headerName: "Kontakt",
      editable: true,
      filter: true,
      flex: 1,
      minWidth: 120
    },
    { 
      field: "commission", 
      headerName: "Odměna",
      editable: true,
      filter: true,
      flex: 1,
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
      name: "Nový Tipař",
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
            💡 Tipaři
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
            'Tipaře'
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
          <li>Použijte záložky výše pro přepínání mezi tabulkami Klientů, Partnerů a Tiperů</li>
          <li>Klikněte na jakoukoliv buňku pro úpravu (kromě ID)</li>
          <li>Stiskněte Enter nebo klikněte mimo pro uložení změn</li>
          <li>Klikněte na ikonu koše pro smazání položky</li>
          <li>Klikněte "Přidat Klienta/Partnera/Tipera" pro vytvoření nového záznamu</li>
        </ul>
      </div>
    </div>
  );
};

export default UsersGrid;

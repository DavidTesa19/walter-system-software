import "ag-grid-community/styles/ag-theme-quartz.css";
import "./UsersGrid.css";
import { AgGridReact} from "ag-grid-react";
import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import type { UserInterface } from "./user.interface";
import type { ColDef, ICellEditorParams, GridApi } from "ag-grid-community";
import { ModuleRegistry, AllCommunityModule } from "ag-grid-community";
import { fieldOptions } from "./fieldOptions";

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

// Status cell renderer component
const StatusCellRenderer = (params: any) => {
  const statusOptions = [
    { value: 'Not Started', label: 'Nezahájeno', color: '#6c757d', bgColor: '#f8f9fa' },
    { value: 'In Process', label: 'V procesu', color: '#0d6efd', bgColor: '#e7f1ff' },
    { value: 'Done', label: 'Dokončeno', color: '#198754', bgColor: '#d1eddb' }
  ];

  const getCurrentStatus = () => {
    return statusOptions.find(option => option.value === params.value) || statusOptions[0];
  };

  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Get the position of the clicked cell
    const cellRect = (e.target as HTMLElement).closest('.ag-cell')?.getBoundingClientRect();
    if (!cellRect) return;
    
    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${cellRect.bottom + 2}px`;
    dropdown.style.left = `${cellRect.left}px`;
    dropdown.style.width = `${cellRect.width}px`;
    dropdown.style.zIndex = '10000';
    dropdown.style.backgroundColor = 'white';
    dropdown.style.border = '1px solid #ccc';
    dropdown.style.borderRadius = '4px';
    dropdown.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    dropdown.style.maxHeight = '150px';
    dropdown.style.overflowY = 'auto';
    
    // Create options
    statusOptions.forEach(option => {
      const optionDiv = document.createElement('div');
      optionDiv.style.padding = '8px 12px';
      optionDiv.style.cursor = 'pointer';
      optionDiv.style.backgroundColor = option.bgColor;
      optionDiv.style.color = option.color;
      optionDiv.style.fontWeight = '500';
      optionDiv.style.borderBottom = '1px solid #eee';
      optionDiv.textContent = option.label;
      
      // Hover effect
      optionDiv.addEventListener('mouseenter', () => {
        optionDiv.style.opacity = '0.8';
      });
      
      optionDiv.addEventListener('mouseleave', () => {
        optionDiv.style.opacity = '1';
      });
      
      // Click handler
      optionDiv.addEventListener('click', () => {
        params.setValue(option.value);
        cleanup();
      });
      
      dropdown.appendChild(optionDiv);
    });
    
    // Add to DOM
    document.body.appendChild(dropdown);
    
    // Handle clicking outside to close
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdown.contains(event.target as Node)) {
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
      if (document.body.contains(dropdown)) {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
        document.body.removeChild(dropdown);
      }
    };
    
    // Add event listeners after a short delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 100);
  };

  const currentStatus = getCurrentStatus();

  return (
    <div
      onClick={handleStatusClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        backgroundColor: currentStatus.bgColor,
        color: currentStatus.color,
        fontWeight: '500',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid transparent',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '0.8';
        e.currentTarget.style.border = '1px solid #ccc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1';
        e.currentTarget.style.border = '1px solid transparent';
      }}
    >
      {currentStatus.label}
    </div>
  );
};

// Field cell renderer component
const FieldCellRenderer = (params: any) => {
  const getCurrentField = () => {
    return fieldOptions.find(option => option.value === params.value) || 
           { value: params.value || '', label: params.value || 'Select Field' };
  };

  const handleFieldClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Get the position of the clicked cell
    const cellRect = (e.target as HTMLElement).closest('.ag-cell')?.getBoundingClientRect();
    if (!cellRect) return;
    
    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${cellRect.bottom + 2}px`;
    dropdown.style.left = `${cellRect.left}px`;
    dropdown.style.width = `${Math.max(cellRect.width, 200)}px`;
    dropdown.style.zIndex = '10000';
    dropdown.style.backgroundColor = 'white';
    dropdown.style.border = '1px solid #ccc';
    dropdown.style.borderRadius = '4px';
    dropdown.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    dropdown.style.maxHeight = '300px';
    dropdown.style.overflowY = 'auto';
    
    // Create options with letter headers
    let currentLetter = '';
    fieldOptions.forEach(option => {
      const firstLetter = option.label.charAt(0).toUpperCase();
      
      // Add letter header if we're starting a new letter section
      if (firstLetter !== currentLetter) {
        currentLetter = firstLetter;
        
        const headerDiv = document.createElement('div');
        headerDiv.style.padding = '8px 12px';
        headerDiv.style.backgroundColor = '#e9ecef';
        headerDiv.style.color = '#495057';
        headerDiv.style.fontWeight = 'bold';
        headerDiv.style.fontSize = '14px';
        headerDiv.style.borderBottom = '2px solid #dee2e6';
        headerDiv.style.position = 'sticky';
        headerDiv.style.top = '0';
        headerDiv.style.zIndex = '1';
        headerDiv.textContent = currentLetter;
        headerDiv.style.cursor = 'default';
        
        dropdown.appendChild(headerDiv);
      }
      
      const optionDiv = document.createElement('div');
      optionDiv.style.padding = '8px 12px';
      optionDiv.style.cursor = 'pointer';
      optionDiv.style.backgroundColor = 'white';
      optionDiv.style.color = '#333';
      optionDiv.style.borderBottom = '1px solid #eee';
      optionDiv.textContent = option.label;
      
      // Hover effect
      optionDiv.addEventListener('mouseenter', () => {
        optionDiv.style.backgroundColor = '#f8f9fa';
      });
      
      optionDiv.addEventListener('mouseleave', () => {
        optionDiv.style.backgroundColor = 'white';
      });
      
      // Click handler
      optionDiv.addEventListener('click', () => {
        params.setValue(option.value);
        cleanup();
      });
      
      dropdown.appendChild(optionDiv);
    });
    
    // Add to DOM
    document.body.appendChild(dropdown);
    
    // Handle clicking outside to close
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdown.contains(event.target as Node)) {
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
      if (document.body.contains(dropdown)) {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
        document.body.removeChild(dropdown);
      }
    };
    
    // Add event listeners after a short delay to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 100);
  };

  const currentField = getCurrentField();

  return (
    <div
      onClick={handleFieldClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        backgroundColor: 'white',
        color: '#333',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid transparent',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#f8f9fa';
        e.currentTarget.style.border = '1px solid #ccc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'white';
        e.currentTarget.style.border = '1px solid transparent';
      }}
    >
      {currentField.label}
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

  const handleDeletePartner = useCallback(
    async (partnerId: number, rowData?: UserInterface, gridApi?: GridApi<UserInterface>) => {
      console.log('🗑️ DELETE PARTNER CALLED');
      console.log('  - Partner ID:', partnerId);
      console.log('  - Row Data:', rowData);
      console.log('  - API Base:', API_BASE);
      
      if (!partnerId || Number.isNaN(partnerId)) {
        console.error('❌ Invalid partner id, skipping delete:', rowData?.id);
        return;
      }

      try {
        console.log(`📡 Sending DELETE request to: ${API_BASE}/partners/${partnerId}`);
        const response = await fetch(`${API_BASE}/partners/${partnerId}`, {
          method: 'DELETE',
        });
        
        console.log('📥 Response received:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        if (response.ok) {
          console.log('✅ Delete successful, updating grid');
          const apiToUse = gridApi ?? partnersGridRef.current?.api;
          if (rowData && apiToUse) {
            apiToUse.applyTransaction({ remove: [rowData] });
          }
          setPartnersData(prev => prev.filter(partner => Number(partner.id) !== partnerId));
          await fetchPartnersData();
        } else {
          const errorText = await response.text();
          console.error('❌ Failed to delete partner:', errorText || response.statusText);
          alert('Failed to delete partner');
        }
      } catch (error) {
        console.error('💥 Error deleting partner:', error);
        alert('Error deleting partner');
      }
    },
    [API_BASE, fetchPartnersData]
  );

  const handleDeleteClient = useCallback(
    async (clientId: number, rowData?: UserInterface, gridApi?: GridApi<UserInterface>) => {
      console.log('🗑️ DELETE CLIENT CALLED');
      console.log('  - Client ID:', clientId);
      console.log('  - Row Data:', rowData);
      console.log('  - API Base:', API_BASE);
      
      if (!clientId || Number.isNaN(clientId)) {
        console.error('❌ Invalid client id, skipping delete:', rowData?.id);
        return;
      }

      try {
        console.log(`📡 Sending DELETE request to: ${API_BASE}/clients/${clientId}`);
        const response = await fetch(`${API_BASE}/clients/${clientId}`, {
          method: 'DELETE',
        });
        
        console.log('📥 Response received:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok
        });

        if (response.ok) {
          console.log('✅ Delete successful, updating grid');
          const apiToUse = gridApi ?? clientsGridRef.current?.api;
          if (rowData && apiToUse) {
            apiToUse.applyTransaction({ remove: [rowData] });
          }
          setClientsData(prev => prev.filter(client => Number(client.id) !== clientId));
          await fetchClientsData();
        } else {
          const errorText = await response.text();
          console.error('❌ Failed to delete client:', errorText || response.statusText);
          alert('Failed to delete client');
        }
      } catch (error) {
        console.error('💥 Error deleting client:', error);
        alert('Error deleting client');
      }
    },
    [API_BASE, fetchClientsData]
  );

  const handleDeleteTiper = useCallback(
    async (tiperId: number, rowData?: UserInterface, gridApi?: GridApi<UserInterface>) => {
      if (!tiperId || Number.isNaN(tiperId)) {
        console.error('Invalid tiper id, skipping delete:', rowData?.id);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/tipers/${tiperId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          const apiToUse = gridApi ?? tipersGridRef.current?.api;
          if (rowData && apiToUse) {
            apiToUse.applyTransaction({ remove: [rowData] });
          }
          setTipersData(prev => prev.filter(tiper => Number(tiper.id) !== tiperId));
          await fetchTipersData();
        } else {
          const errorText = await response.text();
          console.error('Failed to delete tiper:', errorText || response.statusText);
          alert('Failed to delete tiper');
        }
      } catch (error) {
        console.error('Error deleting tiper:', error);
        alert('Error deleting tiper');
      }
    },
    [API_BASE, fetchTipersData]
  );

  const PartnersDeleteButton = (props: any) => {
    console.log('🔄 PartnersDeleteButton RENDERED', { id: props.data?.id });
    
    const handleClick = (e: React.MouseEvent) => {
      console.log('🖱️ DELETE BUTTON CLICKED (PARTNER)');
      console.log('  - Event:', e.type);
      console.log('  - Props data:', props.data);
      console.log('  - Props data.id:', props.data?.id);
      
      e.stopPropagation();
      e.preventDefault();
      
      const partnerId = Number(props.data?.id);
      console.log('  - Parsed partnerId:', partnerId);
      console.log('  - Is NaN?:', Number.isNaN(partnerId));
      
      void handleDeletePartner(partnerId, props.data, props.api);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      console.log('👇 Mouse down on partner delete button', e.button);
      // Handle delete on mouse down to bypass AG Grid's click capture
      e.stopPropagation();
      e.preventDefault();
      handleClick(e);
    };

    return (
      <button
        onMouseDown={handleMouseDown}
        className="delete-btn"
        title="Delete partner"
        style={{ cursor: 'pointer', pointerEvents: 'auto', zIndex: 9999 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 3L3 9M3 3L9 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  };

  const ClientsDeleteButton = (props: any) => {
    console.log('🔄 ClientsDeleteButton RENDERED', { id: props.data?.id });
    
    const handleClick = (e: React.MouseEvent) => {
      console.log('🖱️ DELETE BUTTON CLICKED');
      console.log('  - Event:', e.type);
      console.log('  - Props data:', props.data);
      console.log('  - Props data.id:', props.data?.id);
      
      e.stopPropagation();
      e.preventDefault();
      
      const clientId = Number(props.data?.id);
      console.log('  - Parsed clientId:', clientId);
      console.log('  - Is NaN?:', Number.isNaN(clientId));
      
      void handleDeleteClient(clientId, props.data, props.api);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      console.log('👇 Mouse down on client delete button', e.button);
      // Handle delete on mouse down to bypass AG Grid's click capture
      e.stopPropagation();
      e.preventDefault();
      handleClick(e);
    };

    return (
      <button
        onMouseDown={handleMouseDown}
        className="delete-btn"
        title="Delete client"
        style={{ cursor: 'pointer', pointerEvents: 'auto', zIndex: 9999 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 3L3 9M3 3L9 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  };

  const TipersDeleteButton = (props: any) => {
    const handleClick = (e: React.MouseEvent) => {
      console.log('🖱️ DELETE BUTTON CLICKED (TIPER)');
      e.stopPropagation();
      e.preventDefault();
      const tiperId = Number(props.data?.id);
      console.log('  - Parsed tiperId:', tiperId);
      void handleDeleteTiper(tiperId, props.data, props.api);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      console.log('👇 Mouse down on tiper delete button', e.button);
      e.stopPropagation();
      e.preventDefault();
      handleClick(e);
    };

    return (
      <button
        onMouseDown={handleMouseDown}
        className="delete-btn"
        title="Delete tiper"
        style={{ cursor: 'pointer', pointerEvents: 'auto', zIndex: 9999 }}
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
      cellRendererParams: {
        onDelete: handleDeletePartner,
      },
      width: 80,
      pinned: 'left',
      sortable: false,
      filter: false,
      resizable: false,
      suppressSizeToFit: true,
      editable: false,
      suppressNavigable: true
    },
    { 
      field: "id", 
      headerName: "ID",
      flex: 0.5,
      minWidth: 70,
      editable: false 
    },
    { 
      field: "field", 
      headerName: "Specializace/Obor",
      editable: false,
      filter: true,
      flex: 2,
      minWidth: 120,
      cellRenderer: FieldCellRenderer
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
      field: "info", 
      headerName: "Info o společnosti",
      editable: true,
      filter: true,
      flex: 2.5,
      minWidth: 120
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
  ];

  // Clients column definitions
  const clientsColDefs: ColDef<UserInterface>[] = [
    { 
      headerName: "", 
      cellRenderer: ClientsDeleteButton,
      cellRendererParams: {
        onDelete: handleDeleteClient,
      },
      width: 80,
      pinned: 'left',
      sortable: false,
      filter: false,
      resizable: false,
      suppressSizeToFit: true,
      editable: false,
      suppressNavigable: true
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
      editable: false,
      filter: true,
      flex: 1,
      minWidth: 120,
      cellRenderer: FieldCellRenderer
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
      editable: false,
      filter: true,
      flex: 1,
      minWidth: 120,
      cellRenderer: StatusCellRenderer
    },
  ];

  // Tipers column definitions
  const tipersColDefs: ColDef<UserInterface>[] = [
    { 
      headerName: "", 
      cellRenderer: TipersDeleteButton,
      cellRendererParams: {
        onDelete: handleDeleteTiper,
      },
      width: 80,
      pinned: 'left',
      sortable: false,
      filter: false,
      resizable: false,
      suppressSizeToFit: true,
      editable: false
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
      editable: false,
      filter: true,
      flex: 2,
      minWidth: 120,
      cellRenderer: FieldCellRenderer
    },
    { 
      field: "info", 
      headerName: "Informace",
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
      headerName: "Odměna/Provize",
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
      const { created_at, updated_at, ...updatedUser } = params.data;
      
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
      const { created_at, updated_at, ...updatedClient } = params.data;
      
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
      const { created_at, updated_at, ...updatedTiper } = params.data;
      
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

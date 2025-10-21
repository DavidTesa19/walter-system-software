import "ag-grid-community/styles/ag-theme-quartz.css";
import "./UsersGrid.css";
import { AgGridReact} from "ag-grid-react";
import { useEffect, useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import type { UserInterface } from "./user.interface";
import type { ColDef, ICellEditorParams } from "ag-grid-community";
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
          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.backgroundColor = isDark ? '#2d2d2d' : '#f0f0f0';
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
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const statusOptions = isDark ? [
    { value: 'Not Started', label: 'Nezahájeno', color: '#9ca3af', bgColor: '#1f2937' },
    { value: 'In Process', label: 'V procesu', color: '#60a5fa', bgColor: '#1e3a8a' },
    { value: 'Done', label: 'Dokončeno', color: '#34d399', bgColor: '#064e3b' }
  ] : [
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
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
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
    dropdown.style.backgroundColor = isDark ? '#1a1a1a' : 'white';
    dropdown.style.border = isDark ? '1px solid #2d2d2d' : '1px solid #ccc';
    dropdown.style.borderRadius = '4px';
    dropdown.style.boxShadow = isDark ? '0 2px 8px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.15)';
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
           { value: params.value || '', label: params.value || 'Vyberte obor' };
  };

  const handleFieldClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
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
    dropdown.style.backgroundColor = isDark ? '#1a1a1a' : 'white';
    dropdown.style.border = isDark ? '1px solid #2d2d2d' : '1px solid #ccc';
    dropdown.style.borderRadius = '4px';
    dropdown.style.boxShadow = isDark ? '0 2px 8px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.15)';
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
        headerDiv.style.backgroundColor = isDark ? '#0d0d0d' : '#e9ecef';
        headerDiv.style.color = isDark ? '#b0b0b0' : '#495057';
        headerDiv.style.fontWeight = 'bold';
        headerDiv.style.fontSize = '14px';
        headerDiv.style.borderBottom = isDark ? '2px solid #2d2d2d' : '2px solid #dee2e6';
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
      optionDiv.style.backgroundColor = isDark ? '#1a1a1a' : 'white';
      optionDiv.style.color = isDark ? '#e0e0e0' : '#333';
      optionDiv.style.borderBottom = isDark ? '1px solid #2d2d2d' : '1px solid #eee';
      optionDiv.textContent = option.label;
      
      // Hover effect
      optionDiv.addEventListener('mouseenter', () => {
        optionDiv.style.backgroundColor = isDark ? '#2d2d2d' : '#f8f9fa';
      });
      
      optionDiv.addEventListener('mouseleave', () => {
        optionDiv.style.backgroundColor = isDark ? '#1a1a1a' : 'white';
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
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

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
        backgroundColor: isDark ? '#0d0d0d' : 'white',
        color: isDark ? '#e0e0e0' : '#333',
        padding: '0 8px',
        borderRadius: '4px',
        border: '1px solid transparent',
        transition: 'all 0.2s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isDark ? '#2d2d2d' : '#f8f9fa';
        e.currentTarget.style.border = isDark ? '1px solid #4a4a4a' : '1px solid #ccc';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isDark ? '#0d0d0d' : 'white';
        e.currentTarget.style.border = '1px solid transparent';
      }}
    >
      {currentField.label}
    </div>
  );
};

type TableType = 'clients' | 'partners' | 'tipers';

interface UsersGridProps {
  viewMode: 'active' | 'pending';
}

const UsersGrid: React.FC<UsersGridProps> = ({ viewMode }) => {
  const [activeTable, setActiveTable] = useState<TableType>('clients');
  const [partnersData, setPartnersData] = useState<UserInterface[]>([]);
  const [clientsData, setClientsData] = useState<UserInterface[]>([]);
  const [tipersData, setTipersData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const partnersGridRef = useRef<AgGridReact>(null);
  const clientsGridRef = useRef<AgGridReact>(null);
  const tipersGridRef = useRef<AgGridReact>(null);
  
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3004";
  const status = viewMode === 'active' ? 'accepted' : 'pending';

  // Fetch partners data
  const fetchPartnersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/partners?status=${status}`);
      const data = await response.json();
      setPartnersData(data);
    } catch (error) {
      console.error('Error fetching partners:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, status]);

  // Fetch clients data
  const fetchClientsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/clients?status=${status}`);
      const data = await response.json();
      setClientsData(data);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, status]);

  const fetchTipersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/tipers?status=${status}`);
      const data = await response.json();
      setTipersData(data);
    } catch (error) {
      console.error('Error fetching tipers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [API_BASE, status]);

  // Delete handlers for each table (used by external buttons)
  // Approve handlers
  const handleApproveClient = useCallback(async (id: number) => {
    try {
      const response = await fetch(`${API_BASE}/clients/${id}/approve`, { method: 'POST' });
      if (response.ok) {
        fetchClientsData();
      } else {
        alert('Nepodařilo se schválit klienta');
      }
    } catch (error) {
      console.error('Error approving client:', error);
      alert('Chyba při schvalování klienta');
    }
  }, [API_BASE, fetchClientsData]);

  const handleApprovePartner = useCallback(async (id: number) => {
    try {
      const response = await fetch(`${API_BASE}/partners/${id}/approve`, { method: 'POST' });
      if (response.ok) {
        fetchPartnersData();
      } else {
        alert('Nepodařilo se schválit partnera');
      }
    } catch (error) {
      console.error('Error approving partner:', error);
      alert('Chyba při schvalování partnera');
    }
  }, [API_BASE, fetchPartnersData]);

  const handleApproveTiper = useCallback(async (id: number) => {
    try {
      const response = await fetch(`${API_BASE}/tipers/${id}/approve`, { method: 'POST' });
      if (response.ok) {
        fetchTipersData();
      } else {
        alert('Nepodařilo se schválit tipaře');
      }
    } catch (error) {
      console.error('Error approving tiper:', error);
      alert('Chyba při schvalování tipaře');
    }
  }, [API_BASE, fetchTipersData]);

  const handleDeleteClient = useCallback(async (id: number) => {
    const client = clientsData.find(c => c.id === id);
    const isPending = client?.status === 'pending';
    const confirmMessage = isPending 
      ? `Opravdu chcete zamítnout tohoto klienta?\n\nJméno: ${client?.name || 'N/A'}\nSpolečnost: ${client?.company || 'N/A'}`
      : `Opravdu chcete smazat tohoto klienta?\n\nJméno: ${client?.name || 'N/A'}\nSpolečnost: ${client?.company || 'N/A'}`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/clients/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchClientsData();
      } else {
        alert('Nepodařilo se smazat klienta');
      }
    } catch (error) {
      console.error('Error deleting client:', error);
      alert('Chyba při mazání klienta');
    }
  }, [API_BASE, fetchClientsData, clientsData]);

  const handleDeletePartner = useCallback(async (id: number) => {
    const partner = partnersData.find(p => p.id === id);
    const isPending = partner?.status === 'pending';
    const confirmMessage = isPending 
      ? `Opravdu chcete zamítnout tohoto partnera?\n\nJméno: ${partner?.name || 'N/A'}\nSpolečnost: ${partner?.company || 'N/A'}`
      : `Opravdu chcete smazat tohoto partnera?\n\nJméno: ${partner?.name || 'N/A'}\nSpolečnost: ${partner?.company || 'N/A'}`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/partners/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchPartnersData();
      } else {
        alert('Nepodařilo se smazat partnera');
      }
    } catch (error) {
      console.error('Error deleting partner:', error);
      alert('Chyba při mazání partnera');
    }
  }, [API_BASE, fetchPartnersData, partnersData]);

  const handleDeleteTiper = useCallback(async (id: number) => {
    const tiper = tipersData.find(t => t.id === id);
    const isPending = tiper?.status === 'pending';
    const confirmMessage = isPending 
      ? `Opravdu chcete zamítnout tohoto tipaře?\n\nJméno: ${tiper?.name || 'N/A'}\nSpolečnost: ${tiper?.company || 'N/A'}`
      : `Opravdu chcete smazat tohoto tipaře?\n\nJméno: ${tiper?.name || 'N/A'}\nSpolečnost: ${tiper?.company || 'N/A'}`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/tipers/${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchTipersData();
      } else {
        alert('Nepodařilo se smazat tipaře');
      }
    } catch (error) {
      console.error('Error deleting tiper:', error);
      alert('Chyba při mazání tipaře');
    }
  }, [API_BASE, fetchTipersData, tipersData]);

  // Refs to grid wrappers for measuring header/row heights
  const clientsWrapperRef = useRef<HTMLDivElement>(null);
  const partnersWrapperRef = useRef<HTMLDivElement>(null);
  const tipersWrapperRef = useRef<HTMLDivElement>(null);

  // Measured sizes per table
  const [clientsSizes, setClientsSizes] = useState({ row: 42, headerOffset: 80 });
  const [partnersSizes, setPartnersSizes] = useState({ row: 42, headerOffset: 80 });
  const [tipersSizes, setTipersSizes] = useState({ row: 42, headerOffset: 80 });

  const measureGrid = useCallback((wrapper: HTMLDivElement | null) => {
    try {
      if (!wrapper) return { row: 42, headerOffset: 80 };
      const headerEl = wrapper.querySelector('.ag-header') as HTMLElement | null;
      const firstRow = wrapper.querySelector('.ag-center-cols-container .ag-row') as HTMLElement | null;
      const headerRect = headerEl?.getBoundingClientRect();
      const rowRect = firstRow?.getBoundingClientRect();
      const cs = window.getComputedStyle(wrapper);
      const paddingTop = parseFloat(cs.paddingTop || '0');
      const headerHeight = (headerRect?.height ?? 64);
      const rowHeight = (rowRect?.height ?? 42);
      return { row: Math.round(rowHeight), headerOffset: Math.round(headerHeight + paddingTop) };
    } catch {
      return { row: 42, headerOffset: 80 };
    }
  }, []);

  // Re-measure when data changes or window resizes
  useEffect(() => {
    const timer = setTimeout(() => {
      setClientsSizes(measureGrid(clientsWrapperRef.current));
    }, 50);
    return () => clearTimeout(timer);
  }, [clientsData, measureGrid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPartnersSizes(measureGrid(partnersWrapperRef.current));
    }, 50);
    return () => clearTimeout(timer);
  }, [partnersData, measureGrid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTipersSizes(measureGrid(tipersWrapperRef.current));
    }, 50);
    return () => clearTimeout(timer);
  }, [tipersData, measureGrid]);

  // Re-measure when switching tabs
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTable === 'clients') {
        setClientsSizes(measureGrid(clientsWrapperRef.current));
      } else if (activeTable === 'partners') {
        setPartnersSizes(measureGrid(partnersWrapperRef.current));
      } else if (activeTable === 'tipers') {
        setTipersSizes(measureGrid(tipersWrapperRef.current));
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeTable, measureGrid]);

  useEffect(() => {
    const onResize = () => {
      setClientsSizes(measureGrid(clientsWrapperRef.current));
      setPartnersSizes(measureGrid(partnersWrapperRef.current));
      setTipersSizes(measureGrid(tipersWrapperRef.current));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureGrid]);

  

  // Clients column definitions
  const clientsColDefs: ColDef<UserInterface>[] = [
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

  // Partners column definitions
  const partnersColDefs: ColDef<UserInterface>[] = [
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
      field: "name", 
      headerName: "Jméno",
      filter: true,
      editable: true,
      flex: 1.5,
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

  // Tipers column definitions
  const tipersColDefs: ColDef<UserInterface>[] = [
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
      field: "info", 
      headerName: "Info o Tipaři",
      editable: true,
      filter: true,
      flex: 2,
      minWidth: 120
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

  // Debug: Log data changes
  useEffect(() => {
    console.log('DEBUG: clientsData changed:', {
      length: clientsData.length,
      data: clientsData,
      viewMode,
      activeTable
    });
  }, [clientsData, viewMode, activeTable]);

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
        alert('Nepodařilo se aktualizovat tipaře');
        fetchTipersData(); // Revert changes by refreshing
      }
    } catch (error) {
      console.error('Error updating tiper:', error);
      alert('Chyba při aktualizaci tipaře');
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
        alert('Nepodařilo se přidat partnera');
      }
    } catch (error) {
      console.error('Error adding partner:', error);
      alert('Chyba při přidávání partnera');
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
        alert('Nepodařilo se přidat klienta');
      }
    } catch (error) {
      console.error('Error adding client:', error);
      alert('Chyba při přidávání klienta');
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
        alert('Nepodařilo se přidat tipaře');
      }
    } catch (error) {
      console.error('Error adding tiper:', error);
      alert('Chyba při přidávání tipaře');
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
          <div className="grid-container">
            {viewMode === 'pending' && (
              <div
                className="approve-buttons-column"
                style={{
                  ['--row-height' as any]: `${clientsSizes.row}px`,
                  ['--header-offset' as any]: `${clientsSizes.headerOffset}px`,
                }}
              >
                {clientsData.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleApproveClient(client.id as number)}
                    className="external-approve-btn"
                    title="Schválit klienta"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
            <div
              className="delete-buttons-column"
              style={{
                ['--row-height' as any]: `${clientsSizes.row}px`,
                ['--header-offset' as any]: `${clientsSizes.headerOffset}px`,
              }}
            >
              {clientsData.map((client) => (
                <button
                  key={client.id}
                  onClick={() => handleDeleteClient(client.id as number)}
                  className="external-delete-btn"
                  title={viewMode === 'pending' ? 'Zamítnout klienta' : 'Smazat klienta'}
                >
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
            <div ref={clientsWrapperRef} className="grid-wrapper ag-theme-quartz" style={{ height: 500 }}>
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
          </div>
        )}
        
        {/* Partners Table */}
        {activeTable === 'partners' && (
          <div className="grid-container">
            {viewMode === 'pending' && (
              <div
                className="approve-buttons-column"
                style={{
                  ['--row-height' as any]: `${partnersSizes.row}px`,
                  ['--header-offset' as any]: `${partnersSizes.headerOffset}px`,
                }}
              >
                {partnersData.map((partner) => (
                  <button
                    key={partner.id}
                    onClick={() => handleApprovePartner(partner.id as number)}
                    className="external-approve-btn"
                    title="Schválit partnera"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
            <div
              className="delete-buttons-column"
              style={{
                ['--row-height' as any]: `${partnersSizes.row}px`,
                ['--header-offset' as any]: `${partnersSizes.headerOffset}px`,
              }}
            >
              {partnersData.map((partner) => (
                <button
                  key={partner.id}
                  onClick={() => handleDeletePartner(partner.id as number)}
                  className="external-delete-btn"
                  title={viewMode === 'pending' ? 'Zamítnout partnera' : 'Smazat partnera'}
                >
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
            <div ref={partnersWrapperRef} className="grid-wrapper ag-theme-quartz" style={{ height: 500 }}>
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
          </div>
        )}
        
        {/* Tipers Table */}
        {activeTable === 'tipers' && (
          <div className="grid-container">
            {viewMode === 'pending' && (
              <div
                className="approve-buttons-column"
                style={{
                  ['--row-height' as any]: `${tipersSizes.row}px`,
                  ['--header-offset' as any]: `${tipersSizes.headerOffset}px`,
                }}
              >
                {tipersData.map((tiper) => (
                  <button
                    key={tiper.id}
                    onClick={() => handleApproveTiper(tiper.id as number)}
                    className="external-approve-btn"
                    title="Schválit tipaře"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}
            <div
              className="delete-buttons-column"
              style={{
                ['--row-height' as any]: `${tipersSizes.row}px`,
                ['--header-offset' as any]: `${tipersSizes.headerOffset}px`,
              }}
            >
              {tipersData.map((tiper) => (
                <button
                  key={tiper.id}
                  onClick={() => handleDeleteTiper(tiper.id as number)}
                  className="external-delete-btn"
                  title={viewMode === 'pending' ? 'Zamítnout tipaře' : 'Smazat tipaře'}
                >
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
            <div ref={tipersWrapperRef} className="grid-wrapper ag-theme-quartz" style={{ height: 500 }}>
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
          </div>
        )}
      </div>
      
      <div className="instructions">
        <p><strong>Instrukce:</strong></p>
        <ul>
          <li>Použijte záložky výše pro přepínání mezi tabulkami Klientů, Partnerů a Tipařů</li>
          <li>Klikněte na jakoukoliv buňku pro úpravu (kromě ID)</li>
          <li>Stiskněte Enter nebo klikněte mimo pro uložení změn</li>
          <li>Klikněte na ikonu koše pro smazání položky</li>
          <li>Klikněte "Přidat Klienta/Partnera/Tipaře" pro vytvoření nového záznamu</li>
        </ul>
      </div>
    </div>
  );
};

export default UsersGrid;

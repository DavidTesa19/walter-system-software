import "ag-grid-community/styles/ag-theme-quartz.css";
import "../usersGrid/UsersGrid.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type CellValueChangedEvent, type ColDef, type CellClickedEvent } from "ag-grid-community";
import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";
import InfoPopupEditor from "./cells/InfoPopupEditor";
import OptionSelectEditor from "./cells/OptionSelectEditor";
import type { ICellRendererParams } from "ag-grid-community";

export interface FutureFunction {
  id: number;
  name: string;
  priority: string;
  complexity: string;
  phase: string;
  info: string;
  status: string;
  archived: boolean;
}

ModuleRegistry.registerModules([AllCommunityModule]);

const PRIORITY_OPTIONS = ["Nízká", "Střední", "Vysoká"] as const;
const COMPLEXITY_OPTIONS = ["Jednoduchá", "Středně složitá", "Složitá"] as const;
const PHASE_OPTIONS = ["Urgentní", "Střednědobé", "Před spuštěním", "Po spuštění"] as const;

// All statuses
const ALL_STATUS_OPTIONS = ["Plánováno", "Probíhá", "Ke kontrole", "Dokončeno", "Odloženo", "Zrušeno"] as const;

// Statuses that appear in active table
const ACTIVE_STATUSES = ["Plánováno", "Probíhá", "Ke kontrole", "Dokončeno"] as const;

// Statuses that auto-archive
const AUTO_ARCHIVE_STATUSES = ["Odloženo", "Zrušeno"] as const;

const FutureFunctionsGrid: React.FC = () => {
  const [futureFunctions, setFutureFunctions] = useState<FutureFunction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showArchive, setShowArchive] = useState(true);
  const activeWrapperRef = useRef<HTMLDivElement | null>(null);
  const archiveWrapperRef = useRef<HTMLDivElement | null>(null);

  const fetchFutureFunctions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<FutureFunction[]>(`/future-functions`);
      setFutureFunctions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching future functions:", error);
      alert("Nepodařilo se načíst plán funkcí");
      setFutureFunctions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFutureFunctions();
  }, [fetchFutureFunctions]);

  // Split data into active and archived
  const activeFunctions = useMemo(
    () => futureFunctions.filter((f) => !f.archived),
    [futureFunctions]
  );

  const archivedFunctions = useMemo(
    () => futureFunctions.filter((f) => f.archived),
    [futureFunctions]
  );

  const handleAddFunction = useCallback(async () => {
    const newFunction: Omit<FutureFunction, "id"> = {
      name: "Nová funkce",
      priority: PRIORITY_OPTIONS[1],
      complexity: COMPLEXITY_OPTIONS[1],
      phase: PHASE_OPTIONS[1],
      info: "",
      status: "Plánováno",
      archived: false
    };

    try {
      setIsLoading(true);
      await apiPost(`/future-functions`, newFunction);
      await fetchFutureFunctions();
    } catch (error) {
      console.error("Error adding future function:", error);
      alert("Nepodařilo se přidat funkci");
    } finally {
      setIsLoading(false);
    }
  }, [fetchFutureFunctions]);

  const handleDeleteFunction = useCallback(
    async (id: number) => {
      const target = futureFunctions.find((item) => item.id === id);
      const name = target?.name ? `\"${target.name}\"` : "tuto funkci";

      if (!confirm(`Opravdu chcete smazat ${name}?`)) {
        return;
      }

      try {
        setIsLoading(true);
        await apiDelete(`/future-functions/${id}`);
        await fetchFutureFunctions();
      } catch (error) {
        console.error("Error deleting future function:", error);
        alert("Nepodařilo se smazat funkci");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFutureFunctions, futureFunctions]
  );

  const handleArchiveFunction = useCallback(
    async (id: number) => {
      try {
        setIsLoading(true);
        await apiPut(`/future-functions/${id}`, {
          ...futureFunctions.find((f) => f.id === id),
          archived: true
        });
        await fetchFutureFunctions();
      } catch (error) {
        console.error("Error archiving future function:", error);
        alert("Chyba při archivaci funkce");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFutureFunctions, futureFunctions]
  );

  const handleRestoreFunction = useCallback(
    async (id: number) => {
      const target = futureFunctions.find((f) => f.id === id);
      if (!target) return;

      try {
        setIsLoading(true);
        // When restoring, if the status is an auto-archive status, reset to Plánováno
        const newStatus = (AUTO_ARCHIVE_STATUSES as readonly string[]).includes(target.status)
          ? "Plánováno"
          : target.status;
        await apiPut(`/future-functions/${id}`, {
          ...target,
          archived: false,
          status: newStatus
        });
        await fetchFutureFunctions();
      } catch (error) {
        console.error("Error restoring future function:", error);
        alert("Chyba při obnovení funkce");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFutureFunctions, futureFunctions]
  );

  const onCellValueChanged = useCallback(
    async (params: CellValueChangedEvent<FutureFunction>) => {
      if (!params.data?.id) {
        return;
      }

      const data = { ...params.data };

      // Auto-archive when status changes to Odloženo or Zrušeno
      if (params.column.getColId() === "status") {
        if ((AUTO_ARCHIVE_STATUSES as readonly string[]).includes(data.status)) {
          data.archived = true;
        }
        // Auto-restore when status changes to an active status (except Dokončeno which stays where it is)
        if ((ACTIVE_STATUSES as readonly string[]).includes(data.status) && data.status !== "Dokončeno") {
          data.archived = false;
        }
      }

      try {
        await apiPut(`/future-functions/${data.id}`, data);
        await fetchFutureFunctions();
      } catch (error) {
        console.error("Error updating future function:", error);
        alert("Chyba při ukládání změn");
        await fetchFutureFunctions();
      }
    },
    [fetchFutureFunctions]
  );

  // Delete button cell renderer for the pinned column
  const DeleteCellRenderer = useCallback((params: ICellRendererParams<FutureFunction>) => {
    const id = params.data?.id;
    if (id == null) return null;
    return (
      <button
        type="button"
        onClick={() => handleDeleteFunction(id)}
        className="inrow-delete-btn"
        title="Smazat funkci"
      >
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }, [handleDeleteFunction]);

  // Archive button cell renderer — only shown for Dokončeno items in active table
  const ArchiveCellRenderer = useCallback((params: ICellRendererParams<FutureFunction>) => {
    const data = params.data;
    if (!data || data.status !== "Dokončeno" || data.archived) return null;
    return (
      <button
        type="button"
        onClick={() => handleArchiveFunction(data.id)}
        className="inrow-archive-btn"
        title="Archivovat funkci"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--ag-header-foreground-color, #aaa)",
          padding: "2px"
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 8v13H3V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1 3h22v5H1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  }, [handleArchiveFunction]);

  // Restore button cell renderer — shown in archive table
  const RestoreCellRenderer = useCallback((params: ICellRendererParams<FutureFunction>) => {
    const data = params.data;
    if (!data) return null;
    return (
      <button
        type="button"
        onClick={() => handleRestoreFunction(data.id)}
        className="inrow-restore-btn"
        title="Obnovit funkci (přesunout zpět do aktivní tabulky)"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--ag-header-foreground-color, #aaa)",
          padding: "2px"
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polyline points="1 4 1 10 7 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  }, [handleRestoreFunction]);

  // Status cell renderer with color coding
  const StatusCellRenderer = useCallback((params: ICellRendererParams<FutureFunction>) => {
    const status = params.value as string;
    if (!status) return null;

    const colorMap: Record<string, string> = {
      "Plánováno": "#3b82f6",
      "Probíhá": "#f59e0b",
      "Ke kontrole": "#a855f7",
      "Dokončeno": "#22c55e",
      "Odloženo": "#6b7280",
      "Zrušeno": "#ef4444"
    };

    const color = colorMap[status] ?? "#888";

    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontWeight: 500
      }}>
        <span style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: color,
          flexShrink: 0
        }} />
        {status}
      </span>
    );
  }, []);

  const onCellClickedHandler = useCallback((params: CellClickedEvent<FutureFunction>) => {
    const rowIndex = params.node?.rowIndex;
    const colId = params.column?.getId();

    if (rowIndex == null || colId == null) {
      return;
    }

    const isAlreadyEditing = params.api.getEditingCells().some((cell) => {
      const cellColId = cell.column?.getId();
      return cell.rowIndex === rowIndex && cellColId === colId;
    });

    if (!isAlreadyEditing) {
      params.api.startEditingCell({ rowIndex, colKey: colId });
    }
  }, []);

  // Active table column definitions
  const activeColumnDefs = useMemo<ColDef<FutureFunction>[]>(
    () => [
      {
        headerName: "",
        colId: "delete",
        pinned: "left",
        width: 36,
        minWidth: 36,
        maxWidth: 36,
        suppressMovable: true,
        lockPosition: true,
        sortable: false,
        filter: false,
        resizable: false,
        editable: false,
        cellClass: "action-cell",
        headerClass: "action-cell",
        cellRenderer: DeleteCellRenderer
      },
      {
        field: "id",
        headerName: "ID",
        editable: false,
        width: 90,
        minWidth: 80
      },
      {
        field: "name",
        headerName: "Název funkce",
        filter: true,
        flex: 1.5,
        minWidth: 180
      },
      {
        field: "priority",
        headerName: "Priorita",
        filter: true,
        flex: 1,
        minWidth: 140,
        cellEditor: OptionSelectEditor,
        cellEditorPopup: true,
        cellEditorParams: {
          values: [...PRIORITY_OPTIONS]
        },
        onCellClicked: onCellClickedHandler
      },
      {
        field: "complexity",
        headerName: "Komplexita",
        filter: true,
        flex: 1,
        minWidth: 150,
        cellEditor: OptionSelectEditor,
        cellEditorPopup: true,
        cellEditorParams: {
          values: [...COMPLEXITY_OPTIONS]
        },
        onCellClicked: onCellClickedHandler
      },
      {
        field: "phase",
        headerName: "Časový plán",
        filter: true,
        flex: 1,
        minWidth: 150,
        cellEditor: OptionSelectEditor,
        cellEditorPopup: true,
        cellEditorParams: {
          values: [...PHASE_OPTIONS]
        },
        onCellClicked: onCellClickedHandler
      },
      {
        field: "info",
        headerName: "Info",
        filter: true,
        flex: 2,
        minWidth: 220,
        tooltipField: "info",
        cellClass: "info-cell-truncate",
        cellEditor: InfoPopupEditor,
        cellEditorPopup: true,
        cellEditorParams: {
          maxLength: 1000,
          rows: 8,
          cols: 60
        },
        suppressKeyboardEvent: (params) => {
          if (params.editing && params.event.key === 'Enter') {
            return true;
          }
          return false;
        },
        onCellClicked: onCellClickedHandler
      },
      {
        field: "status",
        headerName: "Stav",
        filter: true,
        flex: 1,
        minWidth: 160,
        cellRenderer: StatusCellRenderer,
        cellEditor: OptionSelectEditor,
        cellEditorPopup: true,
        cellEditorParams: {
          values: [...ALL_STATUS_OPTIONS]
        },
        onCellClicked: onCellClickedHandler
      },
      {
        headerName: "",
        colId: "archive",
        pinned: "right",
        width: 36,
        minWidth: 36,
        maxWidth: 36,
        suppressMovable: true,
        lockPosition: true,
        sortable: false,
        filter: false,
        resizable: false,
        editable: false,
        cellClass: "action-cell",
        headerClass: "action-cell",
        cellRenderer: ArchiveCellRenderer
      }
    ],
    [DeleteCellRenderer, ArchiveCellRenderer, StatusCellRenderer, onCellClickedHandler]
  );

  // Archive table column definitions
  const archiveColumnDefs = useMemo<ColDef<FutureFunction>[]>(
    () => [
      {
        headerName: "",
        colId: "restore",
        pinned: "left",
        width: 36,
        minWidth: 36,
        maxWidth: 36,
        suppressMovable: true,
        lockPosition: true,
        sortable: false,
        filter: false,
        resizable: false,
        editable: false,
        cellClass: "action-cell",
        headerClass: "action-cell",
        cellRenderer: RestoreCellRenderer
      },
      {
        headerName: "",
        colId: "delete",
        pinned: "left",
        width: 36,
        minWidth: 36,
        maxWidth: 36,
        suppressMovable: true,
        lockPosition: true,
        sortable: false,
        filter: false,
        resizable: false,
        editable: false,
        cellClass: "action-cell",
        headerClass: "action-cell",
        cellRenderer: DeleteCellRenderer
      },
      {
        field: "id",
        headerName: "ID",
        editable: false,
        width: 90,
        minWidth: 80
      },
      {
        field: "name",
        headerName: "Název funkce",
        editable: false,
        filter: true,
        flex: 1.5,
        minWidth: 180
      },
      {
        field: "priority",
        headerName: "Priorita",
        editable: false,
        filter: true,
        flex: 1,
        minWidth: 140
      },
      {
        field: "complexity",
        headerName: "Komplexita",
        editable: false,
        filter: true,
        flex: 1,
        minWidth: 150
      },
      {
        field: "phase",
        headerName: "Časový plán",
        editable: false,
        filter: true,
        flex: 1,
        minWidth: 150
      },
      {
        field: "info",
        headerName: "Info",
        editable: false,
        filter: true,
        flex: 2,
        minWidth: 220,
        tooltipField: "info",
        cellClass: "info-cell-truncate"
      },
      {
        field: "status",
        headerName: "Stav",
        filter: true,
        flex: 1,
        minWidth: 160,
        cellRenderer: StatusCellRenderer,
        cellEditor: OptionSelectEditor,
        cellEditorPopup: true,
        cellEditorParams: {
          values: [...ALL_STATUS_OPTIONS]
        },
        onCellClicked: onCellClickedHandler
      }
    ],
    [DeleteCellRenderer, RestoreCellRenderer, StatusCellRenderer, onCellClickedHandler]
  );

  const onArchiveCellValueChanged = useCallback(
    async (params: CellValueChangedEvent<FutureFunction>) => {
      if (!params.data?.id) {
        return;
      }

      const data = { ...params.data };

      // If status changed to an active-only status, un-archive automatically
      if (params.column.getColId() === "status") {
        if ((ACTIVE_STATUSES as readonly string[]).includes(data.status) && data.status !== "Dokončeno") {
          data.archived = false;
        }
      }

      try {
        await apiPut(`/future-functions/${data.id}`, data);
        await fetchFutureFunctions();
      } catch (error) {
        console.error("Error updating future function:", error);
        alert("Chyba při ukládání změn");
        await fetchFutureFunctions();
      }
    },
    [fetchFutureFunctions]
  );

  return (
    <div className="page-container">
      {/* Active Table */}
      <div className="header-section">
        <h1 className="page-title">Plán budoucích funkcí</h1>
        <button className="add-user-btn" onClick={handleAddFunction} disabled={isLoading}>
          + Přidat funkci
        </button>
      </div>

      <div className="table-section">
        <div className="grid-container">
          <div ref={activeWrapperRef} className="grid-wrapper ag-theme-quartz" style={{ height: 500 }}>
            <AgGridReact<FutureFunction>
              rowData={activeFunctions}
              columnDefs={activeColumnDefs}
              defaultColDef={{
                editable: true,
                resizable: true,
                sortable: true,
                filter: true,
                flex: 1
              }}
              suppressRowClickSelection={true}
              onCellValueChanged={onCellValueChanged}
              loading={isLoading}
              animateRows
            />
          </div>
        </div>
      </div>

      {/* Archive Table */}
      <div className="header-section" style={{ marginTop: "32px" }}>
        <h2
          className="page-title"
          style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.3rem" }}
          onClick={() => setShowArchive((prev) => !prev)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              transform: showArchive ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease"
            }}
          >
            <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Archiv ({archivedFunctions.length})
        </h2>
      </div>

      {showArchive && (
        <div className="table-section">
          <div className="grid-container">
            <div ref={archiveWrapperRef} className="grid-wrapper ag-theme-quartz" style={{ height: Math.min(400, Math.max(150, archivedFunctions.length * 42 + 56)) }}>
              <AgGridReact<FutureFunction>
                rowData={archivedFunctions}
                columnDefs={archiveColumnDefs}
                defaultColDef={{
                  editable: false,
                  resizable: true,
                  sortable: true,
                  filter: true,
                  flex: 1
                }}
                suppressRowClickSelection={true}
                onCellValueChanged={onArchiveCellValueChanged}
                loading={isLoading}
                animateRows
              />
            </div>
          </div>
        </div>
      )}

      <div className="instructions">
        <p>
          <strong>Instrukce pro plán funkcí:</strong>
        </p>
        <ul>
          <li>Použijte tlačítko „Přidat funkci" pro založení nového záznamu</li>
          <li>Kliknutím na buňku lze upravit hodnotu, rozbalovací pole nabízí připravené možnosti</li>
          <li>Sloupec "Info" otevře po kliknutí editor s tlačítky pro potvrzení (✓) a zrušení (×) změn</li>
          <li>Tlačítko s křížkem vlevo odstraní danou položku z plánu</li>
          <li>Změna stavu na <strong>Odloženo</strong> nebo <strong>Zrušeno</strong> automaticky přesune funkci do archivu</li>
          <li>U dokončených funkcí lze kliknout na ikonu archivace vpravo pro ruční archivaci</li>
          <li>V archivu lze funkci obnovit kliknutím na ikonu obnovení nebo změnou stavu na aktivní</li>
        </ul>
      </div>
    </div>
  );
};

export default FutureFunctionsGrid;

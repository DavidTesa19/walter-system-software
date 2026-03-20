import "ag-grid-community/styles/ag-theme-quartz.css";
import "../usersGrid/UsersGrid.css";
import "./FutureFunctionsGrid.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type CellValueChangedEvent, type ColDef, type CellClickedEvent } from "ag-grid-community";
import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";
import { useAuth } from "../auth/AuthContext";
// Import undo/redo hook
import { useUndoRedo } from "../utils/undoRedo";
import InfoPopupEditor from "./cells/InfoPopupEditor";
import OptionSelectEditor from "./cells/OptionSelectEditor";
import FutureFunctionDetail from "./FutureFunctionDetail";
import FutureFunctionCreateModal from "./FutureFunctionCreateModal";
import type { FutureFunction, FutureFunctionDraft } from "./futureFunction.interface";
import type { ICellRendererParams } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

const cloneRecord = (r: any) => JSON.parse(JSON.stringify(r));

const PRIORITY_OPTIONS = ["Nízká", "Střední", "Vysoká"] as const;
const COMPLEXITY_OPTIONS = ["Jednoduchá", "Středně složitá", "Složitá"] as const;
const PHASE_OPTIONS = ["Urgentní", "Střednědobé", "Před spuštěním", "Po spuštění"] as const;

// All statuses
const ALL_STATUS_OPTIONS = ["Plánováno", "Aktuální", "Probíhá", "Ke kontrole", "Dokončeno", "Schváleno", "Neschváleno", "Odloženo", "Zrušeno"] as const;

const STATUS_COLOR_MAP: Record<string, string> = {
  "Plánováno": "#3b82f6",
  "Aktuální": "#22d3ee",
  "Probíhá": "#f59e0b",
  "Ke kontrole": "#a855f7",
  "Dokončeno": "#22c55e",
  "Schváleno": "#a3e635",
  "Neschváleno": "#ef4444",
  "Odloženo": "#6b7280",
  "Zrušeno": "#dc2626"
};

// Statuses that appear in active table
const ACTIVE_STATUSES = ["Plánováno", "Aktuální", "Probíhá", "Ke kontrole", "Dokončeno", "Schváleno", "Neschváleno"] as const;

// Statuses that auto-archive
const AUTO_ARCHIVE_STATUSES = ["Odloženo", "Zrušeno"] as const;

// Statuses that mark a function as completed
const COMPLETION_STATUSES = ["Dokončeno", "Schváleno"] as const;

// Sort order for the status column (lower = higher priority, shown first when ascending)
const ACTIVE_STATUS_ORDER: Record<string, number> = {
  "Schváleno": 0,
  "Neschváleno": 1,
  "Dokončeno": 2,
  "Ke kontrole": 3,
  "Probíhá": 4,
  "Aktuální": 5,
  "Plánováno": 6
};

const ARCHIVE_STATUS_ORDER: Record<string, number> = {
  "Schváleno": 0,
  "Dokončeno": 1,
  "Odloženo": 2,
  "Zrušeno": 3
};

const SUMMARY_ACTIVE_ORDER = ["Schváleno", "Neschváleno", "Dokončeno", "Ke kontrole", "Probíhá", "Aktuální", "Plánováno"];
const SUMMARY_ARCHIVE_ORDER = ["Schváleno", "Dokončeno", "Odloženo", "Zrušeno"];

const createInitialDraft = (mode: "active" | "archive"): FutureFunctionDraft => ({
  name: "",
  priority: PRIORITY_OPTIONS[1],
  complexity: COMPLEXITY_OPTIONS[1],
  phase: PHASE_OPTIONS[1],
  info: "",
  status: mode === "archive" ? "Odloženo" : "Plánováno",
  archived: mode === "archive"
});

const FutureFunctionsGrid: React.FC = () => {
  const [futureFunctions, setFutureFunctions] = useState<FutureFunction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isArchiveView, setIsArchiveView] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState<FutureFunction | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<FutureFunctionDraft>(createInitialDraft("active"));
  const activeWrapperRef = useRef<HTMLDivElement | null>(null);
  const { pushAction, signal, canUndo, canRedo, isBusy, undo, redo } = useUndoRedo();
  const { user } = useAuth();
  const isReadOnly = user?.role === 'salesman' || user?.role === 'viewer';
  const editSnapshotRef = useRef<Record<number, any>>({});

  // Refetch when other views mutate the same resource
  useEffect(() => {
    if (signal?.resource === "future-functions") {
      void fetchFutureFunctions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  const defaultColDef = useMemo<ColDef<FutureFunction>>(
    () => ({
      editable: !isReadOnly,
      resizable: true,
      sortable: true,
      filter: true,
      flex: 1
    }),
    [isReadOnly]
  );

  const getRowId = useCallback((params: { data: FutureFunction }) => String(params.data.id), []);

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

  const openCreateModal = useCallback((mode: "active" | "archive") => {
    setCreateDraft(createInitialDraft(mode));
    setCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    if (isLoading) {
      return;
    }

    setCreateModalOpen(false);
  }, [isLoading]);

  const handleCreateFunction = useCallback(
    async (draft: FutureFunctionDraft) => {
      const newFunction: Omit<FutureFunction, "id"> = {
        ...draft,
        completedAt: (COMPLETION_STATUSES as readonly string[]).includes(draft.status)
          ? new Date().toISOString().split("T")[0]
          : null
      };

      try {
        setIsLoading(true);
        const created = await apiPost<FutureFunction>(`/future-functions`, newFunction);
        await fetchFutureFunctions();
        if (created?.id) {
          pushAction({
            label: "Přidání funkce",
            resource: "future-functions",
            undo: async () => { await apiDelete(`/future-functions/${created.id}`); },
            redo: async () => { await apiPost(`/future-functions`, { ...newFunction, id: created.id }); }
          });
          setSelectedFunction(created);
        }
        setCreateModalOpen(false);
      } catch (error) {
        console.error("Error adding future function:", error);
        alert("Nepodařilo se přidat funkci");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFutureFunctions, pushAction]
  );

  const handleDeleteFunction = useCallback(
    async (func: FutureFunction) => {
      const name = func?.name ? `\"${func.name}\"` : "tuto funkci";

      if (!confirm(`Opravdu chcete smazat ${name}?`)) {
        return;
      }

      const snapshot = cloneRecord(func);
      try {
        setIsLoading(true);
        await apiDelete(`/future-functions/${func.id}`);
        await fetchFutureFunctions();
        pushAction({
          label: `Smazání funkce #${func.id}`,
          resource: "future-functions",
          undo: async () => { await apiPost(`/future-functions`, snapshot); },
          redo: async () => { await apiDelete(`/future-functions/${func.id}`); }
        });
      } catch (error) {
        console.error("Error deleting future function:", error);
        alert("Nepodařilo se smazat funkci");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFutureFunctions, pushAction]
  );

  const handleArchiveFunction = useCallback(
    async (func: FutureFunction) => {
      const snapshot = cloneRecord(func);
      try {
        setIsLoading(true);
        await apiPut(`/future-functions/${func.id}`, { ...func, archived: true });
        await fetchFutureFunctions();
        pushAction({
          label: `Archivace funkce #${func.id}`,
          resource: "future-functions",
          undo: async () => { await apiPut(`/future-functions/${func.id}`, snapshot); },
          redo: async () => { await apiPut(`/future-functions/${func.id}`, { ...func, archived: true }); }
        });
      } catch (error) {
        console.error("Error archiving future function:", error);
        alert("Chyba při archivaci funkce");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFutureFunctions, pushAction]
  );

  const handleRestoreFunction = useCallback(
    async (func: FutureFunction) => {
      if (!func) return;
      const snapshot = cloneRecord(func);

      try {
        setIsLoading(true);
        const newStatus = (AUTO_ARCHIVE_STATUSES as readonly string[]).includes(func.status)
          ? "Plánováno"
          : func.status;
        await apiPut(`/future-functions/${func.id}`, { ...func, archived: false, status: newStatus });
        await fetchFutureFunctions();
        pushAction({
          label: `Obnovení funkce #${func.id}`,
          resource: "future-functions",
          undo: async () => { await apiPut(`/future-functions/${func.id}`, snapshot); },
          redo: async () => { await apiPut(`/future-functions/${func.id}`, { ...func, archived: false, status: newStatus }); }
        });
      } catch (error) {
        console.error("Error restoring future function:", error);
        alert("Chyba při obnovení funkce");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFutureFunctions, pushAction]
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
        // Auto-restore when status changes to an active status (except Dokončeno/Schváleno which stay where they are)
        if ((ACTIVE_STATUSES as readonly string[]).includes(data.status) && data.status !== "Dokončeno" && data.status !== "Schváleno") {
          data.archived = false;
        }
        // Set completedAt when status becomes a completion status
        if ((COMPLETION_STATUSES as readonly string[]).includes(data.status)) {
          data.completedAt = new Date().toISOString().split("T")[0];
        }
      }

      try {
        await apiPut(`/future-functions/${data.id}`, data);
        await fetchFutureFunctions();
        const snap = editSnapshotRef.current[data.id];
        if (snap) {
          const after = cloneRecord(data);
          pushAction({
            label: `Úprava funkce #${data.id}`,
            resource: "future-functions",
            undo: async () => { await apiPut(`/future-functions/${data.id}`, snap); },
            redo: async () => { await apiPut(`/future-functions/${data.id}`, after); }
          });
          delete editSnapshotRef.current[data.id];
        }
      } catch (error) {
        console.error("Error updating future function:", error);
        alert("Chyba při ukládání změn");
        await fetchFutureFunctions();
      }
    },
    [fetchFutureFunctions, pushAction]
  );

  // Detail button cell renderer — opens the detail modal
  const DetailCellRenderer = useCallback((params: ICellRendererParams<FutureFunction>) => {
    const data = params.data;
    if (!data) return null;
    return (
      <button
        type="button"
        onClick={() => setSelectedFunction(data)}
        title="Otevřít detail"
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
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
          <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    );
  }, []);

  // Delete button cell renderer for the pinned column
  const DeleteCellRenderer = useCallback((params: ICellRendererParams<FutureFunction>) => {
    const data = params.data;
    if (!data) return null;
    return (
      <button
        type="button"
        onClick={() => handleDeleteFunction(data)}
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
    if (!data || (data.status !== "Dokončeno" && data.status !== "Schváleno") || data.archived) return null;
    return (
      <button
        type="button"
        onClick={() => handleArchiveFunction(data)}
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
        onClick={() => handleRestoreFunction(data)}
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

    const color = STATUS_COLOR_MAP[status] ?? "#888";

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

  const activeColumnDefs = useMemo<ColDef<FutureFunction>[]>(
    () => ([
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
        headerName: "",
        colId: "detail",
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
        cellRenderer: DetailCellRenderer
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
        flex: 2.5,
        minWidth: 250
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
        comparator: (a: string, b: string) => (ACTIVE_STATUS_ORDER[a] ?? 99) - (ACTIVE_STATUS_ORDER[b] ?? 99),
        onCellClicked: onCellClickedHandler
      },
      {
        field: "completedAt",
        headerName: "Datum dokončení",
        editable: false,
        filter: true,
        width: 145,
        minWidth: 135,
        valueFormatter: (params: { value: string | null | undefined }) => params.value ?? ""
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
    ] as ColDef<FutureFunction>[]).filter(col => !isReadOnly || (col.colId !== 'delete' && col.colId !== 'archive')),
    [DeleteCellRenderer, ArchiveCellRenderer, DetailCellRenderer, StatusCellRenderer, onCellClickedHandler, isReadOnly]
  );

  const archiveColumnDefs = useMemo<ColDef<FutureFunction>[]>(
    () => ([
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
        headerName: "",
        colId: "detail",
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
        cellRenderer: DetailCellRenderer
      },
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
        flex: 2.5,
        minWidth: 250
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
        minWidth: 190,
        width: 210,
        cellRenderer: StatusCellRenderer,
        cellEditor: OptionSelectEditor,
        cellEditorPopup: true,
        cellEditorParams: {
          values: [...ALL_STATUS_OPTIONS]
        },
        comparator: (a: string, b: string) => (ARCHIVE_STATUS_ORDER[a] ?? 99) - (ARCHIVE_STATUS_ORDER[b] ?? 99),
        onCellClicked: onCellClickedHandler
      },
      {
        field: "completedAt",
        headerName: "Datum dokončení",
        editable: false,
        filter: true,
        width: 145,
        minWidth: 135,
        valueFormatter: (params: { value: string | null | undefined }) => params.value ?? ""
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
      }
    ] as ColDef<FutureFunction>[]).filter(col => !isReadOnly || (col.colId !== 'delete' && col.colId !== 'restore')),
    [DeleteCellRenderer, RestoreCellRenderer, DetailCellRenderer, StatusCellRenderer, onCellClickedHandler, isReadOnly]
  );

  const onArchiveCellValueChanged = useCallback(
    async (params: CellValueChangedEvent<FutureFunction>) => {
      if (!params.data?.id) {
        return;
      }

      const data = { ...params.data };

      // If status changed to an active-only status, un-archive automatically
      if (params.column.getColId() === "status") {
        if ((ACTIVE_STATUSES as readonly string[]).includes(data.status) && data.status !== "Dokončeno" && data.status !== "Schváleno") {
          data.archived = false;
        }
        // Set completedAt when status becomes a completion status
        if ((COMPLETION_STATUSES as readonly string[]).includes(data.status)) {
          data.completedAt = new Date().toISOString().split("T")[0];
        }
      }

      try {
        await apiPut(`/future-functions/${data.id}`, data);
        await fetchFutureFunctions();
        const snap = editSnapshotRef.current[data.id];
        if (snap) {
          const after = cloneRecord(data);
          pushAction({
            label: `Úprava archivované funkce #${data.id}`,
            resource: "future-functions",
            undo: async () => { await apiPut(`/future-functions/${data.id}`, snap); },
            redo: async () => { await apiPut(`/future-functions/${data.id}`, after); }
          });
          delete editSnapshotRef.current[data.id];
        }
      } catch (error) {
        console.error("Error updating future function:", error);
        alert("Chyba při ukládání změn");
        await fetchFutureFunctions();
      }
    },
    [fetchFutureFunctions, pushAction]
  );

  const currentRowData = isArchiveView ? archivedFunctions : activeFunctions;
  const currentColumnDefs = isArchiveView ? archiveColumnDefs : activeColumnDefs;
  const currentOnCellValueChanged = isArchiveView ? onArchiveCellValueChanged : onCellValueChanged;
  const currentGridHeight = "clamp(520px, 68vh, 760px)";

  // Status counts for summary strip
  const statusSummary = useMemo(() => {
    const countByStatus = (rows: FutureFunction[]) => {
      const counts: Record<string, number> = {};
      for (const row of rows) {
        const key = row.status || "(bez stavu)";
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    };

    const toEntries = (counts: Record<string, number>, order: string[]) =>
      order
        .filter((s) => (counts[s] ?? 0) > 0)
        .map((s) => ({ status: s, count: counts[s]! }));

    return {
      activeTotal: activeFunctions.length,
      archivedTotal: archivedFunctions.length,
      activeEntries: toEntries(countByStatus(activeFunctions), SUMMARY_ACTIVE_ORDER),
      archivedEntries: toEntries(countByStatus(archivedFunctions), SUMMARY_ARCHIVE_ORDER)
    };
  }, [activeFunctions, archivedFunctions]);

  return (
    <div className="page-container future-functions-page">
      <div
        className="header-section"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: "12px"
        }}
      >
        <h1 className="page-title" style={{ justifySelf: "start" }}>
          Plán budoucích funkcí
        </h1>
        <div className="navigation-tabs" style={{ justifySelf: "center" }}>
          <button
            type="button"
            className={`nav-tab${!isArchiveView ? " active" : ""}`}
            onClick={() => setIsArchiveView(false)}
          >
            📋 Aktivní
          </button>
          <button
            type="button"
            className={`nav-tab${isArchiveView ? " active" : ""}`}
            onClick={() => setIsArchiveView(true)}
          >
            📦 Archiv
          </button>
        </div>
        <div className="header-actions" style={{ justifySelf: "end" }}>
          <button
            className="undo-redo-btn"
            onClick={undo}
            disabled={!canUndo || isBusy}
            title="Zpět (Ctrl+Z)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 10h10a5 5 0 0 1 0 10H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 6l-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="undo-redo-btn"
            onClick={redo}
            disabled={!canRedo || isBusy}
            title="Znovu (Ctrl+Y)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 10H11a5 5 0 0 0 0 10h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {!isReadOnly && (
            <button
              className="add-user-btn"
              onClick={() => openCreateModal(isArchiveView ? "archive" : "active")}
              disabled={isLoading}
            >
              + Přidat funkci
            </button>
          )}
        </div>
      </div>

      {/* Status summary */}
      <div
        className="future-functions-summary"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          marginBottom: "12px",
          padding: "10px 14px",
          borderRadius: "12px",
          background: "var(--color-surface-alt)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--color-shadow-sm)",
          textAlign: "left"
        }}
      >
        {[
          { label: "Aktivní", total: statusSummary.activeTotal, entries: statusSummary.activeEntries },
          { label: "Archiv", total: statusSummary.archivedTotal, entries: statusSummary.archivedEntries }
        ].map(({ label, total, entries }) => (
          <div key={label} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-subheading)", fontWeight: 700, color: "var(--color-text)", minWidth: "90px" }}>
              {label} ({total})
            </span>
            {entries.map(({ status, count }) => (
              <span
                key={status}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  background: "var(--color-surface-hover)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-subheading)",
                  fontSize: "0.85rem"
                }}
              >
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: STATUS_COLOR_MAP[status] ?? "#888", flexShrink: 0 }} />
                {status}: {count}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="table-section future-functions-table-section">
        <div className="grid-container future-functions-grid-container">
          <div ref={activeWrapperRef} className="grid-wrapper ff-grid-wrapper ag-theme-quartz" style={{ height: currentGridHeight }}>
            <AgGridReact<FutureFunction>
              rowData={currentRowData}
              columnDefs={currentColumnDefs}
              defaultColDef={defaultColDef}
              getRowId={getRowId}
              suppressScrollOnNewData={true}
              suppressRowClickSelection={true}
              onCellEditingStarted={(e: any) => {
                if (e.data?.id != null) {
                  editSnapshotRef.current[e.data.id] = cloneRecord(e.data);
                }
              }}
              onCellValueChanged={currentOnCellValueChanged}
              loading={isLoading}
              animateRows
            />
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <FutureFunctionCreateModal
        open={createModalOpen}
        initialValues={createDraft}
        priorityOptions={PRIORITY_OPTIONS}
        complexityOptions={COMPLEXITY_OPTIONS}
        phaseOptions={PHASE_OPTIONS}
        statusOptions={ALL_STATUS_OPTIONS}
        isSubmitting={isLoading}
        onClose={closeCreateModal}
        onSubmit={handleCreateFunction}
      />

      {selectedFunction && (
        <FutureFunctionDetail
          func={selectedFunction}
          onClose={() => setSelectedFunction(null)}
          onUpdate={fetchFutureFunctions}
          readOnly={isReadOnly}
        />
      )}
    </div>
  );
};

export default FutureFunctionsGrid;

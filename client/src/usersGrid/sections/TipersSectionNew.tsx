import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { TiperEntity, TiperCommission, TiperGridRow } from "../types/entities";
import ProfileCellRenderer from "../cells/ProfileCellRenderer";
import EntityCommissionProfilePanel, {
  type EntityData,
  type CommissionData,
  type FieldGroup
} from "../components/EntityCommissionProfilePanel";
import { mapViewToStatus } from "../constants";
import { apiGet, apiPost, apiPut, apiDelete } from "../../utils/api";
import type { SectionProps } from "./SectionTypes";
import useProfileDocuments from "../hooks/useProfileDocuments";
import useProfileNotes from "../hooks/useProfileNotes";
import { ApproveRestoreCellRenderer, DeleteArchiveCellRenderer } from "../cells/RowActionCellRenderers";
import { fieldOptions } from "../fieldOptions";

// Field options as simple string array for AG Grid select
const FIELD_OPTIONS_ARRAY = fieldOptions.map(opt => opt.value);

// =============================================================================
// BUILD ENTITY DATA FOR PROFILE PANEL
// =============================================================================

const buildEntityData = (entity: TiperEntity | null): EntityData | null => {
  if (!entity) return null;

  const groups: FieldGroup[] = [
    {
      title: "Základní údaje",
      color: "purple",
      fields: [
        { key: "name", label: "Jméno / Přezdívka", value: entity.name, type: "text" },
        { key: "company", label: "Organizace", value: entity.company, type: "text" },
        { key: "field", label: "Oblast působení", value: entity.field, type: "select", options: FIELD_OPTIONS_ARRAY },
      ]
    },
    {
      title: "Kontaktní údaje",
      color: "green",
      fields: [
        { key: "mobile", label: "Telefon", value: entity.mobile, type: "text" },
        { key: "email", label: "E-mail", value: entity.email, type: "text" },
        { key: "website", label: "Webové stránky", value: entity.website, type: "text" },
      ]
    },
    {
      title: "Adresa",
      color: "orange",
      fields: [
        { key: "location", label: "Lokalita", value: entity.location, type: "text" },
        { key: "address", label: "Úplná adresa", value: entity.address, type: "textarea" },
      ]
    },
    {
      title: "Informace o tipařovi",
      color: "gray",
      fields: [
        { key: "info", label: "Popis / Poznámky", value: entity.info, type: "textarea", isMultiline: true },
      ]
    }
  ];

  return {
    id: entity.id,
    entity_id: entity.entity_id,
    groups
  };
};

// =============================================================================
// BUILD COMMISSION DATA FOR PROFILE PANEL
// =============================================================================

const buildCommissionData = (commission: TiperCommission | null): CommissionData | null => {
  if (!commission) return null;

  const groups: FieldGroup[] = [
    {
      title: "Základní údaje tipu",
      color: "purple",
      fields: [
        { key: "tip_description", label: "Popis tipu", value: commission.tip_description, type: "textarea" },
        { key: "referred_contact", label: "Doporučený kontakt", value: commission.referred_contact, type: "text" },
        { key: "assigned_to", label: "Odpovědná osoba", value: commission.assigned_to, type: "text" },
      ]
    },
    {
      title: "Finanční údaje",
      color: "green",
      fields: [
        { key: "tip_value", label: "Hodnota tipu", value: commission.tip_value, type: "text" },
        { key: "reward_amount", label: "Odměna tipařovi", value: commission.reward_amount, type: "text" },
        { key: "reward_status", label: "Stav odměny", value: commission.reward_status, type: "select", options: ["Nevyplaceno", "Čeká na schválení", "Schváleno", "Vyplaceno"] },
      ]
    },
    {
      title: "Časové údaje",
      color: "orange",
      fields: [
        { key: "tip_date", label: "Datum tipu", value: commission.tip_date, type: "date" },
        { key: "conversion_date", label: "Datum konverze", value: commission.conversion_date, type: "date" },
        { key: "last_contact", label: "Poslední kontakt", value: commission.last_contact, type: "date" },
      ]
    },
    {
      title: "Stav a poznámky",
      color: "gray",
      fields: [
        { key: "tip_result", label: "Výsledek tipu", value: commission.tip_result, type: "select", options: ["V jednání", "Úspěšný", "Neúspěšný", "Čeká na vyhodnocení"] },
        { key: "priority", label: "Priorita", value: commission.priority, type: "select", options: ["Nízká", "Střední", "Vysoká", "Urgentní"] },
        { key: "next_step", label: "Další krok", value: commission.next_step, type: "textarea" },
        { key: "notes", label: "Poznámky", value: commission.notes, type: "textarea", isMultiline: true },
      ]
    }
  ];

  return {
    id: commission.id,
    commission_id: commission.commission_id,
    status: commission.status,
    groups
  };
};

// =============================================================================
// TIPERS SECTION COMPONENT
// =============================================================================

const TipersSectionNew: React.FC<SectionProps> = ({
  viewMode,
  isActive,
  onRegisterAddHandler,
  onLoadingChange
}) => {
  // State for entities and commissions
  const [entities, setEntities] = useState<TiperEntity[]>([]);
  const [commissions, setCommissions] = useState<TiperCommission[]>([]);
  const [gridData, setGridData] = useState<TiperGridRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Selected entity/commission for profile panel
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [selectedCommissionId, setSelectedCommissionId] = useState<number | null>(null);
  
  const gridRef = useRef<AgGridReact<TiperGridRow>>(null);

  // Get status from viewMode
  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  // Document and notes managers
  const documentManager = useProfileDocuments("tipers", selectedEntityId);
  const notesManager = useProfileNotes("tipers", selectedEntityId);

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [entitiesData, commissionsData] = await Promise.all([
        apiGet<TiperEntity[]>('/tiper-entities'),
        apiGet<TiperCommission[]>(`/tiper-commissions?status=${status}`)
      ]);

      const entitiesList = Array.isArray(entitiesData) ? entitiesData : [];
      const commissionsList = Array.isArray(commissionsData) ? commissionsData : [];

      setEntities(entitiesList);
      setCommissions(commissionsList);

      // Build grid data - each row is a commission with entity info
      const rows: TiperGridRow[] = commissionsList.map(commission => {
        const entity = entitiesList.find(e => e.id === commission.tiper_entity_id);
        return {
          ...commission,
          entity_id: entity?.entity_id || '',
          name: entity?.name || '',
          company: entity?.company || '',
          field: entity?.field || '',
          location: entity?.location || '',
          mobile: entity?.mobile || '',
          email: entity?.email || '',
          entity: entity || null
        };
      });

      setGridData(rows);
    } catch (error) {
      console.error("Error fetching tiper data:", error);
      setEntities([]);
      setCommissions([]);
      setGridData([]);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  // ==========================================================================
  // PROFILE PANEL LOGIC
  // ==========================================================================

  const selectedEntity = useMemo(() => {
    if (selectedEntityId === null) return null;
    return entities.find(e => e.id === selectedEntityId) || null;
  }, [entities, selectedEntityId]);

  const selectedCommission = useMemo(() => {
    if (selectedCommissionId === null) return null;
    return commissions.find(c => c.id === selectedCommissionId) || null;
  }, [commissions, selectedCommissionId]);

  const entityData = useMemo(() => buildEntityData(selectedEntity), [selectedEntity]);
  const commissionData = useMemo(() => buildCommissionData(selectedCommission), [selectedCommission]);

  const openProfile = useCallback((row: TiperGridRow) => {
    if (row.entity) {
      setSelectedEntityId(row.entity.id);
    }
    setSelectedCommissionId(row.id);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedCommissionId(null);
  }, []);

  // ==========================================================================
  // UPDATE HANDLERS
  // ==========================================================================

  const handleUpdateEntity = useCallback(async (entityId: number, updates: Record<string, unknown>) => {
    try {
      await apiPut(`/tiper-entities/${entityId}`, updates);
      fetchData();
    } catch (error) {
      console.error("Error updating tiper entity:", error);
      throw error;
    }
  }, [fetchData]);

  const handleUpdateCommission = useCallback(async (commissionId: number, updates: Record<string, unknown>) => {
    try {
      await apiPut(`/tiper-commissions/${commissionId}`, updates);
      fetchData();
    } catch (error) {
      console.error("Error updating tiper commission:", error);
      throw error;
    }
  }, [fetchData]);

  // ==========================================================================
  // ROW ACTIONS
  // ==========================================================================

  const handleApprove = useCallback(async (id: number) => {
    try {
      await apiPost(`/tiper-commissions/${id}/approve`);
      fetchData();
    } catch (error) {
      console.error("Error approving commission:", error);
      alert("Chyba při schvalování tipu");
    }
  }, [fetchData]);

  const handleRestore = useCallback(async (id: number) => {
    try {
      await apiPost(`/tiper-commissions/${id}/restore`);
      fetchData();
    } catch (error) {
      console.error("Error restoring commission:", error);
      alert("Chyba při obnovování tipu");
    }
  }, [fetchData]);

  const handleDelete = useCallback(async (id: number) => {
    const commission = commissions.find(c => c.id === id);
    const row = gridData.find(r => r.id === id);
    const isArchived = commission?.status === "archived";
    const isPending = commission?.status === "pending";

    let confirmMessage = "";
    if (isArchived) {
      confirmMessage = `Opravdu chcete TRVALE SMAZAT tento tip z databáze?\n\nPopis: ${commission?.tip_description || "N/A"}\nTipař: ${row?.name || "N/A"}\n\nTato akce je NEzvratná!`;
    } else if (isPending) {
      confirmMessage = `Opravdu chcete zamítnout tento tip?\n\nPopis: ${commission?.tip_description || "N/A"}\nTipař: ${row?.name || "N/A"}`;
    } else {
      confirmMessage = `Opravdu chcete přesunout tento tip do archivu?\n\nPopis: ${commission?.tip_description || "N/A"}\nTipař: ${row?.name || "N/A"}`;
    }

    if (!confirm(confirmMessage)) return;

    try {
      if (isArchived || isPending) {
        await apiDelete(`/tiper-commissions/${id}`);
      } else {
        await apiPost(`/tiper-commissions/${id}/archive`);
      }
      fetchData();
    } catch (error) {
      console.error("Error performing action:", error);
      alert("Chyba při provádění akce");
    }
  }, [commissions, gridData, fetchData]);

  // ==========================================================================
  // GRID CONTEXT
  // ==========================================================================

  const gridContext = useMemo(() => ({
    openProfile,
    rowActions: {
      viewMode,
      entityAccusative: "tip",
      onApprove: handleApprove,
      onRestore: handleRestore,
      onDelete: handleDelete
    }
  }), [openProfile, viewMode, handleApprove, handleRestore, handleDelete]);

  // ==========================================================================
  // CELL VALUE CHANGED
  // ==========================================================================

  const onCellValueChanged = useCallback(async (params: any) => {
    try {
      const row = params.data as TiperGridRow;
      const field = params.colDef.field;
      const newValue = params.newValue;

      const entityFields = ['name', 'company', 'field', 'location', 'mobile', 'email'];
      
      if (entityFields.includes(field) && row.entity) {
        await apiPut(`/tiper-entities/${row.entity.id}`, { [field]: newValue });
      } else {
        await apiPut(`/tiper-commissions/${row.id}`, { [field]: newValue });
      }
      
      fetchData();
    } catch (error) {
      console.error("Error updating:", error);
      alert("Chyba při aktualizaci");
      fetchData();
    }
  }, [fetchData]);

  // ==========================================================================
  // ADD NEW TIPER + COMMISSION
  // ==========================================================================

  const handleAdd = useCallback(async () => {
    try {
      const response = await apiPost<{ entity: TiperEntity; commission: TiperCommission }>('/tiper-entities/with-commission', {
        entity: {
          name: "Nový Tipař",
          company: "",
          location: "",
          mobile: "",
          email: "",
          field: ""
        },
        commission: {
          tip_description: "Nový Tip",
          status: status,
          tip_value: "",
          reward_amount: ""
        }
      });
      
      fetchData();
      
      if (response?.entity && response?.commission) {
        setSelectedEntityId(response.entity.id);
        setSelectedCommissionId(response.commission.id);
      }
    } catch (error) {
      console.error("Error adding tiper:", error);
      alert("Chyba při přidávání tipařia");
    }
  }, [fetchData, status]);

  // ==========================================================================
  // EFFECTS
  // ==========================================================================

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isActive) {
      onRegisterAddHandler(handleAdd);
      onLoadingChange(isLoading);
    }
    return () => {
      if (isActive) {
        onLoadingChange(false);
      }
    };
  }, [handleAdd, isActive, isLoading, onLoadingChange, onRegisterAddHandler]);

  useEffect(() => {
    if (selectedCommissionId !== null) {
      const exists = commissions.some(c => c.id === selectedCommissionId);
      if (!exists) {
        closeProfile();
      }
    }
  }, [commissions, selectedCommissionId, closeProfile]);

  // ==========================================================================
  // COLUMN DEFINITIONS
  // ==========================================================================

  const columnDefs = useMemo<ColDef<TiperGridRow>[]>(() => {
    const cols: ColDef<TiperGridRow>[] = [];

    if (viewMode === "pending" || viewMode === "archived") {
      cols.push({
        headerName: "",
        colId: "approve",
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
        menuTabs: [],
        cellClass: "action-cell",
        headerClass: "action-cell",
        cellRenderer: ApproveRestoreCellRenderer
      });
    }

    cols.push({
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
      menuTabs: [],
      cellClass: "action-cell",
      headerClass: "action-cell",
      cellRenderer: DeleteArchiveCellRenderer
    });

    cols.push({
      headerName: "",
      colId: "profile",
      pinned: "left",
      width: 60,
      minWidth: 60,
      maxWidth: 68,
      suppressMovable: true,
      lockPosition: true,
      sortable: false,
      filter: false,
      resizable: false,
      cellClass: "profile-cell",
      headerClass: "profile-cell",
      cellRenderer: ProfileCellRenderer,
      editable: false,
      menuTabs: []
    });

    // ID column - show combined entity_id + commission_id
    cols.push({
      headerName: "ID",
      colId: "display_id",
      valueGetter: (params) => {
        const row = params.data as TiperGridRow;
        return `${row.entity_id}-${row.commission_id.split('-')[1] || row.commission_id}`;
      },
      flex: 0.7,
      minWidth: 90,
      editable: false
    });

    // Entity info columns
    cols.push(
      {
        field: "name",
        headerName: "Jméno / Přezdívka",
        filter: true,
        editable: true,
        flex: 1.5,
        minWidth: 140
      },
      {
        field: "field",
        headerName: "Oblast",
        filter: true,
        editable: true,
        flex: 1,
        minWidth: 100,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: {
          values: FIELD_OPTIONS_ARRAY
        }
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
        headerName: "Telefon",
        filter: true,
        editable: true,
        flex: 1,
        minWidth: 100
      }
    );

    // Commission info columns
    cols.push(
      {
        field: "tip_description",
        headerName: "Popis tipu",
        filter: true,
        editable: true,
        flex: 2,
        minWidth: 180
      },
      {
        field: "tip_value",
        headerName: "Hodnota",
        filter: true,
        editable: true,
        flex: 0.8,
        minWidth: 80
      },
      {
        field: "reward_amount",
        headerName: "Odměna",
        filter: true,
        editable: true,
        flex: 0.8,
        minWidth: 80
      },
      {
        field: "tip_result",
        headerName: "Výsledek",
        filter: true,
        editable: true,
        flex: 1,
        minWidth: 100,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: {
          values: ["V jednání", "Úspěšný", "Neúspěšný", "Čeká na vyhodnocení"]
        }
      }
    );

    return cols;
  }, [viewMode]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <>
      <div className="grid-container">
        <div className="grid-wrapper ag-theme-quartz" style={{ height: 500 }}>
          <AgGridReact<TiperGridRow>
            ref={gridRef}
            rowData={gridData}
            columnDefs={columnDefs}
            onCellValueChanged={onCellValueChanged}
            defaultColDef={{
              resizable: true,
              sortable: true
            }}
            suppressRowClickSelection={true}
            loading={isLoading}
            context={gridContext}
          />
        </div>
      </div>

      <EntityCommissionProfilePanel
        open={selectedCommissionId !== null}
        entityType="tiper"
        entityLabel="Tipař"
        entity={entityData}
        commission={commissionData}
        onClose={closeProfile}
        onUpdateEntity={handleUpdateEntity}
        onUpdateCommission={handleUpdateCommission}
        documents={documentManager.documents}
        documentsLoading={documentManager.isLoading}
        documentsUploading={documentManager.isUploading}
        documentDownloadBaseUrl={documentManager.downloadBaseUrl}
        onUploadDocument={documentManager.uploadDocument}
        onDeleteDocument={documentManager.deleteDocument}
        onArchiveDocument={documentManager.archiveDocument}
        archivedDocuments={documentManager.archivedDocuments}
        notes={notesManager.notes}
        notesLoading={notesManager.isLoading}
        notesCreating={notesManager.isCreating}
        onAddNote={notesManager.createNote}
        onDeleteNote={notesManager.deleteNote}
      />
    </>
  );
};

export default TipersSectionNew;

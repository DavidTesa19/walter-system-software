import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { ClientEntity, ClientCommission, ClientGridRow } from "../types/entities";
import ProfileCellRenderer from "../cells/ProfileCellRenderer";
import EntityCommissionCreateModal from "../components/EntityCommissionCreateModal";
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

type ClientEntityApi = {
  id: number;
  entity_id: string;
  company_name?: string | null;
  field?: string | null;
  service?: string | null;
  budget?: string | null;
  location?: string | null;
  info?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ClientCommissionApi = {
  id: number;
  commission_id: string;
  entity_id: number;
  status: "pending" | "accepted" | "archived";
  position?: string | null;
  budget?: string | null;
  state?: string | null;
  assigned_to?: string | null;
  field?: string | null;
  service_position?: string | null;
  location?: string | null;
  category?: string | null;
  deadline?: string | null;
  priority?: string | null;
  phone?: string | null;
  commission_value?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

const FIELD_OPTIONS_ARRAY = fieldOptions.map((opt) => opt.value);
const joinName = (...parts: Array<string | null | undefined>) => parts.filter((part): part is string => Boolean(part && part.trim())).join(" ").trim();

type ClientCreateDraft = {
  entity: Record<string, string>;
  commission: Record<string, string>;
};

const emptyToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const createDefaultClientDraft = (): ClientCreateDraft => ({
  entity: {
    name: "",
    company: "",
    field: "",
    mobile: "",
    email: "",
    website: "",
    location: "",
    info: ""
  },
  commission: {
    position: "",
    service_position: "",
    assigned_to: "",
    budget: "",
    commission_value: "",
    priority: "",
    state: "",
    deadline: "",
    notes: ""
  }
});

const normalizeClientEntity = (entity: ClientEntityApi): ClientEntity => ({
  id: entity.id,
  entity_id: entity.entity_id,
  name: joinName(entity.first_name, entity.last_name) || entity.company_name || entity.entity_id,
  company: entity.company_name ?? null,
  field: entity.field ?? null,
  location: entity.location ?? null,
  address: null,
  mobile: entity.phone ?? null,
  email: entity.email ?? null,
  website: entity.website ?? null,
  info: entity.info ?? null,
  created_at: entity.created_at,
  updated_at: entity.updated_at
});

const normalizeClientCommission = (commission: ClientCommissionApi): ClientCommission => ({
  id: commission.id,
  commission_id: commission.commission_id,
  client_entity_id: Number(commission.entity_id),
  status: commission.status,
  assigned_to: commission.assigned_to ?? null,
  priority: commission.priority ?? null,
  notes: commission.notes ?? null,
  deadline: commission.deadline ?? null,
  state: commission.state ?? null,
  commission_value: commission.commission_value ?? null,
  position: commission.position ?? null,
  budget: commission.budget ?? null,
  service_position: commission.service_position ?? null,
  field: commission.field ?? null,
  location: commission.location ?? null,
  category: commission.category ?? null,
  phone: commission.phone ?? null,
  created_at: commission.created_at,
  updated_at: commission.updated_at
});

const mapClientEntityUpdates = (updates: Record<string, unknown>) => {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === "name") mapped.first_name = value;
    else if (key === "company") mapped.company_name = value;
    else if (key === "mobile") mapped.phone = value;
    else if (["field", "location", "email", "website", "info"].includes(key)) mapped[key] = value;
  }
  return mapped;
};

// =============================================================================
// BUILD ENTITY DATA FOR PROFILE PANEL
// =============================================================================

const buildEntityData = (entity: ClientEntity | null): EntityData | null => {
  if (!entity) return null;

  const groups: FieldGroup[] = [
    {
      title: "Základní údaje",
      color: "purple",
      fields: [
        { key: "name", label: "Jméno / Název", value: entity.name, type: "text" },
        { key: "company", label: "Společnost", value: entity.company, type: "text" },
        { key: "field", label: "Obor činnosti", value: entity.field, type: "select", options: FIELD_OPTIONS_ARRAY },
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
      title: "Informace o klientovi",
      color: "gray",
      fields: [
        { key: "location", label: "Lokalita", value: entity.location, type: "text" },
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

const buildCommissionData = (commission: ClientCommission | null): CommissionData | null => {
  if (!commission) return null;

  const groups: FieldGroup[] = [
    {
      title: "Základní údaje zakázky",
      color: "purple",
      fields: [
        { key: "position", label: "Zakázka", value: commission.position, type: "text" },
        { key: "service_position", label: "Typ služby", value: commission.service_position, type: "text" },
        { key: "assigned_to", label: "Odpovědná osoba", value: commission.assigned_to, type: "text" },
      ]
    },
    {
      title: "Finanční údaje",
      color: "green",
      fields: [
        { key: "budget", label: "Rozpočet", value: commission.budget, type: "text" },
        { key: "commission_value", label: "Provize", value: commission.commission_value, type: "text" },
        { key: "priority", label: "Priorita", value: commission.priority, type: "select", options: ["Nízká", "Střední", "Vysoká", "Urgentní"] },
      ]
    },
    {
      title: "Časové údaje",
      color: "orange",
      fields: [
        { key: "state", label: "Stav", value: commission.state, type: "text" },
        { key: "deadline", label: "Termín", value: commission.deadline, type: "date" },
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

const buildClientDraftEntityData = (draft: ClientCreateDraft): EntityData => ({
  id: 0,
  entity_id: "Nový klient",
  groups: buildEntityData({
    id: 0,
    entity_id: "Nový klient",
    name: draft.entity.name,
    company: draft.entity.company,
    field: draft.entity.field,
    location: draft.entity.location,
    address: null,
    mobile: draft.entity.mobile,
    email: draft.entity.email,
    website: draft.entity.website,
    info: draft.entity.info,
    created_at: undefined,
    updated_at: undefined
  })!.groups
});

const buildClientDraftCommissionData = (draft: ClientCreateDraft, status: ClientCommissionApi["status"]): CommissionData => ({
  id: 0,
  commission_id: "Nová zakázka",
  status,
  groups: buildCommissionData({
    id: 0,
    commission_id: "Nová zakázka",
    client_entity_id: 0,
    status,
    assigned_to: draft.commission.assigned_to,
    priority: draft.commission.priority,
    notes: draft.commission.notes,
    deadline: draft.commission.deadline,
    state: draft.commission.state,
    commission_value: draft.commission.commission_value,
    position: draft.commission.position,
    budget: draft.commission.budget,
    service_position: draft.commission.service_position,
    field: null,
    location: null,
    category: null,
    phone: null,
    created_at: undefined,
    updated_at: undefined
  })!.groups
});

// =============================================================================
// CLIENTS SECTION COMPONENT
// =============================================================================

const ClientsSectionNew: React.FC<SectionProps> = ({
  viewMode,
  isActive,
  onRegisterAddHandler,
  onLoadingChange
}) => {
  // State for entities and commissions
  const [entities, setEntities] = useState<ClientEntity[]>([]);
  const [commissions, setCommissions] = useState<ClientCommission[]>([]);
  const [gridData, setGridData] = useState<ClientGridRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<ClientCreateDraft>(createDefaultClientDraft);
  
  // Selected entity/commission for profile panel
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [selectedCommissionId, setSelectedCommissionId] = useState<number | null>(null);
  
  const gridRef = useRef<AgGridReact<ClientGridRow>>(null);

  // Get status from viewMode
  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  // Document and notes managers
  const documentManager = useProfileDocuments("clients", selectedEntityId);
  const notesManager = useProfileNotes("clients", selectedEntityId);

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [entitiesData, commissionsData] = await Promise.all([
        apiGet<ClientEntityApi[]>('/api/client-entities'),
        apiGet<ClientCommissionApi[]>(`/api/client-commissions?status=${status}`)
      ]);

      const entitiesList = (Array.isArray(entitiesData) ? entitiesData : []).map(normalizeClientEntity);
      const commissionsList = (Array.isArray(commissionsData) ? commissionsData : []).map(normalizeClientCommission);

      setEntities(entitiesList);
      setCommissions(commissionsList);

      // Build grid data - each row is a commission with entity info
      const rows: ClientGridRow[] = commissionsList.map(commission => {
        const entity = entitiesList.find(e => e.id === commission.client_entity_id);
        return {
          ...commission,
          entity_id: entity?.entity_id || commission.commission_id.split('-')[0] || '',
          name: entity?.name || '',
          company: entity?.company || '',
          field: entity?.field || commission.field || '',
          location: entity?.location || commission.location || '',
          mobile: entity?.mobile || commission.phone || '',
          email: entity?.email || '',
          entity: entity || null
        };
      });

      setGridData(rows);
    } catch (error) {
      console.error("Error fetching client data:", error);
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
  const draftEntityData = useMemo(() => buildClientDraftEntityData(createDraft), [createDraft]);
  const draftCommissionData = useMemo(() => buildClientDraftCommissionData(createDraft, status), [createDraft, status]);

  const openProfile = useCallback((row: ClientGridRow) => {
    if (row.entity) {
      setSelectedEntityId(row.entity.id);
    }
    setSelectedCommissionId(row.id);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedCommissionId(null);
  }, []);

  const openCreateModal = useCallback((draft?: ClientCreateDraft) => {
    setCreateDraft(draft ?? createDefaultClientDraft());
    setCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    if (isCreating) return;
    setCreateModalOpen(false);
    setCreateDraft(createDefaultClientDraft());
  }, [isCreating]);

  const handleDraftEntityChange = useCallback((key: string, value: string) => {
    setCreateDraft((current) => ({ ...current, entity: { ...current.entity, [key]: value } }));
  }, []);

  const handleDraftCommissionChange = useCallback((key: string, value: string) => {
    setCreateDraft((current) => ({ ...current, commission: { ...current.commission, [key]: value } }));
  }, []);

  // ==========================================================================
  // UPDATE HANDLERS
  // ==========================================================================

  const handleUpdateEntity = useCallback(async (entityId: number, updates: Record<string, unknown>) => {
    try {
      const mappedUpdates = mapClientEntityUpdates(updates);
      if (Object.keys(mappedUpdates).length === 0) return;
      await apiPut(`/api/client-entities/${entityId}`, mappedUpdates);
      fetchData();
    } catch (error) {
      console.error("Error updating client entity:", error);
      throw error;
    }
  }, [fetchData]);

  const handleUpdateCommission = useCallback(async (commissionId: number, updates: Record<string, unknown>) => {
    try {
      await apiPut(`/api/client-commissions/${commissionId}`, updates);
      fetchData();
    } catch (error) {
      console.error("Error updating client commission:", error);
      throw error;
    }
  }, [fetchData]);

  // ==========================================================================
  // ROW ACTIONS
  // ==========================================================================

  const handleApprove = useCallback(async (id: number) => {
    try {
      await apiPost(`/api/client-commissions/${id}/approve`);
      fetchData();
    } catch (error) {
      console.error("Error approving commission:", error);
      alert("Chyba při schvalování zakázky");
    }
  }, [fetchData]);

  const handleRestore = useCallback(async (id: number) => {
    try {
      await apiPost(`/api/client-commissions/${id}/restore`);
      fetchData();
    } catch (error) {
      console.error("Error restoring commission:", error);
      alert("Chyba při obnovování zakázky");
    }
  }, [fetchData]);

  const handleDelete = useCallback(async (id: number) => {
    const commission = commissions.find(c => c.id === id);
    const row = gridData.find(r => r.id === id);
    const isArchived = commission?.status === "archived";
    const isPending = commission?.status === "pending";

    let confirmMessage = "";
    if (isArchived) {
      confirmMessage = `Opravdu chcete TRVALE SMAZAT tuto zakázku z databáze?\n\nZakázka: ${commission?.position || "N/A"}\nKlient: ${row?.name || row?.company || "N/A"}\n\nTato akce je NEzvratná!`;
    } else if (isPending) {
      confirmMessage = `Opravdu chcete zamítnout tuto zakázku?\n\nZakázka: ${commission?.position || "N/A"}\nKlient: ${row?.name || row?.company || "N/A"}`;
    } else {
      confirmMessage = `Opravdu chcete přesunout tuto zakázku do archivu?\n\nZakázka: ${commission?.position || "N/A"}\nKlient: ${row?.name || row?.company || "N/A"}`;
    }

    if (!confirm(confirmMessage)) return;

    try {
      if (isArchived || isPending) {
        await apiDelete(`/api/client-commissions/${id}`);
      } else {
        await apiPost(`/api/client-commissions/${id}/archive`);
      }
      fetchData();
    } catch (error) {
      console.error("Error performing action:", error);
      alert("Chyba při provádění akce");
    }
  }, [commissions, gridData, fetchData]);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    try {
      const response = await apiPost<{ entity: ClientEntity; commission: ClientCommission }>("/api/client-entities/with-commission", {
        entity: {
          first_name: emptyToNull(createDraft.entity.name),
          company_name: emptyToNull(createDraft.entity.company),
          field: emptyToNull(createDraft.entity.field),
          phone: emptyToNull(createDraft.entity.mobile),
          email: emptyToNull(createDraft.entity.email),
          website: emptyToNull(createDraft.entity.website),
          location: emptyToNull(createDraft.entity.location),
          info: emptyToNull(createDraft.entity.info)
        },
        commission: {
          position: emptyToNull(createDraft.commission.position),
          service_position: emptyToNull(createDraft.commission.service_position),
          assigned_to: emptyToNull(createDraft.commission.assigned_to),
          budget: emptyToNull(createDraft.commission.budget),
          commission_value: emptyToNull(createDraft.commission.commission_value),
          priority: emptyToNull(createDraft.commission.priority),
          state: emptyToNull(createDraft.commission.state),
          deadline: emptyToNull(createDraft.commission.deadline),
          notes: emptyToNull(createDraft.commission.notes),
          status
        }
      });

      setCreateModalOpen(false);
      setCreateDraft(createDefaultClientDraft());
      await fetchData();

      if (response?.entity && response?.commission) {
        setSelectedEntityId(response.entity.id);
        setSelectedCommissionId(response.commission.id);
      }
    } catch (error) {
      console.error("Error adding client:", error);
      alert("Chyba při vytváření klienta");
    } finally {
      setIsCreating(false);
    }
  }, [createDraft, fetchData, status]);

  const handleDuplicateEntityCommission = useCallback(() => {
    if (!selectedEntity || !selectedCommission) return;
    closeProfile();
    openCreateModal({
      entity: {
        name: selectedEntity.name ?? "",
        company: selectedEntity.company ?? "",
        field: selectedEntity.field ?? "",
        mobile: selectedEntity.mobile ?? "",
        email: selectedEntity.email ?? "",
        website: selectedEntity.website ?? "",
        location: selectedEntity.location ?? "",
        info: selectedEntity.info ?? ""
      },
      commission: {
        position: selectedCommission.position ?? "",
        service_position: selectedCommission.service_position ?? "",
        assigned_to: selectedCommission.assigned_to ?? "",
        budget: selectedCommission.budget ?? "",
        commission_value: selectedCommission.commission_value ?? "",
        priority: selectedCommission.priority ?? "",
        state: selectedCommission.state ?? "",
        deadline: selectedCommission.deadline ?? "",
        notes: selectedCommission.notes ?? ""
      }
    });
  }, [closeProfile, openCreateModal, selectedCommission, selectedEntity]);

  const handleDuplicateCommission = useCallback(async () => {
    if (!selectedEntity || !selectedCommission) return;

    try {
      const response = await apiPost<{ id: number }>("/api/client-commissions", {
        entity_id: selectedEntity.id,
        position: selectedCommission.position,
        service_position: selectedCommission.service_position,
        assigned_to: selectedCommission.assigned_to,
        budget: selectedCommission.budget,
        commission_value: selectedCommission.commission_value,
        priority: selectedCommission.priority,
        state: selectedCommission.state,
        deadline: selectedCommission.deadline,
        notes: selectedCommission.notes,
        status: selectedCommission.status
      });

      await fetchData();

      if (response?.id) {
        setSelectedEntityId(selectedEntity.id);
        setSelectedCommissionId(response.id);
      }
    } catch (error) {
      console.error("Error duplicating client commission:", error);
      alert("Chyba při duplikaci zakázky");
    }
  }, [fetchData, selectedCommission, selectedEntity]);

  // ==========================================================================
  // GRID CONTEXT
  // ==========================================================================

  const gridContext = useMemo(() => ({
    openProfile,
    rowActions: {
      viewMode,
      entityAccusative: "zakázku",
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
      const row = params.data as ClientGridRow;
      const field = params.colDef.field as string | undefined;
      const newValue = params.newValue;

      if (!field) return;

      const entityFields = ['name', 'company', 'field', 'location', 'mobile', 'email'];
      
      if (entityFields.includes(field) && row.entity) {
        await handleUpdateEntity(row.entity.id, { [field]: newValue });
      } else {
        await handleUpdateCommission(row.id, { [field]: newValue });
      }
    } catch (error) {
      console.error("Error updating:", error);
      alert("Chyba při aktualizaci");
      fetchData();
    }
  }, [fetchData, handleUpdateCommission, handleUpdateEntity]);

  // ==========================================================================
  // ADD NEW CLIENT + COMMISSION
  // ==========================================================================

  const handleAdd = useCallback(async () => {
    openCreateModal();
  }, [openCreateModal]);

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

  const columnDefs = useMemo<ColDef<ClientGridRow>[]>(() => {
    const cols: ColDef<ClientGridRow>[] = [];

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
        const row = params.data as ClientGridRow;
        const entityCode = row.entity_id || row.commission_id.split('-')[0] || '';
        const commissionPart = row.commission_id.split('-')[1] || row.commission_id;
        return `${entityCode}-${commissionPart}`;
      },
      flex: 0.7,
      minWidth: 90,
      editable: false
    });

    // Entity info columns
    cols.push(
      {
        field: "name",
        headerName: "Jméno / Název",
        filter: true,
        editable: true,
        flex: 1.5,
        minWidth: 140
      },
      {
        field: "company",
        headerName: "Společnost",
        filter: true,
        editable: true,
        flex: 1.5,
        minWidth: 140
      },
      {
        field: "field",
        headerName: "Obor",
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
      }
    );

    // Commission info columns
    cols.push(
      {
        field: "position",
        headerName: "Zakázka",
        filter: true,
        editable: true,
        flex: 1.5,
        minWidth: 140
      },
      {
        field: "budget",
        headerName: "Rozpočet",
        filter: true,
        editable: true,
        flex: 1,
        minWidth: 100
      },
      {
        field: "service_position",
        headerName: "Typ služby",
        filter: true,
        editable: true,
        flex: 1,
        minWidth: 100,
        cellEditor: 'agTextCellEditor'
      },
      {
        field: "priority",
        headerName: "Priorita",
        filter: true,
        editable: true,
        flex: 0.8,
        minWidth: 80,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: {
          values: ["Nízká", "Střední", "Vysoká", "Urgentní"]
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
        <div className="grid-wrapper ag-theme-quartz" style={{ height: "75vh" }}>
          <AgGridReact<ClientGridRow>
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
        entityType="client"
        entityLabel="Klient"
        entity={entityData}
        commission={commissionData}
        onDuplicateEntityCommission={handleDuplicateEntityCommission}
        onDuplicateCommission={handleDuplicateCommission}
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
        onUnarchiveDocument={documentManager.unarchiveDocument}
        archivedDocuments={documentManager.archivedDocuments}
        notes={notesManager.notes}
        notesLoading={notesManager.isLoading}
        notesCreating={notesManager.isCreating}
        onAddNote={notesManager.createNote}
        onDeleteNote={notesManager.deleteNote}
      />

      <EntityCommissionCreateModal
        open={createModalOpen}
        title="Nový klient a zakázka"
        entityTitle="Klient"
        commissionTitle="Zakázka"
        entityGroups={draftEntityData.groups}
        commissionGroups={draftCommissionData.groups}
        entityValues={createDraft.entity}
        commissionValues={createDraft.commission}
        isSubmitting={isCreating}
        submitLabel="Vytvořit klienta"
        onClose={closeCreateModal}
        onEntityChange={handleDraftEntityChange}
        onCommissionChange={handleDraftCommissionChange}
        onSubmit={handleCreate}
      />
    </>
  );
};

export default ClientsSectionNew;

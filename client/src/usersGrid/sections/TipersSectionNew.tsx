import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { TiperEntity, TiperCommission, TiperGridRow } from "../types/entities";
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

type TiperEntityApi = {
  id: number;
  entity_id: string;
  company_name?: string | null;
  field?: string | null;
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

type TiperCommissionApi = {
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

type TiperCreateDraft = {
  entity: Record<string, string>;
  commission: Record<string, string>;
};

const emptyToNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const createDefaultTiperDraft = (): TiperCreateDraft => ({
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

const normalizeTiperEntity = (entity: TiperEntityApi): TiperEntity => ({
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

const normalizeTiperCommission = (commission: TiperCommissionApi): TiperCommission => ({
  id: commission.id,
  commission_id: commission.commission_id,
  tiper_entity_id: Number(commission.entity_id),
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

const mapTiperEntityUpdates = (updates: Record<string, unknown>) => {
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

const buildEntityData = (entity: TiperEntity | null): EntityData | null => {
  if (!entity) return null;

  const groups: FieldGroup[] = [
    {
      title: "Základní údaje",
      color: "purple",
      fields: [
        { key: "name", label: "Jméno", value: entity.name, type: "text" },
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
      title: "Informace o tipařovi",
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

const buildCommissionData = (commission: TiperCommission | null): CommissionData | null => {
  if (!commission) return null;

  const groups: FieldGroup[] = [
    {
      title: "Základní údaje tipu",
      color: "purple",
      fields: [
        { key: "position", label: "Tip / Zakázka", value: commission.position, type: "textarea" },
        { key: "service_position", label: "Typ", value: commission.service_position, type: "text" },
        { key: "assigned_to", label: "Odpovědná osoba", value: commission.assigned_to, type: "text" },
      ]
    },
    {
      title: "Finanční údaje",
      color: "green",
      fields: [
        { key: "budget", label: "Hodnota", value: commission.budget, type: "text" },
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

const buildTiperDraftEntityData = (draft: TiperCreateDraft): EntityData => ({
  id: 0,
  entity_id: "Nový tipař",
  groups: buildEntityData({
    id: 0,
    entity_id: "Nový tipař",
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

const buildTiperDraftCommissionData = (draft: TiperCreateDraft, status: TiperCommissionApi["status"]): CommissionData => ({
  id: 0,
  commission_id: "Nový tip",
  status,
  groups: buildCommissionData({
    id: 0,
    commission_id: "Nový tip",
    tiper_entity_id: 0,
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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<TiperCreateDraft>(createDefaultTiperDraft);
  
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
      const [entitiesData, commissionsData, allCommissionsData] = await Promise.all([
        apiGet<TiperEntityApi[]>('/api/tiper-entities'),
        apiGet<TiperCommissionApi[]>(`/api/tiper-commissions?status=${status}`),
        status === 'accepted' ? apiGet<TiperCommissionApi[]>('/api/tiper-commissions') : Promise.resolve([])
      ]);

      const entitiesList = (Array.isArray(entitiesData) ? entitiesData : []).map(normalizeTiperEntity);
      const commissionsList = (Array.isArray(commissionsData) ? commissionsData : []).map(normalizeTiperCommission);
      const allCommissionsList = (Array.isArray(allCommissionsData) ? allCommissionsData : []).map(normalizeTiperCommission);

      setEntities(entitiesList);
      setCommissions(commissionsList);

      // Build grid data - each row is a commission with entity info
      const rows: TiperGridRow[] = commissionsList.map(commission => {
        const entity = entitiesList.find(e => e.id === commission.tiper_entity_id);
        return {
          ...commission,
          entityOnly: false,
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

      if (status === 'accepted') {
        const entityIdsWithAnyCommission = new Set(allCommissionsList.map((commission) => commission.tiper_entity_id));

        const standaloneRows: TiperGridRow[] = entitiesList
          .filter((entity) => !entityIdsWithAnyCommission.has(entity.id))
          .map((entity) => ({
            id: -entity.id,
            commission_id: `${entity.entity_id}-000`,
            tiper_entity_id: entity.id,
            status: 'accepted',
            assigned_to: null,
            priority: null,
            notes: null,
            deadline: null,
            state: null,
            commission_value: null,
            position: null,
            budget: null,
            service_position: null,
            field: entity.field || '',
            location: entity.location || '',
            category: null,
            phone: entity.mobile ?? null,
            created_at: entity.created_at,
            updated_at: entity.updated_at,
            entityOnly: true,
            entity_id: entity.entity_id,
            name: entity.name || '',
            company: entity.company || '',
            mobile: entity.mobile || '',
            email: entity.email || '',
            entity
          }));

        rows.push(...standaloneRows);
      }

      rows.sort((left, right) => {
        const entityCompare = left.entity_id.localeCompare(right.entity_id);
        if (entityCompare !== 0) return entityCompare;
        if (left.entityOnly && !right.entityOnly) return -1;
        if (!left.entityOnly && right.entityOnly) return 1;
        return left.commission_id.localeCompare(right.commission_id);
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
  const draftEntityData = useMemo(() => buildTiperDraftEntityData(createDraft), [createDraft]);
  const draftCommissionData = useMemo(() => buildTiperDraftCommissionData(createDraft, status), [createDraft, status]);

  const openProfile = useCallback((row: TiperGridRow) => {
    if (row.entity) {
      setSelectedEntityId(row.entity.id);
    }
    setSelectedCommissionId(row.entityOnly ? null : row.id);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedCommissionId(null);
  }, []);

  const openCreateModal = useCallback((draft?: TiperCreateDraft) => {
    setCreateDraft(draft ?? createDefaultTiperDraft());
    setCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    if (isCreating) return;
    setCreateModalOpen(false);
    setCreateDraft(createDefaultTiperDraft());
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
      const mappedUpdates = mapTiperEntityUpdates(updates);
      if (Object.keys(mappedUpdates).length === 0) return;
      await apiPut(`/api/tiper-entities/${entityId}`, mappedUpdates);
      fetchData();
    } catch (error) {
      console.error("Error updating tiper entity:", error);
      throw error;
    }
  }, [fetchData]);

  const handleUpdateCommission = useCallback(async (commissionId: number, updates: Record<string, unknown>) => {
    try {
      await apiPut(`/api/tiper-commissions/${commissionId}`, updates);
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
      await apiPost(`/api/tiper-commissions/${id}/approve`);
      fetchData();
    } catch (error) {
      console.error("Error approving commission:", error);
      alert("Chyba při schvalování tipu");
    }
  }, [fetchData]);

  const handleRestore = useCallback(async (id: number) => {
    try {
      await apiPost(`/api/tiper-commissions/${id}/restore`);
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
      confirmMessage = `Opravdu chcete TRVALE SMAZAT tento tip z databáze?\n\nTip: ${commission?.position || "N/A"}\nTipař: ${row?.name || row?.company || "N/A"}\n\nTato akce je NEzvratná!`;
    } else if (isPending) {
      confirmMessage = `Opravdu chcete zamítnout tento tip?\n\nTip: ${commission?.position || "N/A"}\nTipař: ${row?.name || row?.company || "N/A"}`;
    } else {
      confirmMessage = `Opravdu chcete přesunout tento tip do archivu?\n\nTip: ${commission?.position || "N/A"}\nTipař: ${row?.name || row?.company || "N/A"}`;
    }

    if (!confirm(confirmMessage)) return;

    try {
      if (isArchived || isPending) {
        await apiDelete(`/api/tiper-commissions/${id}`);
      } else {
        await apiPost(`/api/tiper-commissions/${id}/archive`);
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
      const response = await apiPost<{ entity: TiperEntity; commission: TiperCommission }>("/api/tiper-entities/with-commission", {
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
      setCreateDraft(createDefaultTiperDraft());
      await fetchData();

      if (response?.entity && response?.commission) {
        setSelectedEntityId(response.entity.id);
        setSelectedCommissionId(response.commission.id);
      }
    } catch (error) {
      console.error("Error adding tiper:", error);
      alert("Chyba při vytváření tipaře");
    } finally {
      setIsCreating(false);
    }
  }, [createDraft, fetchData, status]);

  const handleCreateEntityOnly = useCallback(async () => {
    setIsCreating(true);
    try {
      const entity = await apiPost<TiperEntityApi>('/api/tiper-entities', {
        first_name: emptyToNull(createDraft.entity.name),
        company_name: emptyToNull(createDraft.entity.company),
        field: emptyToNull(createDraft.entity.field),
        phone: emptyToNull(createDraft.entity.mobile),
        email: emptyToNull(createDraft.entity.email),
        website: emptyToNull(createDraft.entity.website),
        location: emptyToNull(createDraft.entity.location),
        info: emptyToNull(createDraft.entity.info)
      });

      setCreateModalOpen(false);
      setCreateDraft(createDefaultTiperDraft());
      await fetchData();

      if (entity?.id) {
        setSelectedEntityId(entity.id);
        setSelectedCommissionId(null);
      }
    } catch (error) {
      console.error('Error creating tiper entity:', error);
      alert('Chyba při vytváření tipaře');
    } finally {
      setIsCreating(false);
    }
  }, [createDraft, fetchData]);

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
      const response = await apiPost<{ id: number }>("/api/tiper-commissions", {
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
      console.error("Error duplicating tiper commission:", error);
      alert("Chyba při duplikaci tipu");
    }
  }, [fetchData, selectedCommission, selectedEntity]);

  const handleCreateFirstCommission = useCallback(async () => {
    if (!selectedEntity) return;

    try {
      const response = await apiPost<{ id: number }>('/api/tiper-commissions', {
        entity_id: selectedEntity.id,
        status,
        position: null,
        budget: null,
        commission_value: null
      });

      await fetchData();

      if (response?.id) {
        setSelectedCommissionId(response.id);
      }
    } catch (error) {
      console.error('Error creating first tiper commission:', error);
      alert('Chyba při vytváření prvního tipu');
    }
  }, [fetchData, selectedEntity, status]);

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
  // ADD NEW TIPER + COMMISSION
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
    if (selectedEntityId !== null) {
      const exists = entities.some(e => e.id === selectedEntityId);
      if (!exists) {
        closeProfile();
      }
    }
  }, [closeProfile, entities, selectedEntityId]);

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
        if (row.entityOnly) {
          return row.entity_id;
        }
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
        headerName: "Jméno",
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
        field: "position",
        headerName: "Tip / Zakázka",
        filter: true,
        editable: (params) => !params.data?.entityOnly,
        flex: 2,
        minWidth: 180,
        valueFormatter: (params) => params.data?.entityOnly ? "" : params.value || ""
      },
      {
        field: "budget",
        headerName: "Hodnota",
        filter: true,
        editable: (params) => !params.data?.entityOnly,
        flex: 0.8,
        minWidth: 80,
        valueFormatter: (params) => params.data?.entityOnly ? "" : params.value || ""
      },
      {
        field: "commission_value",
        headerName: "Provize",
        filter: true,
        editable: (params) => !params.data?.entityOnly,
        flex: 0.8,
        minWidth: 80,
        valueFormatter: (params) => params.data?.entityOnly ? "" : params.value || ""
      },
      {
        field: "priority",
        headerName: "Priorita",
        filter: true,
        editable: (params) => !params.data?.entityOnly,
        flex: 1,
        minWidth: 100,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: {
          values: ["Nízká", "Střední", "Vysoká", "Urgentní"]
        },
        valueFormatter: (params) => params.data?.entityOnly ? "" : params.value || ""
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
        open={selectedEntityId !== null}
        entityType="tiper"
        entityLabel="Tipař"
        entity={entityData}
        commission={commissionData}
        onDuplicateEntityCommission={handleDuplicateEntityCommission}
        onDuplicateCommission={handleDuplicateCommission}
        onCreateCommission={selectedCommission ? undefined : handleCreateFirstCommission}
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
        title="Nový tipař a tip"
        entityTitle="Tipař"
        commissionTitle="Tip / zakázka"
        entityGroups={draftEntityData.groups}
        commissionGroups={draftCommissionData.groups}
        entityValues={createDraft.entity}
        commissionValues={createDraft.commission}
        isSubmitting={isCreating}
        submitLabel="Vytvořit tipaře"
        secondarySubmitLabel="Vytvořit jen tipaře"
        onClose={closeCreateModal}
        onEntityChange={handleDraftEntityChange}
        onCommissionChange={handleDraftCommissionChange}
        onSecondarySubmit={handleCreateEntityOnly}
        onSubmit={handleCreate}
      />
    </>
  );
};

export default TipersSectionNew;

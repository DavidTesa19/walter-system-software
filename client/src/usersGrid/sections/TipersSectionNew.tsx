import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { TiperEntity, TiperCommission, TiperGridRow } from "../types/entities";
import ProfileCellRenderer from "../cells/ProfileCellRenderer";
import AssignedUsersCellRenderer from "../cells/AssignedUsersCellRenderer";
import EntityCommissionCreateModal from "../components/EntityCommissionCreateModal";
import EntityCommissionProfilePanel, {
  type EntityData,
  type CommissionData,
  type FieldGroup,
  type LinkedCommissionItem
} from "../components/EntityCommissionProfilePanel";
import StatusCellRenderer from "../cells/StatusCellRenderer";
import { mapViewToStatus } from "../constants";
import { apiGet, apiPost, apiPut, apiDelete } from "../../utils/api";
import type { SectionProps } from "./SectionTypes";
import useProfileDocuments from "../hooks/useProfileDocuments";
import useProfileNotes from "../hooks/useProfileNotes";
import { ApproveRestoreCellRenderer, DeleteArchiveCellRenderer } from "../cells/RowActionCellRenderers";
import { fieldOptions } from "../fieldOptions";
import { formatProfileDate } from "../utils/profileUtils";
import { formatAssignedUsernames, fromAssignmentDraftValue, toAssignmentDraftValue } from "../assignmentUtils";
import { compareWorkflowStatuses, DEFAULT_WORKFLOW_STATUS, getNormalizedWorkflowStatus, WORKFLOW_STATUS_VALUES } from "../workflowStatus";
import useAssignableUsers from "../hooks/useAssignableUsers";
import ActivityCellRenderer from "../../activity/ActivityCellRenderer";
import { useActivity } from "../../activity/ActivityContext";
import { buildCommissionsRecordScope, buildSubjectsRecordScope, getActivitySystem } from "../../activity/activityKeys";

type TiperEntityApi = {
  id: number;
  entity_id: string;
  status: "pending" | "accepted" | "archived";
  assigned_to?: string | null;
  assigned_user_ids?: number[] | null;
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
  assigned_user_ids?: number[] | null;
  field?: string | null;
  service_position?: string | null;
  location?: string | null;
  category?: string | null;
  deadline?: string | null;
  priority?: string | null;
  phone?: string | null;
  commission_value?: string | null;
  notes?: string | null;
  entity_company_name?: string | null;
  entity_first_name?: string | null;
  entity_last_name?: string | null;
  entity_field?: string | null;
  entity_location?: string | null;
  entity_info?: string | null;
  entity_phone?: string | null;
  entity_email?: string | null;
  entity_website?: string | null;
  created_at?: string;
  updated_at?: string;
};

const FIELD_OPTIONS_ARRAY = fieldOptions.map((opt) => opt.value);
const joinName = (...parts: Array<string | null | undefined>) => parts.filter((part): part is string => Boolean(part && part.trim())).join(" ").trim();

type TiperCreateDraft = {
  entity: {
    name: string;
    company: string;
    field: string;
    mobile: string;
    email: string;
    website: string;
    location: string;
    info: string;
    assigned_user_ids: string[];
  };
  commission: {
    position: string;
    service_position: string;
    assigned_user_ids: string[];
    budget: string;
    commission_value: string;
    priority: string;
    state: string;
    deadline: string;
    notes: string;
  };
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
    info: "",
    assigned_user_ids: []
  },
  commission: {
    position: "",
    service_position: "",
    assigned_user_ids: [],
    budget: "",
    commission_value: "",
    priority: "",
    state: DEFAULT_WORKFLOW_STATUS,
    deadline: "",
    notes: ""
  }
});

const normalizeTiperEntity = (entity: TiperEntityApi): TiperEntity => ({
  id: entity.id,
  entity_id: entity.entity_id,
  status: entity.status,
  assigned_to: entity.assigned_to ?? null,
  assigned_user_ids: entity.assigned_user_ids ?? [],
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
  assigned_user_ids: commission.assigned_user_ids ?? [],
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

const getCommissionEntityName = (commission: TiperCommissionApi) =>
  joinName(commission.entity_first_name, commission.entity_last_name) || commission.entity_company_name || commission.commission_id.split('-')[0] || '';

const mapTiperEntityUpdates = (updates: Record<string, unknown>) => {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === "name") mapped.first_name = value;
    else if (key === "company") mapped.company_name = value;
    else if (key === "mobile") mapped.phone = value;
    else if (key === "assigned_user_ids") mapped.assigned_user_ids = value;
    else if (["field", "location", "email", "website", "info"].includes(key)) mapped[key] = value;
  }
  return mapped;
};

const deriveTiperEntityFromCommission = (commission: TiperCommissionApi): TiperEntity | null => {
  const entityId = Number(commission.entity_id);
  if (!Number.isFinite(entityId)) return null;

  return {
    id: entityId,
    entity_id: commission.commission_id.split('-')[0] || String(entityId),
    status: commission.status,
    name: joinName(commission.entity_first_name, commission.entity_last_name) || commission.entity_company_name || commission.commission_id.split('-')[0] || String(entityId),
    company: commission.entity_company_name ?? null,
    field: commission.entity_field ?? null,
    location: commission.entity_location ?? null,
    address: null,
    mobile: commission.entity_phone ?? null,
    email: commission.entity_email ?? null,
    website: commission.entity_website ?? null,
    info: commission.entity_info ?? null,
    assigned_to: null,
    assigned_user_ids: [],
    created_at: undefined,
    updated_at: undefined
  };
};

// =============================================================================
// BUILD ENTITY DATA FOR PROFILE PANEL
// =============================================================================

const buildEntityData = (entity: TiperEntity | null, assignmentOptions: Array<string | { value: string; label: string; description?: string }>): EntityData | null => {
  if (!entity) return null;

  const groups: FieldGroup[] = [
    {
      title: "Základní údaje",
      color: "purple",
      fields: [
        { key: "name", label: "Jméno", value: entity.name, type: "text" },
        { key: "company", label: "Organizace", value: entity.company, type: "text" },
        { key: "field", label: "Oblast působení", value: entity.field, type: "select", options: FIELD_OPTIONS_ARRAY },
        { key: "assigned_user_ids", label: "Přiřazení uživatelé", value: toAssignmentDraftValue(entity.assigned_user_ids), type: "multi-select", options: assignmentOptions }
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
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
    groups
  };
};

// =============================================================================
// BUILD COMMISSION DATA FOR PROFILE PANEL
// =============================================================================

const buildCommissionData = (commission: TiperCommission | null, assignmentOptions: Array<string | { value: string; label: string; description?: string }>): CommissionData | null => {
  if (!commission) return null;

  const groups: FieldGroup[] = [
    {
      title: "Základní údaje tipu",
      color: "purple",
      fields: [
        { key: "position", label: "Tip / Zakázka", value: commission.position, type: "textarea" },
        { key: "service_position", label: "Typ", value: commission.service_position, type: "text" },
        { key: "assigned_user_ids", label: "Přiřazení uživatelé", value: toAssignmentDraftValue(commission.assigned_user_ids), type: "multi-select", options: assignmentOptions }
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
        { key: "state", label: "Stav", value: getNormalizedWorkflowStatus(commission.state), type: "select", options: [...WORKFLOW_STATUS_VALUES] },
        { key: "deadline", label: "Termín", value: commission.deadline, type: "date" },
        { key: "notes", label: "Poznámky", value: commission.notes, type: "textarea", isMultiline: true },
      ]
    }
  ];

  return {
    id: commission.id,
    commission_id: commission.commission_id,
    status: commission.status,
    createdAt: commission.created_at,
    updatedAt: commission.updated_at,
    groups
  };
};

const formatAddedDate = (value?: string | null) => formatProfileDate(value) ?? "";

const buildLinkedCommissionItems = (commissions: TiperCommission[], assignedUsers: Parameters<typeof formatAssignedUsernames>[1]): LinkedCommissionItem[] => commissions
  .map((commission) => ({
    id: commission.id,
    commission_id: commission.commission_id,
    status: commission.status,
    title: commission.position || 'Bez názvu tipu',
    subtitle: [commission.service_position, formatAssignedUsernames(commission.assigned_user_ids, assignedUsers, commission.assigned_to)].filter(Boolean).join(' • ') || null
  }))
  .sort((left, right) => left.commission_id.localeCompare(right.commission_id));

const buildTiperDraftEntityData = (draft: TiperCreateDraft, assignmentOptions: Array<string | { value: string; label: string; description?: string }>): EntityData => ({
  id: 0,
  entity_id: "Nový tipař",
  groups: buildEntityData({
    id: 0,
    entity_id: "Nový tipař",
    status: "accepted",
    name: draft.entity.name,
    company: draft.entity.company,
    field: draft.entity.field,
    location: draft.entity.location,
    address: null,
    mobile: draft.entity.mobile,
    email: draft.entity.email,
    website: draft.entity.website,
    info: draft.entity.info,
    assigned_to: null,
    assigned_user_ids: fromAssignmentDraftValue(draft.entity.assigned_user_ids),
    created_at: undefined,
    updated_at: undefined
  }, assignmentOptions)!.groups
});

const buildTiperDraftCommissionData = (draft: TiperCreateDraft, status: TiperCommissionApi["status"], assignmentOptions: Array<string | { value: string; label: string; description?: string }>): CommissionData => ({
  id: 0,
  commission_id: "Nový tip",
  status,
  groups: buildCommissionData({
    id: 0,
    commission_id: "Nový tip",
    tiper_entity_id: 0,
    status,
    assigned_to: null,
    assigned_user_ids: fromAssignmentDraftValue(draft.commission.assigned_user_ids),
    priority: draft.commission.priority,
    notes: draft.commission.notes,
    deadline: draft.commission.deadline,
    state: getNormalizedWorkflowStatus(draft.commission.state),
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
  }, assignmentOptions)!.groups
});

// =============================================================================
// TIPERS SECTION COMPONENT
// =============================================================================

const TipersSectionNew: React.FC<SectionProps> = ({
  viewMode,
  isActive,
  systemNamespace,
  onRegisterAddHandler,
  onLoadingChange
}) => {
  const { users: assignableUsers, options: assignmentOptions } = useAssignableUsers();
  const { markItemSeen } = useActivity();
  // State for entities and commissions
  const [entities, setEntities] = useState<TiperEntity[]>([]);
  const [commissions, setCommissions] = useState<TiperCommission[]>([]);
  const [gridData, setGridData] = useState<TiperGridRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [includeCommission, setIncludeCommission] = useState(false);
  const [createDraft, setCreateDraft] = useState<TiperCreateDraft>(createDefaultTiperDraft);
  
  // Selected entity/commission for profile panel
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [selectedCommissionId, setSelectedCommissionId] = useState<number | null>(null);
  
  const gridRef = useRef<AgGridReact<TiperGridRow>>(null);

  // Get status from viewMode
  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);
  const resourceKey = systemNamespace ? "project-tipers" : "tipers";
  const activitySystem = useMemo(() => getActivitySystem(systemNamespace), [systemNamespace]);
  const subjectActivityScope = useMemo(() => buildSubjectsRecordScope(activitySystem, "tipers"), [activitySystem]);
  const commissionActivityScope = useMemo(() => buildCommissionsRecordScope(activitySystem, "tipers"), [activitySystem]);
  const entityApiBase = systemNamespace ? `/api/${systemNamespace}/tiper-entities` : "/api/tiper-entities";
  const commissionApiBase = systemNamespace ? `/api/${systemNamespace}/tiper-commissions` : "/api/tiper-commissions";

  // Document and notes managers
  const documentManager = useProfileDocuments(resourceKey, selectedEntityId);
  const notesManager = useProfileNotes(resourceKey, selectedEntityId);

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [entitiesData, commissionsData] = await Promise.all([
        apiGet<TiperEntityApi[]>(`${entityApiBase}?status=${status}`),
        apiGet<TiperCommissionApi[]>(`${commissionApiBase}?status=${status}`)
      ]);

      const entitiesList = (Array.isArray(entitiesData) ? entitiesData : []).map(normalizeTiperEntity);
      const commissionsList = (Array.isArray(commissionsData) ? commissionsData : []).map(normalizeTiperCommission);

      setEntities(entitiesList);
      setCommissions(commissionsList);

      if (status === 'accepted') {
        const commissionsByEntity = new Map<number, TiperCommission[]>();
        for (const commission of commissionsList) {
          const current = commissionsByEntity.get(commission.tiper_entity_id) || [];
          current.push(commission);
          commissionsByEntity.set(commission.tiper_entity_id, current);
        }

        const rows: TiperGridRow[] = entitiesList.map((entity) => {
          const entityCommissions = commissionsByEntity.get(entity.id) || [];
          const primaryCommission = entityCommissions[0] || null;

          return {
            id: entity.id,
            commission_id: primaryCommission?.commission_id || `${entity.entity_id}-000`,
            tiper_entity_id: entity.id,
            status: entity.status,
            assigned_to: primaryCommission?.assigned_to ?? entity.assigned_to ?? null,
            assigned_user_ids: primaryCommission?.assigned_user_ids ?? entity.assigned_user_ids ?? [],
            priority: primaryCommission?.priority ?? null,
            notes: primaryCommission?.notes ?? null,
            deadline: primaryCommission?.deadline ?? null,
            state: getNormalizedWorkflowStatus(primaryCommission?.state),
            commission_value: primaryCommission?.commission_value ?? null,
            position: primaryCommission?.position ?? null,
            budget: primaryCommission?.budget ?? null,
            service_position: primaryCommission?.service_position ?? null,
            field: entity.field || primaryCommission?.field || '',
            location: entity.location || primaryCommission?.location || '',
            category: primaryCommission?.category ?? null,
            phone: entity.mobile ?? primaryCommission?.phone ?? null,
            created_at: entity.created_at,
            updated_at: entity.updated_at,
            subjectRow: true,
            entity_id: entity.entity_id,
            name: entity.name || '',
            company: entity.company || '',
            mobile: entity.mobile || '',
            email: entity.email || '',
            commission_count: entityCommissions.length,
            primaryCommissionId: primaryCommission?.id ?? null,
            activity_scope: subjectActivityScope,
            activity_item_id: entity.id,
            activity_latest_at: entity.updated_at ?? entity.created_at,
            activity_created_at: entity.created_at,
            entity
          };
        });

        rows.sort((left, right) => left.entity_id.localeCompare(right.entity_id));
        setGridData(rows);
        return;
      }

      // Build grid data - each row is a commission with entity info
      const entityIdsWithCommission = new Set<number>(commissionsList.map((commission) => commission.tiper_entity_id));

      const commissionRows: TiperGridRow[] = commissionsList.map((commission, index) => {
        const rawCommission = (Array.isArray(commissionsData) ? commissionsData : [])[index];
        const entity = entitiesList.find((e) => e.id === commission.tiper_entity_id) || deriveTiperEntityFromCommission(rawCommission);
        return {
          ...commission,
          entityOnly: false,
          entity_id: entity?.entity_id || commission.commission_id.split('-')[0] || '',
          name: entity?.name || getCommissionEntityName(rawCommission),
          company: entity?.company || rawCommission?.entity_company_name || '',
          field: entity?.field || rawCommission?.entity_field || commission.field || '',
          location: entity?.location || rawCommission?.entity_location || commission.location || '',
          mobile: entity?.mobile || rawCommission?.entity_phone || commission.phone || '',
          email: entity?.email || rawCommission?.entity_email || '',
          activity_scope: commissionActivityScope,
          activity_item_id: commission.id,
          activity_latest_at: commission.updated_at ?? commission.created_at,
          activity_created_at: commission.created_at,
          entity: entity || null
        };
      });

      const entityOnlyRows: TiperGridRow[] = entitiesList
        .filter((entity) => !entityIdsWithCommission.has(entity.id))
        .map((entity) => ({
          id: -entity.id,
          commission_id: `${entity.entity_id}-000`,
          tiper_entity_id: entity.id,
          status: entity.status,
          assigned_to: null,
          assigned_user_ids: entity.assigned_user_ids ?? [],
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
          phone: entity.mobile || null,
          created_at: entity.created_at,
          updated_at: entity.updated_at,
          entityOnly: true,
          entity_id: entity.entity_id,
          name: entity.name || '',
          company: entity.company || '',
          mobile: entity.mobile || '',
          email: entity.email || '',
          commission_count: 0,
          primaryCommissionId: null,
          activity_scope: subjectActivityScope,
          activity_item_id: entity.id,
          activity_latest_at: entity.updated_at ?? entity.created_at,
          activity_created_at: entity.created_at,
          entity: entity || null
        }));

      const rows = [...commissionRows, ...entityOnlyRows];

      rows.sort((left, right) => left.commission_id.localeCompare(right.commission_id));

      setGridData(rows);
    } catch (error) {
      console.error("Error fetching tiper data:", error);
      setEntities([]);
      setCommissions([]);
      setGridData([]);
    } finally {
      setIsLoading(false);
    }
  }, [commissionActivityScope, commissionApiBase, entityApiBase, status, subjectActivityScope]);

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

  const linkedCommissions = useMemo(() => {
    if (selectedEntityId === null) return [];
    return buildLinkedCommissionItems(commissions.filter((commission) => commission.tiper_entity_id === selectedEntityId), assignableUsers);
  }, [assignableUsers, commissions, selectedEntityId]);

  const entityData = useMemo(() => buildEntityData(selectedEntity, assignmentOptions), [assignmentOptions, selectedEntity]);
  const commissionData = useMemo(() => buildCommissionData(selectedCommission, assignmentOptions), [assignmentOptions, selectedCommission]);
  const draftEntityData = useMemo(() => buildTiperDraftEntityData(createDraft, assignmentOptions), [assignmentOptions, createDraft]);
  const draftCommissionData = useMemo(() => buildTiperDraftCommissionData(createDraft, status, assignmentOptions), [assignmentOptions, createDraft, status]);

  useEffect(() => {
    if (!selectedEntity) {
      return;
    }

    markItemSeen(subjectActivityScope, selectedEntity.id, selectedEntity.updated_at ?? selectedEntity.created_at ?? null);
  }, [markItemSeen, selectedEntity, subjectActivityScope]);

  useEffect(() => {
    if (!selectedCommission) {
      return;
    }

    markItemSeen(commissionActivityScope, selectedCommission.id, selectedCommission.updated_at ?? selectedCommission.created_at ?? null);
  }, [commissionActivityScope, markItemSeen, selectedCommission]);

  const openProfile = useCallback((row: TiperGridRow) => {
    const entityId = row.entity?.id ?? row.tiper_entity_id ?? null;
    if (entityId !== null) setSelectedEntityId(entityId);
    setSelectedCommissionId(viewMode === "active" ? null : row.primaryCommissionId ?? (row.entityOnly ? null : row.id));
  }, [viewMode]);

  const closeProfile = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedCommissionId(null);
  }, []);

  const openCreateModal = useCallback((draft?: TiperCreateDraft) => {
    setCreateDraft(draft ?? createDefaultTiperDraft());
    setIncludeCommission(Boolean(draft));
    setCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    if (isCreating) return;
    setCreateModalOpen(false);
    setIncludeCommission(false);
    setCreateDraft(createDefaultTiperDraft());
  }, [isCreating]);

  const handleDraftEntityChange = useCallback((key: string, value: string | string[]) => {
    setCreateDraft((current) => ({ ...current, entity: { ...current.entity, [key]: value } }));
  }, []);

  const handleDraftCommissionChange = useCallback((key: string, value: string | string[]) => {
    setCreateDraft((current) => ({ ...current, commission: { ...current.commission, [key]: value } }));
  }, []);

  // ==========================================================================
  // UPDATE HANDLERS
  // ==========================================================================

  const handleUpdateEntity = useCallback(async (entityId: number, updates: Record<string, unknown>) => {
    try {
      const mappedUpdates = mapTiperEntityUpdates(updates);
      if (Object.keys(mappedUpdates).length === 0) return;
      await apiPut(`${entityApiBase}/${entityId}`, mappedUpdates);
      fetchData();
    } catch (error) {
      console.error("Error updating tiper entity:", error);
      throw error;
    }
  }, [entityApiBase, fetchData]);

  const handleUpdateCommission = useCallback(async (commissionId: number, updates: Record<string, unknown>) => {
    try {
      await apiPut(`${commissionApiBase}/${commissionId}`, updates);
      fetchData();
    } catch (error) {
      console.error("Error updating tiper commission:", error);
      throw error;
    }
  }, [commissionApiBase, fetchData]);

  // ==========================================================================
  // ROW ACTIONS
  // ==========================================================================

  const handleApprove = useCallback(async (id: number) => {
    try {
      const row = gridData.find((item) => item.id === id);
      if (!row) return;
      if (row.entityOnly && row.entity) await apiPost(`${entityApiBase}/${row.entity.id}/approve`);
      else await apiPost(`${commissionApiBase}/${id}/approve`);
      fetchData();
    } catch (error) {
      console.error("Error approving commission:", error);
      alert("Chyba při schvalování tipu");
    }
  }, [commissionApiBase, entityApiBase, fetchData, gridData]);

  const handleRestore = useCallback(async (id: number) => {
    try {
      const row = gridData.find((item) => item.id === id);
      if (!row) return;
      if (row.entityOnly && row.entity) await apiPost(`${entityApiBase}/${row.entity.id}/restore`);
      else await apiPost(`${commissionApiBase}/${id}/restore`);
      fetchData();
    } catch (error) {
      console.error("Error restoring commission:", error);
      alert("Chyba při obnovování tipu");
    }
  }, [commissionApiBase, entityApiBase, fetchData, gridData]);

  const handleDelete = useCallback(async (id: number) => {
    if (viewMode === "active") {
      const row = gridData.find(r => r.id === id);
      const entityId = row?.entity?.id ?? null;
      if (!row || entityId === null) return;

      const linkedCount = row.commission_count ?? 0;
      const label = row.name || row.company || row.entity_id;
      const confirmMessage = linkedCount > 0
        ? `Opravdu chcete TRVALE SMAZAT tohoto tipaře a všech ${linkedCount} navázaných tipů / zakázek?\n\nTipař: ${label}\nID: ${row.entity_id}\n\nTato akce je NEzvratná!`
        : `Opravdu chcete TRVALE SMAZAT tohoto tipaře?\n\nTipař: ${label}\nID: ${row.entity_id}\n\nTato akce je NEzvratná!`;

      if (!confirm(confirmMessage)) return;

      try {
        await apiDelete(`${entityApiBase}/${entityId}`);
        if (selectedEntityId === entityId) {
          closeProfile();
        }
        fetchData();
      } catch (error) {
        console.error("Error deleting tiper entity:", error);
        alert("Chyba při mazání tipaře");
      }
      return;
    }

    const commission = commissions.find(c => c.id === id);
    const row = gridData.find(r => r.id === id);
    if (row?.entityOnly && row.entity) {
      const isArchivedEntity = row.status === "archived";
      const confirmMessage = isArchivedEntity
        ? `Opravdu chcete TRVALE SMAZAT tohoto tipaře z databáze?\n\nTipař: ${row.name || row.company || row.entity_id}\nID: ${row.entity_id}\n\nTato akce je NEzvratná!`
        : `Opravdu chcete zamítnout tohoto tipaře?\n\nTipař: ${row.name || row.company || row.entity_id}\nID: ${row.entity_id}`;

      if (!confirm(confirmMessage)) return;

      try {
        await apiDelete(`${entityApiBase}/${row.entity.id}`);
        if (selectedEntityId === row.entity.id) {
          closeProfile();
        }
        fetchData();
      } catch (error) {
        console.error("Error deleting tiper entity:", error);
        alert("Chyba při provádění akce");
      }
      return;
    }
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
        await apiDelete(`${commissionApiBase}/${id}`);
      } else {
        await apiPost(`${commissionApiBase}/${id}/archive`);
      }
      fetchData();
    } catch (error) {
      console.error("Error performing action:", error);
      alert("Chyba při provádění akce");
    }
  }, [closeProfile, commissionApiBase, commissions, entityApiBase, fetchData, gridData, selectedEntityId, viewMode]);

  const handleCreateWithCommission = useCallback(async () => {
    setIsCreating(true);
    try {
      const response = await apiPost<{ entity: TiperEntity; commission: TiperCommission }>(`${entityApiBase}/with-commission`, {
        entity: {
          status,
          first_name: emptyToNull(createDraft.entity.name),
          company_name: emptyToNull(createDraft.entity.company),
          field: emptyToNull(createDraft.entity.field),
          phone: emptyToNull(createDraft.entity.mobile),
          email: emptyToNull(createDraft.entity.email),
          website: emptyToNull(createDraft.entity.website),
          location: emptyToNull(createDraft.entity.location),
          info: emptyToNull(createDraft.entity.info),
          assigned_user_ids: fromAssignmentDraftValue(createDraft.entity.assigned_user_ids)
        },
        commission: {
          position: emptyToNull(createDraft.commission.position),
          service_position: emptyToNull(createDraft.commission.service_position),
          assigned_user_ids: fromAssignmentDraftValue(createDraft.commission.assigned_user_ids),
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
      const entity = await apiPost<TiperEntityApi>(entityApiBase, {
        status,
        first_name: emptyToNull(createDraft.entity.name),
        company_name: emptyToNull(createDraft.entity.company),
        field: emptyToNull(createDraft.entity.field),
        phone: emptyToNull(createDraft.entity.mobile),
        email: emptyToNull(createDraft.entity.email),
        website: emptyToNull(createDraft.entity.website),
        location: emptyToNull(createDraft.entity.location),
        info: emptyToNull(createDraft.entity.info),
        assigned_user_ids: fromAssignmentDraftValue(createDraft.entity.assigned_user_ids)
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
  }, [createDraft, entityApiBase, fetchData, status]);

  const handleCreate = useCallback(async () => {
    if (includeCommission) {
      await handleCreateWithCommission();
      return;
    }
    await handleCreateEntityOnly();
  }, [handleCreateEntityOnly, handleCreateWithCommission, includeCommission]);

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
        info: selectedEntity.info ?? "",
        assigned_user_ids: toAssignmentDraftValue(selectedEntity.assigned_user_ids)
      },
      commission: {
        position: selectedCommission.position ?? "",
        service_position: selectedCommission.service_position ?? "",
        assigned_user_ids: toAssignmentDraftValue(selectedCommission.assigned_user_ids),
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
      const response = await apiPost<{ id: number }>(commissionApiBase, {
        entity_id: selectedEntity.id,
        position: selectedCommission.position,
        service_position: selectedCommission.service_position,
        assigned_user_ids: selectedCommission.assigned_user_ids ?? [],
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
  }, [commissionApiBase, fetchData, selectedCommission, selectedEntity]);

  const handleCreateFirstCommission = useCallback(async () => {
    if (!selectedEntity) return;

    try {
      const response = await apiPost<{ id: number }>(commissionApiBase, {
        entity_id: selectedEntity.id,
        status,
        position: null,
        budget: null,
        commission_value: null,
        assigned_user_ids: []
      });

      await fetchData();

      if (response?.id) {
        setSelectedCommissionId(response.id);
      }
    } catch (error) {
      console.error('Error creating first tiper commission:', error);
      alert('Chyba při vytváření prvního tipu');
    }
  }, [commissionApiBase, fetchData, selectedEntity, status]);

  // ==========================================================================
  // GRID CONTEXT
  // ==========================================================================

  const gridContext = useMemo(() => ({
    openProfile,
    rowActions: {
      viewMode,
      entityAccusative: viewMode === "active" ? "tipaře" : "tip",
      entityOnlyAccusative: "tipaře",
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
      } else if (!row.entityOnly) {
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

  useEffect(() => {
    if (selectedCommissionId !== null && !commissions.some(c => c.id === selectedCommissionId)) {
      setSelectedCommissionId(null);
    }
  }, [commissions, selectedCommissionId]);

  // ==========================================================================
  // COLUMN DEFINITIONS
  // ==========================================================================

  const columnDefs = useMemo<ColDef<TiperGridRow>[]>(() => {
    const cols: ColDef<TiperGridRow>[] = [];
    const assignedUsersColumn: ColDef<TiperGridRow> = {
      field: "assigned_user_ids",
      headerName: "Přiřazení",
      editable: false,
      sortable: false,
      filter: true,
      minWidth: 128,
      maxWidth: 148,
      cellRenderer: AssignedUsersCellRenderer,
      cellRendererParams: {
        users: assignableUsers,
        maxVisible: 3
      },
      filterValueGetter: (params) => formatAssignedUsernames(params.data?.assigned_user_ids, assignableUsers, params.data?.assigned_to) ?? "",
      tooltipValueGetter: (params) => formatAssignedUsernames(params.data?.assigned_user_ids, assignableUsers, params.data?.assigned_to) ?? ""
    };

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
      colId: "activity",
      pinned: "left",
      width: 30,
      minWidth: 30,
      maxWidth: 30,
      suppressMovable: true,
      lockPosition: true,
      sortable: false,
      filter: false,
      resizable: false,
      editable: false,
      menuTabs: [],
      cellClass: "activity-cell",
      headerClass: "activity-cell",
      cellRenderer: ActivityCellRenderer
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
        if (viewMode === "active" || row.entityOnly) return row.entity_id;
        const entityCode = row.entity_id || row.commission_id.split('-')[0] || '';
        const commissionPart = row.commission_id.split('-')[1] || row.commission_id;
        return `${entityCode}-${commissionPart}`;
      },
      flex: 0.7,
      minWidth: 90,
      editable: false
    });

    cols.push({
      field: "created_at",
      headerName: "Datum přidání",
      filter: true,
      editable: false,
      flex: 0.95,
      minWidth: 130,
      valueFormatter: (params) => formatAddedDate(params.value)
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
      },
      assignedUsersColumn
    );

    if (viewMode === "active") {
      cols.push(
        {
          field: "company",
          headerName: "Společnost",
          filter: true,
          editable: true,
          flex: 1.2,
          minWidth: 130
        },
        {
          field: "email",
          headerName: "E-mail",
          filter: true,
          editable: true,
          flex: 1.2,
          minWidth: 170
        },
        {
          field: "commission_count",
          headerName: "Počet tipů",
          filter: true,
          editable: false,
          flex: 0.9,
          minWidth: 120
        }
      );
    } else {
      cols.push(
        {
          field: "position",
          headerName: "Tip / Zakázka",
          filter: true,
          editable: (params) => !params.data?.entityOnly,
          flex: 2,
          minWidth: 180
        },
        {
          field: "budget",
          headerName: "Hodnota",
          filter: true,
          editable: (params) => !params.data?.entityOnly,
          flex: 0.8,
          minWidth: 80
        },
        {
          field: "commission_value",
          headerName: "Provize",
          filter: true,
          editable: (params) => !params.data?.entityOnly,
          flex: 0.8,
          minWidth: 80
        },
        assignedUsersColumn,
        {
          field: "state",
          headerName: "Stav",
          filter: true,
          editable: false,
          flex: 1,
          minWidth: 140,
          comparator: (left, right) => compareWorkflowStatuses(left, right),
          cellRenderer: StatusCellRenderer
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
          }
        }
      );
    }

    return cols;
  }, [assignableUsers, viewMode]);

  const useContentHeightLayout = gridData.length <= 8;

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <>
      <div className={`grid-container${useContentHeightLayout ? ' grid-container--content-height' : ''}`}>
        <div className={`grid-wrapper ag-theme-quartz${useContentHeightLayout ? ' grid-wrapper--content-height' : ''}`}>
          <AgGridReact<TiperGridRow>
            ref={gridRef}
            rowData={gridData}
            columnDefs={columnDefs}
            domLayout={useContentHeightLayout ? 'autoHeight' : 'normal'}
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
        linkedCommissions={linkedCommissions}
        selectedCommissionId={selectedCommissionId}
        onSelectCommission={setSelectedCommissionId}
        onDuplicateEntityCommission={handleDuplicateEntityCommission}
        onDuplicateCommission={handleDuplicateCommission}
        onCreateCommission={selectedEntity ? handleCreateFirstCommission : undefined}
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
        onUpdateNote={notesManager.updateNote}
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
        submitLabel={includeCommission ? "Vytvořit tipaře a tip" : "Vytvořit tipaře"}
        includeCommission={includeCommission}
        includeCommissionLabel="Přidat rovnou i tip / zakázku"
        onClose={closeCreateModal}
        onEntityChange={handleDraftEntityChange}
        onCommissionChange={handleDraftCommissionChange}
        onIncludeCommissionChange={setIncludeCommission}
        onSubmit={handleCreate}
      />
    </>
  );
};

export default TipersSectionNew;

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { ClientEntity, ClientCommission, ClientGridRow } from "../types/entities";
import ProfileCellRenderer from "../cells/ProfileCellRenderer";
import EntityCommissionCreateModal from "../components/EntityCommissionCreateModal";
import EntityCommissionProfilePanel, {
  type EntityData,
  type CommissionData,
  type FieldGroup,
  type LinkedCommissionItem
} from "../components/EntityCommissionProfilePanel";
import { mapViewToStatus } from "../constants";
import { apiGet, apiPost, apiPut, apiDelete } from "../../utils/api";
import type { SectionProps } from "./SectionTypes";
import useProfileDocuments from "../hooks/useProfileDocuments";
import useProfileNotes from "../hooks/useProfileNotes";
import { ApproveRestoreCellRenderer, DeleteArchiveCellRenderer } from "../cells/RowActionCellRenderers";
import { fieldOptions } from "../fieldOptions";
import { formatProfileDate } from "../utils/profileUtils";

type ClientEntityApi = {
  id: number;
  entity_id: string;
  status: "pending" | "accepted" | "archived";
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
  entity_company_name?: string | null;
  entity_first_name?: string | null;
  entity_last_name?: string | null;
  entity_field?: string | null;
  entity_service?: string | null;
  entity_budget?: string | null;
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
    service: "",
    budget: "",
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
  status: entity.status,
  name: joinName(entity.first_name, entity.last_name) || entity.company_name || entity.entity_id,
  company: entity.company_name ?? null,
  field: entity.field ?? null,
  service: entity.service ?? null,
  budget: entity.budget ?? null,
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

const getCommissionEntityName = (commission: ClientCommissionApi) =>
  joinName(commission.entity_first_name, commission.entity_last_name) || commission.entity_company_name || commission.commission_id.split('-')[0] || '';

const mapClientEntityUpdates = (updates: Record<string, unknown>) => {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key === "name") mapped.first_name = value;
    else if (key === "company") mapped.company_name = value;
    else if (key === "mobile") mapped.phone = value;
    else if (["field", "service", "budget", "location", "email", "website", "info"].includes(key)) mapped[key] = value;
  }
  return mapped;
};

const deriveClientEntityFromCommission = (commission: ClientCommissionApi): ClientEntity | null => {
  const entityId = Number(commission.entity_id);
  if (!Number.isFinite(entityId)) return null;

  return {
    id: entityId,
    entity_id: commission.commission_id.split('-')[0] || String(entityId),
    status: commission.status,
    name: joinName(commission.entity_first_name, commission.entity_last_name) || commission.entity_company_name || commission.commission_id.split('-')[0] || String(entityId),
    company: commission.entity_company_name ?? null,
    field: commission.entity_field ?? null,
    service: commission.entity_service ?? null,
    budget: commission.entity_budget ?? null,
    location: commission.entity_location ?? null,
    address: null,
    mobile: commission.entity_phone ?? null,
    email: commission.entity_email ?? null,
    website: commission.entity_website ?? null,
    info: commission.entity_info ?? null,
    created_at: undefined,
    updated_at: undefined
  };
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
        { key: "service", label: "Požadovaná služba", value: entity.service, type: "text" },
        { key: "budget", label: "Rozpočet subjektu", value: entity.budget, type: "text" },
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
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
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
    createdAt: commission.created_at,
    updatedAt: commission.updated_at,
    groups
  };
};

const formatAddedDate = (value?: string | null) => formatProfileDate(value) ?? "";

const buildLinkedCommissionItems = (commissions: ClientCommission[]): LinkedCommissionItem[] => commissions
  .map((commission) => ({
    id: commission.id,
    commission_id: commission.commission_id,
    status: commission.status,
    title: commission.position || 'Bez názvu zakázky',
    subtitle: [commission.service_position, commission.assigned_to].filter(Boolean).join(' • ') || null
  }))
  .sort((left, right) => left.commission_id.localeCompare(right.commission_id));

const buildClientDraftEntityData = (draft: ClientCreateDraft): EntityData => ({
  id: 0,
  entity_id: "Nový klient",
  groups: buildEntityData({
    id: 0,
    entity_id: "Nový klient",
    status: "accepted",
    name: draft.entity.name,
    company: draft.entity.company,
    field: draft.entity.field,
    service: draft.entity.service,
    budget: draft.entity.budget,
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
  systemNamespace,
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
  const [includeCommission, setIncludeCommission] = useState(false);
  const [createDraft, setCreateDraft] = useState<ClientCreateDraft>(createDefaultClientDraft);
  
  // Selected entity/commission for profile panel
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [selectedCommissionId, setSelectedCommissionId] = useState<number | null>(null);
  
  const gridRef = useRef<AgGridReact<ClientGridRow>>(null);

  // Get status from viewMode
  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);
  const resourceKey = systemNamespace ? "project-clients" : "clients";
  const entityApiBase = systemNamespace ? `/api/${systemNamespace}/client-entities` : "/api/client-entities";
  const commissionApiBase = systemNamespace ? `/api/${systemNamespace}/client-commissions` : "/api/client-commissions";

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
        apiGet<ClientEntityApi[]>(`${entityApiBase}?status=${status}`),
        apiGet<ClientCommissionApi[]>(`${commissionApiBase}?status=${status}`)
      ]);

      const entitiesList = (Array.isArray(entitiesData) ? entitiesData : []).map(normalizeClientEntity);
      const commissionsList = (Array.isArray(commissionsData) ? commissionsData : []).map(normalizeClientCommission);

      setEntities(entitiesList);
      setCommissions(commissionsList);

      if (status === 'accepted') {
        const commissionsByEntity = new Map<number, ClientCommission[]>();
        for (const commission of commissionsList) {
          const current = commissionsByEntity.get(commission.client_entity_id) || [];
          current.push(commission);
          commissionsByEntity.set(commission.client_entity_id, current);
        }

        const rows: ClientGridRow[] = entitiesList.map((entity) => {
          const entityCommissions = commissionsByEntity.get(entity.id) || [];
          const primaryCommission = entityCommissions[0] || null;

          return {
            id: entity.id,
            commission_id: primaryCommission?.commission_id || `${entity.entity_id}-000`,
            client_entity_id: entity.id,
            status: entity.status,
            assigned_to: primaryCommission?.assigned_to ?? null,
            priority: primaryCommission?.priority ?? null,
            notes: primaryCommission?.notes ?? null,
            deadline: primaryCommission?.deadline ?? null,
            state: primaryCommission?.state ?? null,
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
            entity
          };
        });

        rows.sort((left, right) => left.entity_id.localeCompare(right.entity_id));
        setGridData(rows);
        return;
      }

      // Build grid data - each row is a commission with entity info
      const entityIdsWithCommission = new Set<number>(commissionsList.map((commission) => commission.client_entity_id));

      const commissionRows: ClientGridRow[] = commissionsList.map((commission, index) => {
        const rawCommission = (Array.isArray(commissionsData) ? commissionsData : [])[index];
        const entity = entitiesList.find((e) => e.id === commission.client_entity_id) || deriveClientEntityFromCommission(rawCommission);
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
          entity: entity || null
        };
      });

      const entityOnlyRows: ClientGridRow[] = entitiesList
        .filter((entity) => !entityIdsWithCommission.has(entity.id))
        .map((entity) => ({
          id: -entity.id,
          commission_id: `${entity.entity_id}-000`,
          client_entity_id: entity.id,
          status: entity.status,
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
          entity: entity || null
        }));

      const rows = [...commissionRows, ...entityOnlyRows];

      rows.sort((left, right) => left.commission_id.localeCompare(right.commission_id));

      setGridData(rows);
    } catch (error) {
      console.error("Error fetching client data:", error);
      setEntities([]);
      setCommissions([]);
      setGridData([]);
    } finally {
      setIsLoading(false);
    }
  }, [commissionApiBase, entityApiBase, status]);

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
    return buildLinkedCommissionItems(commissions.filter((commission) => commission.client_entity_id === selectedEntityId));
  }, [commissions, selectedEntityId]);

  const entityData = useMemo(() => buildEntityData(selectedEntity), [selectedEntity]);
  const commissionData = useMemo(() => buildCommissionData(selectedCommission), [selectedCommission]);
  const draftEntityData = useMemo(() => buildClientDraftEntityData(createDraft), [createDraft]);
  const draftCommissionData = useMemo(() => buildClientDraftCommissionData(createDraft, status), [createDraft, status]);

  const openProfile = useCallback((row: ClientGridRow) => {
    const entityId = row.entity?.id ?? row.client_entity_id ?? null;
    if (entityId !== null) setSelectedEntityId(entityId);
    setSelectedCommissionId(viewMode === "active" ? null : row.primaryCommissionId ?? (row.entityOnly ? null : row.id));
  }, [viewMode]);

  const closeProfile = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedCommissionId(null);
  }, []);

  const openCreateModal = useCallback((draft?: ClientCreateDraft) => {
    setCreateDraft(draft ?? createDefaultClientDraft());
    setIncludeCommission(Boolean(draft));
    setCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    if (isCreating) return;
    setCreateModalOpen(false);
    setIncludeCommission(false);
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
      await apiPut(`${entityApiBase}/${entityId}`, mappedUpdates);
      fetchData();
    } catch (error) {
      console.error("Error updating client entity:", error);
      throw error;
    }
  }, [entityApiBase, fetchData]);

  const handleUpdateCommission = useCallback(async (commissionId: number, updates: Record<string, unknown>) => {
    try {
      await apiPut(`${commissionApiBase}/${commissionId}`, updates);
      fetchData();
    } catch (error) {
      console.error("Error updating client commission:", error);
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
      alert("Chyba při schvalování zakázky");
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
      alert("Chyba při obnovování zakázky");
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
        ? `Opravdu chcete TRVALE SMAZAT tohoto klienta a všech ${linkedCount} navázaných zakázek?\n\nKlient: ${label}\nID: ${row.entity_id}\n\nTato akce je NEzvratná!`
        : `Opravdu chcete TRVALE SMAZAT tohoto klienta?\n\nKlient: ${label}\nID: ${row.entity_id}\n\nTato akce je NEzvratná!`;

      if (!confirm(confirmMessage)) return;

      try {
        await apiDelete(`${entityApiBase}/${entityId}`);
        if (selectedEntityId === entityId) {
          closeProfile();
        }
        fetchData();
      } catch (error) {
        console.error("Error deleting client entity:", error);
        alert("Chyba při mazání klienta");
      }
      return;
    }

    const commission = commissions.find(c => c.id === id);
    const row = gridData.find(r => r.id === id);
    if (row?.entityOnly && row.entity) {
      const isArchivedEntity = row.status === "archived";
      const confirmMessage = isArchivedEntity
        ? `Opravdu chcete TRVALE SMAZAT tohoto klienta z databáze?\n\nKlient: ${row.name || row.company || row.entity_id}\nID: ${row.entity_id}\n\nTato akce je NEzvratná!`
        : `Opravdu chcete zamítnout tohoto klienta?\n\nKlient: ${row.name || row.company || row.entity_id}\nID: ${row.entity_id}`;

      if (!confirm(confirmMessage)) return;

      try {
        await apiDelete(`${entityApiBase}/${row.entity.id}`);
        if (selectedEntityId === row.entity.id) {
          closeProfile();
        }
        fetchData();
      } catch (error) {
        console.error("Error deleting client entity:", error);
        alert("Chyba při provádění akce");
      }
      return;
    }
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
      const response = await apiPost<{ entity: ClientEntity; commission: ClientCommission }>(`${entityApiBase}/with-commission`, {
        entity: {
          status,
          first_name: emptyToNull(createDraft.entity.name),
          company_name: emptyToNull(createDraft.entity.company),
          field: emptyToNull(createDraft.entity.field),
          service: emptyToNull(createDraft.entity.service),
          budget: emptyToNull(createDraft.entity.budget),
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

  const handleCreateEntityOnly = useCallback(async () => {
    setIsCreating(true);
    try {
      const entity = await apiPost<ClientEntityApi>(entityApiBase, {
        status,
        first_name: emptyToNull(createDraft.entity.name),
        company_name: emptyToNull(createDraft.entity.company),
        field: emptyToNull(createDraft.entity.field),
        service: emptyToNull(createDraft.entity.service),
        budget: emptyToNull(createDraft.entity.budget),
        phone: emptyToNull(createDraft.entity.mobile),
        email: emptyToNull(createDraft.entity.email),
        website: emptyToNull(createDraft.entity.website),
        location: emptyToNull(createDraft.entity.location),
        info: emptyToNull(createDraft.entity.info)
      });

      setCreateModalOpen(false);
      setCreateDraft(createDefaultClientDraft());
      await fetchData();

      if (entity?.id) {
        setSelectedEntityId(entity.id);
        setSelectedCommissionId(null);
      }
    } catch (error) {
      console.error('Error creating client entity:', error);
      alert('Chyba při vytváření klienta');
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
        service: selectedEntity.service ?? "",
        budget: selectedEntity.budget ?? "",
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
      const response = await apiPost<{ id: number }>(commissionApiBase, {
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
  }, [commissionApiBase, fetchData, selectedCommission, selectedEntity]);

  const handleCreateFirstCommission = useCallback(async () => {
    if (!selectedEntity) return;

    try {
      const response = await apiPost<{ id: number }>('/api/client-commissions', {
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
      console.error('Error creating first client commission:', error);
      alert('Chyba při vytváření první zakázky');
    }
  }, [fetchData, selectedEntity, status]);

  // ==========================================================================
  // GRID CONTEXT
  // ==========================================================================

  const gridContext = useMemo(() => ({
    openProfile,
    rowActions: {
      viewMode,
      entityAccusative: viewMode === "active" ? "klienta" : "zakázku",
      entityOnlyAccusative: "klienta",
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

    if (viewMode === "active") {
      cols.push(
        {
          field: "mobile",
          headerName: "Telefon",
          filter: true,
          editable: true,
          flex: 1,
          minWidth: 120
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
          headerName: "Počet zakázek",
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
          headerName: "Zakázka",
          filter: true,
          editable: (params) => !params.data?.entityOnly,
          flex: 1.5,
          minWidth: 140
        },
        {
          field: "budget",
          headerName: "Rozpočet",
          filter: true,
          editable: (params) => !params.data?.entityOnly,
          flex: 1,
          minWidth: 100
        },
        {
          field: "service_position",
          headerName: "Typ služby",
          filter: true,
          editable: (params) => !params.data?.entityOnly,
          flex: 1,
          minWidth: 100,
          cellEditor: 'agTextCellEditor'
        },
        {
          field: "priority",
          headerName: "Priorita",
          filter: true,
          editable: (params) => !params.data?.entityOnly,
          flex: 0.8,
          minWidth: 80,
          cellEditor: 'agSelectCellEditor',
          cellEditorParams: {
            values: ["Nízká", "Střední", "Vysoká", "Urgentní"]
          }
        }
      );
    }

    return cols;
  }, [viewMode]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <>
      <div className="grid-container">
        <div className="grid-wrapper ag-theme-quartz">
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
        open={selectedEntityId !== null}
        entityType="client"
        entityLabel="Klient"
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
        title="Nový klient a zakázka"
        entityTitle="Klient"
        commissionTitle="Zakázka"
        entityGroups={draftEntityData.groups}
        commissionGroups={draftCommissionData.groups}
        entityValues={createDraft.entity}
        commissionValues={createDraft.commission}
        isSubmitting={isCreating}
        submitLabel={includeCommission ? "Vytvořit klienta a zakázku" : "Vytvořit klienta"}
        includeCommission={includeCommission}
        includeCommissionLabel="Přidat rovnou i zakázku"
        onClose={closeCreateModal}
        onEntityChange={handleDraftEntityChange}
        onCommissionChange={handleDraftCommissionChange}
        onIncludeCommissionChange={setIncludeCommission}
        onSubmit={handleCreate}
      />
    </>
  );
};

export default ClientsSectionNew;

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { PartnerEntity, PartnerCommission, PartnerGridRow } from "../types/entities";
import ProfileCellRenderer from "../cells/ProfileCellRenderer";
import EntityCommissionProfilePanel, {
  type EntityData,
  type CommissionData,
  type FieldGroup
} from "../components/EntityCommissionProfilePanel";
import { mapViewToStatus } from "../constants";
import { apiDelete, apiGet, apiPost, apiPut } from "../../utils/api";
import type { SectionProps } from "./SectionTypes";
import useProfileDocuments from "../hooks/useProfileDocuments";
import useProfileNotes from "../hooks/useProfileNotes";
import { ApproveRestoreCellRenderer, DeleteArchiveCellRenderer } from "../cells/RowActionCellRenderers";
import { fieldOptions } from "../fieldOptions";

type PartnerEntityApi = {
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

type PartnerCommissionApi = {
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

const joinName = (...parts: Array<string | null | undefined>) =>
  parts.filter((part): part is string => Boolean(part && part.trim())).join(" ").trim();

const normalizePartnerEntity = (entity: PartnerEntityApi): PartnerEntity => ({
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

const normalizePartnerCommission = (commission: PartnerCommissionApi): PartnerCommission => ({
  id: commission.id,
  commission_id: commission.commission_id,
  partner_entity_id: Number(commission.entity_id),
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

const mapPartnerEntityUpdates = (updates: Record<string, unknown>) => {
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (key === "name") mapped.first_name = value;
    else if (key === "company") mapped.company_name = value;
    else if (key === "mobile") mapped.phone = value;
    else if (["field", "location", "email", "website", "info"].includes(key)) mapped[key] = value;
  }

  return mapped;
};

const buildEntityData = (entity: PartnerEntity | null): EntityData | null => {
  if (!entity) return null;

  const groups: FieldGroup[] = [
    {
      title: "Základní údaje",
      color: "purple",
      fields: [
        { key: "name", label: "Jméno / Název", value: entity.name, type: "text" },
        { key: "company", label: "Společnost", value: entity.company, type: "text" },
        { key: "field", label: "Obor", value: entity.field, type: "select", options: FIELD_OPTIONS_ARRAY }
      ]
    },
    {
      title: "Kontakty",
      color: "green",
      fields: [
        { key: "mobile", label: "Telefon", value: entity.mobile, type: "text" },
        { key: "email", label: "E-mail", value: entity.email, type: "text" },
        { key: "website", label: "Web", value: entity.website, type: "text" }
      ]
    },
    {
      title: "Další informace",
      color: "gray",
      fields: [
        { key: "location", label: "Lokalita", value: entity.location, type: "text" },
        { key: "info", label: "Info", value: entity.info, type: "textarea", isMultiline: true }
      ]
    }
  ];

  return { id: entity.id, entity_id: entity.entity_id, groups };
};

const buildCommissionData = (commission: PartnerCommission | null): CommissionData | null => {
  if (!commission) return null;

  const groups: FieldGroup[] = [
    {
      title: "Zakázka",
      color: "purple",
      fields: [
        { key: "position", label: "Pozice / Zakázka", value: commission.position, type: "text" },
        { key: "service_position", label: "Typ služby", value: commission.service_position, type: "text" },
        { key: "assigned_to", label: "Přiřazeno", value: commission.assigned_to, type: "text" }
      ]
    },
    {
      title: "Finance a stav",
      color: "green",
      fields: [
        { key: "budget", label: "Rozpočet", value: commission.budget, type: "text" },
        { key: "commission_value", label: "Provize", value: commission.commission_value, type: "text" },
        { key: "priority", label: "Priorita", value: commission.priority, type: "select", options: ["Nízká", "Střední", "Vysoká", "Urgentní"] }
      ]
    },
    {
      title: "Průběh",
      color: "orange",
      fields: [
        { key: "state", label: "Stav", value: commission.state, type: "text" },
        { key: "deadline", label: "Termín", value: commission.deadline, type: "date" },
        { key: "notes", label: "Poznámky", value: commission.notes, type: "textarea", isMultiline: true }
      ]
    }
  ];

  return { id: commission.id, commission_id: commission.commission_id, status: commission.status, groups };
};

const PartnersSectionNew: React.FC<SectionProps> = ({ viewMode, isActive, onRegisterAddHandler, onLoadingChange }) => {
  const [entities, setEntities] = useState<PartnerEntity[]>([]);
  const [commissions, setCommissions] = useState<PartnerCommission[]>([]);
  const [gridData, setGridData] = useState<PartnerGridRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [selectedCommissionId, setSelectedCommissionId] = useState<number | null>(null);

  const gridRef = useRef<AgGridReact<PartnerGridRow>>(null);
  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);
  const documentManager = useProfileDocuments("partners", selectedEntityId);
  const notesManager = useProfileNotes("partners", selectedEntityId);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [entitiesData, commissionsData] = await Promise.all([
        apiGet<PartnerEntityApi[]>("/api/partner-entities"),
        apiGet<PartnerCommissionApi[]>(`/api/partner-commissions?status=${status}`)
      ]);

      const normalizedEntities = (Array.isArray(entitiesData) ? entitiesData : []).map(normalizePartnerEntity);
      const normalizedCommissions = (Array.isArray(commissionsData) ? commissionsData : []).map(normalizePartnerCommission);

      setEntities(normalizedEntities);
      setCommissions(normalizedCommissions);

      const rows: PartnerGridRow[] = normalizedCommissions.map((commission) => {
        const entity = normalizedEntities.find((item) => item.id === commission.partner_entity_id) || null;
        return {
          ...commission,
          entity_id: entity?.entity_id || commission.commission_id.split("-")[0] || "",
          name: entity?.name || "",
          company: entity?.company || "",
          field: entity?.field || commission.field || "",
          location: entity?.location || commission.location || "",
          mobile: entity?.mobile || commission.phone || "",
          email: entity?.email || "",
          entity
        };
      });

      setGridData(rows);
    } catch (error) {
      console.error("Error fetching partner data:", error);
      setEntities([]);
      setCommissions([]);
      setGridData([]);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  const selectedEntity = useMemo(() => selectedEntityId === null ? null : entities.find((entity) => entity.id === selectedEntityId) || null, [entities, selectedEntityId]);
  const selectedCommission = useMemo(() => selectedCommissionId === null ? null : commissions.find((commission) => commission.id === selectedCommissionId) || null, [commissions, selectedCommissionId]);
  const entityData = useMemo(() => buildEntityData(selectedEntity), [selectedEntity]);
  const commissionData = useMemo(() => buildCommissionData(selectedCommission), [selectedCommission]);

  const openProfile = useCallback((row: PartnerGridRow) => {
    if (row.entity) setSelectedEntityId(row.entity.id);
    setSelectedCommissionId(row.id);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedEntityId(null);
    setSelectedCommissionId(null);
  }, []);

  const handleUpdateEntity = useCallback(async (entityId: number, updates: Record<string, unknown>) => {
    const mappedUpdates = mapPartnerEntityUpdates(updates);
    if (Object.keys(mappedUpdates).length === 0) return;
    await apiPut(`/api/partner-entities/${entityId}`, mappedUpdates);
    fetchData();
  }, [fetchData]);

  const handleUpdateCommission = useCallback(async (commissionId: number, updates: Record<string, unknown>) => {
    await apiPut(`/api/partner-commissions/${commissionId}`, updates);
    fetchData();
  }, [fetchData]);

  const handleApprove = useCallback(async (id: number) => {
    try {
      await apiPost(`/api/partner-commissions/${id}/approve`);
      fetchData();
    } catch (error) {
      console.error("Error approving partner commission:", error);
      alert("Chyba při schvalování zakázky");
    }
  }, [fetchData]);

  const handleRestore = useCallback(async (id: number) => {
    try {
      await apiPost(`/api/partner-commissions/${id}/restore`);
      fetchData();
    } catch (error) {
      console.error("Error restoring partner commission:", error);
      alert("Chyba při obnovování zakázky");
    }
  }, [fetchData]);

  const handleDelete = useCallback(async (id: number) => {
    const commission = commissions.find((item) => item.id === id);
    const row = gridData.find((item) => item.id === id);
    const isArchived = commission?.status === "archived";
    const isPending = commission?.status === "pending";
    const subject = commission?.position || "N/A";
    const partner = row?.name || row?.company || "N/A";

    let confirmMessage = "";
    if (isArchived) confirmMessage = `Opravdu chcete TRVALE SMAZAT tuto zakázku z databáze?\n\nZakázka: ${subject}\nPartner: ${partner}\n\nTato akce je NEzvratná!`;
    else if (isPending) confirmMessage = `Opravdu chcete zamítnout tuto zakázku?\n\nZakázka: ${subject}\nPartner: ${partner}`;
    else confirmMessage = `Opravdu chcete přesunout tuto zakázku do archivu?\n\nZakázka: ${subject}\nPartner: ${partner}`;

    if (!window.confirm(confirmMessage)) return;

    try {
      if (isArchived || isPending) await apiDelete(`/api/partner-commissions/${id}`);
      else await apiPost(`/api/partner-commissions/${id}/archive`);
      fetchData();
    } catch (error) {
      console.error("Error deleting or archiving partner commission:", error);
      alert("Chyba při provádění akce");
    }
  }, [commissions, fetchData, gridData]);

  const gridContext = useMemo(() => ({
    openProfile,
    rowActions: {
      viewMode,
      entityAccusative: "zakázku",
      onApprove: handleApprove,
      onRestore: handleRestore,
      onDelete: handleDelete
    }
  }), [handleApprove, handleDelete, handleRestore, openProfile, viewMode]);

  const onCellValueChanged = useCallback(async (params: any) => {
    const row = params.data as PartnerGridRow;
    const field = params.colDef.field as string | undefined;
    if (!field) return;

    try {
      if (["name", "company", "field", "location", "mobile", "email"].includes(field) && row.entity) {
        await handleUpdateEntity(row.entity.id, { [field]: params.newValue });
      } else {
        await handleUpdateCommission(row.id, { [field]: params.newValue });
      }
    } catch (error) {
      console.error("Error updating partner row:", error);
      alert("Chyba při aktualizaci");
      fetchData();
    }
  }, [fetchData, handleUpdateCommission, handleUpdateEntity]);

  const handleAdd = useCallback(async () => {
    try {
      const response = await apiPost<{ entity: { id: number }; commission: { id: number } }>("/api/partner-entities/with-commission", {
        entity: {
          first_name: "Nový Partner",
          company_name: "Nová Společnost",
          location: "",
          phone: "",
          email: "",
          field: ""
        },
        commission: {
          position: "Nová zakázka",
          status,
          budget: "",
          commission_value: ""
        }
      });

      await fetchData();

      if (response?.entity?.id && response?.commission?.id) {
        setSelectedEntityId(response.entity.id);
        setSelectedCommissionId(response.commission.id);
      }
    } catch (error) {
      console.error("Error adding partner entity and commission:", error);
      alert("Chyba při přidávání partnera");
    }
  }, [fetchData, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isActive) {
      onRegisterAddHandler(handleAdd);
      onLoadingChange(isLoading);
    }
    return () => {
      if (isActive) onLoadingChange(false);
    };
  }, [handleAdd, isActive, isLoading, onLoadingChange, onRegisterAddHandler]);

  useEffect(() => {
    if (selectedCommissionId !== null && !commissions.some((commission) => commission.id === selectedCommissionId)) {
      closeProfile();
    }
  }, [closeProfile, commissions, selectedCommissionId]);

  const columnDefs = useMemo<ColDef<PartnerGridRow>[]>(() => {
    const cols: ColDef<PartnerGridRow>[] = [];

    if (viewMode === "pending" || viewMode === "archived") {
      cols.push({ headerName: "", colId: "approve", pinned: "left", width: 36, minWidth: 36, maxWidth: 36, suppressMovable: true, lockPosition: true, sortable: false, filter: false, resizable: false, editable: false, menuTabs: [], cellClass: "action-cell", headerClass: "action-cell", cellRenderer: ApproveRestoreCellRenderer });
    }

    cols.push(
      { headerName: "", colId: "delete", pinned: "left", width: 36, minWidth: 36, maxWidth: 36, suppressMovable: true, lockPosition: true, sortable: false, filter: false, resizable: false, editable: false, menuTabs: [], cellClass: "action-cell", headerClass: "action-cell", cellRenderer: DeleteArchiveCellRenderer },
      { headerName: "", colId: "profile", pinned: "left", width: 60, minWidth: 60, maxWidth: 68, suppressMovable: true, lockPosition: true, sortable: false, filter: false, resizable: false, editable: false, menuTabs: [], cellClass: "profile-cell", headerClass: "profile-cell", cellRenderer: ProfileCellRenderer },
      {
        headerName: "ID",
        colId: "display_id",
        valueGetter: (params) => {
          const row = params.data as PartnerGridRow;
          const entityCode = row.entity_id || row.commission_id.split("-")[0] || "";
          const commissionPart = row.commission_id.split("-")[1] || row.commission_id;
          return `${entityCode}-${commissionPart}`;
        },
        flex: 0.75,
        minWidth: 100,
        editable: false
      },
      { field: "name", headerName: "Jméno / Název", filter: true, editable: true, flex: 1.5, minWidth: 160 },
      { field: "company", headerName: "Společnost", filter: true, editable: true, flex: 1.5, minWidth: 160 },
      { field: "field", headerName: "Obor", filter: true, editable: true, flex: 1, minWidth: 110, cellEditor: "agSelectCellEditor", cellEditorParams: { values: FIELD_OPTIONS_ARRAY } },
      { field: "location", headerName: "Lokalita", filter: true, editable: true, flex: 1, minWidth: 110 },
      { field: "position", headerName: "Zakázka", filter: true, editable: true, flex: 1.5, minWidth: 150 },
      { field: "budget", headerName: "Rozpočet", filter: true, editable: true, flex: 1, minWidth: 110 },
      { field: "commission_value", headerName: "Provize", filter: true, editable: true, flex: 1, minWidth: 110 },
      { field: "priority", headerName: "Priorita", filter: true, editable: true, flex: 0.9, minWidth: 90, cellEditor: "agSelectCellEditor", cellEditorParams: { values: ["Nízká", "Střední", "Vysoká", "Urgentní"] } }
    );

    return cols;
  }, [viewMode]);

  return (
    <>
      <div className="grid-container">
        <div className="grid-wrapper ag-theme-quartz" style={{ height: "75vh" }}>
          <AgGridReact<PartnerGridRow>
            ref={gridRef}
            rowData={gridData}
            columnDefs={columnDefs}
            onCellValueChanged={onCellValueChanged}
            defaultColDef={{ resizable: true, sortable: true }}
            suppressRowClickSelection={true}
            loading={isLoading}
            context={gridContext}
          />
        </div>
      </div>

      <EntityCommissionProfilePanel
        open={selectedCommissionId !== null}
        entityType="partner"
        entityLabel="Partner"
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
        onUnarchiveDocument={documentManager.unarchiveDocument}
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

export default PartnersSectionNew;

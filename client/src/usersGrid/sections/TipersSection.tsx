import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { UserInterface } from "../user.interface";
import FieldCellRenderer from "../cells/FieldCellRenderer";
import ProfileCellRenderer from "../cells/ProfileCellRenderer";
import ProfilePanel from "../components/ProfilePanel";
import { mapViewToStatus } from "../constants";
import { apiGet, apiPost, apiPut, apiDelete } from "../../utils/api";
import { formatProfileDate, normalizeText, toStatusBadge } from "../utils/profileUtils";
import type { ProfileSection } from "../types/profile";
import type { SectionProps } from "./SectionTypes";
import StatusCellRenderer from "../cells/StatusCellRenderer";
import useProfileDocuments from "../hooks/useProfileDocuments";
import useProfileNotes from "../hooks/useProfileNotes";
import { ApproveRestoreCellRenderer, DeleteArchiveCellRenderer } from "../cells/RowActionCellRenderers";
import { useUndoRedo } from "../../utils/undoRedo";
import { getNormalizedWorkflowStatus } from "../workflowStatus";

const cloneRecord = (r: any) => JSON.parse(JSON.stringify(r));

type TiperCommissionApi = {
  id: number;
  commission_id: string;
  entity_id: number;
  entity_code?: string | null;
  status?: string | null;
  position?: string | null;
  budget?: string | null;
  state?: string | null;
  assigned_to?: string | null;
  field?: string | null;
  service_position?: string | null;
  location?: string | null;
  info?: string | null;
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
  entity_email?: string | null;
  entity_phone?: string | null;
  entity_website?: string | null;
  created_at?: string;
  updated_at?: string;
};

const TIPER_ENTITY_FIELDS = new Set(["name", "company", "location", "mobile", "info", "email", "website", "field"]);

const joinName = (...parts: Array<string | null | undefined>) =>
  parts.filter((part): part is string => Boolean(part && part.trim())).join(" ").trim();

const emptyToNull = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const getDisplayId = (tiper: UserInterface | null | undefined) => {
  if (!tiper) {
    return null;
  }
  if (tiper.commission_id) {
    return tiper.commission_id;
  }
  if (tiper.id === undefined || tiper.id === null) {
    return null;
  }
  return String(tiper.id);
};

const normalizeTiperCommissionRow = (commission: TiperCommissionApi): UserInterface => ({
  id: commission.id,
  commission_id: commission.commission_id,
  entity_internal_id: commission.entity_id,
  entity_code: commission.entity_code ?? undefined,
  name:
    joinName(commission.entity_first_name, commission.entity_last_name) ||
    commission.entity_company_name ||
    commission.entity_code ||
    commission.commission_id,
  company: commission.entity_company_name ?? "",
  location: commission.entity_location ?? commission.location ?? "",
  mobile: commission.entity_phone ?? commission.phone ?? "",
  commission: commission.commission_value ?? "",
  info: commission.entity_info ?? commission.info ?? "",
  date: commission.deadline ?? commission.created_at,
  status: commission.status ?? undefined,
  stage: getNormalizedWorkflowStatus(commission.state),
  field: commission.entity_field ?? commission.field ?? "",
  email: commission.entity_email ?? "",
  website: commission.entity_website ?? "",
  notes: commission.notes ?? undefined,
  assigned_to: commission.assigned_to ?? undefined,
  priority: commission.priority ?? undefined,
  next_step: commission.position ?? commission.service_position ?? undefined
});

const mapTiperEntityPayload = (tiper: Partial<UserInterface>) => ({
  first_name: emptyToNull(tiper.name),
  company_name: emptyToNull(tiper.company),
  field: emptyToNull(tiper.field),
  location: emptyToNull(tiper.location),
  info: emptyToNull(tiper.info),
  phone: emptyToNull(tiper.mobile),
  email: emptyToNull(tiper.email),
  website: emptyToNull(tiper.website)
});

const mapTiperCommissionPayload = (tiper: Partial<UserInterface>) => ({
  status: emptyToNull(tiper.status) ?? "pending",
  position: emptyToNull(tiper.next_step),
  deadline: emptyToNull(tiper.date),
  state: emptyToNull(tiper.stage),
  assigned_to: emptyToNull(tiper.assigned_to),
  priority: emptyToNull(tiper.priority),
  commission_value: emptyToNull(tiper.commission),
  notes: emptyToNull(tiper.notes),
  phone: emptyToNull(tiper.mobile),
  location: emptyToNull(tiper.location),
  field: emptyToNull(tiper.field),
  info: emptyToNull(tiper.info)
});

const buildTiperSections = (tiper: UserInterface | null): ProfileSection[] => {
  if (!tiper) {
    return [];
  }

  const sections: ProfileSection[] = [];

  // Identifikace a stav
  const idFields = [] as any[];
  const displayId = getDisplayId(tiper);
  if (displayId) {
    idFields.push({ label: "ID", value: displayId });
  }
  const status = normalizeText(tiper.status);
  if (status) {
    idFields.push({ label: "Stav", value: status });
  }
  const name = normalizeText(tiper.name);
  if (name) {
    idFields.push({ label: "Jméno", value: name });
  }
  if (idFields.length > 0) {
    sections.push({ title: "Identifikace", fields: idFields });
  }

  const profileFields = [];
  const specialization = normalizeText(tiper.field);
  if (specialization) {
    profileFields.push({ label: "Specializace", value: specialization });
  }
  const location = normalizeText(tiper.location);
  if (location) {
    profileFields.push({ label: "Lokalita", value: location });
  }
  const company = normalizeText(tiper.company);
  if (company) {
    profileFields.push({ label: "Společnost", value: company });
  }
  const address = normalizeText(tiper.address);
  if (address) {
    profileFields.push({ label: "Adresa", value: address });
  }

  if (profileFields.length > 0) {
    sections.push({ title: "Profil tipaře", fields: profileFields });
  }

  const contactFields = [];
  const contact = normalizeText(tiper.mobile);
  if (contact) {
    contactFields.push({ label: "Kontakt", value: contact });
  }
  const email = normalizeText(tiper.email);
  if (email) {
    contactFields.push({ label: "E-mail", value: email });
  }
  const website = normalizeText(tiper.website);
  if (website) {
    contactFields.push({ label: "Web", value: website });
  }

  if (contactFields.length > 0) {
    sections.push({ title: "Kontakt", fields: contactFields });
  }

  const cooperationFields = [];
  const commission = normalizeText(tiper.commission);
  if (commission) {
    cooperationFields.push({ label: "Odměna / Provize", value: commission });
  }

  const date = formatProfileDate(tiper.date);
  if (date) {
    cooperationFields.push({ label: "Datum poslední aktualizace", value: date });
  }

  const lastContact = formatProfileDate(tiper.last_contact);
  if (lastContact) {
    cooperationFields.push({ label: "Poslední kontakt", value: lastContact });
  }

  const assignedTo = normalizeText(tiper.assigned_to);
  if (assignedTo) {
    cooperationFields.push({ label: "Odpovědná osoba", value: assignedTo });
  }

  const nextStep = normalizeText(tiper.next_step);
  if (nextStep) {
    cooperationFields.push({ label: "Další krok", value: nextStep, isMultiline: true });
  }

  const priority = normalizeText(tiper.priority);
  if (priority) {
    cooperationFields.push({ label: "Priorita", value: priority });
  }

  if (status) {
    cooperationFields.push({ label: "Stav", value: status });
  }

  if (Array.isArray(tiper.tags) && tiper.tags.length > 0) {
    cooperationFields.push({ label: "Štítky", value: tiper.tags.join(", ") });
  }

  cooperationFields.push({
    label: "Info o tipaři",
    value: normalizeText(tiper.info) ?? "—",
    always: true,
    isMultiline: true
  });

  const notes = normalizeText(tiper.notes);
  if (notes) {
    cooperationFields.push({ label: "Poznámky", value: notes, isMultiline: true });
  }

  if (cooperationFields.length > 0) {
    sections.push({ title: "Spolupráce", fields: cooperationFields });
  }

  return sections;
};

const buildTiperMeta = (tiper: UserInterface | null): Array<{ label: string; value: string }> | undefined => {
  const displayId = getDisplayId(tiper);
  if (!tiper || !displayId) {
    return undefined;
  }

  const meta: Array<{ label: string; value: string }> = [{ label: "ID", value: displayId }];
  const status = normalizeText(tiper.status);
  if (status) {
    meta.push({ label: "Status", value: status });
  }
  const priority = normalizeText(tiper.priority);
  if (priority) {
    meta.push({ label: "Priorita", value: priority });
  }
  const assignedTo = normalizeText(tiper.assigned_to);
  if (assignedTo) {
    meta.push({ label: "Odpovědná osoba", value: assignedTo });
  }
  return meta;
};

const TipersSection: React.FC<SectionProps> = ({
  viewMode,
  isActive,
  systemNamespace,
  onRegisterAddHandler,
  onLoadingChange,
  focusRecordId,
  focusRequestKey
}) => {
  const [tipersData, setTipersData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const gridRef = useRef<AgGridReact<UserInterface>>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const resourceKey = systemNamespace ? "project-tipers" : "tipers";
  const entityApiBase = systemNamespace ? `/api/${systemNamespace}/tiper-entities` : "/api/tiper-entities";
  const commissionApiBase = systemNamespace ? `/api/${systemNamespace}/tiper-commissions` : "/api/tiper-commissions";
  const documentManager = useProfileDocuments(resourceKey, selectedId);
  const notesManager = useProfileNotes(resourceKey, selectedId);
  const { pushAction, signal } = useUndoRedo();
  const editSnapshotRef = useRef<Record<number, any>>({});

  // Refetch when other views mutate the same resource
  useEffect(() => {
    if (signal?.resource === resourceKey) {
      fetchTipersData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceKey, signal]);

  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  const fetchTipersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<TiperCommissionApi[]>(`${commissionApiBase}?status=${status}`);
      setTipersData(Array.isArray(data) ? data.map(normalizeTiperCommissionRow) : []);
    } catch (error) {
      console.error("Error fetching tipers:", error);
      setTipersData([]);
    } finally {
      setIsLoading(false);
    }
  }, [commissionApiBase, status]);

  const selectedTiper = useMemo(() => {
    if (selectedId === null) {
      return null;
    }
    return tipersData.find((tiper) => tiper.id === selectedId) ?? null;
  }, [selectedId, tipersData]);

  const openProfile = useCallback((tiper: UserInterface) => {
    if (tiper?.id === undefined || tiper.id === null) {
      return;
    }
    setSelectedId(tiper.id);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedId(null);
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    const exists = tipersData.some((tiper) => tiper.id === selectedId);
    if (!exists) {
      setSelectedId(null);
    }
  }, [selectedId, tipersData]);

  const profileSections = useMemo(() => buildTiperSections(selectedTiper), [selectedTiper]);
  const profileBadge = useMemo(() => toStatusBadge(selectedTiper?.status), [selectedTiper]);
  const profileMeta = useMemo(() => buildTiperMeta(selectedTiper), [selectedTiper]);
  const profileTitle = normalizeText(selectedTiper?.name) ?? "Profil tipaře";
  const profileSubtitle = normalizeText(selectedTiper?.company) ?? null;

  const handleApproveTiper = useCallback(
    async (id: number) => {
      const prev = cloneRecord(tipersData.find((t) => t.id === id));
      if (!prev) return;
      try {
        await apiPost(`${commissionApiBase}/${id}/approve`);
        fetchTipersData();
        pushAction({
          label: `Schválení zakázky #${id}`,
          resource: resourceKey,
          undo: async () => {
            await apiPut(`${commissionApiBase}/${id}`, { status: prev.status ?? "pending" });
          },
          redo: async () => {
            await apiPost(`${commissionApiBase}/${id}/approve`);
          }
        });
      } catch (error) {
        console.error("Error approving tiper:", error);
        alert("Chyba při schvalování tipaře");
      }
    },
    [commissionApiBase, fetchTipersData, pushAction, resourceKey, tipersData]
  );

  const handleRestoreTiper = useCallback(
    async (id: number) => {
      const prev = cloneRecord(tipersData.find((t) => t.id === id));
      if (!prev) return;
      try {
        await apiPost(`${commissionApiBase}/${id}/restore`);
        fetchTipersData();
        pushAction({
          label: `Obnovení zakázky #${id}`,
          resource: resourceKey,
          undo: async () => {
            await apiPut(`${commissionApiBase}/${id}`, { status: prev.status ?? "archived" });
          },
          redo: async () => {
            await apiPost(`${commissionApiBase}/${id}/restore`);
          }
        });
      } catch (error) {
        console.error("Error restoring tiper:", error);
        alert("Chyba při obnovování tipaře");
      }
    },
    [commissionApiBase, fetchTipersData, pushAction, resourceKey, tipersData]
  );

  const handleDeleteTiper = useCallback(
    async (id: number) => {
      const tiper = tipersData.find((t) => t.id === id);
      const isArchived = tiper?.status === "archived";
      const isPending = tiper?.status === "pending";

      let confirmMessage = "";

      if (isArchived) {
        confirmMessage =
          `Opravdu chcete TRVALE SMAZAT tohoto tipaře z databáze?\n\nJméno: ${tiper?.name || "N/A"}\nSpolečnost: ${tiper?.company || "N/A"}\n\nTato akce je NEzvratná!`;
      } else if (isPending) {
        confirmMessage =
          `Opravdu chcete zamítnout tohoto tipaře?\n\nJméno: ${tiper?.name || "N/A"}\nSpolečnost: ${tiper?.company || "N/A"}`;
      } else {
        confirmMessage =
          `Opravdu chcete přesunout tohoto tipaře do archivu k odstraňení?\n\nJméno: ${tiper?.name || "N/A"}\nSpolečnost: ${tiper?.company || "N/A"}`;
      }

      if (!confirm(confirmMessage)) {
        return;
      }

      try {
        if (isArchived || isPending) {
          await apiDelete(`${commissionApiBase}/${id}`);
          let restoredId: number | null = null;
          pushAction({
            label: `Smazání zakázky #${id}`,
            resource: resourceKey,
            undo: async () => {
              if (!tiper?.entity_internal_id) return;
              const restored = await apiPost<{ id: number }>(commissionApiBase, {
                entity_id: tiper.entity_internal_id,
                ...mapTiperCommissionPayload(tiper)
              });
              restoredId = restored?.id ?? null;
            },
            redo: async () => {
              await apiDelete(`${commissionApiBase}/${restoredId ?? id}`);
            }
          });
        } else {
          await apiPost(`${commissionApiBase}/${id}/archive`);
          pushAction({
            label: `Archivace zakázky #${id}`,
            resource: resourceKey,
            undo: async () => {
              await apiPost(`${commissionApiBase}/${id}/restore`);
            },
            redo: async () => {
              await apiPost(`${commissionApiBase}/${id}/archive`);
            }
          });
        }
        fetchTipersData();
      } catch (error) {
        console.error("Error performing action on tiper:", error);
        alert("Chyba při mazání tipaře");
      }
    },
    [commissionApiBase, fetchTipersData, pushAction, resourceKey, tipersData]
  );

  const gridContext = useMemo(
    () => ({
      openProfile,
      rowActions: {
        viewMode,
        entityAccusative: "zakázku",
        onApprove: handleApproveTiper,
        onRestore: handleRestoreTiper,
        onDelete: handleDeleteTiper
      }
    }),
    [handleApproveTiper, handleDeleteTiper, handleRestoreTiper, openProfile, viewMode]
  );

  const onTipersCellValueChanged = useCallback(
    async (params: any) => {
      // Guard: never allow status field to be changed via cell editing
      if (params.column?.colId === "status") return;
      const id = params.data.id;
      const field = params.colDef.field as string | undefined;
      if (!field) return;
      const snapshot = editSnapshotRef.current[id];
      try {
        const updatedTiper = { ...(params.data as UserInterface) };
        const isEntityField = TIPER_ENTITY_FIELDS.has(field);

        if (isEntityField) {
          if (!updatedTiper.entity_internal_id) {
            throw new Error("Missing linked entity id for tiper row");
          }
          await apiPut(`${entityApiBase}/${updatedTiper.entity_internal_id}`, mapTiperEntityPayload(updatedTiper));
        } else {
          await apiPut(`${commissionApiBase}/${updatedTiper.id}`, mapTiperCommissionPayload(updatedTiper));
        }

        if (snapshot) {
          const after = cloneRecord(updatedTiper);
          pushAction({
            label: `Úprava zakázky #${id}`,
            resource: resourceKey,
            undo: async () => {
              if (isEntityField) {
                if (!snapshot.entity_internal_id) return;
                await apiPut(`${entityApiBase}/${snapshot.entity_internal_id}`, mapTiperEntityPayload(snapshot));
                return;
              }
              await apiPut(`${commissionApiBase}/${id}`, mapTiperCommissionPayload(snapshot));
            },
            redo: async () => {
              if (isEntityField) {
                if (!after.entity_internal_id) return;
                await apiPut(`${entityApiBase}/${after.entity_internal_id}`, mapTiperEntityPayload(after));
                return;
              }
              await apiPut(`${commissionApiBase}/${id}`, mapTiperCommissionPayload(after));
            }
          });
          delete editSnapshotRef.current[id];
        }
      } catch (error) {
        console.error("Error updating tiper:", error);
        alert("Chyba při aktualizaci tipaře");
        fetchTipersData();
      }
    },
    [commissionApiBase, entityApiBase, fetchTipersData, pushAction, resourceKey]
  );

  const handleAddTiper = useCallback(async () => {
    const newTiper = {
      name: "Nový Tipař",
      company: "Nová Společnost",
      location: "Nová Lokalita",
      mobile: "000 000 000",
      status: status
    };

    try {
      let createdId: number | null = null;
      const created = await apiPost<TiperCommissionApi>(commissionApiBase, {
        entity_data: mapTiperEntityPayload(newTiper),
        commission_data: mapTiperCommissionPayload(newTiper)
      });
      createdId = created?.id ?? null;
      fetchTipersData();
      if (createdId !== null) {
        pushAction({
          label: "Přidání zakázky",
          resource: resourceKey,
          undo: async () => {
            await apiDelete(`${commissionApiBase}/${createdId}`);
          },
          redo: async () => {
            const recreated = await apiPost<TiperCommissionApi>(commissionApiBase, {
              entity_data: mapTiperEntityPayload(newTiper),
              commission_data: mapTiperCommissionPayload(newTiper)
            });
            createdId = recreated?.id ?? null;
          }
        });
      }
    } catch (error) {
      console.error("Error adding tiper:", error);
      alert("Chyba při přidávání tipaře");
    }
  }, [commissionApiBase, fetchTipersData, pushAction, resourceKey, status]);

  useEffect(() => {
    fetchTipersData();
  }, [fetchTipersData]);

  useEffect(() => {
    if (isActive) {
      onRegisterAddHandler(handleAddTiper);
      onLoadingChange(isLoading);
    }
    return () => {
      if (isActive) {
        onLoadingChange(false);
      }
    };
  }, [handleAddTiper, isActive, isLoading, onLoadingChange, onRegisterAddHandler]);

  useEffect(() => {
    if (!isActive || !focusRequestKey || focusRecordId === null || focusRecordId === undefined) {
      return;
    }

    const targetTiper = tipersData.find((tiper) => tiper.id === focusRecordId);
    if (!targetTiper || !gridRef.current?.api) {
      return;
    }

    openProfile(targetTiper);

    let targetNode: any = null;
    gridRef.current.api.forEachNode((node) => {
      if (node.data?.id === focusRecordId) {
        targetNode = node;
      }
    });

    if (targetNode?.rowIndex !== null && targetNode?.rowIndex !== undefined) {
      gridRef.current.api.ensureIndexVisible(targetNode.rowIndex, "middle");
      gridRef.current.api.flashCells({ rowNodes: [targetNode] });
    }
  }, [focusRecordId, focusRequestKey, isActive, openProfile, tipersData]);

  const tipersColDefs = useMemo<ColDef<UserInterface>[]>(
    () => {
      const cols: ColDef<UserInterface>[] = [];

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

      cols.push(
      {
        colId: "display-id",
        headerName: "ID",
        flex: 0.5,
        minWidth: 70,
        editable: false,
        valueGetter: (params) => params.data?.commission_id ?? params.data?.id
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
        field: "stage",
        headerName: "Stav",
        editable: false,
        filter: true,
        flex: 1,
        minWidth: 120,
        cellRenderer: StatusCellRenderer
      },
      {
        field: "commission",
        headerName: "Odměna/Provize",
        editable: true,
        filter: true,
        flex: 1,
        minWidth: 120
      }
      );

      return cols;
    },
    [viewMode]
  );

  return (
    <>
      <div className="grid-container">
        <div className="grid-wrapper ag-theme-quartz">
          <AgGridReact<UserInterface>
            ref={gridRef}
            rowData={tipersData}
            columnDefs={tipersColDefs}
            onCellEditingStarted={(e: any) => {
              if (e.data?.id != null) {
                editSnapshotRef.current[e.data.id] = cloneRecord(e.data);
              }
            }}
            onCellValueChanged={onTipersCellValueChanged}
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

      <ProfilePanel
        open={selectedTiper !== null}
        entityLabel="Tipař"
        title={profileTitle}
        subtitle={profileSubtitle}
        badge={profileBadge}
        meta={profileMeta}
        sections={profileSections}
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
        onClose={closeProfile}
      />
    </>
  );
};

export default TipersSection;

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
import useProfileDocuments from "../hooks/useProfileDocuments";
import useProfileNotes from "../hooks/useProfileNotes";
import { ApproveRestoreCellRenderer, DeleteArchiveCellRenderer } from "../cells/RowActionCellRenderers";
import { useUndoRedo } from "../../utils/undoRedo";

const cloneRecord = (r: any) => JSON.parse(JSON.stringify(r));

type PartnerCommissionApi = {
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
  entity_field?: string | null;
  entity_location?: string | null;
  entity_info?: string | null;
  entity_first_name?: string | null;
  entity_last_name?: string | null;
  entity_email?: string | null;
  entity_phone?: string | null;
  entity_website?: string | null;
  created_at?: string;
  updated_at?: string;
};

const PARTNER_ENTITY_FIELDS = new Set(["name", "company", "location", "mobile", "info", "email", "website", "field"]);

const joinName = (...parts: Array<string | null | undefined>) =>
  parts.filter((part): part is string => Boolean(part && part.trim())).join(" ").trim();

const emptyToNull = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const getDisplayId = (partner: UserInterface | null | undefined) => {
  if (!partner) {
    return null;
  }
  if (partner.commission_id) {
    return partner.commission_id;
  }
  if (partner.id === undefined || partner.id === null) {
    return null;
  }
  return String(partner.id);
};

const normalizePartnerCommissionRow = (commission: PartnerCommissionApi): UserInterface => ({
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
  stage: commission.state ?? undefined,
  field: commission.entity_field ?? commission.field ?? "",
  email: commission.entity_email ?? "",
  website: commission.entity_website ?? "",
  notes: commission.notes ?? undefined,
  assigned_to: commission.assigned_to ?? undefined,
  priority: commission.priority ?? undefined,
  next_step: commission.position ?? commission.service_position ?? undefined
});

const mapPartnerEntityPayload = (partner: Partial<UserInterface>) => ({
  first_name: emptyToNull(partner.name),
  company_name: emptyToNull(partner.company),
  field: emptyToNull(partner.field),
  location: emptyToNull(partner.location),
  info: emptyToNull(partner.info),
  phone: emptyToNull(partner.mobile),
  email: emptyToNull(partner.email),
  website: emptyToNull(partner.website)
});

const mapPartnerCommissionPayload = (partner: Partial<UserInterface>) => ({
  status: emptyToNull(partner.status) ?? "pending",
  position: emptyToNull(partner.next_step),
  deadline: emptyToNull(partner.date),
  state: emptyToNull(partner.stage),
  assigned_to: emptyToNull(partner.assigned_to),
  priority: emptyToNull(partner.priority),
  commission_value: emptyToNull(partner.commission),
  notes: emptyToNull(partner.notes),
  phone: emptyToNull(partner.mobile),
  location: emptyToNull(partner.location),
  field: emptyToNull(partner.field),
  info: emptyToNull(partner.info)
});

const buildPartnerSections = (partner: UserInterface | null): ProfileSection[] => {
  if (!partner) {
    return [];
  }

  const sections: ProfileSection[] = [];

  // Identifikace a stav
  const idFields = [] as any[];
  const displayId = getDisplayId(partner);
  if (displayId) {
    idFields.push({ label: "ID", value: displayId });
  }
  const status = normalizeText(partner.status);
  if (status) {
    idFields.push({ label: "Stav", value: status });
  }
  const name = normalizeText(partner.name);
  if (name) {
    idFields.push({ label: "Jméno", value: name });
  }
  if (idFields.length > 0) {
    sections.push({ title: "Identifikace", fields: idFields });
  }

  const generalFields = [];
  const specialization = normalizeText(partner.field);
  if (specialization) {
    generalFields.push({ label: "Specializace / Obor", value: specialization });
  }
  const company = normalizeText(partner.company);
  if (company) {
    generalFields.push({ label: "Společnost", value: company });
  }
  const location = normalizeText(partner.location);
  if (location) {
    generalFields.push({ label: "Lokalita", value: location });
  }
  const address = normalizeText(partner.address);
  if (address) {
    generalFields.push({ label: "Adresa", value: address });
  }

  if (generalFields.length > 0) {
    sections.push({ title: "Základní informace", fields: generalFields });
  }

  const contactFields = [];
  const contact = normalizeText(partner.mobile);
  if (contact) {
    contactFields.push({ label: "Kontakt", value: contact });
  }
  const email = normalizeText(partner.email);
  if (email) {
    contactFields.push({ label: "E-mail", value: email });
  }
  const website = normalizeText(partner.website);
  if (website) {
    contactFields.push({ label: "Web", value: website });
  }

  if (contactFields.length > 0) {
    sections.push({ title: "Kontakt", fields: contactFields });
  }

  const cooperationFields = [];
  const commission = normalizeText(partner.commission);
  if (commission) {
    cooperationFields.push({ label: "Odměna / Provize", value: commission });
  }

  const date = formatProfileDate(partner.date);
  if (date) {
    cooperationFields.push({ label: "Datum", value: date });
  }

  const lastContact = formatProfileDate(partner.last_contact);
  if (lastContact) {
    cooperationFields.push({ label: "Poslední kontakt", value: lastContact });
  }

  const assignedTo = normalizeText(partner.assigned_to);
  if (assignedTo) {
    cooperationFields.push({ label: "Odpovědná osoba", value: assignedTo });
  }

  const nextStep = normalizeText(partner.next_step);
  if (nextStep) {
    cooperationFields.push({ label: "Další krok", value: nextStep, isMultiline: true });
  }

  const priority = normalizeText(partner.priority);
  if (priority) {
    cooperationFields.push({ label: "Priorita", value: priority });
  }

  if (status) {
    cooperationFields.push({ label: "Stav", value: status });
  }

  if (Array.isArray(partner.tags) && partner.tags.length > 0) {
    cooperationFields.push({ label: "Štítky", value: partner.tags.join(", ") });
  }

  cooperationFields.push({
    label: "Informace o společnosti",
    value: normalizeText(partner.info) ?? "—",
    always: true,
    isMultiline: true
  });

  const notes = normalizeText(partner.notes);
  if (notes) {
    cooperationFields.push({ label: "Poznámky", value: notes, isMultiline: true });
  }

  if (cooperationFields.length > 0) {
    sections.push({ title: "Spolupráce", fields: cooperationFields });
  }

  return sections;
};

const buildPartnerMeta = (partner: UserInterface | null): Array<{ label: string; value: string }> | undefined => {
  const displayId = getDisplayId(partner);
  if (!partner || !displayId) {
    return undefined;
  }

  const meta: Array<{ label: string; value: string }> = [{ label: "ID", value: displayId }];
  const status = normalizeText(partner.status);
  if (status) {
    meta.push({ label: "Status", value: status });
  }
  const date = formatProfileDate(partner.date);
  if (date) {
    meta.push({ label: "Datum", value: date });
  }
  const priority = normalizeText(partner.priority);
  if (priority) {
    meta.push({ label: "Priorita", value: priority });
  }
  return meta;
};

const PartnersSection: React.FC<SectionProps> = ({
  viewMode,
  isActive,
  onRegisterAddHandler,
  onLoadingChange,
  focusRecordId,
  focusRequestKey
}) => {
  const [partnersData, setPartnersData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const gridRef = useRef<AgGridReact<UserInterface>>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const documentManager = useProfileDocuments("partners", selectedId);
  const notesManager = useProfileNotes("partners", selectedId);
  const { pushAction, signal } = useUndoRedo();
  const editSnapshotRef = useRef<Record<number, any>>({});

  // Refetch when other views mutate the same resource
  useEffect(() => {
    if (signal?.resource === "partners") {
      fetchPartnersData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  const defaultColDef = useMemo(
    () => ({
      resizable: true,
      sortable: true
    }),
    []
  );

  const getRowId = useCallback((params: any) => String(params.data.id), []);

  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  const fetchPartnersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<PartnerCommissionApi[]>(`/api/partner-commissions?status=${status}`);
      setPartnersData(Array.isArray(data) ? data.map(normalizePartnerCommissionRow) : []);
    } catch (error) {
      console.error("Error fetching partners:", error);
      setPartnersData([]);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  const selectedPartner = useMemo(() => {
    if (selectedId === null) {
      return null;
    }
    return partnersData.find((partner) => partner.id === selectedId) ?? null;
  }, [partnersData, selectedId]);

  const openProfile = useCallback((partner: UserInterface) => {
    if (partner?.id === undefined || partner.id === null) {
      return;
    }
    setSelectedId(partner.id);
  }, []);

  const closeProfile = useCallback(() => {
    setSelectedId(null);
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    const exists = partnersData.some((partner) => partner.id === selectedId);
    if (!exists) {
      setSelectedId(null);
    }
  }, [partnersData, selectedId]);

  const profileSections = useMemo(() => buildPartnerSections(selectedPartner), [selectedPartner]);
  const profileBadge = useMemo(() => toStatusBadge(selectedPartner?.status), [selectedPartner]);
  const profileMeta = useMemo(() => buildPartnerMeta(selectedPartner), [selectedPartner]);
  const profileTitle = normalizeText(selectedPartner?.name) ?? "Profil partnera";
  const profileSubtitle = normalizeText(selectedPartner?.company) ?? null;

  const handleApprovePartner = useCallback(
    async (id: number) => {
      const prev = cloneRecord(partnersData.find((p) => p.id === id));
      if (!prev) return;
      try {
        await apiPost(`/api/partner-commissions/${id}/approve`);
        fetchPartnersData();
        pushAction({
          label: `Schválení zakázky #${id}`,
          resource: "partners",
          undo: async () => {
            await apiPut(`/api/partner-commissions/${id}`, { status: prev.status ?? "pending" });
          },
          redo: async () => {
            await apiPost(`/api/partner-commissions/${id}/approve`);
          }
        });
      } catch (error) {
        console.error("Error approving partner:", error);
        alert("Chyba při schvalování partnera");
      }
    },
    [partnersData, fetchPartnersData, pushAction]
  );

  const handleRestorePartner = useCallback(
    async (id: number) => {
      const prev = cloneRecord(partnersData.find((p) => p.id === id));
      if (!prev) return;
      try {
        await apiPost(`/api/partner-commissions/${id}/restore`);
        fetchPartnersData();
        pushAction({
          label: `Obnovení zakázky #${id}`,
          resource: "partners",
          undo: async () => {
            await apiPut(`/api/partner-commissions/${id}`, { status: prev.status ?? "archived" });
          },
          redo: async () => {
            await apiPost(`/api/partner-commissions/${id}/restore`);
          }
        });
      } catch (error) {
        console.error("Error restoring partner:", error);
        alert("Chyba při obnovování partnera");
      }
    },
    [partnersData, fetchPartnersData, pushAction]
  );

  const handleDeletePartner = useCallback(
    async (id: number) => {
      const partner = partnersData.find((p) => p.id === id);
      const isArchived = partner?.status === "archived";
      const isPending = partner?.status === "pending";

      let confirmMessage = "";

      if (isArchived) {
        confirmMessage =
          `Opravdu chcete TRVALE SMAZAT tohoto partnera z databáze?\n\nJméno: ${partner?.name || "N/A"}\nSpolečnost: ${partner?.company || "N/A"}\n\nTato akce je NEzvratná!`;
      } else if (isPending) {
        confirmMessage =
          `Opravdu chcete zamítnout tohoto partnera?\n\nJméno: ${partner?.name || "N/A"}\nSpolečnost: ${partner?.company || "N/A"}`;
      } else {
        confirmMessage =
          `Opravdu chcete přesunout tohoto partnera do archivu k odstraňení?\n\nJméno: ${partner?.name || "N/A"}\nSpolečnost: ${partner?.company || "N/A"}`;
      }

      if (!confirm(confirmMessage)) {
        return;
      }

      try {
        if (isArchived || isPending) {
          await apiDelete(`/api/partner-commissions/${id}`);
          let restoredId: number | null = null;
          pushAction({
            label: `Smazání zakázky #${id}`,
            resource: "partners",
            undo: async () => {
              if (!partner?.entity_internal_id) return;
              const restored = await apiPost<{ id: number }>(`/api/partner-commissions`, {
                entity_id: partner.entity_internal_id,
                ...mapPartnerCommissionPayload(partner)
              });
              restoredId = restored?.id ?? null;
            },
            redo: async () => {
              await apiDelete(`/api/partner-commissions/${restoredId ?? id}`);
            }
          });
        } else {
          await apiPost(`/api/partner-commissions/${id}/archive`);
          pushAction({
            label: `Archivace zakázky #${id}`,
            resource: "partners",
            undo: async () => {
              await apiPost(`/api/partner-commissions/${id}/restore`);
            },
            redo: async () => {
              await apiPost(`/api/partner-commissions/${id}/archive`);
            }
          });
        }
        fetchPartnersData();
      } catch (error) {
        console.error("Error performing action on partner:", error);
        alert("Chyba při provádění akce");
      }
    },
    [fetchPartnersData, partnersData, pushAction]
  );

  const gridContext = useMemo(
    () => ({
      openProfile,
      rowActions: {
        viewMode,
        entityAccusative: "zakázku",
        onApprove: handleApprovePartner,
        onRestore: handleRestorePartner,
        onDelete: handleDeletePartner
      }
    }),
    [handleApprovePartner, handleDeletePartner, handleRestorePartner, openProfile, viewMode]
  );

  const onPartnersCellValueChanged = useCallback(
    async (params: any) => {
      // Guard: never allow status field to be changed via cell editing
      if (params.column?.colId === "status") return;
      const id = params.data.id;
      const field = params.colDef.field as string | undefined;
      if (!field) return;
      const snapshot = editSnapshotRef.current[id];
      try {
        const updatedPartner = { ...(params.data as UserInterface) };
        const isEntityField = PARTNER_ENTITY_FIELDS.has(field);

        if (isEntityField) {
          if (!updatedPartner.entity_internal_id) {
            throw new Error("Missing linked entity id for partner row");
          }
          await apiPut(`/api/partner-entities/${updatedPartner.entity_internal_id}`, mapPartnerEntityPayload(updatedPartner));
        } else {
          await apiPut(`/api/partner-commissions/${updatedPartner.id}`, mapPartnerCommissionPayload(updatedPartner));
        }

        if (snapshot) {
          const after = cloneRecord(updatedPartner);
          pushAction({
            label: `Úprava zakázky #${id}`,
            resource: "partners",
            undo: async () => {
              if (isEntityField) {
                if (!snapshot.entity_internal_id) return;
                await apiPut(`/api/partner-entities/${snapshot.entity_internal_id}`, mapPartnerEntityPayload(snapshot));
                return;
              }
              await apiPut(`/api/partner-commissions/${id}`, mapPartnerCommissionPayload(snapshot));
            },
            redo: async () => {
              if (isEntityField) {
                if (!after.entity_internal_id) return;
                await apiPut(`/api/partner-entities/${after.entity_internal_id}`, mapPartnerEntityPayload(after));
                return;
              }
              await apiPut(`/api/partner-commissions/${id}`, mapPartnerCommissionPayload(after));
            }
          });
          delete editSnapshotRef.current[id];
        }
      } catch (error) {
        console.error("Error updating partner:", error);
        alert("Error updating partner");
        fetchPartnersData();
      }
    },
    [fetchPartnersData, pushAction]
  );

  const handleAddPartner = useCallback(async () => {
    const newPartner = {
      name: "Nový Partner",
      company: "Nová Společnost",
      location: "Nová Lokalita",
      mobile: "000 000 000",
      status: status
    };

    try {
      let createdId: number | null = null;
      const created = await apiPost<PartnerCommissionApi>(`/api/partner-commissions`, {
        entity_data: mapPartnerEntityPayload(newPartner),
        commission_data: mapPartnerCommissionPayload(newPartner)
      });
      createdId = created?.id ?? null;
      fetchPartnersData();
      if (createdId !== null) {
        pushAction({
          label: "Přidání zakázky",
          resource: "partners",
          undo: async () => {
            await apiDelete(`/api/partner-commissions/${createdId}`);
          },
          redo: async () => {
            const recreated = await apiPost<PartnerCommissionApi>(`/api/partner-commissions`, {
              entity_data: mapPartnerEntityPayload(newPartner),
              commission_data: mapPartnerCommissionPayload(newPartner)
            });
            createdId = recreated?.id ?? null;
          }
        });
      }
    } catch (error) {
      console.error("Error adding partner:", error);
      alert("Chyba při přidávání partnera");
    }
  }, [fetchPartnersData, pushAction, status]);

  useEffect(() => {
    fetchPartnersData();
  }, [fetchPartnersData]);

  useEffect(() => {
    if (isActive) {
      onRegisterAddHandler(handleAddPartner);
      onLoadingChange(isLoading);
    }
    return () => {
      if (isActive) {
        onLoadingChange(false);
      }
    };
  }, [handleAddPartner, isActive, isLoading, onLoadingChange, onRegisterAddHandler]);

  useEffect(() => {
    if (!isActive || !focusRequestKey || focusRecordId === null || focusRecordId === undefined) {
      return;
    }

    const targetPartner = partnersData.find((partner) => partner.id === focusRecordId);
    if (!targetPartner || !gridRef.current?.api) {
      return;
    }

    openProfile(targetPartner);

    let targetNode: any = null;
    gridRef.current.api.forEachNode((node) => {
      if (node.data?.id === focusRecordId) {
        targetNode = node;
      }
    });

    if (targetNode?.rowIndex !== null && targetNode?.rowIndex !== undefined) {
      gridRef.current.api.ensureIndexVisible(targetNode.rowIndex, "middle");
      // flashCells can throw if the cell is not yet rendered (virtualization)
      const api = gridRef.current.api;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            api.flashCells({ rowNodes: [targetNode], columns: ["name"] });
          } catch (error) {
            console.warn("Search row highlight skipped:", error);
          }
        });
      });
    }
  }, [focusRecordId, focusRequestKey, isActive, openProfile, partnersData]);

  const partnersColDefs = useMemo<ColDef<UserInterface>[]>(
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
            rowData={partnersData}
            columnDefs={partnersColDefs}
            onCellEditingStarted={(e: any) => {
              if (e.data?.id != null) {
                editSnapshotRef.current[e.data.id] = cloneRecord(e.data);
              }
            }}
            onCellValueChanged={onPartnersCellValueChanged}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            suppressScrollOnNewData={true}
            suppressRowClickSelection={true}
            loading={isLoading}
            context={gridContext}
          />
        </div>
      </div>

      <ProfilePanel
        open={selectedPartner !== null}
        entityLabel="Partner"
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

export default PartnersSection;

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { UserInterface } from "../user.interface";
import DateCellRenderer from "../cells/DateCellRenderer";
import DatePickerEditor from "../cells/DatePickerEditor";
import StatusCellRenderer from "../cells/StatusCellRenderer";
import FieldCellRenderer from "../cells/FieldCellRenderer";
import ProfileCellRenderer from "../cells/ProfileCellRenderer";
import AssignedUsersCellRenderer from "../cells/AssignedUsersCellRenderer";
import ProfilePanel, { type ProfileSection } from "../components/ProfilePanel";
import useProfileDocuments from "../hooks/useProfileDocuments";
import useProfileNotes from "../hooks/useProfileNotes";
import { mapViewToStatus } from "../constants";
import { apiGet, apiPost, apiPut, apiDelete } from "../../utils/api";
import { formatProfileDate, normalizeText, toStatusBadge } from "../utils/profileUtils";
import type { SectionProps } from "./SectionTypes";
import { ApproveRestoreCellRenderer, DeleteArchiveCellRenderer } from "../cells/RowActionCellRenderers";
import { useUndoRedo } from "../../utils/undoRedo";
import { compareWorkflowStatuses, getNormalizedWorkflowStatus } from "../workflowStatus";
import useAssignableUsers from "../hooks/useAssignableUsers";
import ActivityCellRenderer from "../../activity/ActivityCellRenderer";
import { useActivity } from "../../activity/ActivityContext";
import { buildCommissionsRecordScope, getActivitySystem } from "../../activity/activityKeys";

const cloneRecord = (r: any) => JSON.parse(JSON.stringify(r));

type ClientCommissionApi = {
  id: number;
  commission_id: string;
  entity_id: number;
  entity_code?: string | null;
  status?: string | null;
  position?: string | null;
  budget?: string | null;
  state?: string | null;
  assigned_to?: string | null;
  assigned_user_ids?: number[] | null;
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
  entity_service?: string | null;
  entity_location?: string | null;
  entity_info?: string | null;
  entity_budget?: string | null;
  entity_first_name?: string | null;
  entity_last_name?: string | null;
  entity_email?: string | null;
  entity_phone?: string | null;
  entity_website?: string | null;
  created_at?: string;
  updated_at?: string;
};

const CLIENT_ENTITY_FIELDS = new Set(["name", "company", "location", "mobile", "field", "email", "website"]);

const joinName = (...parts: Array<string | null | undefined>) =>
  parts.filter((part): part is string => Boolean(part && part.trim())).join(" ").trim();

const emptyToNull = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const getDisplayId = (client: UserInterface | null | undefined) => {
  if (!client) {
    return null;
  }
  if (client.commission_id) {
    return client.commission_id;
  }
  if (client.id === undefined || client.id === null) {
    return null;
  }
  return String(client.id);
};

const normalizeClientCommissionRow = (commission: ClientCommissionApi): UserInterface => ({
  id: commission.id,
  commission_id: commission.commission_id,
  entity_internal_id: commission.entity_id,
  entity_code: commission.entity_code ?? undefined,
  created_at: commission.created_at,
  updated_at: commission.updated_at,
  name:
    joinName(commission.entity_first_name, commission.entity_last_name) ||
    commission.entity_company_name ||
    commission.entity_code ||
    commission.commission_id,
  company: commission.entity_company_name ?? "",
  location: commission.entity_location ?? commission.location ?? "",
  mobile: commission.entity_phone ?? commission.phone ?? "",
  commission: commission.commission_value ?? commission.budget ?? "",
  info: commission.position ?? commission.notes ?? commission.entity_info ?? commission.info ?? "",
  date: commission.deadline ?? commission.created_at,
  status: commission.status ?? undefined,
  stage: getNormalizedWorkflowStatus(commission.state ?? commission.status),
  field: commission.entity_field ?? commission.field ?? "",
  email: commission.entity_email ?? "",
  website: commission.entity_website ?? "",
  notes: commission.notes ?? undefined,
  assigned_to: commission.assigned_to ?? undefined,
  assigned_user_ids: commission.assigned_user_ids ?? undefined,
  priority: commission.priority ?? undefined,
  next_step: commission.service_position ?? undefined,
  activity_item_id: commission.id,
  activity_latest_at: commission.updated_at ?? commission.created_at,
  activity_created_at: commission.created_at
});

const mapClientEntityPayload = (client: Partial<UserInterface>) => ({
  first_name: emptyToNull(client.name),
  company_name: emptyToNull(client.company),
  field: emptyToNull(client.field),
  location: emptyToNull(client.location),
  phone: emptyToNull(client.mobile),
  email: emptyToNull(client.email),
  website: emptyToNull(client.website)
});

const mapClientCommissionPayload = (client: Partial<UserInterface>) => ({
  status: emptyToNull(client.status) ?? "pending",
  position: emptyToNull(client.info),
  service_position: emptyToNull(client.next_step),
  deadline: emptyToNull(client.date),
  state: emptyToNull(client.stage),
  assigned_to: emptyToNull(client.assigned_to),
  priority: emptyToNull(client.priority),
  commission_value: emptyToNull(client.commission),
  budget: emptyToNull(client.commission),
  notes: emptyToNull(client.notes),
  phone: emptyToNull(client.mobile),
  location: emptyToNull(client.location),
  field: emptyToNull(client.field)
});

const buildClientProfileSections = (client: UserInterface | null): ProfileSection[] => {
  if (!client) {
    return [];
  }

  const sections: ProfileSection[] = [];

  // Identifikace a stav
  const idFields = [] as any[];
  const displayId = getDisplayId(client);
  if (displayId) {
    idFields.push({ label: "ID", value: displayId });
  }
  const status = normalizeText(client.status);
  if (status) {
    idFields.push({ label: "Stav", value: status });
  }
  const name = normalizeText(client.name);
  if (name) {
    idFields.push({ label: "Jméno", value: name });
  }
  if (idFields.length > 0) {
    sections.push({ title: "Identifikace", fields: idFields });
  }

  const baseFields = [];
  const company = normalizeText(client.company);
  if (company) {
    baseFields.push({ label: "Společnost", value: company });
  }
  const location = normalizeText(client.location);
  if (location) {
    baseFields.push({ label: "Lokalita", value: location });
  }
  const field = normalizeText(client.field);
  if (field) {
    baseFields.push({ label: "Obor", value: field });
  }
  const address = normalizeText(client.address);
  if (address) {
    baseFields.push({ label: "Adresa", value: address });
  }

  if (baseFields.length > 0) {
    sections.push({ title: "Základní informace", fields: baseFields });
  }

  const contactFields = [];
  const email = normalizeText(client.email);
  if (email) {
    contactFields.push({ label: "E-mail", value: email });
  }
  const mobile = normalizeText(client.mobile);
  if (mobile) {
    contactFields.push({ label: "Kontakt", value: mobile });
  }
  const website = normalizeText(client.website);
  if (website) {
    contactFields.push({ label: "Web", value: website });
  }

  if (contactFields.length > 0) {
    sections.push({ title: "Kontakt", fields: contactFields });
  }

  const detailFields = [];
  const commission = normalizeText(client.commission);
  if (commission) {
    detailFields.push({ label: "Odměna / Provize", value: commission });
  }

  const date = formatProfileDate(client.date);
  if (date) {
    detailFields.push({ label: "Datum zahájení", value: date });
  }

  // Explicitně zobraz i status v detailech (kromě badge)
  if (status) {
    detailFields.push({ label: "Stav", value: status });
  }

  const lastContact = formatProfileDate(client.last_contact);
  if (lastContact) {
    detailFields.push({ label: "Poslední kontakt", value: lastContact });
  }

  const assignedTo = normalizeText(client.assigned_to);
  if (assignedTo) {
    detailFields.push({ label: "Odpovědná osoba", value: assignedTo });
  }

  const nextStep = normalizeText(client.next_step);
  if (nextStep) {
    detailFields.push({ label: "Další krok", value: nextStep, isMultiline: true });
  }

  const priority = normalizeText(client.priority);
  if (priority) {
    detailFields.push({ label: "Priorita", value: priority });
  }

  if (Array.isArray(client.tags) && client.tags.length > 0) {
    detailFields.push({ label: "Štítky", value: client.tags.join(", ") });
  }

  detailFields.push({
    label: "Popis / Požadavky",
    value: normalizeText(client.info) ?? "—",
    always: true,
    isMultiline: true
  });

  const notes = normalizeText(client.notes);
  if (notes) {
    detailFields.push({ label: "Poznámky", value: notes, isMultiline: true });
  }

  if (detailFields.length > 0) {
    sections.push({ title: "Detail zakázky", fields: detailFields });
  }

  return sections;
};

const buildClientMeta = (client: UserInterface | null): Array<{ label: string; value: string }> | undefined => {
  const displayId = getDisplayId(client);
  if (!client || !displayId) {
    return undefined;
  }

  const meta: Array<{ label: string; value: string }> = [{ label: "ID", value: displayId }];
  const priority = normalizeText(client.priority);
  if (priority) {
    meta.push({ label: "Priorita", value: priority });
  }
  const assignedTo = normalizeText(client.assigned_to);
  if (assignedTo) {
    meta.push({ label: "Odpovědná osoba", value: assignedTo });
  }
  return meta;
};

const ClientsSection: React.FC<SectionProps> = ({
  viewMode,
  isActive,
  systemNamespace,
  onRegisterAddHandler,
  onLoadingChange,
  focusRecordId,
  focusRequestKey
}) => {
  const { users: assignableUsers } = useAssignableUsers();
  const { markItemSeen } = useActivity();
  const [clientsData, setClientsData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const gridRef = useRef<AgGridReact<UserInterface>>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const resourceKey = systemNamespace ? "project-clients" : "clients";
  const entityApiBase = systemNamespace ? `/api/${systemNamespace}/client-entities` : "/api/client-entities";
  const commissionApiBase = systemNamespace ? `/api/${systemNamespace}/client-commissions` : "/api/client-commissions";
  const documentManager = useProfileDocuments(resourceKey, selectedProfileId);
  const notesManager = useProfileNotes(resourceKey, selectedProfileId);
  const { pushAction, signal } = useUndoRedo();
  const editSnapshotRef = useRef<Record<number, any>>({});

  // Refetch when other views mutate the same resource
  useEffect(() => {
    if (signal?.resource === resourceKey) {
      fetchClientsData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceKey, signal]);

  const defaultColDef = useMemo(
    () => ({
      resizable: true,
      sortable: true
    }),
    []
  );

  const getRowId = useCallback((params: any) => String(params.data.id), []);

  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);
  const activityScope = useMemo(
    () => buildCommissionsRecordScope(getActivitySystem(systemNamespace), "clients"),
    [systemNamespace]
  );

  const fetchClientsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<ClientCommissionApi[]>(`${commissionApiBase}?status=${status}`);
      setClientsData(
        Array.isArray(data)
          ? data.map((row) => ({
              ...normalizeClientCommissionRow(row),
              activity_scope: activityScope
            }))
          : []
      );
    } catch (error) {
      console.error("Error fetching clients:", error);
      setClientsData([]);
    } finally {
      setIsLoading(false);
    }
  }, [activityScope, commissionApiBase, status]);

  const selectedProfile = useMemo(() => {
    if (selectedProfileId === null) {
      return null;
    }
    return clientsData.find((client) => client.id === selectedProfileId) ?? null;
  }, [clientsData, selectedProfileId]);

  const handleOpenProfile = useCallback((client: UserInterface) => {
    if (client?.id === undefined || client.id === null) {
      return;
    }
    setSelectedProfileId(client.id);
  }, []);

  const handleCloseProfile = useCallback(() => {
    setSelectedProfileId(null);
  }, []);

  useEffect(() => {
    if (selectedProfileId === null) {
      return;
    }
    const stillExists = clientsData.some((client) => client.id === selectedProfileId);
    if (!stillExists) {
      setSelectedProfileId(null);
    }
  }, [clientsData, selectedProfileId]);

  useEffect(() => {
    if (!selectedProfile) {
      return;
    }

    markItemSeen(activityScope, selectedProfile.id, selectedProfile.updated_at ?? selectedProfile.created_at ?? null);
  }, [activityScope, markItemSeen, selectedProfile]);

  const profileSections = useMemo(
    () => buildClientProfileSections(selectedProfile),
    [selectedProfile]
  );
  const profileMeta = useMemo(() => buildClientMeta(selectedProfile), [selectedProfile]);
  const profileBadge = useMemo(() => toStatusBadge(selectedProfile?.status), [selectedProfile]);
  const profileTitle = normalizeText(selectedProfile?.name) ?? "Profil klienta";
  const profileSubtitle = normalizeText(selectedProfile?.company) ?? null;

  const handleApproveClient = useCallback(
    async (id: number) => {
      const prev = cloneRecord(clientsData.find((c) => c.id === id));
      if (!prev) return;
      try {
        await apiPost(`${commissionApiBase}/${id}/approve`);
        fetchClientsData();
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
        console.error("Error approving client:", error);
        alert("Chyba při schvalování klienta");
      }
    },
    [clientsData, commissionApiBase, fetchClientsData, pushAction, resourceKey]
  );

  const handleRestoreClient = useCallback(
    async (id: number) => {
      const prev = cloneRecord(clientsData.find((c) => c.id === id));
      if (!prev) return;
      try {
        await apiPost(`${commissionApiBase}/${id}/restore`);
        fetchClientsData();
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
        console.error("Error restoring client:", error);
        alert("Chyba při obnovování klienta");
      }
    },
    [clientsData, commissionApiBase, fetchClientsData, pushAction, resourceKey]
  );

  const handleDeleteClient = useCallback(
    async (id: number) => {
      const client = clientsData.find((c) => c.id === id);
      const isArchived = client?.status === "archived";
      const isPending = client?.status === "pending";

      let confirmMessage = "";

      if (isArchived) {
        confirmMessage =
          `Opravdu chcete TRVALE SMAZAT tohoto klienta z databáze?\n\nJméno: ${client?.name || "N/A"}\nSpolečnost: ${client?.company || "N/A"}\n\nTato akce je NEzvratná!`;
      } else if (isPending) {
        confirmMessage =
          `Opravdu chcete zamítnout tohoto klienta?\n\nJméno: ${client?.name || "N/A"}\nSpolečnost: ${client?.company || "N/A"}`;
      } else {
        confirmMessage =
          `Opravdu chcete přesunout tohoto klienta do archivu k odstraňení?\n\nJméno: ${client?.name || "N/A"}\nSpolečnost: ${client?.company || "N/A"}`;
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
              if (!client?.entity_internal_id) return;
              const restored = await apiPost<{ id: number }>(commissionApiBase, {
                entity_id: client.entity_internal_id,
                ...mapClientCommissionPayload(client)
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
        fetchClientsData();
      } catch (error) {
        console.error("Error performing action on client:", error);
        alert("Chyba při provádění akce");
      }
    },
    [clientsData, commissionApiBase, fetchClientsData, pushAction, resourceKey]
  );

  const gridContext = useMemo(
    () => ({
      openProfile: handleOpenProfile,
      rowActions: {
        viewMode,
        entityAccusative: "zakázku",
        onApprove: handleApproveClient,
        onRestore: handleRestoreClient,
        onDelete: handleDeleteClient
      }
    }),
    [handleApproveClient, handleDeleteClient, handleOpenProfile, handleRestoreClient, viewMode]
  );

  const onClientsCellValueChanged = useCallback(
    async (params: any) => {
      // Guard: never allow status field to be changed via cell editing
      if (params.column?.colId === "status") return;
      const id = params.data.id;
      const field = params.colDef.field as string | undefined;
      if (!field) return;
      const snapshot = editSnapshotRef.current[id];
      try {
        const updatedClient = { ...(params.data as UserInterface) };
        const isEntityField = CLIENT_ENTITY_FIELDS.has(field);

        if (isEntityField) {
          if (!updatedClient.entity_internal_id) {
            throw new Error("Missing linked entity id for client row");
          }
          await apiPut(`${entityApiBase}/${updatedClient.entity_internal_id}`, mapClientEntityPayload(updatedClient));
        } else {
          await apiPut(`${commissionApiBase}/${updatedClient.id}`, mapClientCommissionPayload(updatedClient));
        }

        if (snapshot) {
          const after = cloneRecord(updatedClient);
          pushAction({
            label: `Úprava zakázky #${id}`,
            resource: resourceKey,
            undo: async () => {
              if (isEntityField) {
                if (!snapshot.entity_internal_id) return;
                await apiPut(`${entityApiBase}/${snapshot.entity_internal_id}`, mapClientEntityPayload(snapshot));
                return;
              }
              await apiPut(`${commissionApiBase}/${id}`, mapClientCommissionPayload(snapshot));
            },
            redo: async () => {
              if (isEntityField) {
                if (!after.entity_internal_id) return;
                await apiPut(`${entityApiBase}/${after.entity_internal_id}`, mapClientEntityPayload(after));
                return;
              }
              await apiPut(`${commissionApiBase}/${id}`, mapClientCommissionPayload(after));
            }
          });
          delete editSnapshotRef.current[id];
        }
      } catch (error) {
        console.error("Error updating client:", error);
        alert("Error updating client");
        fetchClientsData();
      }
    },
    [commissionApiBase, entityApiBase, fetchClientsData, pushAction, resourceKey]
  );

  const handleAddClient = useCallback(async () => {
    const newClient = {
      name: "Nový Klient",
      company: "Nová Společnost",
      location: "Nová Lokalita",
      mobile: "000 000 000",
      status: status
    };

    try {
      let createdId: number | null = null;
      const created = await apiPost<ClientCommissionApi>(commissionApiBase, {
        entity_data: mapClientEntityPayload(newClient),
        commission_data: mapClientCommissionPayload(newClient)
      });
      createdId = created?.id ?? null;
      fetchClientsData();
      if (createdId !== null) {
        pushAction({
          label: "Přidání zakázky",
          resource: resourceKey,
          undo: async () => {
            await apiDelete(`${commissionApiBase}/${createdId}`);
          },
          redo: async () => {
            const recreated = await apiPost<ClientCommissionApi>(commissionApiBase, {
              entity_data: mapClientEntityPayload(newClient),
              commission_data: mapClientCommissionPayload(newClient)
            });
            createdId = recreated?.id ?? null;
          }
        });
      }
    } catch (error) {
      console.error("Error adding client:", error);
      alert("Chyba při přidávání klienta");
    }
  }, [commissionApiBase, fetchClientsData, pushAction, resourceKey, status]);

  useEffect(() => {
    fetchClientsData();
  }, [fetchClientsData]);

  useEffect(() => {
    if (isActive) {
      onRegisterAddHandler(handleAddClient);
      onLoadingChange(isLoading);
    }
    return () => {
      if (isActive) {
        onLoadingChange(false);
      }
    };
  }, [handleAddClient, isActive, isLoading, onLoadingChange, onRegisterAddHandler]);

  useEffect(() => {
    if (!isActive || !focusRequestKey || focusRecordId === null || focusRecordId === undefined) {
      return;
    }

    const targetClient = clientsData.find((client) => client.id === focusRecordId);
    if (!targetClient || !gridRef.current?.api) {
      return;
    }

    handleOpenProfile(targetClient);

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
  }, [clientsData, focusRecordId, focusRequestKey, handleOpenProfile, isActive]);

  const clientsColDefs = useMemo<ColDef<UserInterface>[]>(
    () => {
      const cols: ColDef<UserInterface>[] = [];
      const assignedUsersColumn: ColDef<UserInterface> = {
        field: "assigned_user_ids",
        headerName: "Přiřazení",
        editable: false,
        sortable: false,
        filter: true,
        minWidth: 120,
        maxWidth: 140,
        cellRenderer: AssignedUsersCellRenderer,
        cellRendererParams: {
          users: assignableUsers,
          maxVisible: 3
        },
        filterValueGetter: (params) => params.data?.assigned_to ?? "",
        tooltipValueGetter: (params) => params.data?.assigned_to ?? ""
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
        field: "name",
        headerName: "Jméno",
        filter: true,
        editable: true,
        flex: 1.25,
        minWidth: 100
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
        headerName: "Kontakt",
        editable: true,
        filter: true,
        flex: 1.5,
        minWidth: 120
      },
      assignedUsersColumn,
      {
        field: "field",
        headerName: "Obor",
        editable: false,
        filter: true,
        flex: 1,
        minWidth: 120,
        cellRenderer: FieldCellRenderer
      },
      {
        field: "info",
        headerName: "Popis/Požadavky",
        editable: true,
        filter: true,
        flex: 2,
        minWidth: 120
      },
      {
        field: "date",
        headerName: "Datum",
        editable: true,
        filter: true,
        flex: 1.5,
        minWidth: 120,
        cellRenderer: DateCellRenderer,
        cellEditor: DatePickerEditor
      },
      {
        field: "stage",
        headerName: "Stav",
        editable: false,
        filter: true,
        flex: 1,
        minWidth: 120,
        comparator: (left, right) => compareWorkflowStatuses(left, right),
        cellRenderer: StatusCellRenderer
      }
      );

      return cols;
    },
    [assignableUsers, viewMode]
  );

  const useContentHeightLayout = clientsData.length <= 8;

  return (
    <>
      <div className={`grid-container${useContentHeightLayout ? ' grid-container--content-height' : ''}`}>
        <div className={`grid-wrapper ag-theme-quartz${useContentHeightLayout ? ' grid-wrapper--content-height' : ''}`}>
          <AgGridReact<UserInterface>
            ref={gridRef}
            rowData={clientsData}
            columnDefs={clientsColDefs}
            domLayout={useContentHeightLayout ? 'autoHeight' : 'normal'}
            onCellEditingStarted={(e: any) => {
              if (e.data?.id != null) {
                editSnapshotRef.current[e.data.id] = cloneRecord(e.data);
              }
            }}
            onCellValueChanged={onClientsCellValueChanged}
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
        open={selectedProfile !== null}
        entityLabel="Klient"
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
        onClose={handleCloseProfile}
      />
    </>
  );
};

export default ClientsSection;

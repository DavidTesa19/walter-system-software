import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { UserInterface } from "../user.interface";
import DateCellRenderer from "../cells/DateCellRenderer";
import DatePickerEditor from "../cells/DatePickerEditor";
import StatusCellRenderer from "../cells/StatusCellRenderer";
import FieldCellRenderer from "../cells/FieldCellRenderer";
import ProfileCellRenderer from "../cells/ProfileCellRenderer";
import ProfilePanel, { type ProfileSection } from "../components/ProfilePanel";
import useProfileDocuments from "../hooks/useProfileDocuments";
import useProfileNotes from "../hooks/useProfileNotes";
import { mapViewToStatus } from "../constants";
import { apiGet, apiPost, apiPut, apiDelete } from "../../utils/api";
import { formatProfileDate, normalizeText, toStatusBadge } from "../utils/profileUtils";
import type { SectionProps } from "./SectionTypes";
import { ApproveRestoreCellRenderer, DeleteArchiveCellRenderer } from "../cells/RowActionCellRenderers";

const buildClientProfileSections = (client: UserInterface | null): ProfileSection[] => {
  if (!client) {
    return [];
  }

  const sections: ProfileSection[] = [];

  // Identifikace a stav
  const idFields = [] as any[];
  if (client.id !== undefined && client.id !== null) {
    idFields.push({ label: "ID", value: String(client.id) });
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
  if (!client || client.id === undefined || client.id === null) {
    return undefined;
  }

  const meta: Array<{ label: string; value: string }> = [{ label: "ID", value: String(client.id) }];
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
  onRegisterAddHandler,
  onLoadingChange
}) => {
  const [clientsData, setClientsData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const gridRef = useRef<AgGridReact<UserInterface>>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const documentManager = useProfileDocuments("clients", selectedProfileId);
  const notesManager = useProfileNotes("clients", selectedProfileId);

  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  const fetchClientsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<UserInterface[]>(`/clients?status=${status}`);
      setClientsData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching clients:", error);
      setClientsData([]);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

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
      try {
        await apiPost(`/clients/${id}/approve`);
        fetchClientsData();
      } catch (error) {
        console.error("Error approving client:", error);
        alert("Chyba při schvalování klienta");
      }
    },
    [fetchClientsData]
  );

  const handleRestoreClient = useCallback(
    async (id: number) => {
      try {
        await apiPost(`/clients/${id}/restore`);
        fetchClientsData();
      } catch (error) {
        console.error("Error restoring client:", error);
        alert("Chyba při obnovování klienta");
      }
    },
    [fetchClientsData]
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
          await apiDelete(`/clients/${id}`);
        } else {
          await apiPost(`/clients/${id}/archive`);
        }
        fetchClientsData();
      } catch (error) {
        console.error("Error performing action on client:", error);
        alert("Chyba při provádění akce");
      }
    },
    [clientsData, fetchClientsData]
  );

  const gridContext = useMemo(
    () => ({
      openProfile: handleOpenProfile,
      rowActions: {
        viewMode,
        entityAccusative: "klienta",
        onApprove: handleApproveClient,
        onRestore: handleRestoreClient,
        onDelete: handleDeleteClient
      }
    }),
    [handleApproveClient, handleDeleteClient, handleOpenProfile, handleRestoreClient, viewMode]
  );

  const onClientsCellValueChanged = useCallback(
    async (params: any) => {
      try {
        const { created_at, updated_at, ...updatedClient } = params.data;
        await apiPut(`/clients/${updatedClient.id}`, updatedClient);
      } catch (error) {
        console.error("Error updating client:", error);
        alert("Error updating client");
        fetchClientsData();
      }
    },
    [fetchClientsData]
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
      await apiPost(`/clients`, newClient);
      fetchClientsData();
    } catch (error) {
      console.error("Error adding client:", error);
      alert("Chyba při přidávání klienta");
    }
  }, [fetchClientsData, status]);

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

  const clientsColDefs = useMemo<ColDef<UserInterface>[]>(
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
        field: "id",
        headerName: "ID",
        flex: 0.5,
        minWidth: 70,
        editable: false
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
        field: "status",
        headerName: "Stav",
        editable: false,
        filter: true,
        flex: 1,
        minWidth: 120,
        cellRenderer: StatusCellRenderer
      }
      );

      return cols;
    },
    [viewMode]
  );

  return (
    <>
      <div className="grid-container">
        <div className="grid-wrapper ag-theme-quartz" style={{ height: 500 }}>
          <AgGridReact<UserInterface>
            ref={gridRef}
            rowData={clientsData}
            columnDefs={clientsColDefs}
            onCellValueChanged={onClientsCellValueChanged}
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
        onDeleteNote={notesManager.deleteNote}
        onClose={handleCloseProfile}
      />
    </>
  );
};

export default ClientsSection;

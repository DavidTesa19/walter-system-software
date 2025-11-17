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
import { measureGrid, type GridSizes } from "../utils/gridSizing";
import { API_BASE, mapViewToStatus } from "../constants";
import { formatProfileDate, normalizeText, toStatusBadge } from "../utils/profileUtils";
import type { SectionProps } from "./SectionTypes";

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<GridSizes>({ row: 42, headerOffset: 80 });
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);

  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  const fetchClientsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/clients?status=${status}`);
      const data = await response.json();
      setClientsData(data);
    } catch (error) {
      console.error("Error fetching clients:", error);
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

  const gridContext = useMemo(() => ({ openProfile: handleOpenProfile }), [handleOpenProfile]);

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
        const response = await fetch(`${API_BASE}/clients/${id}/approve`, { method: "POST" });
        if (response.ok) {
          fetchClientsData();
        } else {
          alert("Nepodařilo se schválit klienta");
        }
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
        const response = await fetch(`${API_BASE}/clients/${id}/restore`, { method: "POST" });
        if (response.ok) {
          fetchClientsData();
        } else {
          alert("Nepodařilo se obnovit klienta");
        }
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
      let endpoint = "";
      let method: "POST" | "DELETE" = "DELETE";

      if (isArchived) {
        confirmMessage =
          `Opravdu chcete TRVALE SMAZAT tohoto klienta z databáze?\n\nJméno: ${client?.name || "N/A"}\nSpolečnost: ${client?.company || "N/A"}\n\nTato akce je NEzvratná!`;
        endpoint = `${API_BASE}/clients/${id}`;
      } else if (isPending) {
        confirmMessage =
          `Opravdu chcete zamítnout tohoto klienta?\n\nJméno: ${client?.name || "N/A"}\nSpolečnost: ${client?.company || "N/A"}`;
        endpoint = `${API_BASE}/clients/${id}`;
      } else {
        confirmMessage =
          `Opravdu chcete přesunout tohoto klienta do archivu k odstraňení?\n\nJméno: ${client?.name || "N/A"}\nSpolečnost: ${client?.company || "N/A"}`;
        endpoint = `${API_BASE}/clients/${id}/archive`;
        method = "POST";
      }

      if (!confirm(confirmMessage)) {
        return;
      }

      try {
        const response = await fetch(endpoint, { method });
        if (response.ok) {
          fetchClientsData();
        } else {
          alert("Nepodařilo se provést akci");
        }
      } catch (error) {
        console.error("Error performing action on client:", error);
        alert("Chyba při provádění akce");
      }
    },
    [clientsData, fetchClientsData]
  );

  const onClientsCellValueChanged = useCallback(
    async (params: any) => {
      try {
        const { created_at, updated_at, ...updatedClient } = params.data;

        const response = await fetch(`${API_BASE}/clients/${updatedClient.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(updatedClient)
        });

        if (!response.ok) {
          alert("Failed to update client");
          fetchClientsData();
        }
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
      mobile: "000 000 000"
    };

    try {
      const response = await fetch(`${API_BASE}/clients`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newClient)
      });

      if (response.ok) {
        fetchClientsData();
      } else {
        alert("Nepodařilo se přidat klienta");
      }
    } catch (error) {
      console.error("Error adding client:", error);
      alert("Chyba při přidávání klienta");
    }
  }, [fetchClientsData]);

  useEffect(() => {
    fetchClientsData();
  }, [fetchClientsData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSizes(measureGrid(wrapperRef.current));
    }, 50);
    return () => clearTimeout(timer);
  }, [clientsData]);

  useEffect(() => {
    const onResize = () => setSizes(measureGrid(wrapperRef.current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    () => [
      {
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
      },
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
    ],
    []
  );

  return (
    <>
      <div className="grid-container">
        {viewMode === "pending" && (
          <div
            className="approve-buttons-column"
            style={{
              ["--row-height" as any]: `${sizes.row}px`,
              ["--header-offset" as any]: `${sizes.headerOffset}px`
            }}
          >
            {clientsData.map((client) => (
              <button
                key={client.id}
                onClick={() => handleApproveClient(client.id as number)}
                className="external-approve-btn"
                title="Schválit klienta"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        )}
        {viewMode === "archived" && (
          <div
            className="approve-buttons-column"
            style={{
              ["--row-height" as any]: `${sizes.row}px`,
              ["--header-offset" as any]: `${sizes.headerOffset}px`
            }}
          >
            {clientsData.map((client) => (
              <button
                key={client.id}
                onClick={() => handleRestoreClient(client.id as number)}
                className="external-approve-btn"
                title="Obnovit klienta"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 3v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 21v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        )}
        <div
          className="delete-buttons-column"
          style={{
            ["--row-height" as any]: `${sizes.row}px`,
            ["--header-offset" as any]: `${sizes.headerOffset}px`
          }}
        >
          {clientsData.map((client) => (
            <button
              key={client.id}
              onClick={() => handleDeleteClient(client.id as number)}
              className="external-delete-btn"
              title={
                viewMode === "pending"
                  ? "Zamítnout klienta"
                  : viewMode === "archived"
                  ? "Trvale smazat klienta"
                  : "Archivovat klienta"
              }
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
        <div ref={wrapperRef} className="grid-wrapper ag-theme-quartz" style={{ height: 500 }}>
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
        onClose={handleCloseProfile}
      />
    </>
  );
};

export default ClientsSection;

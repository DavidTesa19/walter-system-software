import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { UserInterface } from "../user.interface";
import FieldCellRenderer from "../cells/FieldCellRenderer";
import ProfileCellRenderer from "../cells/ProfileCellRenderer";
import ProfilePanel from "../components/ProfilePanel";
import { measureGrid, type GridSizes } from "../utils/gridSizing";
import { mapViewToStatus } from "../constants";
import { apiGet, apiPost, apiPut, apiDelete } from "../../utils/api";
import { formatProfileDate, normalizeText, toStatusBadge } from "../utils/profileUtils";
import type { ProfileSection } from "../types/profile";
import type { SectionProps } from "./SectionTypes";
import useProfileDocuments from "../hooks/useProfileDocuments";

const buildPartnerSections = (partner: UserInterface | null): ProfileSection[] => {
  if (!partner) {
    return [];
  }

  const sections: ProfileSection[] = [];

  // Identifikace a stav
  const idFields = [] as any[];
  if (partner.id !== undefined && partner.id !== null) {
    idFields.push({ label: "ID", value: String(partner.id) });
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
  if (!partner || partner.id === undefined || partner.id === null) {
    return undefined;
  }

  const meta: Array<{ label: string; value: string }> = [{ label: "ID", value: String(partner.id) }];
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
  onLoadingChange
}) => {
  const [partnersData, setPartnersData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const gridRef = useRef<AgGridReact<UserInterface>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<GridSizes>({ row: 42, headerOffset: 80 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const documentManager = useProfileDocuments("partners", selectedId);

  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  const fetchPartnersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<UserInterface[]>(`/partners?status=${status}`);
      setPartnersData(Array.isArray(data) ? data : []);
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

  const gridContext = useMemo(() => ({ openProfile }), [openProfile]);

  const profileSections = useMemo(() => buildPartnerSections(selectedPartner), [selectedPartner]);
  const profileBadge = useMemo(() => toStatusBadge(selectedPartner?.status), [selectedPartner]);
  const profileMeta = useMemo(() => buildPartnerMeta(selectedPartner), [selectedPartner]);
  const profileTitle = normalizeText(selectedPartner?.name) ?? "Profil partnera";
  const profileSubtitle = normalizeText(selectedPartner?.company) ?? null;

  const handleApprovePartner = useCallback(
    async (id: number) => {
      try {
        await apiPost(`/partners/${id}/approve`);
        fetchPartnersData();
      } catch (error) {
        console.error("Error approving partner:", error);
        alert("Chyba při schvalování partnera");
      }
    },
    [fetchPartnersData]
  );

  const handleRestorePartner = useCallback(
    async (id: number) => {
      try {
        await apiPost(`/partners/${id}/restore`);
        fetchPartnersData();
      } catch (error) {
        console.error("Error restoring partner:", error);
        alert("Chyba při obnovování partnera");
      }
    },
    [fetchPartnersData]
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
          await apiDelete(`/partners/${id}`);
        } else {
          await apiPost(`/partners/${id}/archive`);
        }
        fetchPartnersData();
      } catch (error) {
        console.error("Error performing action on partner:", error);
        alert("Chyba při provádění akce");
      }
    },
    [fetchPartnersData, partnersData]
  );

  const onPartnersCellValueChanged = useCallback(
    async (params: any) => {
      try {
        const { created_at, updated_at, ...updatedPartner } = params.data;
        await apiPut(`/partners/${updatedPartner.id}`, updatedPartner);
      } catch (error) {
        console.error("Error updating partner:", error);
        alert("Error updating partner");
        fetchPartnersData();
      }
    },
    [fetchPartnersData]
  );

  const handleAddPartner = useCallback(async () => {
    const newPartner = {
      name: "Nový Partner",
      company: "Nová Společnost",
      location: "Nová Lokalita",
      mobile: "000 000 000"
    };

    try {
      await apiPost(`/partners`, newPartner);
      fetchPartnersData();
    } catch (error) {
      console.error("Error adding partner:", error);
      alert("Chyba při přidávání partnera");
    }
  }, [fetchPartnersData]);

  useEffect(() => {
    fetchPartnersData();
  }, [fetchPartnersData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSizes(measureGrid(wrapperRef.current));
    }, 50);
    return () => clearTimeout(timer);
  }, [partnersData]);

  useEffect(() => {
    const onResize = () => setSizes(measureGrid(wrapperRef.current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const partnersColDefs = useMemo<ColDef<UserInterface>[]>(
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
            {partnersData.map((partner) => (
              <button
                key={partner.id}
                onClick={() => handleApprovePartner(partner.id as number)}
                className="external-approve-btn"
                title="Schválit partnera"
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
            {partnersData.map((partner) => (
              <button
                key={partner.id}
                onClick={() => handleRestorePartner(partner.id as number)}
                className="external-approve-btn"
                title="Obnovit partnera"
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
          {partnersData.map((partner) => (
            <button
              key={partner.id}
              onClick={() => handleDeletePartner(partner.id as number)}
              className="external-delete-btn"
              title={
                viewMode === "pending"
                  ? "Zamítnout partnera"
                  : viewMode === "archived"
                  ? "Trvale smazat partnera"
                  : "Archivovat partnera"
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
            rowData={partnersData}
            columnDefs={partnersColDefs}
            onCellValueChanged={onPartnersCellValueChanged}
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
        onClose={closeProfile}
      />
    </>
  );
};

export default PartnersSection;

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
import useProfileNotes from "../hooks/useProfileNotes";

const buildTiperSections = (tiper: UserInterface | null): ProfileSection[] => {
  if (!tiper) {
    return [];
  }

  const sections: ProfileSection[] = [];

  // Identifikace a stav
  const idFields = [] as any[];
  if (tiper.id !== undefined && tiper.id !== null) {
    idFields.push({ label: "ID", value: String(tiper.id) });
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
  if (!tiper || tiper.id === undefined || tiper.id === null) {
    return undefined;
  }

  const meta: Array<{ label: string; value: string }> = [{ label: "ID", value: String(tiper.id) }];
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
  onRegisterAddHandler,
  onLoadingChange
}) => {
  const [tipersData, setTipersData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const gridRef = useRef<AgGridReact<UserInterface>>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = useState<GridSizes>({ row: 42, headerOffset: 80 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const documentManager = useProfileDocuments("tipers", selectedId);
  const notesManager = useProfileNotes("tipers", selectedId);

  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  const fetchTipersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<UserInterface[]>(`/tipers?status=${status}`);
      setTipersData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching tipers:", error);
      setTipersData([]);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

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

  const gridContext = useMemo(() => ({ openProfile }), [openProfile]);

  const profileSections = useMemo(() => buildTiperSections(selectedTiper), [selectedTiper]);
  const profileBadge = useMemo(() => toStatusBadge(selectedTiper?.status), [selectedTiper]);
  const profileMeta = useMemo(() => buildTiperMeta(selectedTiper), [selectedTiper]);
  const profileTitle = normalizeText(selectedTiper?.name) ?? "Profil tipaře";
  const profileSubtitle = normalizeText(selectedTiper?.company) ?? null;

  const handleApproveTiper = useCallback(
    async (id: number) => {
      try {
        await apiPost(`/tipers/${id}/approve`);
        fetchTipersData();
      } catch (error) {
        console.error("Error approving tiper:", error);
        alert("Chyba při schvalování tipaře");
      }
    },
    [fetchTipersData]
  );

  const handleRestoreTiper = useCallback(
    async (id: number) => {
      try {
        await apiPost(`/tipers/${id}/restore`);
        fetchTipersData();
      } catch (error) {
        console.error("Error restoring tiper:", error);
        alert("Chyba při obnovování tipaře");
      }
    },
    [fetchTipersData]
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
          await apiDelete(`/tipers/${id}`);
        } else {
          await apiPost(`/tipers/${id}/archive`);
        }
        fetchTipersData();
      } catch (error) {
        console.error("Error performing action on tiper:", error);
        alert("Chyba při mazání tipaře");
      }
    },
    [fetchTipersData, tipersData]
  );

  const onTipersCellValueChanged = useCallback(
    async (params: any) => {
      try {
        const { created_at, updated_at, ...updatedTiper } = params.data;
        await apiPut(`/tipers/${updatedTiper.id}`, updatedTiper);
      } catch (error) {
        console.error("Error updating tiper:", error);
        alert("Chyba při aktualizaci tipaře");
        fetchTipersData();
      }
    },
    [fetchTipersData]
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
      await apiPost(`/tipers`, newTiper);
      fetchTipersData();
    } catch (error) {
      console.error("Error adding tiper:", error);
      alert("Chyba při přidávání tipaře");
    }
  }, [fetchTipersData, status]);

  useEffect(() => {
    fetchTipersData();
  }, [fetchTipersData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSizes(measureGrid(wrapperRef.current));
    }, 50);
    return () => clearTimeout(timer);
  }, [tipersData]);

  useEffect(() => {
    const onResize = () => setSizes(measureGrid(wrapperRef.current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const tipersColDefs = useMemo<ColDef<UserInterface>[]>(
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
        field: "commission",
        headerName: "Odměna/Provize",
        editable: true,
        filter: true,
        flex: 1,
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
            {tipersData.map((tiper) => (
              <button
                key={tiper.id}
                onClick={() => handleApproveTiper(tiper.id as number)}
                className="external-approve-btn"
                title="Schválit tipaře"
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
            {tipersData.map((tiper) => (
              <button
                key={tiper.id}
                onClick={() => handleRestoreTiper(tiper.id as number)}
                className="external-approve-btn"
                title="Obnovit tipaře"
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
          {tipersData.map((tiper) => (
            <button
              key={tiper.id}
              onClick={() => handleDeleteTiper(tiper.id as number)}
              className="external-delete-btn"
              title={
                viewMode === "pending"
                  ? "Zamítnout tipaře"
                  : viewMode === "archived"
                  ? "Trvale smazat tipaře"
                  : "Archivovat tipaře"
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
            rowData={tipersData}
            columnDefs={tipersColDefs}
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
        notes={notesManager.notes}
        notesLoading={notesManager.isLoading}
        notesCreating={notesManager.isCreating}
        onAddNote={notesManager.createNote}
        onDeleteNote={notesManager.deleteNote}
        onClose={closeProfile}
      />
    </>
  );
};

export default TipersSection;

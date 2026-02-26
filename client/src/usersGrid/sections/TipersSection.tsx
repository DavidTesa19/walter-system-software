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
const stripMeta = ({ created_at, updated_at, ...rest }: any) => rest;

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
  onLoadingChange,
  focusRecordId,
  focusRequestKey
}) => {
  const [tipersData, setTipersData] = useState<UserInterface[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const gridRef = useRef<AgGridReact<UserInterface>>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const documentManager = useProfileDocuments("tipers", selectedId);
  const notesManager = useProfileNotes("tipers", selectedId);
  const { pushAction, signal } = useUndoRedo();
  const editSnapshotRef = useRef<Record<number, any>>({});

  // Refetch when other views mutate the same resource
  useEffect(() => {
    if (signal?.resource === "tipers") {
      fetchTipersData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

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
        await apiPost(`/tipers/${id}/approve`);
        fetchTipersData();
        pushAction({
          label: `Schválení tipaře #${id}`,
          resource: "tipers",
          undo: async () => {
            await apiPut(`/tipers/${id}`, { ...stripMeta(prev) });
          },
          redo: async () => {
            await apiPost(`/tipers/${id}/approve`);
          }
        });
      } catch (error) {
        console.error("Error approving tiper:", error);
        alert("Chyba při schvalování tipaře");
      }
    },
    [tipersData, fetchTipersData, pushAction]
  );

  const handleRestoreTiper = useCallback(
    async (id: number) => {
      const prev = cloneRecord(tipersData.find((t) => t.id === id));
      if (!prev) return;
      try {
        await apiPost(`/tipers/${id}/restore`);
        fetchTipersData();
        pushAction({
          label: `Obnovení tipaře #${id}`,
          resource: "tipers",
          undo: async () => {
            await apiPut(`/tipers/${id}`, { ...stripMeta(prev) });
          },
          redo: async () => {
            await apiPost(`/tipers/${id}/restore`);
          }
        });
      } catch (error) {
        console.error("Error restoring tiper:", error);
        alert("Chyba při obnovování tipaře");
      }
    },
    [tipersData, fetchTipersData, pushAction]
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
          pushAction({
            label: `Smazání tipaře #${id}`,
            resource: "tipers",
            undo: async () => {
              await apiPost(`/tipers`, { ...stripMeta(tiper) });
            },
            redo: async () => {
              await apiDelete(`/tipers/${id}`);
            }
          });
        } else {
          await apiPost(`/tipers/${id}/archive`);
          pushAction({
            label: `Archivace tipaře #${id}`,
            resource: "tipers",
            undo: async () => {
              await apiPost(`/tipers/${id}/restore`);
            },
            redo: async () => {
              await apiPost(`/tipers/${id}/archive`);
            }
          });
        }
        fetchTipersData();
      } catch (error) {
        console.error("Error performing action on tiper:", error);
        alert("Chyba při mazání tipaře");
      }
    },
    [fetchTipersData, tipersData, pushAction]
  );

  const gridContext = useMemo(
    () => ({
      openProfile,
      rowActions: {
        viewMode,
        entityAccusative: "tipaře",
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
      const snapshot = editSnapshotRef.current[id];
      try {
        const { created_at, updated_at, ...updatedTiper } = params.data;
        await apiPut(`/tipers/${updatedTiper.id}`, updatedTiper);
        if (snapshot) {
          const after = cloneRecord(updatedTiper);
          pushAction({
            label: `Úprava tipaře #${id}`,
            resource: "tipers",
            undo: async () => {
              await apiPut(`/tipers/${id}`, stripMeta(snapshot));
            },
            redo: async () => {
              await apiPut(`/tipers/${id}`, stripMeta(after));
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
    [fetchTipersData, pushAction]
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
      const created = await apiPost<UserInterface>(`/tipers`, newTiper);
      fetchTipersData();
      if (created?.id) {
        pushAction({
          label: "Přidání tipaře",
          resource: "tipers",
          undo: async () => {
            await apiDelete(`/tipers/${created.id}`);
          },
          redo: async () => {
            await apiPost(`/tipers`, { ...newTiper, id: created.id });
          }
        });
      }
    } catch (error) {
      console.error("Error adding tiper:", error);
      alert("Chyba při přidávání tipaře");
    }
  }, [fetchTipersData, pushAction, status]);

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
        onDeleteNote={notesManager.deleteNote}
        onClose={closeProfile}
      />
    </>
  );
};

export default TipersSection;

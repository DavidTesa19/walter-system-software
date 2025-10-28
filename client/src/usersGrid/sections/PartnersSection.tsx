import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { UserInterface } from "../user.interface";
import FieldCellRenderer from "../cells/FieldCellRenderer";
import { measureGrid, type GridSizes } from "../utils/gridSizing";
import { API_BASE, mapViewToStatus } from "../constants";
import type { SectionProps } from "./SectionTypes";

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

  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  const fetchPartnersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/partners?status=${status}`);
      const data = await response.json();
      setPartnersData(data);
    } catch (error) {
      console.error("Error fetching partners:", error);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  const handleApprovePartner = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`${API_BASE}/partners/${id}/approve`, { method: "POST" });
        if (response.ok) {
          fetchPartnersData();
        } else {
          alert("Nepodařilo se schválit partnera");
        }
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
        const response = await fetch(`${API_BASE}/partners/${id}/restore`, { method: "POST" });
        if (response.ok) {
          fetchPartnersData();
        } else {
          alert("Nepodařilo se obnovit partnera");
        }
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
      let endpoint = "";
      let method: "POST" | "DELETE" = "DELETE";

      if (isArchived) {
        confirmMessage =
          `Opravdu chcete TRVALE SMAZAT tohoto partnera z databáze?\n\nJméno: ${partner?.name || "N/A"}\nSpolečnost: ${partner?.company || "N/A"}\n\nTato akce je NEzvratná!`;
        endpoint = `${API_BASE}/partners/${id}`;
      } else if (isPending) {
        confirmMessage =
          `Opravdu chcete zamítnout tohoto partnera?\n\nJméno: ${partner?.name || "N/A"}\nSpolečnost: ${partner?.company || "N/A"}`;
        endpoint = `${API_BASE}/partners/${id}`;
      } else {
        confirmMessage =
          `Opravdu chcete přesunout tohoto partnera do archivu k odstraňení?\n\nJméno: ${partner?.name || "N/A"}\nSpolečnost: ${partner?.company || "N/A"}`;
        endpoint = `${API_BASE}/partners/${id}/archive`;
        method = "POST";
      }

      if (!confirm(confirmMessage)) {
        return;
      }

      try {
        const response = await fetch(endpoint, { method });
        if (response.ok) {
          fetchPartnersData();
        } else {
          alert("Nepodařilo se provést akci");
        }
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

        const response = await fetch(`${API_BASE}/partners/${updatedPartner.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(updatedPartner)
        });

        if (!response.ok) {
          alert("Failed to update partner");
          fetchPartnersData();
        }
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
      const response = await fetch(`${API_BASE}/partners`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newPartner)
      });

      if (response.ok) {
        fetchPartnersData();
      } else {
        alert("Nepodařilo se přidat partnera");
      }
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
        />
      </div>
    </div>
  );
};

export default PartnersSection;

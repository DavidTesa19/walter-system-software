import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import type { UserInterface } from "../user.interface";
import FieldCellRenderer from "../cells/FieldCellRenderer";
import { measureGrid, type GridSizes } from "../utils/gridSizing";
import { API_BASE, mapViewToStatus } from "../constants";
import type { SectionProps } from "./SectionTypes";

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

  const status = useMemo(() => mapViewToStatus(viewMode), [viewMode]);

  const fetchTipersData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/tipers?status=${status}`);
      const data = await response.json();
      setTipersData(data);
    } catch (error) {
      console.error("Error fetching tipers:", error);
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  const handleApproveTiper = useCallback(
    async (id: number) => {
      try {
        const response = await fetch(`${API_BASE}/tipers/${id}/approve`, { method: "POST" });
        if (response.ok) {
          fetchTipersData();
        } else {
          alert("Nepodařilo se schválit tipaře");
        }
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
        const response = await fetch(`${API_BASE}/tipers/${id}/restore`, { method: "POST" });
        if (response.ok) {
          fetchTipersData();
        } else {
          alert("Nepodařilo se obnovit tipaře");
        }
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
      let endpoint = "";
      let method: "POST" | "DELETE" = "DELETE";

      if (isArchived) {
        confirmMessage =
          `Opravdu chcete TRVALE SMAZAT tohoto tipaře z databáze?\n\nJméno: ${tiper?.name || "N/A"}\nSpolečnost: ${tiper?.company || "N/A"}\n\nTato akce je NEzvratná!`;
        endpoint = `${API_BASE}/tipers/${id}`;
      } else if (isPending) {
        confirmMessage =
          `Opravdu chcete zamítnout tohoto tipaře?\n\nJméno: ${tiper?.name || "N/A"}\nSpolečnost: ${tiper?.company || "N/A"}`;
        endpoint = `${API_BASE}/tipers/${id}`;
      } else {
        confirmMessage =
          `Opravdu chcete přesunout tohoto tipaře do archivu k odstraňení?\n\nJméno: ${tiper?.name || "N/A"}\nSpolečnost: ${tiper?.company || "N/A"}`;
        endpoint = `${API_BASE}/tipers/${id}/archive`;
        method = "POST";
      }

      if (!confirm(confirmMessage)) {
        return;
      }

      try {
        const response = await fetch(endpoint, { method });
        if (response.ok) {
          fetchTipersData();
        } else {
          alert("Nepodařilo se provést akci");
        }
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

        const response = await fetch(`${API_BASE}/tipers/${updatedTiper.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(updatedTiper)
        });

        if (!response.ok) {
          alert("Nepodařilo se aktualizovat tipaře");
          fetchTipersData();
        }
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
      mobile: "000 000 000"
    };

    try {
      const response = await fetch(`${API_BASE}/tipers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newTiper)
      });

      if (response.ok) {
        fetchTipersData();
      } else {
        alert("Nepodařilo se přidat tipaře");
      }
    } catch (error) {
      console.error("Error adding tiper:", error);
      alert("Chyba při přidávání tipaře");
    }
  }, [fetchTipersData]);

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
        />
      </div>
    </div>
  );
};

export default TipersSection;

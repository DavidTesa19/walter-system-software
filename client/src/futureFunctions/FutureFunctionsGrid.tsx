import "ag-grid-community/styles/ag-theme-quartz.css";
import "../usersGrid/UsersGrid.css";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type CellValueChangedEvent, type ColDef } from "ag-grid-community";
import { API_BASE } from "../usersGrid/constants";
import { measureGrid, type GridSizes } from "../usersGrid/utils/gridSizing";
import InfoCellRenderer from "./cells/InfoCellRenderer";

export interface FutureFunction {
  id: number;
  name: string;
  priority: "Low" | "Medium" | "High";
  complexity: "Simple" | "Moderate" | "Complex";
  phase: "Urgent" | "Medium Term" | "Before Launch" | "Post Launch";
  info: string;
  status: "Planned" | "In Progress" | "Completed";
}

ModuleRegistry.registerModules([AllCommunityModule]);

const PRIORITY_OPTIONS = ["Low", "Medium", "High"] as const;
const COMPLEXITY_OPTIONS = ["Simple", "Moderate", "Complex"] as const;
const PHASE_OPTIONS = ["Urgent", "Medium Term", "Before Launch", "Post Launch"] as const;
const STATUS_OPTIONS = ["Planned", "In Progress", "Completed"] as const;

// Note: we no longer render an in-row delete button. Instead an external
// delete column is rendered to the left of the grid to match other sections.

const FutureFunctionsGrid: React.FC = () => {
  const [futureFunctions, setFutureFunctions] = useState<FutureFunction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [sizes, setSizes] = useState<GridSizes>({ row: 42, headerOffset: 80 });

  const fetchFutureFunctions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/future-functions`);
      if (!response.ok) {
        throw new Error("Failed to fetch");
      }
      const data: FutureFunction[] = await response.json();
      setFutureFunctions(data);
    } catch (error) {
      console.error("Error fetching future functions:", error);
      alert("Nepodařilo se načíst plán funkcí");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFutureFunctions();
  }, [fetchFutureFunctions]);

  const handleAddFunction = useCallback(async () => {
    const newFunction = {
      name: "Nová funkce",
    priority: PRIORITY_OPTIONS[1],
    complexity: COMPLEXITY_OPTIONS[1],
    phase: PHASE_OPTIONS[1],
      info: "",
      status: STATUS_OPTIONS[0]
    } satisfies Omit<FutureFunction, "id">;

    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/future-functions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(newFunction)
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      await fetchFutureFunctions();
    } catch (error) {
      console.error("Error adding future function:", error);
      alert("Nepodařilo se přidat funkci");
    } finally {
      setIsLoading(false);
    }
  }, [fetchFutureFunctions]);

  const handleDeleteFunction = useCallback(
    async (id: number) => {
      const target = futureFunctions.find((item) => item.id === id);
      const name = target?.name ? `\"${target.name}\"` : "tuto funkci";

      if (!confirm(`Opravdu chcete smazat ${name}?`)) {
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(`${API_BASE}/future-functions/${id}`, {
          method: "DELETE"
        });

        if (!response.ok) {
          throw new Error("Request failed");
        }

        await fetchFutureFunctions();
      } catch (error) {
        console.error("Error deleting future function:", error);
        alert("Nepodařilo se smazat funkci");
      } finally {
        setIsLoading(false);
      }
    },
    [fetchFutureFunctions, futureFunctions]
  );

  const onCellValueChanged = useCallback(
    async (params: CellValueChangedEvent<FutureFunction>) => {
      if (!params.data?.id) {
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/future-functions/${params.data.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(params.data)
        });

        if (!response.ok) {
          alert("Nepodařilo se uložit změny");
          await fetchFutureFunctions();
        }
      } catch (error) {
        console.error("Error updating future function:", error);
        alert("Chyba při ukládání změn");
        await fetchFutureFunctions();
      }
    },
    [fetchFutureFunctions]
  );

  const columnDefs = useMemo<ColDef<FutureFunction>[]>(
    () => [
      {
        field: "id",
        headerName: "ID",
        editable: false,
        width: 90,
        minWidth: 80
      },
      {
        field: "name",
        headerName: "Název funkce",
        filter: true,
        flex: 1.5,
        minWidth: 180
      },
      {
        field: "priority",
        headerName: "Priorita",
        filter: true,
        flex: 1,
        minWidth: 140,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: [...PRIORITY_OPTIONS]
        }
      },
      {
        field: "complexity",
        headerName: "Komplexita",
        filter: true,
        flex: 1,
        minWidth: 150,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: [...COMPLEXITY_OPTIONS]
        }
      },
      {
        field: "phase",
        headerName: "Fáze",
        filter: true,
        flex: 1,
        minWidth: 150,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: [...PHASE_OPTIONS]
        }
      },
      {
        field: "info",
        headerName: "Info",
        filter: true,
        flex: 2,
        minWidth: 220,
        tooltipField: "info",
        cellRenderer: InfoCellRenderer,
        cellEditor: "agLargeTextCellEditor",
        cellEditorPopup: true,
        cellEditorParams: {
          maxLength: 1000,
          rows: 8,
          cols: 60
        }
      },
      {
        field: "status",
        headerName: "Stav",
        filter: true,
        flex: 1,
        minWidth: 150,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: {
          values: [...STATUS_OPTIONS]
        }
      },
      // actions are handled by the external delete column on the left
    ],
  []
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setSizes(measureGrid(wrapperRef.current));
    }, 50);
    return () => clearTimeout(timer);
  }, [futureFunctions]);

  useEffect(() => {
    const onResize = () => setSizes(measureGrid(wrapperRef.current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="page-container">
      <div className="header-section">
        <h1 className="page-title">Plán budoucích funkcí</h1>
        <button className="add-user-btn" onClick={handleAddFunction} disabled={isLoading}>
          + Přidat funkci
        </button>
      </div>

      <div className="table-section">
        <div className="grid-container">
          <div
            className="delete-buttons-column"
            style={{
              ["--row-height" as any]: `${sizes.row}px`,
              ["--header-offset" as any]: `${sizes.headerOffset}px`
            }}
          >
            {futureFunctions.map((item) => (
              <button
                key={item.id}
                onClick={() => handleDeleteFunction(item.id as number)}
                className="external-delete-btn"
                title="Smazat položku"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>

          <div ref={wrapperRef} className="grid-wrapper ag-theme-quartz" style={{ height: 500 }}>
            <AgGridReact<FutureFunction>
              rowData={futureFunctions}
              columnDefs={columnDefs}
              defaultColDef={{
                editable: true,
                resizable: true,
                sortable: true,
                filter: true,
                flex: 1
              }}
              suppressRowClickSelection={true}
              onCellValueChanged={onCellValueChanged}
              loading={isLoading}
              animateRows
            />
          </div>
        </div>
      </div>

      <div className="instructions">
        <p>
          <strong>Instrukce pro plán funkcí:</strong>
        </p>
        <ul>
          <li>Použijte tlačítko „Přidat funkci" pro založení nového záznamu</li>
          <li>Kliknutím na buňku lze upravit hodnotu, rozbalovací pole nabízí připravené možnosti</li>
          <li>Sloupec "Info" lze kliknutím otevřít v detailu bez změny výšky řádku</li>
          <li>Tlačítko s křížkem vlevo odstraní danou položku z plánu</li>
        </ul>
      </div>
    </div>
  );
};

export default FutureFunctionsGrid;

import React from "react";
import { formatSpecialization, parseMultiValue, resolveRowObor } from "../multiValue";
import type { FieldEditorAnchor } from "../components/SubjectFieldPopover";

interface SpecializationCellParams {
  value?: string;
  oborKey: string;
  // Opens the section-owned Obor/Zaměření editor popover for this row — the
  // same one the Obor cell opens, since a Zaměření is always chosen underneath
  // a specific Obor value.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOpenEditor?: (data: any, anchorRect: FieldEditorAnchor) => void;
  disabled?: boolean;
  // Ag-grid params
  colDef: any;
  data: any;
  node: any;
}

// Grid-cell counterpart to the profile panel's nested Zaměření picker. Editing
// happens in the shared popover (SubjectFieldPopover), which lists every Obor
// value with its own Zaměření dropdown — so rows with several Obor values are
// as editable here as single-value ones, and the value is persisted through the
// same entity-update path the profile panel uses.
const SpecializationCellRenderer: React.FC<SpecializationCellParams> = (params) => {
  const oborValues = parseMultiValue(resolveRowObor(params.data, params.oborKey));
  const canOpenEditor = typeof params.onOpenEditor === "function" && !params.disabled;

  // The column's valueGetter already formats the stored map; fall back to
  // formatting here so the cell also works without one.
  const currentValue = params.value
    ?? formatSpecialization(params.data?.entity?.field_specialization, resolveRowObor(params.data, params.oborKey));

  const handleClick = (e: React.MouseEvent) => {
    if (!canOpenEditor) {
      return;
    }

    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    e.stopPropagation();
    e.preventDefault();

    params.onOpenEditor!(params.data, cellRect);
  };

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const displayText = currentValue || (oborValues.length === 0 ? "Nejprve vyberte obor" : "Vyberte zaměření");

  return (
    <div
      onClick={handleClick}
      className={`field-cell-renderer ${currentValue ? '' : 'placeholder'}`}
      title={currentValue || undefined}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        cursor: canOpenEditor ? "pointer" : "default",
        padding: "0 8px",
        borderRadius: "4px",
        transition: "all 0.2s ease",
        opacity: params.disabled ? 0.7 : 1,
      }}
    >
      <span style={{
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: currentValue ? "inherit" : (isDark ? "#888" : "#999")
      }}>
        {displayText}
      </span>
      {canOpenEditor ? (
        <span style={{ marginLeft: "auto", opacity: 0.5, display: "flex", alignItems: "center" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      ) : null}
    </div>
  );
};

export default SpecializationCellRenderer;

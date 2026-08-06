import React from "react";
import type { FieldOption } from "../fieldOptions";
import { openFieldDropdown, SPECIALIZATION_DROPDOWN_LABELS } from "./fieldDropdown";
import { parseMultiValue, parseSpecializationMap, serializeSpecializationMap } from "../multiValue";

interface SpecializationCellParams {
  value?: string;
  setValue?: (value: string | null) => void;
  oborKey: string;
  getOptions: (oborValue: string) => FieldOption[];
  onCreateFieldOption?: (oborValue: string, value: string) => Promise<FieldOption | void> | FieldOption | void;
  onDeleteFieldOption?: (optionId: number) => Promise<void> | void;
  disabled?: boolean;
  // Ag-grid params
  colDef: any;
  data: any;
  node: any;
}

// Grid-cell counterpart to the profile panel's nested Zaměření picker. Only
// interactive when the row has exactly one Obor value — with several, which
// obor a click would target is ambiguous, so editing stays in the profile
// panel (same guard FieldCellRenderer applies to multi-value Obor cells).
const SpecializationCellRenderer: React.FC<SpecializationCellParams> = (params) => {
  const oborValues = parseMultiValue(params.data?.[params.oborKey]);
  const oborValue = oborValues.length === 1 ? oborValues[0] : null;

  const specMap = parseSpecializationMap(params.data?.entity?.field_specialization);
  const currentValue = oborValue ? (specMap[oborValue] ?? "") : "";

  const writeMap = (nextMap: Record<string, string>) => {
    const serialized = serializeSpecializationMap(nextMap);
    if (typeof params.setValue === "function") {
      params.setValue(serialized);
    } else if (params.colDef?.field && typeof params.node?.setDataValue === "function") {
      params.node.setDataValue(params.colDef.field, serialized);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (params.disabled || !oborValue) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    const options = params.getOptions(oborValue);

    openFieldDropdown({
      anchorRect: cellRect,
      fieldOptions: options,
      groupedFieldOptions: [{ label: "Zaměření", options }],
      currentValue,
      disabled: params.disabled,
      labels: SPECIALIZATION_DROPDOWN_LABELS,
      onSelect: (nextValue) => {
        const nextMap = { ...specMap };
        if (nextValue) {
          nextMap[oborValue] = nextValue;
        } else {
          delete nextMap[oborValue];
        }
        writeMap(nextMap);
      },
      onCreateFieldOption: params.onCreateFieldOption
        ? (value) => params.onCreateFieldOption!(oborValue, value)
        : undefined,
      onDeleteFieldOption: params.onDeleteFieldOption,
      onDeletedCurrentValue: () => {
        const nextMap = { ...specMap };
        delete nextMap[oborValue];
        writeMap(nextMap);
      },
    });
  };

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const displayText = oborValues.length === 0
    ? "Nejprve vyberte obor"
    : oborValue
      ? (currentValue || "Vyberte zaměření")
      : (params.value || "—");

  return (
    <div
      onClick={handleClick}
      className={`field-cell-renderer ${currentValue ? '' : 'placeholder'}`}
      title={
        oborValues.length === 0
          ? "Nejprve vyberte obor"
          : !oborValue
            ? "Několik oborů — upravte zaměření v profilu subjektu"
            : undefined
      }
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        cursor: oborValue && !params.disabled ? "pointer" : "default",
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
      {oborValue ? (
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

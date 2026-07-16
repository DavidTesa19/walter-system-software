import React from "react";
import {
  fieldOptions as defaultFieldOptions,
  groupedFieldOptions as defaultGroupedFieldOptions,
} from "../fieldOptions";
import type { FieldCategory, FieldOption } from "../fieldOptions";
import { openFieldDropdown } from "./fieldDropdown";

interface FieldCellParams {
  value: string;
  setValue?: (value: string) => void;
  fieldOptions?: FieldOption[];
  groupedFieldOptions?: FieldCategory[];
  onCreateFieldOption?: (value: string) => Promise<FieldOption | void> | FieldOption | void;
  onDeleteFieldOption?: (optionId: number) => Promise<void> | void;
  disabled?: boolean;
  // Ag-grid params
  colDef: any;
  data: any;
  node: any;
}

const REMOVED_FIELD_LABEL = "Odstraněno";

const FieldCellRenderer: React.FC<FieldCellParams> = (params) => {
  const availableFieldOptions = params.fieldOptions ?? defaultFieldOptions;
  const availableGroupedFieldOptions = params.groupedFieldOptions ?? defaultGroupedFieldOptions;
  const flatFieldOptions = availableFieldOptions.length > 0
    ? availableFieldOptions
    : availableGroupedFieldOptions.flatMap((group) => group.options);

  const getCurrentField = () => {
    return (
      flatFieldOptions.find((option) => option.value === params.value) || {
        value: params.value || "",
        label: params.value || "Vyberte obor"
      }
    );
  };

  const writeValue = (val: string) => {
    if (typeof params.setValue === "function") {
      params.setValue(val);
    } else if (params.colDef?.field && typeof params.node?.setDataValue === "function") {
      params.node.setDataValue(params.colDef.field, val);
    }
  };

  const handleFieldClick = (e: React.MouseEvent) => {
    if (params.disabled) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    openFieldDropdown({
      anchorRect: cellRect,
      fieldOptions: availableFieldOptions,
      groupedFieldOptions: availableGroupedFieldOptions,
      currentValue: params.value,
      disabled: params.disabled,
      onSelect: writeValue,
      onCreateFieldOption: params.onCreateFieldOption,
      onDeleteFieldOption: params.onDeleteFieldOption,
      onDeletedCurrentValue: () => writeValue(REMOVED_FIELD_LABEL),
    });
  };

  const currentField = getCurrentField();
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  return (
    <div
      onClick={handleFieldClick}
      className={`field-cell-renderer ${params.value ? '' : 'placeholder'}`}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        cursor: "pointer",
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
        color: !params.value ? (isDark ? "#888" : "#999") : "inherit"
      }}>
        {currentField.label}
      </span>
      {/* Down chevron icon to indicate it's a dropdown */}
      <span style={{ marginLeft: "auto", opacity: 0.5, display: "flex", alignItems: "center" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </span>
    </div>
  );
};

export default FieldCellRenderer;

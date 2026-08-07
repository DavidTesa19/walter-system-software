import React from "react";
import {
  fieldOptions as defaultFieldOptions,
  groupedFieldOptions as defaultGroupedFieldOptions,
} from "../fieldOptions";
import type { FieldCategory, FieldOption } from "../fieldOptions";
import { openFieldDropdown } from "./fieldDropdown";
import { parseMultiValue } from "../multiValue";
import type { FieldEditorAnchor } from "../components/SubjectFieldPopover";

interface FieldCellParams {
  value: string;
  setValue?: (value: string) => void;
  fieldOptions?: FieldOption[];
  groupedFieldOptions?: FieldCategory[];
  onCreateFieldOption?: (value: string) => Promise<FieldOption | void> | FieldOption | void;
  onDeleteFieldOption?: (optionId: number) => Promise<void> | void;
  // Opens the section-owned Obor/Zaměření editor popover for this row. When
  // supplied it replaces the inline single-select dropdown, because that one
  // can only ever hold a single value (it would silently drop the extras of a
  // multi-value Obor) and its writes go through ag-grid's value plumbing
  // instead of the entity-update path the profile panel uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOpenEditor?: (data: any, anchorRect: FieldEditorAnchor) => void;
  placeholder?: string;
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

  // A subject can carry several Obor values (stored as a JSON array string).
  const values = parseMultiValue(params.value);
  const canOpenEditor = typeof params.onOpenEditor === "function" && !params.disabled;
  // Without the popover editor only single-value cells can be edited inline.
  const isInteractive = canOpenEditor || (!params.disabled && values.length <= 1);

  const labelForValue = (value: string) =>
    flatFieldOptions.find((option) => option.value === value)?.label ?? value;

  const getCurrentLabel = () => {
    if (values.length === 0) return params.placeholder ?? "Vyberte obor";
    return values.map(labelForValue).join(", ");
  };

  const writeValue = (val: string) => {
    if (typeof params.setValue === "function") {
      params.setValue(val);
    } else if (params.colDef?.field && typeof params.node?.setDataValue === "function") {
      params.node.setDataValue(params.colDef.field, val);
    }
  };

  const handleFieldClick = (e: React.MouseEvent) => {
    if (!isInteractive) {
      return;
    }

    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    e.stopPropagation();
    e.preventDefault();

    if (canOpenEditor) {
      params.onOpenEditor!(params.data, cellRect);
      return;
    }

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

  const currentLabel = getCurrentLabel();
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  return (
    <div
      onClick={handleFieldClick}
      className={`field-cell-renderer ${values.length > 0 ? '' : 'placeholder'}`}
      title={values.length > 1 ? values.map(labelForValue).join(", ") : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        cursor: isInteractive ? "pointer" : "default",
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
        color: values.length === 0 ? (isDark ? "#888" : "#999") : "inherit"
      }}>
        {currentLabel}
      </span>
      {isInteractive ? (
        <span style={{ marginLeft: "auto", opacity: 0.5, display: "flex", alignItems: "center" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      ) : null}
    </div>
  );
};

export default FieldCellRenderer;

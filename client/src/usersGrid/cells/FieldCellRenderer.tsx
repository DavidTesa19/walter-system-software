import React, { useState } from "react";
import {
  fieldOptions as defaultFieldOptions,
  groupedFieldOptions as defaultGroupedFieldOptions,
} from "../fieldOptions";
import type { FieldCategory, FieldOption } from "../fieldOptions";
import { openFieldDropdown } from "./fieldDropdown";
import FieldPopoverPanel from "./FieldPopoverPanel";
import { MultiValueEditor, type EditableField, type SpecializationPickerConfig } from "../components/EntityCommissionProfilePanel";
import { parseMultiValue, parseSpecializationMap } from "../multiValue";

interface FieldCellParams {
  value: string;
  setValue?: (value: string) => void;
  fieldOptions?: FieldOption[];
  groupedFieldOptions?: FieldCategory[];
  onCreateFieldOption?: (value: string) => Promise<FieldOption | void> | FieldOption | void;
  onDeleteFieldOption?: (optionId: number) => Promise<void> | void;
  disabled?: boolean;
  // Obor key on the row/entity (defaults to "field"); passed through so this
  // renderer stays reusable if a section ever keys its obor column differently.
  oborKey?: string;
  label?: string;
  // When provided, lets the popover editor persist directly (bypassing
  // ag-grid's cell value plumbing) — the same path the profile panel uses.
  onSaveEntityField?: (entityId: number, key: string, value: string | null) => void;
  specializationPicker?: SpecializationPickerConfig;
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

  const [popoverAnchor, setPopoverAnchor] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);

  // A subject can carry several Obor values (stored as a JSON array string).
  const values = parseMultiValue(params.value);
  const isMulti = values.length > 1;
  const oborKey = params.oborKey ?? "field";
  const entityId: number | null = params.data?.entity?.id ?? null;

  const labelForValue = (value: string) =>
    flatFieldOptions.find((option) => option.value === value)?.label ?? value;

  const getCurrentLabel = () => {
    if (values.length === 0) return "Vyberte obor";
    return values.map(labelForValue).join(", ");
  };

  const writeValue = (val: string) => {
    if (typeof params.setValue === "function") {
      params.setValue(val);
    } else if (params.colDef?.field && typeof params.node?.setDataValue === "function") {
      params.node.setDataValue(params.colDef.field, val);
    }
  };

  // Lets the popover's MultiValueEditor save both the obor list and, per obor
  // value, its nested Zaměření — routed straight to the entity update handler
  // so it works identically to the profile panel, regardless of whether the
  // ag-grid column for that key has a matching valueGetter/valueSetter pair.
  const handlePopoverSave = (key: string, value: string | boolean | string[] | null) => {
    if (params.onSaveEntityField && entityId != null) {
      params.onSaveEntityField(entityId, key, typeof value === "string" ? value : value == null ? null : String(value));
      return;
    }
    // Fallback: at least keep the obor column itself in sync via ag-grid.
    if (key === oborKey) writeValue(typeof value === "string" ? value : "");
  };

  const handleFieldClick = (e: React.MouseEvent) => {
    if (params.disabled) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    // With several values the single-select dropdown would overwrite the
    // list, so several values are edited with the same add/remove UI as the
    // profile panel, opened in a popover anchored to this cell.
    if (isMulti) {
      setPopoverAnchor(cellRect);
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

  const popoverField: EditableField = {
    key: oborKey,
    label: params.label ?? "Obor",
    value: params.value,
    type: "multi-value",
    multiValueEditor: "field-select",
    options: flatFieldOptions,
    specializationValues: parseSpecializationMap(params.data?.entity?.field_specialization),
  };

  return (
    <div
      onClick={handleFieldClick}
      className={`field-cell-renderer ${params.value ? '' : 'placeholder'}`}
      title={isMulti ? "Několik oborů — klikněte pro úpravu" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        cursor: params.disabled ? "default" : "pointer",
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
      <span style={{ marginLeft: "auto", opacity: 0.5, display: "flex", alignItems: "center" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </span>
      {popoverAnchor ? (
        <FieldPopoverPanel anchorRect={popoverAnchor} onClose={() => setPopoverAnchor(null)}>
          <MultiValueEditor
            field={popoverField}
            onSave={handlePopoverSave}
            fieldPicker={{
              fieldOptions: availableFieldOptions,
              groupedFieldOptions: availableGroupedFieldOptions,
              onCreateFieldOption: params.onCreateFieldOption,
              onDeleteFieldOption: params.onDeleteFieldOption,
            }}
            specializationPicker={params.specializationPicker}
          />
        </FieldPopoverPanel>
      ) : null}
    </div>
  );
};

export default FieldCellRenderer;

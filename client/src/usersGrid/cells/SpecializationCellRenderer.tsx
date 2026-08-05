import React, { useState } from "react";
import type { FieldOption } from "../fieldOptions";
import { openFieldDropdown, SPECIALIZATION_DROPDOWN_LABELS } from "./fieldDropdown";
import FieldPopoverPanel from "./FieldPopoverPanel";
import { MultiValueEditor, type EditableField, type SpecializationPickerConfig } from "../components/EntityCommissionProfilePanel";
import { parseMultiValue, parseSpecializationMap, serializeSpecializationMap } from "../multiValue";

interface SpecializationCellParams {
  value?: string;
  setValue?: (value: string | null) => void;
  oborKey: string;
  oborLabel?: string;
  getOptions: (oborValue: string) => FieldOption[];
  onCreateFieldOption?: (oborValue: string, value: string) => Promise<FieldOption | void> | FieldOption | void;
  onDeleteFieldOption?: (optionId: number) => Promise<void> | void;
  disabled?: boolean;
  // Same shared field picker as the Obor column, needed so the popover can
  // also edit the Obor list itself when several values are selected.
  fieldOptions?: FieldOption[];
  groupedFieldOptions?: { label: string; options: FieldOption[] }[];
  onCreateFieldOptionForObor?: (value: string) => Promise<FieldOption | void> | FieldOption | void;
  onDeleteFieldOptionForObor?: (optionId: number) => Promise<void> | void;
  onSaveEntityField?: (entityId: number, key: string, value: string | null) => void;
  // Ag-grid params
  colDef: any;
  data: any;
  node: any;
}

// Grid-cell counterpart to the profile panel's nested Zaměření picker. With
// exactly one Obor value it edits that value's specialization directly; with
// several, which obor a click would target is ambiguous, so it opens the same
// add/remove popover as the Obor cell (anchored here) instead of doing nothing.
const SpecializationCellRenderer: React.FC<SpecializationCellParams> = (params) => {
  const oborValues = parseMultiValue(params.data?.[params.oborKey]);
  const oborValue = oborValues.length === 1 ? oborValues[0] : null;
  const isMulti = oborValues.length > 1;
  const entityId: number | null = params.data?.entity?.id ?? null;

  const [popoverAnchor, setPopoverAnchor] = useState<{ top: number; bottom: number; left: number; width: number } | null>(null);

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

  const specializationPicker: SpecializationPickerConfig = {
    fieldKey: params.colDef?.field ?? "field_specialization",
    getOptions: params.getOptions,
    onCreateOption: params.onCreateFieldOption,
    onDeleteOption: params.onDeleteFieldOption,
  };

  const handlePopoverSave = (key: string, value: string | boolean | string[] | null) => {
    if (params.onSaveEntityField && entityId != null) {
      params.onSaveEntityField(entityId, key, typeof value === "string" ? value : value == null ? null : String(value));
      return;
    }
    if (key === specializationPicker.fieldKey) {
      writeMap(parseSpecializationMap(value));
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (params.disabled || oborValues.length === 0) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    if (isMulti) {
      setPopoverAnchor(cellRect);
      return;
    }

    const options = params.getOptions(oborValue!);

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
          nextMap[oborValue!] = nextValue;
        } else {
          delete nextMap[oborValue!];
        }
        writeMap(nextMap);
      },
      onCreateFieldOption: params.onCreateFieldOption
        ? (value) => params.onCreateFieldOption!(oborValue!, value)
        : undefined,
      onDeleteFieldOption: params.onDeleteFieldOption,
      onDeletedCurrentValue: () => {
        const nextMap = { ...specMap };
        delete nextMap[oborValue!];
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

  const popoverField: EditableField = {
    key: params.oborKey,
    label: params.oborLabel ?? "Obor",
    value: params.data?.[params.oborKey],
    type: "multi-value",
    multiValueEditor: "field-select",
    options: params.fieldOptions ?? [],
    specializationValues: specMap,
  };

  return (
    <div
      onClick={handleClick}
      className={`field-cell-renderer ${currentValue ? '' : 'placeholder'}`}
      title={
        oborValues.length === 0
          ? "Nejprve vyberte obor"
          : isMulti
            ? "Několik oborů — klikněte pro úpravu zaměření"
            : undefined
      }
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        cursor: oborValues.length > 0 && !params.disabled ? "pointer" : "default",
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
      {oborValues.length > 0 ? (
        <span style={{ marginLeft: "auto", opacity: 0.5, display: "flex", alignItems: "center" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      ) : null}
      {popoverAnchor ? (
        <FieldPopoverPanel anchorRect={popoverAnchor} onClose={() => setPopoverAnchor(null)}>
          <MultiValueEditor
            field={popoverField}
            onSave={handlePopoverSave}
            fieldPicker={{
              fieldOptions: params.fieldOptions ?? [],
              groupedFieldOptions: params.groupedFieldOptions ?? [],
              onCreateFieldOption: params.onCreateFieldOptionForObor,
              onDeleteFieldOption: params.onDeleteFieldOptionForObor,
            }}
            specializationPicker={specializationPicker}
          />
        </FieldPopoverPanel>
      ) : null}
    </div>
  );
};

export default SpecializationCellRenderer;

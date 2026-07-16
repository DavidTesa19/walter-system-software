import React, { useMemo, useRef } from "react";
import type { FieldCategory, FieldOption } from "../fieldOptions";
import { openFieldDropdown } from "../cells/fieldDropdown";
import "./FieldSelectInput.css";

// Shared config bundle for the searchable "Obor" field picker, reused by the
// create modal and the profile panel.
export interface FieldPickerConfig {
  fieldOptions: FieldOption[];
  groupedFieldOptions: FieldCategory[];
  onCreateFieldOption?: (value: string) => Promise<FieldOption | void> | FieldOption | void;
  onDeleteFieldOption?: (optionId: number) => Promise<void> | void;
}

export interface FieldSelectInputProps {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  fieldOptions: FieldOption[];
  groupedFieldOptions: FieldCategory[];
  onChange: (value: string) => void;
  onCreateFieldOption?: (value: string) => Promise<FieldOption | void> | FieldOption | void;
  onDeleteFieldOption?: (optionId: number) => Promise<void> | void;
}

// A single-line trigger, styled like the modal's other inputs, that opens the
// same searchable/hierarchical "Obor" dropdown used in the ag-grid tables.
const FieldSelectInput: React.FC<FieldSelectInputProps> = ({
  value,
  placeholder,
  disabled = false,
  fieldOptions,
  groupedFieldOptions,
  onChange,
  onCreateFieldOption,
  onDeleteFieldOption,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const flatFieldOptions = useMemo(
    () => (fieldOptions.length > 0 ? fieldOptions : groupedFieldOptions.flatMap((group) => group.options)),
    [fieldOptions, groupedFieldOptions]
  );

  const currentLabel = useMemo(() => {
    if (!value) return "";
    return flatFieldOptions.find((option) => option.value === value)?.label ?? value;
  }, [flatFieldOptions, value]);

  const openDropdown = () => {
    if (disabled || !buttonRef.current) return;
    openFieldDropdown({
      anchorRect: buttonRef.current.getBoundingClientRect(),
      fieldOptions,
      groupedFieldOptions,
      currentValue: value,
      disabled,
      onSelect: onChange,
      onCreateFieldOption,
      onDeleteFieldOption,
      onDeletedCurrentValue: () => onChange(""),
    });
  };

  return (
    <button
      type="button"
      ref={buttonRef}
      className="editable-input select ec-field-select-trigger"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        openDropdown();
      }}
    >
      <span className={`ec-field-select-value ${value ? "" : "is-placeholder"}`}>
        {value ? currentLabel : (placeholder || "- Vyberte -")}
      </span>
      <span className="ec-field-select-chevron" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </span>
    </button>
  );
};

export default FieldSelectInput;

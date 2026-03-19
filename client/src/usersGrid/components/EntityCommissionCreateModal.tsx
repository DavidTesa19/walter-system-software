import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { FieldGroup } from "./EntityCommissionProfilePanel";
import "./EntityCommissionProfilePanel.css";

type FieldValues = Record<string, string>;

interface EntityCommissionCreateModalProps {
  open: boolean;
  title: string;
  entityTitle: string;
  commissionTitle: string;
  entityGroups: FieldGroup[];
  commissionGroups: FieldGroup[];
  entityValues: FieldValues;
  commissionValues: FieldValues;
  isSubmitting?: boolean;
  submitLabel?: string;
  includeCommission: boolean;
  includeCommissionLabel?: string;
  onClose: () => void;
  onEntityChange: (key: string, value: string) => void;
  onCommissionChange: (key: string, value: string) => void;
  onIncludeCommissionChange: (checked: boolean) => void;
  onSubmit: () => void | Promise<void>;
}

interface DraftFieldProps {
  field: FieldGroup["fields"][number];
  value: string;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}

const DraftField: React.FC<DraftFieldProps> = ({ field, value, onChange, disabled = false }) => {
  if (field.type === "textarea") {
    return (
      <textarea
        className="editable-input textarea"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(field.key, event.target.value)}
        placeholder={field.placeholder || field.label}
        rows={4}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        className="editable-input select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(field.key, event.target.value)}
      >
        <option value="">- Vyberte -</option>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "date") {
    return (
      <input
        type="date"
        className="editable-input date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(field.key, event.target.value)}
      />
    );
  }

  return (
    <input
      type="text"
      className="editable-input"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(field.key, event.target.value)}
      placeholder={field.placeholder || field.label}
    />
  );
};

interface DraftFieldGroupProps {
  group: FieldGroup;
  values: FieldValues;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}

const DraftFieldGroup: React.FC<DraftFieldGroupProps> = ({ group, values, onChange, disabled = false }) => {
  const colorClass = group.color ? `group-${group.color}` : "";

  return (
    <div className={`field-group ${colorClass}`}>
      <h4 className="field-group-title">{group.title}</h4>
      <div className="field-group-content">
        {group.fields.map((field) => (
          <div key={field.key} className={`field-row ${field.isMultiline ? "multiline" : ""}`}>
            <label className="field-label">{field.label}</label>
            <div className="editable-field editing ec-create-field">
              <DraftField field={field} value={values[field.key] || ""} onChange={onChange} disabled={disabled} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const EntityCommissionCreateModal: React.FC<EntityCommissionCreateModalProps> = ({
  open,
  title,
  entityTitle,
  commissionTitle,
  entityGroups,
  commissionGroups,
  entityValues,
  commissionValues,
  isSubmitting = false,
  submitLabel = "Vytvořit",
  includeCommission,
  includeCommissionLabel = "Vytvořit rovnou i zakázku",
  onClose,
  onEntityChange,
  onCommissionChange,
  onIncludeCommissionChange,
  onSubmit
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useMemo(() => `entity-create-modal-${title.replace(/\s+/g, "-").toLowerCase()}`, [title]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  const handleOverlayMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="ec-profile-overlay" onMouseDown={handleOverlayMouseDown} role="presentation">
      <div className="ec-profile-panel ec-create-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="ec-profile-header">
          <div className="ec-profile-header-info">
            <span className="ec-profile-type">Nový záznam</span>
            <h2 className="ec-profile-title" id={titleId}>{title}</h2>
          </div>
          <button type="button" className="ec-profile-close" onClick={onClose} aria-label="Zavřít">
            <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="ec-profile-body">
          <div className="ec-profile-main">
            <div className="ec-profile-columns">
              <div className="ec-profile-column entity-column">
                <div className="ec-column-header">
                  <h3 className="ec-column-title">{entityTitle}</h3>
                </div>
                <div className="ec-column-content">
                  {entityGroups.map((group, index) => (
                    <DraftFieldGroup key={`entity-group-${index}`} group={group} values={entityValues} onChange={onEntityChange} />
                  ))}
                </div>
              </div>

              <div className="ec-profile-column commission-column">
                <div className="ec-column-header">
                  <div className="ec-create-commission-header">
                    <h3 className="ec-column-title">{commissionTitle}</h3>
                    <label className="ec-create-checkbox">
                      <input
                        type="checkbox"
                        checked={includeCommission}
                        onChange={(event) => onIncludeCommissionChange(event.target.checked)}
                      />
                      <span>{includeCommissionLabel}</span>
                    </label>
                  </div>
                </div>
                <div className={`ec-column-content ${includeCommission ? "" : "ec-column-content-disabled"}`}>
                  {commissionGroups.map((group, index) => (
                    <DraftFieldGroup
                      key={`commission-group-${index}`}
                      group={group}
                      values={commissionValues}
                      onChange={onCommissionChange}
                      disabled={!includeCommission}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="ec-create-actions">
              <button type="button" className="ec-create-action secondary" onClick={onClose} disabled={isSubmitting}>
                Zrušit
              </button>
              <button type="button" className="ec-create-action primary" onClick={onSubmit} disabled={isSubmitting}>
                {isSubmitting ? "Ukládám..." : submitLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EntityCommissionCreateModal;
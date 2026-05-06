import React from "react";
import type { FutureFunction, FutureFunctionDraft } from "./futureFunction.interface";

type FutureFunctionProfileValues = FutureFunctionDraft & Partial<Pick<FutureFunction, "created_at" | "completedAt">>;
type FutureFunctionFieldType = "input" | "textarea" | "select" | "checkbox" | "date";
type FutureFunctionFieldElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type FutureFunctionFieldValue = FutureFunctionProfileValues[keyof FutureFunctionProfileValues];

interface FutureFunctionProfileFieldsProps {
  values: FutureFunctionProfileValues;
  priorityOptions: readonly string[];
  complexityOptions: readonly string[];
  phaseOptions: readonly string[];
  statusOptions: readonly string[];
  onFieldChange: (key: keyof FutureFunctionProfileValues, value: FutureFunctionFieldValue) => void;
  onFieldKeyDown: (
    event: React.KeyboardEvent<FutureFunctionFieldElement>,
    fieldType: FutureFunctionFieldType,
    options?: readonly string[],
    onSelectChange?: (nextValue: string) => void
  ) => void;
  readOnly?: boolean;
  disabled?: boolean;
  firstFieldRef?: React.RefObject<HTMLInputElement | null>;
  navFieldClassName?: string;
  namePlaceholder?: string;
  infoPlaceholder?: string;
  archivedLabel?: string;
  showCreatedAt?: boolean;
  createdAtDisplay?: React.ReactNode;
  showCompletedAt?: boolean;
  statusColor?: string;
  staticFieldClassName?: string;
  staticTextClassName?: string;
  statusFieldClassName?: string;
  statusEditorClassName?: string;
}

const joinClassNames = (...parts: Array<string | false | null | undefined>) => {
  return parts.filter(Boolean).join(" ");
};

const FutureFunctionProfileFields: React.FC<FutureFunctionProfileFieldsProps> = ({
  values,
  priorityOptions,
  complexityOptions,
  phaseOptions,
  statusOptions,
  onFieldChange,
  onFieldKeyDown,
  readOnly = false,
  disabled = false,
  firstFieldRef,
  navFieldClassName = "",
  namePlaceholder = "",
  infoPlaceholder = "",
  archivedLabel = "Vytvořit rovnou v archivu",
  showCreatedAt = false,
  createdAtDisplay,
  showCompletedAt = false,
  statusColor,
  staticFieldClassName = "",
  staticTextClassName = "",
  statusFieldClassName = "",
  statusEditorClassName = ""
}) => {
  const fieldClassName = joinClassNames("ff-create-nav-field", navFieldClassName);
  const staticField = (content: React.ReactNode, extraClassName?: string) => (
    <div className={joinClassNames(staticFieldClassName, extraClassName)}>{content}</div>
  );

  return (
    <>
      <label className="ff-create-field ff-create-field-wide">
        <span>Název funkce</span>
        {readOnly
          ? staticField(values.name || "—")
          : (
            <input
              ref={firstFieldRef}
              className={fieldClassName}
              type="text"
              value={values.name}
              onChange={(event) => onFieldChange("name", event.target.value)}
              onKeyDown={(event) => onFieldKeyDown(event, "input")}
              placeholder={namePlaceholder}
              disabled={disabled}
            />
          )}
      </label>

      <label className="ff-create-field">
        <span>Priorita</span>
        {readOnly
          ? staticField(values.priority || "—")
          : (
            <select
              className={fieldClassName}
              value={values.priority}
              onChange={(event) => onFieldChange("priority", event.target.value)}
              onKeyDown={(event) => onFieldKeyDown(event, "select", priorityOptions, (nextValue) => onFieldChange("priority", nextValue))}
              disabled={disabled}
            >
              {priorityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
      </label>

      <label className="ff-create-field">
        <span>Komplexita</span>
        {readOnly
          ? staticField(values.complexity || "—")
          : (
            <select
              className={fieldClassName}
              value={values.complexity}
              onChange={(event) => onFieldChange("complexity", event.target.value)}
              onKeyDown={(event) => onFieldKeyDown(event, "select", complexityOptions, (nextValue) => onFieldChange("complexity", nextValue))}
              disabled={disabled}
            >
              {complexityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
      </label>

      <label className="ff-create-field">
        <span>Časový plán</span>
        {readOnly
          ? staticField(values.phase || "—")
          : (
            <select
              className={fieldClassName}
              value={values.phase}
              onChange={(event) => onFieldChange("phase", event.target.value)}
              onKeyDown={(event) => onFieldKeyDown(event, "select", phaseOptions, (nextValue) => onFieldChange("phase", nextValue))}
              disabled={disabled}
            >
              {phaseOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
      </label>

      <label className="ff-create-field">
        <span>Stav</span>
        {readOnly
          ? staticField(
            statusColor ? (
              <span className="ff-status-badge">
                <span className="ff-status-dot" style={{ backgroundColor: statusColor }} />
                {values.status || "—"}
              </span>
            ) : (values.status || "—"),
            statusFieldClassName
          )
          : (
            <div className={joinClassNames(statusEditorClassName)}>
              {statusColor ? <span className="ff-status-dot" style={{ backgroundColor: statusColor }} /> : null}
              <select
                className={fieldClassName}
                value={values.status}
                onChange={(event) => onFieldChange("status", event.target.value)}
                onKeyDown={(event) => onFieldKeyDown(event, "select", statusOptions, (nextValue) => onFieldChange("status", nextValue))}
                disabled={disabled}
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )}
      </label>

      {showCreatedAt ? (
        <label className="ff-create-field">
          <span>Datum přidání</span>
          {staticField(createdAtDisplay ?? "—")}
        </label>
      ) : null}

      {showCompletedAt ? (
        <label className="ff-create-field">
          <span>Datum dokončení</span>
          {readOnly
            ? staticField(values.completedAt || "—")
            : (
              <input
                type="date"
                className={fieldClassName}
                value={values.completedAt ?? ""}
                onChange={(event) => onFieldChange("completedAt", event.target.value || null)}
                onKeyDown={(event) => onFieldKeyDown(event, "date")}
                disabled={disabled}
              />
            )}
        </label>
      ) : null}

      <div className="ff-create-field ff-create-field-wide">
        <span>{archivedLabel}</span>
        {readOnly
          ? staticField(values.archived ? "Ano" : "Ne")
          : (
            <label className="ff-create-checkbox">
              <input
                className={fieldClassName}
                type="checkbox"
                checked={values.archived}
                onChange={(event) => onFieldChange("archived", event.target.checked)}
                onKeyDown={(event) => onFieldKeyDown(event, "checkbox")}
                disabled={disabled}
              />
              <span>{values.archived ? "Ano" : "Ne"}</span>
            </label>
          )}
      </div>

      <label className="ff-create-field ff-create-field-wide">
        <span>Info</span>
        {readOnly
          ? staticField(values.info || "Žádné informace", staticTextClassName)
          : (
            <textarea
              className={fieldClassName}
              value={values.info}
              onChange={(event) => onFieldChange("info", event.target.value)}
              onKeyDown={(event) => onFieldKeyDown(event, "textarea")}
              placeholder={infoPlaceholder}
              rows={5}
              disabled={disabled}
            />
          )}
      </label>
    </>
  );
};

export default FutureFunctionProfileFields;
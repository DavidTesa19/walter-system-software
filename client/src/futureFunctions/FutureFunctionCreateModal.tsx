import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FutureFunctionDraft } from "./futureFunction.interface";
import "./FutureFunctionCreateModal.css";

interface FutureFunctionCreateModalProps {
  open: boolean;
  initialValues: FutureFunctionDraft;
  priorityOptions: readonly string[];
  complexityOptions: readonly string[];
  phaseOptions: readonly string[];
  statusOptions: readonly string[];
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: FutureFunctionDraft) => Promise<void> | void;
}

const FutureFunctionCreateModal: React.FC<FutureFunctionCreateModalProps> = ({
  open,
  initialValues,
  priorityOptions,
  complexityOptions,
  phaseOptions,
  statusOptions,
  isSubmitting = false,
  onClose,
  onSubmit
}) => {
  const [draft, setDraft] = useState<FutureFunctionDraft>(initialValues);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleId = useMemo(() => "future-function-create-modal-title", []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(initialValues);
  }, [initialValues, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    const frame = window.requestAnimationFrame(() => {
      firstFieldRef.current?.focus();
      firstFieldRef.current?.select();
    });

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [onClose, open]);

  const updateField = useCallback(<K extends keyof FutureFunctionDraft>(key: K, value: FutureFunctionDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const focusField = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return;
    }

    element.focus();

    if (element instanceof HTMLInputElement && element.type !== "checkbox") {
      element.select();
    }

    if (element instanceof HTMLTextAreaElement) {
      element.select();
    }
  }, []);

  const getNavigableFields = useCallback(() => {
    if (!formRef.current) {
      return [];
    }

    return Array.from(
      formRef.current.querySelectorAll<HTMLElement>(".ff-create-nav-field:not(:disabled)")
    );
  }, []);

  const moveToAdjacentField = useCallback((current: HTMLElement, direction: 1 | -1) => {
    const fields = getNavigableFields();
    const currentIndex = fields.indexOf(current);

    if (currentIndex === -1) {
      return;
    }

    const nextField = fields[currentIndex + direction] ?? null;

    if (nextField) {
      focusField(nextField);
      return;
    }

    if (direction === 1) {
      const submitButton = formRef.current?.querySelector<HTMLElement>(".ff-create-primary:not(:disabled)") ?? null;
      focusField(submitButton);
    }
  }, [focusField, getNavigableFields]);

  const getNextOptionValue = useCallback((options: readonly string[], currentValue: string, direction: 1 | -1) => {
    const currentIndex = options.indexOf(currentValue);

    if (currentIndex === -1) {
      return options[0] ?? currentValue;
    }

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= options.length) {
      return currentValue;
    }

    return options[nextIndex] ?? currentValue;
  }, []);

  const handleFieldKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>, fieldType: "input" | "textarea" | "select" | "checkbox", options?: readonly string[], onSelectChange?: (nextValue: string) => void) => {
    const target = event.currentTarget;

    if (event.key === "Enter") {
      const shouldKeepNewLine = fieldType === "textarea" && event.shiftKey;

      if (!shouldKeepNewLine) {
        event.preventDefault();
        moveToAdjacentField(target, 1);
      }
      return;
    }

    if (fieldType === "select") {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (options && onSelectChange) {
          onSelectChange(getNextOptionValue(options, target instanceof HTMLSelectElement ? target.value : "", 1));
        }
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (options && onSelectChange) {
          onSelectChange(getNextOptionValue(options, target instanceof HTMLSelectElement ? target.value : "", -1));
        }
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveToAdjacentField(target, 1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveToAdjacentField(target, -1);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveToAdjacentField(target, 1);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveToAdjacentField(target, -1);
    }
  }, [getNextOptionValue, moveToAdjacentField]);

  const handleOverlayMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      alert("Název funkce je povinný.");
      return;
    }

    await onSubmit({
      ...draft,
      name: trimmedName,
      info: draft.info.trim()
    });
  }, [draft, onSubmit]);

  if (!open) {
    return null;
  }

  return (
    <div className="ff-create-overlay" onMouseDown={handleOverlayMouseDown} role="presentation">
      <div className="ff-create-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ff-create-header">
          <div>
            <span className="ff-create-kicker">Nová funkce</span>
            <h2 className="ff-create-title" id={titleId}>Vytvořit funkci</h2>
          </div>
          <button type="button" className="ff-create-close" onClick={onClose} disabled={isSubmitting} aria-label="Zavřít">
            ×
          </button>
        </div>

        <form ref={formRef} className="ff-create-form" onSubmit={handleSubmit}>
          <div className="ff-create-grid">
            <label className="ff-create-field ff-create-field-wide">
              <span>Název funkce</span>
              <input
                ref={firstFieldRef}
                className="ff-create-nav-field"
                type="text"
                value={draft.name}
                onChange={(event) => updateField("name", event.target.value)}
                onKeyDown={(event) => handleFieldKeyDown(event, "input")}
                placeholder="Např. Automatické schvalování"
                disabled={isSubmitting}
              />
            </label>

            <label className="ff-create-field">
              <span>Priorita</span>
              <select
                className="ff-create-nav-field"
                value={draft.priority}
                onChange={(event) => updateField("priority", event.target.value)}
                onKeyDown={(event) => handleFieldKeyDown(event, "select", priorityOptions, (nextValue) => updateField("priority", nextValue))}
                disabled={isSubmitting}
              >
                {priorityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="ff-create-field">
              <span>Komplexita</span>
              <select
                className="ff-create-nav-field"
                value={draft.complexity}
                onChange={(event) => updateField("complexity", event.target.value)}
                onKeyDown={(event) => handleFieldKeyDown(event, "select", complexityOptions, (nextValue) => updateField("complexity", nextValue))}
                disabled={isSubmitting}
              >
                {complexityOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="ff-create-field">
              <span>Časový plán</span>
              <select
                className="ff-create-nav-field"
                value={draft.phase}
                onChange={(event) => updateField("phase", event.target.value)}
                onKeyDown={(event) => handleFieldKeyDown(event, "select", phaseOptions, (nextValue) => updateField("phase", nextValue))}
                disabled={isSubmitting}
              >
                {phaseOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="ff-create-field">
              <span>Stav</span>
              <select
                className="ff-create-nav-field"
                value={draft.status}
                onChange={(event) => updateField("status", event.target.value)}
                onKeyDown={(event) => handleFieldKeyDown(event, "select", statusOptions, (nextValue) => updateField("status", nextValue))}
                disabled={isSubmitting}
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="ff-create-checkbox">
              <input
                className="ff-create-nav-field"
                type="checkbox"
                checked={draft.archived}
                onChange={(event) => updateField("archived", event.target.checked)}
                onKeyDown={(event) => handleFieldKeyDown(event, "checkbox")}
                disabled={isSubmitting}
              />
              <span>Vytvořit rovnou v archivu</span>
            </label>

            <label className="ff-create-field ff-create-field-wide">
              <span>Info</span>
              <textarea
                className="ff-create-nav-field"
                value={draft.info}
                onChange={(event) => updateField("info", event.target.value)}
                onKeyDown={(event) => handleFieldKeyDown(event, "textarea")}
                placeholder="Popis, očekávané chování, poznámky k implementaci..."
                rows={6}
                disabled={isSubmitting}
              />
            </label>
          </div>

          <div className="ff-create-actions">
            <button type="button" className="ff-create-secondary" onClick={onClose} disabled={isSubmitting}>
              Zrušit
            </button>
            <button type="submit" className="ff-create-primary" disabled={isSubmitting}>
              {isSubmitting ? "Vytvářím..." : "Vytvořit funkci"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FutureFunctionCreateModal;
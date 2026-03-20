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

        <form className="ff-create-form" onSubmit={handleSubmit}>
          <div className="ff-create-grid">
            <label className="ff-create-field ff-create-field-wide">
              <span>Název funkce</span>
              <input
                ref={firstFieldRef}
                type="text"
                value={draft.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Např. Automatické schvalování"
                disabled={isSubmitting}
              />
            </label>

            <label className="ff-create-field">
              <span>Priorita</span>
              <select
                value={draft.priority}
                onChange={(event) => updateField("priority", event.target.value)}
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
                value={draft.complexity}
                onChange={(event) => updateField("complexity", event.target.value)}
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
                value={draft.phase}
                onChange={(event) => updateField("phase", event.target.value)}
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
                value={draft.status}
                onChange={(event) => updateField("status", event.target.value)}
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
                type="checkbox"
                checked={draft.archived}
                onChange={(event) => updateField("archived", event.target.checked)}
                disabled={isSubmitting}
              />
              <span>Vytvořit rovnou v archivu</span>
            </label>

            <label className="ff-create-field ff-create-field-wide">
              <span>Info</span>
              <textarea
                value={draft.info}
                onChange={(event) => updateField("info", event.target.value)}
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
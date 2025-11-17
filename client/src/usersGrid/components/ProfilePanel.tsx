import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { ProfileBadge, ProfileDocument, ProfileSection } from "../types/profile";
import "./ProfilePanel.css";

interface ProfileMetaItem {
  label: string;
  value: string;
}

interface ProfilePanelProps {
  open: boolean;
  entityLabel: string;
  title: string;
  subtitle?: string | null;
  badge?: ProfileBadge | null;
  meta?: ProfileMetaItem[];
  sections: ProfileSection[];
  documents?: ProfileDocument[];
  documentsLoading?: boolean;
  documentsUploading?: boolean;
  onUploadDocument?: (file: File) => Promise<void> | void;
  onDeleteDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  documentDownloadBaseUrl?: string;
  onClose: () => void;
}

const isValueEmpty = (value: React.ReactNode) => {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  return false;
};

const ProfilePanel: React.FC<ProfilePanelProps> = ({
  open,
  entityLabel,
  title,
  subtitle,
  badge,
  meta,
  sections,
  documents,
  documentsLoading = false,
  documentsUploading = false,
  onUploadDocument,
  onDeleteDocument,
  documentDownloadBaseUrl,
  onClose
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visibleSections = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        fields: section.fields.filter((field) => field.always || !isValueEmpty(field.value))
      }))
      .filter((section) => section.fields.length > 0);
  }, [sections]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!onUploadDocument) {
        return;
      }
      const file = event.target.files?.[0];
      if (file) {
        onUploadDocument(file);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onUploadDocument]
  );

  const handleDeleteDocument = useCallback(
    (documentId: number, filename: string) => {
      if (!onDeleteDocument) {
        return;
      }
      const confirmed = window.confirm(`Opravdu chcete odstranit dokument \"${filename}\"? Tuto akci nelze vrátit.`);
      if (!confirmed) {
        return;
      }
      onDeleteDocument(documentId);
    },
    [onDeleteDocument]
  );

  const showDocumentsSection = Boolean(
    onUploadDocument ||
    onDeleteDocument ||
    documentsLoading ||
    (documents && documents.length > 0)
  );

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

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !panelRef.current) {
      return;
    }

    const firstInteractive = panelRef.current.querySelector<HTMLElement>("button, a, input, textarea, select");
    firstInteractive?.focus();
  }, [open]);

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="profile-overlay" onMouseDown={handleOverlayMouseDown} role="presentation">
      <div className="profile-panel" ref={panelRef} role="dialog" aria-modal="true">
        <header className="profile-panel__header">
          <div className="profile-panel__header-text">
            <p className="profile-panel__entity">{entityLabel}</p>
            <h2 className="profile-panel__title">{title}</h2>
            {subtitle ? <p className="profile-panel__subtitle">{subtitle}</p> : null}
            {badge ? <span className={`profile-badge profile-badge--${badge.tone}`}>{badge.text}</span> : null}
            {meta && meta.length > 0 ? (
              <dl className="profile-panel__meta">
                {meta.map((item) => (
                  <div key={`${item.label}-${item.value}`} className="profile-panel__meta-item">
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
          <button type="button" className="profile-panel__close" onClick={onClose} aria-label="Zavřít profil">
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M4 4L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="profile-panel__body">
          {visibleSections.length === 0 ? (
            <p className="profile-panel__empty">Pro tento profil zatím nejsou žádné detaily.</p>
          ) : (
            visibleSections.map((section) => (
              <section key={section.title} className="profile-section">
                <h3 className="profile-section__title">{section.title}</h3>
                <div className="profile-section__fields">
                  {section.fields.map((field) => (
                    <div key={field.label} className={`profile-field${field.isMultiline ? " profile-field--multiline" : ""}`}>
                      <span className="profile-field__label">{field.label}</span>
                      <span className="profile-field__value">{field.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}

          {showDocumentsSection ? (
            <section className="profile-section profile-documents">
              <div className="profile-documents__header">
                <h3 className="profile-section__title">Dokumenty</h3>
                {onUploadDocument ? (
                  <label className="profile-documents__upload">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileChange}
                      disabled={documentsUploading}
                    />
                    <span>{documentsUploading ? "Nahrávám..." : "Přidat dokument"}</span>
                  </label>
                ) : null}
              </div>

              {documentsLoading ? (
                <p className="profile-panel__empty">Načítám dokumenty…</p>
              ) : documents && documents.length > 0 ? (
                <ul className="profile-documents__list">
                  {documents.map((doc) => {
                    const downloadHref = documentDownloadBaseUrl
                      ? `${documentDownloadBaseUrl.replace(/\/$/, "")}/${doc.id}/download`
                      : undefined;
                    return (
                      <li key={doc.id} className="profile-document">
                        <div className="profile-document__meta">
                          <span className="profile-document__name">{doc.filename}</span>
                          <span className="profile-document__details">
                            {formatFileSize(doc.sizeBytes)} · {formatDocumentDate(doc.createdAt)}
                          </span>
                        </div>
                        <div className="profile-document__actions">
                          {downloadHref ? (
                            <a
                              className="profile-document__action"
                              href={downloadHref}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Stáhnout
                            </a>
                          ) : null}
                          {onDeleteDocument ? (
                            <button
                              type="button"
                              className="profile-document__action profile-document__action--danger"
                              onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                            >
                              Odstranit
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="profile-panel__empty">Žádné dokumenty zatím nebyly přidány.</p>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ProfilePanel;
export type { ProfileBadge, ProfileSection } from "../types/profile";
export type { ProfileBadgeTone, ProfileField } from "../types/profile";

function formatFileSize(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) {
    return "0 B";
  }
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let u = -1;
  let value = bytes;
  do {
    value /= thresh;
    u += 1;
  } while (Math.abs(value) >= thresh && u < units.length - 1);
  return `${value.toFixed(1)} ${units[u]}`;
}

function formatDocumentDate(value?: string) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("cs-CZ", { year: "numeric", month: "2-digit", day: "2-digit" });
}

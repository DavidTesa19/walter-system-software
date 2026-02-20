import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProfileDocument, ProfileNote } from "../types/profile";
import "./EntityCommissionProfilePanel.css";

// =============================================================================
// TYPES
// =============================================================================

export interface EditableField {
  key: string;
  label: string;
  value: string | boolean | null;
  type: 'text' | 'textarea' | 'select' | 'boolean' | 'date';
  options?: string[];  // For select type
  isMultiline?: boolean;
  placeholder?: string;
}

export interface FieldGroup {
  title: string;
  fields: EditableField[];
  color?: 'purple' | 'green' | 'orange' | 'gray';
}

export interface EntityData {
  id: number;
  entity_id: string;
  groups: FieldGroup[];
}

export interface CommissionData {
  id: number;
  commission_id: string;
  status: string;
  groups: FieldGroup[];
}

interface EntityCommissionProfilePanelProps {
  open: boolean;
  entityType: 'partner' | 'client' | 'tiper';
  entityLabel: string;
  entity: EntityData | null;
  commission: CommissionData | null;
  
  // Callbacks
  onClose: () => void;
  onUpdateEntity?: (entityId: number, updates: Record<string, unknown>) => Promise<void> | void;
  onUpdateCommission?: (commissionId: number, updates: Record<string, unknown>) => Promise<void> | void;
  
  // Documents
  documents?: ProfileDocument[];
  documentsLoading?: boolean;
  documentsUploading?: boolean;
  onUploadDocument?: (file: File) => Promise<void> | void;
  onDeleteDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  onArchiveDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  documentDownloadBaseUrl?: string;
  
  // Notes
  notes?: ProfileNote[];
  notesLoading?: boolean;
  notesCreating?: boolean;
  onAddNote?: (content: string) => Promise<void> | void;
  onDeleteNote?: (noteId: number) => Promise<boolean | void> | boolean | void;
}

// =============================================================================
// EDITABLE FIELD COMPONENT
// =============================================================================

interface EditableFieldCellProps {
  field: EditableField;
  onSave: (key: string, value: string | boolean | null) => void;
}

const EditableFieldCell: React.FC<EditableFieldCellProps> = ({ field, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>(
    field.value === null || field.value === undefined 
      ? '' 
      : field.type === 'boolean' 
        ? (field.value ? 'true' : 'false')
        : String(field.value)
  );
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(
      field.value === null || field.value === undefined 
        ? '' 
        : field.type === 'boolean' 
          ? (field.value ? 'true' : 'false')
          : String(field.value)
    );
  };

  const handleSave = () => {
    setIsEditing(false);
    let finalValue: string | boolean | null = editValue.trim() || null;
    
    if (field.type === 'boolean') {
      finalValue = editValue === 'true';
    }
    
    if (finalValue !== field.value) {
      onSave(field.key, finalValue);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue(
      field.value === null || field.value === undefined 
        ? '' 
        : String(field.value)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const displayValue = useMemo(() => {
    if (field.value === null || field.value === undefined || field.value === '') {
      return <span className="field-empty">—</span>;
    }
    if (field.type === 'boolean') {
      return field.value ? 'Ano' : 'Ne';
    }
    return String(field.value);
  }, [field.value, field.type]);

  if (isEditing) {
    if (field.type === 'textarea') {
      return (
        <div className="editable-field editing">
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className="editable-input textarea"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={field.placeholder || field.label}
            rows={3}
          />
        </div>
      );
    }

    if (field.type === 'select' && field.options) {
      return (
        <div className="editable-field editing">
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            className="editable-input select"
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              // Auto-save on select change
              setTimeout(() => handleSave(), 0);
            }}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
          >
            <option value="">— Vyberte —</option>
            {field.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'boolean') {
      return (
        <div className="editable-field editing">
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            className="editable-input select"
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setTimeout(() => handleSave(), 0);
            }}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
          >
            <option value="false">Ne</option>
            <option value="true">Ano</option>
          </select>
        </div>
      );
    }

    if (field.type === 'date') {
      return (
        <div className="editable-field editing">
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="date"
            className="editable-input date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
          />
        </div>
      );
    }

    return (
      <div className="editable-field editing">
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          className="editable-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={field.placeholder || field.label}
        />
      </div>
    );
  }

  return (
    <div 
      className="editable-field readonly"
      onClick={handleStartEdit}
      title="Kliknutím upravit"
    >
      <span className="field-value">{displayValue}</span>
      <span className="edit-icon">✎</span>
    </div>
  );
};

// =============================================================================
// FIELD GROUP COMPONENT
// =============================================================================

interface FieldGroupComponentProps {
  group: FieldGroup;
  onSave: (key: string, value: string | boolean | null) => void;
}

const FieldGroupComponent: React.FC<FieldGroupComponentProps> = ({ group, onSave }) => {
  const colorClass = group.color ? `group-${group.color}` : '';
  
  return (
    <div className={`field-group ${colorClass}`}>
      <h4 className="field-group-title">{group.title}</h4>
      <div className="field-group-content">
        {group.fields.map(field => (
          <div key={field.key} className={`field-row ${field.isMultiline ? 'multiline' : ''}`}>
            <label className="field-label">{field.label}</label>
            <EditableFieldCell field={field} onSave={onSave} />
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const EntityCommissionProfilePanel: React.FC<EntityCommissionProfilePanelProps> = ({
  open,
  entityType,
  entityLabel,
  entity,
  commission,
  onClose,
  onUpdateEntity,
  onUpdateCommission,
  documents,
  documentsLoading = false,
  documentsUploading = false,
  onUploadDocument,
  onDeleteDocument,
  onArchiveDocument,
  documentDownloadBaseUrl,
  notes,
  notesLoading = false,
  notesCreating = false,
  onAddNote,
  onDeleteNote
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newNote, setNewNote] = useState("");

  // Entity type labels
  const entityTypeLabels = {
    partner: 'Partner',
    client: 'Klient',
    tiper: 'Tipař'
  };

  const handleEntityFieldSave = useCallback((key: string, value: string | boolean | null) => {
    if (entity && onUpdateEntity) {
      onUpdateEntity(entity.id, { [key]: value });
    }
  }, [entity, onUpdateEntity]);

  const handleCommissionFieldSave = useCallback((key: string, value: string | boolean | null) => {
    if (commission && onUpdateCommission) {
      onUpdateCommission(commission.id, { [key]: value });
    }
  }, [commission, onUpdateCommission]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!onUploadDocument) return;
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
      if (!onDeleteDocument) return;
      const confirmed = window.confirm(`Opravdu chcete odstranit dokument "${filename}"?`);
      if (!confirmed) return;
      onDeleteDocument(documentId);
    },
    [onDeleteDocument]
  );

  const handleArchiveDocument = useCallback(
    (documentId: number, filename: string) => {
      if (!onArchiveDocument) return;
      const confirmed = window.confirm(`Opravdu chcete archivovat dokument "${filename}"?`);
      if (!confirmed) return;
      onArchiveDocument(documentId);
    },
    [onArchiveDocument]
  );

  const handleAddNote = useCallback(() => {
    if (!onAddNote || !newNote.trim()) return;
    onAddNote(newNote);
    setNewNote("");
  }, [onAddNote, newNote]);

  const handleDeleteNote = useCallback(
    (noteId: number) => {
      if (!onDeleteNote) return;
      const confirmed = window.confirm("Opravdu chcete smazat tuto poznámku?");
      if (!confirmed) return;
      onDeleteNote(noteId);
    },
    [onDeleteNote]
  );

  // Keyboard handling
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

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!open || !entity || !commission) {
    return null;
  }

  const showDocumentsSection = Boolean(
    onUploadDocument || onDeleteDocument || onArchiveDocument || documentsLoading || (documents && documents.length > 0)
  );

  return (
    <div className="ec-profile-overlay" onMouseDown={handleOverlayMouseDown} role="presentation">
      <div className="ec-profile-panel" ref={panelRef} role="dialog" aria-modal="true">
        
        {/* Header */}
        <header className="ec-profile-header">
          <div className="ec-profile-header-info">
            <span className="ec-profile-type">{entityTypeLabels[entityType]}</span>
            <h2 className="ec-profile-title">{entityLabel}</h2>
            <div className="ec-profile-ids">
              <span className="ec-id-badge entity">{entity.entity_id}</span>
              <span className="ec-id-separator">→</span>
              <span className="ec-id-badge commission">{commission.commission_id}</span>
              <span className={`ec-status-badge ${commission.status}`}>
                {commission.status === 'accepted' ? 'Schváleno' : 
                 commission.status === 'pending' ? 'Čeká na schválení' : 'Archivováno'}
              </span>
            </div>
          </div>
          <button 
            type="button" 
            className="ec-profile-close" 
            onClick={onClose}
            aria-label="Zavřít"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* Main Content */}
        <div className="ec-profile-body">
          {/* Left Column: Entity + Commission Info */}
          <div className="ec-profile-main">
            <div className="ec-profile-columns">
              
              {/* Entity Info Column */}
              <div className="ec-profile-column entity-column">
                <div className="ec-column-header">
                  <h3 className="ec-column-title">{entityTypeLabels[entityType]}</h3>
                  <span className="ec-column-id">{entity.entity_id}</span>
                </div>
                <div className="ec-column-content">
                  {entity.groups.map((group, idx) => (
                    <FieldGroupComponent
                      key={`entity-${idx}`}
                      group={group}
                      onSave={handleEntityFieldSave}
                    />
                  ))}
                </div>
              </div>

              {/* Commission Info Column */}
              <div className="ec-profile-column commission-column">
                <div className="ec-column-header">
                  <h3 className="ec-column-title">Zakázka</h3>
                  <span className="ec-column-id">{commission.commission_id}</span>
                </div>
                <div className="ec-column-content">
                  {commission.groups.map((group, idx) => (
                    <FieldGroupComponent
                      key={`commission-${idx}`}
                      group={group}
                      onSave={handleCommissionFieldSave}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Documents Section */}
            {showDocumentsSection && (
              <section className="ec-documents-section">
                <div className="ec-documents-header">
                  <h3 className="ec-section-title">Dokumenty</h3>
                  {onUploadDocument && (
                    <label className="ec-upload-btn">
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileChange}
                        disabled={documentsUploading}
                      />
                      <span>{documentsUploading ? "Nahrávám..." : "+ Přidat"}</span>
                    </label>
                  )}
                </div>

                {documentsLoading ? (
                  <p className="ec-empty-text">Načítám dokumenty…</p>
                ) : documents && documents.length > 0 ? (
                  <ul className="ec-documents-list">
                    {documents.map((doc) => {
                      const downloadHref = documentDownloadBaseUrl
                        ? `${documentDownloadBaseUrl.replace(/\/$/, "")}/${doc.id}/download`
                        : undefined;
                      return (
                        <li key={doc.id} className="ec-document-item">
                          <div className="ec-document-info">
                            <span className="ec-document-name">{doc.filename}</span>
                            <span className="ec-document-meta">
                              {formatFileSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                            </span>
                          </div>
                          <div className="ec-document-actions">
                            {downloadHref && (
                              <a className="ec-doc-action" href={downloadHref} target="_blank" rel="noreferrer">
                                Stáhnout
                              </a>
                            )}
                            {onArchiveDocument && (
                              <button
                                type="button"
                                className="ec-doc-action archive"
                                onClick={() => handleArchiveDocument(doc.id, doc.filename)}
                              >
                                Archivovat
                              </button>
                            )}
                            {onDeleteDocument && (
                              <button
                                type="button"
                                className="ec-doc-action danger"
                                onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                              >
                                Odstranit
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="ec-empty-text">Žádné dokumenty.</p>
                )}
              </section>
            )}
          </div>

          {/* Right Column: Notes */}
          {(onAddNote || (notes && notes.length > 0)) && (
            <div className="ec-profile-sidebar">
              <div className="ec-sidebar-header">
                <h3 className="ec-section-title">Poznámky</h3>
              </div>
              
              <div className="ec-notes-list">
                {notesLoading ? (
                  <p className="ec-empty-text">Načítám poznámky...</p>
                ) : notes && notes.length > 0 ? (
                  notes.map(note => (
                    <div key={note.id} className="ec-note-item">
                      <div className="ec-note-header">
                        <span className="ec-note-author">{note.author}</span>
                        <span className="ec-note-date">{formatDate(note.createdAt)}</span>
                        {onDeleteNote && (
                          <button 
                            className="ec-note-delete"
                            onClick={() => handleDeleteNote(note.id)}
                            title="Smazat"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <div className="ec-note-content">{note.content}</div>
                    </div>
                  ))
                ) : (
                  <p className="ec-empty-text">Žádné poznámky.</p>
                )}
              </div>

              {onAddNote && (
                <div className="ec-notes-input">
                  <textarea
                    className="ec-notes-textarea"
                    placeholder="Napsat poznámku..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddNote();
                      }
                    }}
                    disabled={notesCreating}
                  />
                  <button 
                    className="ec-notes-submit"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || notesCreating}
                  >
                    {notesCreating ? "..." : "Odeslat"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// UTILITIES
// =============================================================================

function formatFileSize(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "0 B";
  const thresh = 1024;
  if (Math.abs(bytes) < thresh) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let u = -1;
  let value = bytes;
  do {
    value /= thresh;
    u += 1;
  } while (Math.abs(value) >= thresh && u < units.length - 1);
  return `${value.toFixed(1)} ${units[u]}`;
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("cs-CZ", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default EntityCommissionProfilePanel;

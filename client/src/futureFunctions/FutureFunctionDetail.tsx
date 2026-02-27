import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiGet, apiPost, apiDelete, apiUpload, apiDownload, apiGetBlob } from "../utils/api";
import DocumentViewerModal from "../components/DocumentViewerModal";
import type { FutureFunction } from "./FutureFunctionsGrid";
import "./FutureFunctionDetail.css";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface Note {
  id: number;
  entityType: string;
  entityId: number;
  content: string;
  author: string;
  createdAt: string;
  attachments?: Attachment[];
}

interface Attachment {
  id: number;
  entityType: string;
  entityId: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  archivedAt: string | null;
  noteId?: number | null;
}

interface FutureFunctionDetailProps {
  func: FutureFunction;
  onClose: () => void;
  onUpdate?: () => void;
  readOnly?: boolean;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const STATUS_COLORS: Record<string, string> = {
  Plánováno: "#3b82f6",
  Probíhá: "#f59e0b",
  "Ke kontrole": "#a855f7",
  Dokončeno: "#22c55e",
  Neschváleno: "#ef4444",
  Odloženo: "#6b7280",
  Zrušeno: "#dc2626",
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImage = (mime: string) => mime.startsWith("image/");
const isVideo = (mime: string) => mime.startsWith("video/");

const ENTITY = "future-functions";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const FutureFunctionDetail: React.FC<FutureFunctionDetailProps> = ({
  func,
  onClose,
  onUpdate,
  readOnly,
}) => {
  const [activeTab, setActiveTab] = useState<"notes" | "attachments">("notes");

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [pendingNoteFiles, setPendingNoteFiles] = useState<File[]>([]);
  const [noteSending, setNoteSending] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pasteToast, setPasteToast] = useState(false);

  // Document viewer
  const [viewingDoc, setViewingDoc] = useState<{
    id: number;
    filename: string;
  } | null>(null);

  // Thumbnail cache: attachmentId → blobUrl
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteFileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  /* ---- Data fetching ---- */

  const fetchNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const data = await apiGet<Note[]>(`/${ENTITY}/${func.id}/notes`);
      setNotes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching notes:", err);
    } finally {
      setNotesLoading(false);
    }
  }, [func.id]);

  const fetchAttachments = useCallback(async () => {
    setAttachmentsLoading(true);
    try {
      const data = await apiGet<Attachment[]>(
        `/${ENTITY}/${func.id}/documents`
      );
      setAttachments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching attachments:", err);
    } finally {
      setAttachmentsLoading(false);
    }
  }, [func.id]);

  // General attachments = those NOT linked to a note
  const generalAttachments = attachments.filter((a) => !a.noteId);

  useEffect(() => {
    void fetchNotes();
    void fetchAttachments();
  }, [fetchNotes, fetchAttachments]);

  /* ---- Load thumbnails for image/video attachments ---- */

  useEffect(() => {
    // Collect all attachment IDs from both general attachments and note attachments
    const allAttachments = [
      ...attachments,
      ...notes.flatMap((n) => n.attachments || []),
    ];

    const newThumbs: number[] = [];
    for (const att of allAttachments) {
      if (
        (isImage(att.mimeType) || isVideo(att.mimeType)) &&
        !thumbnails[att.id]
      ) {
        newThumbs.push(att.id);
      }
    }
    if (newThumbs.length === 0) return;

    let cancelled = false;

    const loadThumbs = async () => {
      const results: Record<number, string> = {};
      for (const id of newThumbs) {
        if (cancelled) break;
        try {
          const blob = await apiGetBlob(`/documents/${id}/download`);
          results[id] = URL.createObjectURL(blob);
        } catch {
          // skip
        }
      }
      if (!cancelled) {
        setThumbnails((prev) => ({ ...prev, ...results }));
      }
    };

    void loadThumbs();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments, notes]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(thumbnails).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Notes CRUD ---- */

  const handleAddNote = useCallback(async () => {
    if (!noteText.trim() && pendingNoteFiles.length === 0) return;
    setNoteSending(true);
    try {
      // 1. Create the note (content can be empty if only files)
      const created = await apiPost<Note>(`/${ENTITY}/${func.id}/notes`, {
        content: (noteText.trim() || (pendingNoteFiles.length > 0 ? "📎 Příloha" : "")),
      });

      // 2. Upload pending files linked to this note
      if (pendingNoteFiles.length > 0 && created?.id) {
        for (const file of pendingNoteFiles) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("noteId", String(created.id));
          await apiUpload(`/${ENTITY}/${func.id}/documents`, formData);
        }
      }

      setNoteText("");
      setPendingNoteFiles([]);
      await fetchNotes();
      await fetchAttachments();
    } catch (err) {
      console.error("Error adding note:", err);
      alert("Nepodařilo se přidat poznámku");
    } finally {
      setNoteSending(false);
    }
  }, [noteText, pendingNoteFiles, func.id, fetchNotes, fetchAttachments]);

  const handleDeleteNote = useCallback(
    async (noteId: number) => {
      if (!confirm("Smazat tuto poznámku?")) return;
      try {
        await apiDelete(`/notes/${noteId}`);
        await fetchNotes();
      } catch (err) {
        console.error("Error deleting note:", err);
        alert("Nepodařilo se smazat poznámku");
      }
    },
    [fetchNotes]
  );

  /* ---- Note file staging ---- */

  const handleNoteFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        setPendingNoteFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
        e.target.value = "";
      }
    },
    []
  );

  const removePendingFile = useCallback((index: number) => {
    setPendingNoteFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /* ---- File upload ---- */

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          await apiUpload(`/${ENTITY}/${func.id}/documents`, formData);
        }
        await fetchAttachments();
        onUpdate?.();
      } catch (err) {
        console.error("Error uploading file:", err);
        alert("Nepodařilo se nahrát soubor");
      } finally {
        setUploading(false);
      }
    },
    [func.id, fetchAttachments, onUpdate]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        void uploadFiles(Array.from(e.target.files));
        e.target.value = "";
      }
    },
    [uploadFiles]
  );

  /* ---- Drag & drop ---- */

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setDragging(false);

      if (e.dataTransfer.files?.length) {
        if (activeTab === "notes") {
          setPendingNoteFiles((prev) => [
            ...prev,
            ...Array.from(e.dataTransfer.files),
          ]);
        } else {
          void uploadFiles(Array.from(e.dataTransfer.files));
        }
      }
    },
    [uploadFiles, activeTab]
  );

  /* ---- Clipboard paste ---- */

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            // Give pasted images a descriptive filename
            const ext = file.type.split("/")[1] || "png";
            const name = `paste-${Date.now()}.${ext}`;
            const renamedFile = new File([file], name, { type: file.type });
            files.push(renamedFile);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        if (activeTab === "notes") {
          // Stage files for the current note message
          setPendingNoteFiles((prev) => [...prev, ...files]);
          setPasteToast(true);
          setTimeout(() => setPasteToast(false), 2000);
        } else {
          // Upload directly to general attachments
          setPasteToast(true);
          setTimeout(() => setPasteToast(false), 2000);
          void uploadFiles(files);
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [uploadFiles, activeTab]);

  /* ---- Delete attachment ---- */

  const handleDeleteAttachment = useCallback(
    async (docId: number) => {
      if (!confirm("Smazat tento soubor?")) return;
      try {
        await apiDelete(`/documents/${docId}`);
        // Revoke thumbnail blob url if exists
        if (thumbnails[docId]) {
          URL.revokeObjectURL(thumbnails[docId]);
          setThumbnails((prev) => {
            const copy = { ...prev };
            delete copy[docId];
            return copy;
          });
        }
        await fetchAttachments();
      } catch (err) {
        console.error("Error deleting attachment:", err);
        alert("Nepodařilo se smazat soubor");
      }
    },
    [fetchAttachments, thumbnails]
  );

  /* ---- Download attachment ---- */

  const handleDownload = useCallback((att: Attachment) => {
    void apiDownload(`/documents/${att.id}/download`, att.filename);
  }, []);

  /* ---- Escape key ---- */

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !viewingDoc) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, viewingDoc]);

  /* ---- File icon helper ---- */

  const getFileIcon = (mime: string, filename: string) => {
    if (isImage(mime)) return "🖼️";
    if (isVideo(mime)) return "🎬";
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "📕";
    if (["doc", "docx"].includes(ext)) return "📄";
    if (["xls", "xlsx"].includes(ext)) return "📊";
    if (["ppt", "pptx"].includes(ext)) return "📽️";
    if (["zip", "rar", "7z"].includes(ext)) return "📦";
    return "📎";
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const statusColor = STATUS_COLORS[func.status] ?? "#888";

  return (
    <>
      <div className="ff-detail-overlay" onClick={onClose}>
        <div
          className="ff-detail-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="ff-detail-header">
            <div className="ff-detail-header-left">
              <span className="ff-detail-id">#{func.id}</span>
              <h2 className="ff-detail-title">{func.name}</h2>
            </div>
            <button
              className="ff-detail-close"
              onClick={onClose}
              title="Zavřít"
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div className="ff-detail-body">
            {/* Left panel: Info */}
            <div className="ff-detail-info-panel">
              <h3 className="ff-info-section-title">Přehled</h3>
              <div className="ff-info-grid">
                <div className="ff-info-item">
                  <span className="ff-info-label">Stav</span>
                  <div className="ff-info-value">
                    <span className="ff-status-badge">
                      <span
                        className="ff-status-dot"
                        style={{ backgroundColor: statusColor }}
                      />
                      {func.status}
                    </span>
                  </div>
                </div>

                <div className="ff-info-item">
                  <span className="ff-info-label">Priorita</span>
                  <div className="ff-info-value">{func.priority || "—"}</div>
                </div>

                <div className="ff-info-item">
                  <span className="ff-info-label">Komplexita</span>
                  <div className="ff-info-value">
                    {func.complexity || "—"}
                  </div>
                </div>

                <div className="ff-info-item">
                  <span className="ff-info-label">Časový plán</span>
                  <div className="ff-info-value">{func.phase || "—"}</div>
                </div>

                <div className="ff-info-item">
                  <span className="ff-info-label">Datum dokončení</span>
                  <div className="ff-info-value">
                    {func.completedAt || "—"}
                  </div>
                </div>

                <div className="ff-info-item">
                  <span className="ff-info-label">Archivováno</span>
                  <div className="ff-info-value">
                    {func.archived ? "Ano" : "Ne"}
                  </div>
                </div>

                <div className="ff-info-item">
                  <span className="ff-info-label">Popis / Info</span>
                  <div className="ff-info-value info-text">
                    {func.info || "Žádné informace"}
                  </div>
                </div>
              </div>
            </div>

            {/* Right panel: Notes + Attachments */}
            <div className="ff-detail-content-panel">
              <div className="ff-content-tabs">
                <button
                  type="button"
                  className={`ff-content-tab${activeTab === "notes" ? " active" : ""}`}
                  onClick={() => setActiveTab("notes")}
                >
                  📝 Poznámky
                  {notes.length > 0 && ` (${notes.length})`}
                </button>
                <button
                  type="button"
                  className={`ff-content-tab${activeTab === "attachments" ? " active" : ""}`}
                  onClick={() => setActiveTab("attachments")}
                >
                  📎 Přílohy
                  {generalAttachments.length > 0 && ` (${generalAttachments.length})`}
                </button>
              </div>

              <div className="ff-content-body">
                {/* ======== Notes Tab ======== */}
                {activeTab === "notes" && (
                  <>
                    {!readOnly && (
                    <div
                      className="ff-notes-input-area"
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <div className="ff-notes-input-row">
                        <textarea
                          placeholder="Napište poznámku nebo aktualizaci..."
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void handleAddNote();
                            }
                          }}
                        />
                        <div className="ff-notes-input-actions">
                          <button
                            type="button"
                            className="ff-note-attach-btn"
                            onClick={() => noteFileInputRef.current?.click()}
                            title="Přiložit soubor"
                          >
                            📎
                          </button>
                          <button
                            type="button"
                            className="ff-note-submit-btn"
                            onClick={() => void handleAddNote()}
                            disabled={
                              (!noteText.trim() && pendingNoteFiles.length === 0) ||
                              noteSending
                            }
                          >
                            {noteSending ? "Odesílám..." : "Přidat"}
                          </button>
                        </div>
                        <input
                          ref={noteFileInputRef}
                          type="file"
                          className="ff-upload-input"
                          multiple
                          onChange={handleNoteFileSelect}
                        />
                      </div>

                      {/* Staged files preview */}
                      {pendingNoteFiles.length > 0 && (
                        <div className="ff-pending-files">
                          {pendingNoteFiles.map((file, idx) => (
                            <div key={idx} className="ff-pending-file-chip">
                              <span className="ff-pending-file-icon">
                                {getFileIcon(file.type, file.name)}
                              </span>
                              <span className="ff-pending-file-name">
                                {file.name}
                              </span>
                              <button
                                type="button"
                                className="ff-pending-file-remove"
                                onClick={() => removePendingFile(idx)}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {dragging && (
                        <div className="ff-notes-drop-overlay">
                          📂 Přetáhněte soubory sem
                        </div>
                      )}
                    </div>
                    )}

                    {notesLoading ? (
                      <p className="ff-notes-empty">Načítám...</p>
                    ) : notes.length === 0 ? (
                      <p className="ff-notes-empty">
                        Zatím žádné poznámky. Přidejte první poznámku výše.
                      </p>
                    ) : (
                      <div className="ff-notes-list">
                        {notes.map((note) => (
                          <div key={note.id} className="ff-note-card">
                            <div className="ff-note-meta">
                              <span className="ff-note-author">
                                {note.author}
                              </span>
                              <span className="ff-note-date">
                                {formatDate(note.createdAt)}
                              </span>
                            </div>
                            <p className="ff-note-content">{note.content}</p>

                            {/* Inline note attachments */}
                            {note.attachments && note.attachments.length > 0 && (
                              <div className="ff-note-attachments">
                                {note.attachments.map((att) => (
                                  <div
                                    key={att.id}
                                    className="ff-note-attachment-item"
                                  >
                                    {isImage(att.mimeType) &&
                                    thumbnails[att.id] ? (
                                      <img
                                        src={thumbnails[att.id]}
                                        alt={att.filename}
                                        className="ff-note-attachment-img"
                                        onClick={() =>
                                          setViewingDoc({
                                            id: att.id,
                                            filename: att.filename,
                                          })
                                        }
                                      />
                                    ) : isVideo(att.mimeType) &&
                                      thumbnails[att.id] ? (
                                      <video
                                        src={thumbnails[att.id]}
                                        className="ff-note-attachment-video"
                                        controls
                                        muted
                                      />
                                    ) : (
                                      <div
                                        className="ff-note-attachment-file"
                                        onClick={() =>
                                          setViewingDoc({
                                            id: att.id,
                                            filename: att.filename,
                                          })
                                        }
                                      >
                                        <span className="ff-note-attachment-file-icon">
                                          {getFileIcon(att.mimeType, att.filename)}
                                        </span>
                                        <span className="ff-note-attachment-file-name">
                                          {att.filename}
                                        </span>
                                        <span className="ff-note-attachment-file-size">
                                          {formatSize(att.sizeBytes)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {!readOnly && (
                            <button
                              type="button"
                              className="ff-note-delete"
                              onClick={() => void handleDeleteNote(note.id)}
                              title="Smazat poznámku"
                            >
                              ×
                            </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* ======== Attachments Tab ======== */}
                {activeTab === "attachments" && (
                  <>
                    {!readOnly && (
                    <div
                      className="ff-attachments-upload-area"
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <div
                        className={`ff-upload-zone${dragging ? " dragging" : ""}`}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <div className="ff-upload-icon">📂</div>
                        <p className="ff-upload-text">
                          Přetáhněte soubory sem nebo{" "}
                          <strong>klikněte pro výběr</strong>
                        </p>
                        <p className="ff-upload-hint">
                          Obrázky, videa, PDF, Word a další • Ctrl+V pro
                          vložení ze schránky
                        </p>
                        {uploading && (
                          <p className="ff-upload-hint" style={{ color: "var(--color-primary)" }}>
                            Nahrávám...
                          </p>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="ff-upload-input"
                        multiple
                        onChange={handleFileSelect}
                      />
                    </div>
                    )}

                    {attachmentsLoading ? (
                      <p className="ff-attachments-empty">Načítám...</p>
                    ) : generalAttachments.length === 0 ? (
                      <p className="ff-attachments-empty">
                        Zatím žádné přílohy. Přidejte soubory výše nebo
                        vložte ze schránky (Ctrl+V).
                      </p>
                    ) : (
                      <div className="ff-attachments-grid">
                        {generalAttachments.map((att) => (
                          <div key={att.id} className="ff-attachment-card">
                            {!readOnly && (
                            <button
                              type="button"
                              className="ff-attachment-delete-btn"
                              onClick={() =>
                                void handleDeleteAttachment(att.id)
                              }
                              title="Smazat"
                            >
                              ×
                            </button>
                            )}

                            <div
                              className="ff-attachment-preview"
                              onClick={() =>
                                setViewingDoc({
                                  id: att.id,
                                  filename: att.filename,
                                })
                              }
                            >
                              {isImage(att.mimeType) &&
                              thumbnails[att.id] ? (
                                <img
                                  src={thumbnails[att.id]}
                                  alt={att.filename}
                                />
                              ) : isVideo(att.mimeType) &&
                                thumbnails[att.id] ? (
                                <video src={thumbnails[att.id]} muted />
                              ) : (
                                <span className="ff-attachment-file-icon">
                                  {getFileIcon(att.mimeType, att.filename)}
                                </span>
                              )}
                            </div>

                            <div className="ff-attachment-info">
                              <span
                                className="ff-attachment-name"
                                title={att.filename}
                              >
                                {att.filename}
                              </span>
                              <span className="ff-attachment-meta">
                                <span>{formatSize(att.sizeBytes)}</span>
                                <span>{formatDate(att.createdAt)}</span>
                              </span>
                            </div>

                            <div className="ff-attachment-actions">
                              <button
                                type="button"
                                className="ff-attachment-action-btn"
                                onClick={() =>
                                  setViewingDoc({
                                    id: att.id,
                                    filename: att.filename,
                                  })
                                }
                              >
                                Zobrazit
                              </button>
                              <button
                                type="button"
                                className="ff-attachment-action-btn"
                                onClick={() => handleDownload(att)}
                              >
                                Stáhnout
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Paste toast */}
      {pasteToast && (
        <div className="ff-paste-indicator">
          📋 {activeTab === "notes"
            ? "Soubor přidán k poznámce"
            : "Soubor vložen ze schránky — nahrávám..."}
        </div>
      )}

      {/* Document viewer modal */}
      {viewingDoc && (
        <DocumentViewerModal
          documentId={viewingDoc.id}
          filename={viewingDoc.filename}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </>
  );
};

export default FutureFunctionDetail;

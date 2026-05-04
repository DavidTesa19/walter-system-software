import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiDownload } from "../../utils/api";
import { isDocumentViewable } from "../../utils/documentUtils";
import DocumentViewerModal from "../../components/DocumentViewerModal";
import type { DocumentBreadcrumb } from "../hooks/useProfileDocuments";
import type { ProfileDocument } from "../types/profile";

type DocumentExplorerProps = {
  items: ProfileDocument[];
  archivedItems: ProfileDocument[];
  breadcrumbs: DocumentBreadcrumb[];
  currentFolderId: number | null;
  folderOptions: DocumentBreadcrumb[];
  isLoading: boolean;
  isUploading: boolean;
  downloadBaseUrl?: string;
  onUploadDocument?: (file: File) => Promise<void> | void;
  onUploadDocuments?: (files: File[]) => Promise<void> | void;
  onCreateFolder?: (name: string) => Promise<void> | void;
  onRenameDocument?: (documentId: number, filename: string) => Promise<boolean | void> | boolean | void;
  onDeleteDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  onArchiveDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  onUnarchiveDocument?: (documentId: number) => Promise<boolean | void> | boolean | void;
  onMoveDocument?: (documentId: number, parentId: number | null) => Promise<boolean | void> | boolean | void;
  onOpenFolder: (folderId: number) => void;
  onGoToFolder: (folderId: number | null) => void;
  onGoBack: () => void;
  canMoveDocumentTo: (documentId: number, parentId: number | null) => boolean;
  getDocumentPath: (documentId: number) => string;
  getFolderItemCount: (folderId: number) => number;
};

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const DocumentExplorer: React.FC<DocumentExplorerProps> = ({
  items,
  archivedItems,
  breadcrumbs,
  currentFolderId,
  folderOptions,
  isLoading,
  isUploading,
  downloadBaseUrl,
  onUploadDocument,
  onUploadDocuments,
  onCreateFolder,
  onRenameDocument,
  onDeleteDocument,
  onArchiveDocument,
  onUnarchiveDocument,
  onMoveDocument,
  onOpenFolder,
  onGoToFolder,
  onGoBack,
  canMoveDocumentTo,
  getDocumentPath,
  getFolderItemCount
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [bulkMoveTargetId, setBulkMoveTargetId] = useState("");
  const [isApplyingBulkAction, setIsApplyingBulkAction] = useState(false);
  const [movingItemId, setMovingItemId] = useState<number | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [renamingItemId, setRenamingItemId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showArchivedItems, setShowArchivedItems] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<{ id: number; filename: string } | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("cs-CZ");

  const filteredItems = useMemo(() => {
    if (!normalizedSearch) {
      return items;
    }

    return items.filter((item) => item.filename.toLocaleLowerCase("cs-CZ").includes(normalizedSearch));
  }, [items, normalizedSearch]);

  const filteredArchivedItems = useMemo(() => {
    if (!normalizedSearch) {
      return archivedItems;
    }

    return archivedItems.filter((item) => {
      const haystack = `${item.filename} ${getDocumentPath(item.id)}`.toLocaleLowerCase("cs-CZ");
      return haystack.includes(normalizedSearch);
    });
  }, [archivedItems, getDocumentPath, normalizedSearch]);

  const selectableItemIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedItemIds.includes(item.id)),
    [items, selectedItemIds]
  );

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedItemIds.includes(item.id));

  const bulkMoveTargets = useMemo(
    () => folderOptions.filter((target) => selectedItems.every((item) => canMoveDocumentTo(item.id, target.id))),
    [canMoveDocumentTo, folderOptions, selectedItems]
  );

  const moveTargetsByItem = useMemo(() => {
    const byItem = new Map<number, DocumentBreadcrumb[]>();

    for (const item of filteredItems) {
      byItem.set(
        item.id,
        folderOptions.filter((target) => canMoveDocumentTo(item.id, target.id))
      );
    }

    return byItem;
  }, [canMoveDocumentTo, filteredItems, folderOptions]);

  useEffect(() => {
    setSelectedItemIds((previous) => previous.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  useEffect(() => {
    if (selectedItems.length === 0) {
      setBulkMoveTargetId("");
      return;
    }

    const isCurrentTargetAvailable = bulkMoveTargets.some((target) => (target.id === null ? "" : String(target.id)) === bulkMoveTargetId);
    if (!isCurrentTargetAvailable) {
      setBulkMoveTargetId("");
    }
  }, [bulkMoveTargetId, bulkMoveTargets, selectedItems.length]);

  const getDraggedItemIds = (anchorItemId: number) => {
    if (selectedItemIds.includes(anchorItemId)) {
      return selectedItems.map((item) => item.id);
    }

    return [anchorItemId];
  };

  const resetInteractionState = () => {
    setDraggedItemId(null);
    setDropTargetKey(null);
    setMovingItemId(null);
    setMoveTargetId("");
    setRenamingItemId(null);
    setRenameValue("");
  };

  const canDropDraggedItemsTo = (parentId: number | null) => {
    if (draggedItemId === null) {
      return false;
    }

    return getDraggedItemIds(draggedItemId).some((id) => canMoveDocumentTo(id, parentId));
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    try {
      if (onUploadDocuments) {
        await Promise.resolve(onUploadDocuments(files));
      } else if (onUploadDocument) {
        for (const file of files) {
          await Promise.resolve(onUploadDocument(file));
        }
      }
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCreateFolder = async () => {
    if (!onCreateFolder || !newFolderName.trim()) {
      return;
    }

    await Promise.resolve(onCreateFolder(newFolderName.trim()));
    setNewFolderName("");
    setShowCreateFolder(false);
  };

  const handleDelete = async (item: ProfileDocument) => {
    if (!onDeleteDocument) {
      return;
    }

    const message = item.itemKind === "folder"
      ? `Opravdu chcete odstranit složku "${item.filename}" včetně jejího obsahu?`
      : `Opravdu chcete odstranit dokument "${item.filename}"?`;

    if (!window.confirm(message)) {
      return;
    }

    await Promise.resolve(onDeleteDocument(item.id));
  };

  const handleArchive = async (item: ProfileDocument) => {
    if (!onArchiveDocument) {
      return;
    }

    if (!window.confirm(`Opravdu chcete archivovat dokument "${item.filename}"?`)) {
      return;
    }

    await Promise.resolve(onArchiveDocument(item.id));
  };

  const handleMoveSubmit = async (item: ProfileDocument) => {
    if (!onMoveDocument) {
      return;
    }

    const nextParentId = moveTargetId === "" ? null : Number(moveTargetId);
    await Promise.resolve(onMoveDocument(item.id, Number.isNaN(nextParentId as number) ? null : nextParentId));
    setMovingItemId(null);
    setMoveTargetId("");
  };

  const handleDropToFolder = async (parentId: number | null) => {
    if (!onMoveDocument || draggedItemId === null) {
      return;
    }

    const movingIds = getDraggedItemIds(draggedItemId).filter((id) => canMoveDocumentTo(id, parentId));
    if (movingIds.length === 0) {
      resetInteractionState();
      return;
    }

    for (const itemId of movingIds) {
      await Promise.resolve(onMoveDocument(itemId, parentId));
    }

    setSelectedItemIds([]);
    resetInteractionState();
  };

  const startRename = (item: ProfileDocument) => {
    setRenamingItemId(item.id);
    setRenameValue(item.filename);
    setMovingItemId(null);
  };

  const handleRenameSubmit = async (item: ProfileDocument) => {
    if (!onRenameDocument) {
      return;
    }

    const nextName = renameValue.trim();
    if (!nextName || nextName === item.filename) {
      setRenamingItemId(null);
      setRenameValue("");
      return;
    }

    await Promise.resolve(onRenameDocument(item.id, nextName));
    setRenamingItemId(null);
    setRenameValue("");
  };

  const handleBulkDelete = async () => {
    if (!onDeleteDocument || selectedItems.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Opravdu chcete odstranit ${selectedItems.length} vybraných položek${selectedItems.some((item) => item.itemKind === "folder") ? " včetně obsahu složek" : ""}?`
    );
    if (!confirmed) {
      return;
    }

    setIsApplyingBulkAction(true);
    try {
      for (const item of selectedItems) {
        await Promise.resolve(onDeleteDocument(item.id));
      }
      setSelectedItemIds([]);
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const handleBulkArchive = async () => {
    if (!onArchiveDocument) {
      return;
    }

    const filesToArchive = selectedItems.filter((item) => item.itemKind === "file");
    if (filesToArchive.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Opravdu chcete archivovat ${filesToArchive.length} vybraných dokumentů?`);
    if (!confirmed) {
      return;
    }

    setIsApplyingBulkAction(true);
    try {
      for (const item of filesToArchive) {
        await Promise.resolve(onArchiveDocument(item.id));
      }
      setSelectedItemIds([]);
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const handleBulkMove = async () => {
    if (!onMoveDocument || selectedItems.length === 0) {
      return;
    }

    const targetId = bulkMoveTargetId === "" ? null : Number(bulkMoveTargetId);
    const normalizedTargetId = Number.isNaN(targetId as number) ? null : targetId;

    setIsApplyingBulkAction(true);
    try {
      for (const item of selectedItems) {
        if (canMoveDocumentTo(item.id, normalizedTargetId)) {
          await Promise.resolve(onMoveDocument(item.id, normalizedTargetId));
        }
      }
      setSelectedItemIds([]);
      setBulkMoveTargetId("");
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  return (
    <section className="ec-documents-section">
      <div className="ec-documents-header ec-documents-header--explorer">
        <div>
          <h3 className="ec-section-title">Dokumenty</h3>
          <div className="ec-documents-breadcrumbs" aria-label="Cesta složek">
            {breadcrumbs.map((crumb, index) => {
              const isCurrent = index === breadcrumbs.length - 1;
              const crumbKey = `breadcrumb:${crumb.id ?? "root"}`;

              return (
                <React.Fragment key={`${crumb.id ?? "root"}-${index}`}>
                  <button
                    type="button"
                    className={`ec-breadcrumb ${isCurrent ? "is-current" : ""} ${dropTargetKey === crumbKey ? "is-drop-target" : ""}`}
                    onClick={() => onGoToFolder(crumb.id)}
                    disabled={isCurrent}
                    onDragOver={(event) => {
                      if (!canDropDraggedItemsTo(crumb.id)) {
                        return;
                      }
                      event.preventDefault();
                      setDropTargetKey(crumbKey);
                    }}
                    onDragLeave={() => {
                      if (dropTargetKey === crumbKey) {
                        setDropTargetKey(null);
                      }
                    }}
                    onDrop={(event) => {
                      if (!canDropDraggedItemsTo(crumb.id)) {
                        return;
                      }
                      event.preventDefault();
                      void handleDropToFolder(crumb.id);
                    }}
                  >
                    {crumb.label}
                  </button>
                  {index < breadcrumbs.length - 1 ? <span className="ec-breadcrumb-separator">/</span> : null}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="ec-documents-toolbar">
          <button
            type="button"
            className="ec-doc-toolbar-btn secondary"
            onClick={onGoBack}
            disabled={currentFolderId === null}
          >
            Zpět
          </button>
          {onCreateFolder ? (
            <button
              type="button"
              className="ec-doc-toolbar-btn secondary"
              onClick={() => setShowCreateFolder((value) => !value)}
            >
              Nová složka
            </button>
          ) : null}
          {(onUploadDocuments || onUploadDocument) ? (
            <label className="ec-upload-btn">
              <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} disabled={isUploading || isApplyingBulkAction} />
              <span>{isUploading ? "Nahrávám..." : "+ Přidat soubory"}</span>
            </label>
          ) : null}
        </div>
      </div>

      <div className="ec-documents-search-row">
        <input
          type="search"
          className="ec-doc-search-input"
          placeholder="Hledat ve složce a archivech"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <span className="ec-doc-search-meta">
          {filteredItems.length} / {items.length} položek v této složce
        </span>
      </div>

      {filteredItems.length > 0 ? (
        <div className="ec-documents-selection-row">
          <label className="ec-doc-selection-toggle">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={() => {
                setSelectedItemIds((previous) => (
                  allFilteredSelected
                    ? previous.filter((id) => !selectableItemIds.includes(id))
                    : Array.from(new Set([...previous, ...selectableItemIds]))
                ));
              }}
            />
            <span>Vybrat vše v této složce</span>
          </label>

          {selectedItems.length > 0 ? (
            <div className="ec-documents-bulk-actions">
              <span className="ec-doc-search-meta">Vybráno: {selectedItems.length}</span>
              {onMoveDocument ? (
                <>
                  <select
                    value={bulkMoveTargetId}
                    onChange={(event) => setBulkMoveTargetId(event.target.value)}
                    className="ec-doc-move-select"
                    disabled={isApplyingBulkAction}
                  >
                    {bulkMoveTargets.map((target) => (
                      <option key={`bulk-${target.id ?? "root"}-${target.label}`} value={target.id === null ? "" : String(target.id)}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="ec-doc-toolbar-btn secondary" onClick={() => void handleBulkMove()} disabled={isApplyingBulkAction}>
                    Přesunout vybrané
                  </button>
                </>
              ) : null}
              {onArchiveDocument ? (
                <button type="button" className="ec-doc-toolbar-btn secondary" onClick={() => void handleBulkArchive()} disabled={isApplyingBulkAction}>
                  Archivovat soubory
                </button>
              ) : null}
              {onDeleteDocument ? (
                <button type="button" className="ec-doc-toolbar-btn secondary" onClick={() => void handleBulkDelete()} disabled={isApplyingBulkAction}>
                  Odstranit vybrané
                </button>
              ) : null}
              <button type="button" className="ec-doc-toolbar-btn secondary" onClick={() => setSelectedItemIds([])} disabled={isApplyingBulkAction}>
                Zrušit výběr
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showCreateFolder ? (
        <div className="ec-doc-create-folder">
          <input
            type="text"
            className="ec-doc-create-input"
            placeholder="Název složky"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleCreateFolder();
              }
              if (event.key === "Escape") {
                setShowCreateFolder(false);
                setNewFolderName("");
              }
            }}
          />
          <button type="button" className="ec-doc-toolbar-btn primary" onClick={() => void handleCreateFolder()}>
            Vytvořit
          </button>
          <button
            type="button"
            className="ec-doc-toolbar-btn secondary"
            onClick={() => {
              setShowCreateFolder(false);
              setNewFolderName("");
            }}
          >
            Zrušit
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="ec-empty-text">Načítám dokumenty…</p>
      ) : filteredItems.length > 0 ? (
        <ul className="ec-explorer-list">
          {filteredItems.map((item) => {
            const moveTargets = moveTargetsByItem.get(item.id) ?? folderOptions;
            const currentParentValue = item.parentId === null ? "" : String(item.parentId);
            const folderItemCount = item.itemKind === "folder" ? getFolderItemCount(item.id) : 0;
            const isSelected = selectedItemIds.includes(item.id);
            const folderDropKey = `folder:${item.id}`;

            return (
              <li
                key={item.id}
                className={`ec-explorer-item ec-explorer-item--${item.itemKind} ${isSelected ? "is-selected" : ""} ${dropTargetKey === folderDropKey ? "is-drop-target" : ""}`}
                draggable={renamingItemId !== item.id && movingItemId !== item.id && !isApplyingBulkAction}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(item.id));
                  setDraggedItemId(item.id);
                }}
                onDragEnd={() => resetInteractionState()}
              >
                <div className="ec-explorer-row">
                  <label className="ec-doc-selection-toggle ec-doc-selection-toggle--row">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSelectedItemIds((previous) => (
                          previous.includes(item.id)
                            ? previous.filter((id) => id !== item.id)
                            : [...previous, item.id]
                        ));
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    className="ec-explorer-open"
                    onClick={() => item.itemKind === "folder" && onOpenFolder(item.id)}
                    disabled={item.itemKind !== "folder"}
                    onDragOver={(event) => {
                      if (item.itemKind !== "folder" || !canDropDraggedItemsTo(item.id)) {
                        return;
                      }
                      event.preventDefault();
                      setDropTargetKey(folderDropKey);
                    }}
                    onDragLeave={() => {
                      if (dropTargetKey === folderDropKey) {
                        setDropTargetKey(null);
                      }
                    }}
                    onDrop={(event) => {
                      if (item.itemKind !== "folder" || !canDropDraggedItemsTo(item.id)) {
                        return;
                      }
                      event.preventDefault();
                      void handleDropToFolder(item.id);
                    }}
                  >
                    <span className="ec-explorer-icon" aria-hidden="true">
                      {item.itemKind === "folder" ? "📁" : "📄"}
                    </span>
                    <span className="ec-document-info">
                      <span className="ec-document-name-row">
                        <span className="ec-document-name">{item.filename}</span>
                        {item.itemKind === "folder" ? (
                          <span className="ec-folder-count-badge">
                            {folderItemCount} {folderItemCount === 1 ? "položka" : folderItemCount >= 2 && folderItemCount <= 4 ? "položky" : "položek"}
                          </span>
                        ) : null}
                      </span>
                      <span className="ec-document-meta">
                        {item.itemKind === "folder"
                          ? `Složka · vytvořeno ${formatDate(item.createdAt)}`
                          : `${formatFileSize(item.sizeBytes)} · ${formatDate(item.createdAt)}`}
                      </span>
                    </span>
                  </button>

                  <div className="ec-document-actions">
                    {item.itemKind === "folder" ? (
                      <button type="button" className="ec-doc-action" onClick={() => onOpenFolder(item.id)}>
                        Otevřít
                      </button>
                    ) : null}
                    {item.itemKind === "file" && downloadBaseUrl && isDocumentViewable(item.filename) ? (
                      <button
                        type="button"
                        className="ec-doc-action"
                        onClick={() => setViewingDocument({ id: item.id, filename: item.filename })}
                      >
                        Zobrazit
                      </button>
                    ) : null}
                    {item.itemKind === "file" && downloadBaseUrl ? (
                      <button
                        type="button"
                        className="ec-doc-action"
                        onClick={() => void apiDownload(`/documents/${item.id}/download`, item.filename)}
                      >
                        Stáhnout
                      </button>
                    ) : null}
                    {onMoveDocument ? (
                      <button
                        type="button"
                        className="ec-doc-action"
                        onClick={() => {
                          setMovingItemId(item.id);
                          setMoveTargetId(currentParentValue);
                          setRenamingItemId(null);
                        }}
                      >
                        Přesunout
                      </button>
                    ) : null}
                    {onRenameDocument ? (
                      <button type="button" className="ec-doc-action" onClick={() => startRename(item)}>
                        Přejmenovat
                      </button>
                    ) : null}
                    {item.itemKind === "file" && onArchiveDocument ? (
                      <button type="button" className="ec-doc-action archive" onClick={() => void handleArchive(item)}>
                        Archivovat
                      </button>
                    ) : null}
                    {onDeleteDocument ? (
                      <button type="button" className="ec-doc-action danger" onClick={() => void handleDelete(item)}>
                        Odstranit
                      </button>
                    ) : null}
                  </div>
                </div>

                {renamingItemId === item.id ? (
                  <div className="ec-doc-move-row">
                    <input
                      type="text"
                      className="ec-doc-create-input"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void handleRenameSubmit(item);
                        }
                        if (event.key === "Escape") {
                          setRenamingItemId(null);
                          setRenameValue("");
                        }
                      }}
                    />
                    <button type="button" className="ec-doc-toolbar-btn primary" onClick={() => void handleRenameSubmit(item)}>
                      Uložit název
                    </button>
                    <button
                      type="button"
                      className="ec-doc-toolbar-btn secondary"
                      onClick={() => {
                        setRenamingItemId(null);
                        setRenameValue("");
                      }}
                    >
                      Zrušit
                    </button>
                  </div>
                ) : null}

                {movingItemId === item.id ? (
                  <div className="ec-doc-move-row">
                    <select value={moveTargetId} onChange={(event) => setMoveTargetId(event.target.value)} className="ec-doc-move-select">
                      {moveTargets.map((target) => (
                        <option key={`${target.id ?? "root"}-${target.label}`} value={target.id === null ? "" : String(target.id)}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="ec-doc-toolbar-btn primary" onClick={() => void handleMoveSubmit(item)}>
                      Uložit přesun
                    </button>
                    <button
                      type="button"
                      className="ec-doc-toolbar-btn secondary"
                      onClick={() => {
                        setMovingItemId(null);
                        setMoveTargetId("");
                      }}
                    >
                      Zrušit
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : items.length > 0 && normalizedSearch ? (
        <p className="ec-empty-text">Tomuto hledání neodpovídá žádná položka v aktuální složce.</p>
      ) : (
        <p className="ec-empty-text">Tato složka je prázdná.</p>
      )}

      {archivedItems.length > 0 ? (
        <div className="ec-documents-archived">
          <button
            type="button"
            className="ec-documents-archived-toggle"
            onClick={() => setShowArchivedItems((value) => !value)}
          >
            {showArchivedItems ? "▾" : "▸"} Archivované položky ({filteredArchivedItems.length}{normalizedSearch ? ` z ${archivedItems.length}` : ""})
          </button>
          {showArchivedItems ? (
            <ul className="ec-documents-list ec-documents-list--archived">
              {filteredArchivedItems.map((item) => (
                <li key={item.id} className="ec-document-item ec-document-item--archived">
                  <div className="ec-document-info">
                    <span className="ec-document-name">{item.filename}</span>
                    <span className="ec-document-meta">
                      {item.itemKind === "folder" ? "Složka" : formatFileSize(item.sizeBytes)}
                      {` · ${getDocumentPath(item.id) || "Kořen"}`}
                      {` · archivováno ${formatDate(item.archivedAt ?? item.createdAt)}`}
                    </span>
                  </div>
                  <div className="ec-document-actions">
                    {item.itemKind === "file" && downloadBaseUrl && isDocumentViewable(item.filename) ? (
                      <button
                        type="button"
                        className="ec-doc-action"
                        onClick={() => setViewingDocument({ id: item.id, filename: item.filename })}
                      >
                        Zobrazit
                      </button>
                    ) : null}
                    {item.itemKind === "file" && downloadBaseUrl ? (
                      <button
                        type="button"
                        className="ec-doc-action"
                        onClick={() => void apiDownload(`/documents/${item.id}/download`, item.filename)}
                      >
                        Stáhnout
                      </button>
                    ) : null}
                    {onUnarchiveDocument ? (
                      <button
                        type="button"
                        className="ec-doc-action unarchive"
                        onClick={() => void Promise.resolve(onUnarchiveDocument(item.id))}
                      >
                        Obnovit
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {viewingDocument ? (
        <DocumentViewerModal
          documentId={viewingDocument.id}
          filename={viewingDocument.filename}
          onClose={() => setViewingDocument(null)}
        />
      ) : null}
    </section>
  );
};

export default DocumentExplorer;
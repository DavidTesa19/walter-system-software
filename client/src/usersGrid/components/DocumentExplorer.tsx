import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

type ViewMode = "grid" | "list";

const VIEW_MODE_STORAGE_KEY = "ec-documents-view-mode";
const DEFAULT_NEW_FOLDER_NAME = "Nová složka";

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

const getFileExtension = (filename: string) => {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) {
    return "";
  }
  return filename.slice(dot + 1).toLowerCase();
};

type FileKind = "image" | "pdf" | "word" | "excel" | "powerpoint" | "archive" | "audio" | "video" | "code" | "text" | "generic";

const getFileKind = (filename: string): FileKind => {
  const ext = getFileExtension(filename);
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "heic", "tiff"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "rtf", "odt"].includes(ext)) return "word";
  if (["xls", "xlsx", "csv", "ods", "tsv"].includes(ext)) return "excel";
  if (["ppt", "pptx", "odp", "key"].includes(ext)) return "powerpoint";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) return "archive";
  if (["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(ext)) return "audio";
  if (["mp4", "mov", "avi", "mkv", "webm", "wmv"].includes(ext)) return "video";
  if (["js", "jsx", "ts", "tsx", "json", "html", "css", "py", "java", "go", "rs", "c", "cpp", "h", "rb", "php", "sh"].includes(ext)) return "code";
  if (["txt", "md", "log"].includes(ext)) return "text";
  return "generic";
};

const FolderGlyph: React.FC<{ small?: boolean }> = ({ small }) => (
  <svg
    className={`ec-fs-glyph ec-fs-glyph--folder${small ? " ec-fs-glyph--small" : ""}`}
    viewBox="0 0 64 56"
    aria-hidden="true"
  >
    <path
      d="M5 14 a3 3 0 0 1 3 -3 h17 l5 5 h26 a3 3 0 0 1 3 3 v6 H5 z"
      fill="#6FB3E0"
    />
    <path
      d="M5 20 h59 v28 a4 4 0 0 1 -4 4 h-51 a4 4 0 0 1 -4 -4 z"
      fill="#7EC4ED"
    />
    <path
      d="M5 20 h59 v3 h-59 z"
      fill="#5FA1CE"
      opacity="0.55"
    />
  </svg>
);

const FileGlyph: React.FC<{ kind: FileKind; extension?: string; small?: boolean }> = ({ kind, extension, small }) => {
  const palette: Record<FileKind, { body: string; tag: string; label: string }> = {
    image: { body: "#FFFFFF", tag: "#9C7AE6", label: "IMG" },
    pdf: { body: "#FFFFFF", tag: "#E45757", label: "PDF" },
    word: { body: "#FFFFFF", tag: "#2A6FCB", label: "DOC" },
    excel: { body: "#FFFFFF", tag: "#1F8A4C", label: "XLS" },
    powerpoint: { body: "#FFFFFF", tag: "#D8722F", label: "PPT" },
    archive: { body: "#FFFFFF", tag: "#A07B3F", label: "ZIP" },
    audio: { body: "#FFFFFF", tag: "#7C5DB8", label: "MP3" },
    video: { body: "#FFFFFF", tag: "#C84A8A", label: "VID" },
    code: { body: "#FFFFFF", tag: "#3B82A6", label: "</>" },
    text: { body: "#FFFFFF", tag: "#6B7280", label: "TXT" },
    generic: { body: "#FFFFFF", tag: "#8AA0B8", label: "FILE" }
  };
  const { body, tag, label } = palette[kind];
  const tagText = (extension && extension.length <= 4 ? extension.toUpperCase() : label);

  return (
    <svg
      className={`ec-fs-glyph ec-fs-glyph--file${small ? " ec-fs-glyph--small" : ""}`}
      viewBox="0 0 56 64"
      aria-hidden="true"
    >
      <path
        d="M8 4 h28 l14 14 v40 a4 4 0 0 1 -4 4 h-38 a4 4 0 0 1 -4 -4 v-50 a4 4 0 0 1 4 -4 z"
        fill={body}
        stroke="#D2D6DC"
        strokeWidth="1.2"
      />
      <path
        d="M36 4 v10 a4 4 0 0 0 4 4 h10"
        fill="none"
        stroke="#D2D6DC"
        strokeWidth="1.2"
      />
      <rect x="4" y="40" width="40" height="16" rx="3" fill={tag} />
      <text
        x="24"
        y="52"
        textAnchor="middle"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
        fontSize={tagText.length >= 4 ? "8" : "10"}
        fontWeight="700"
        fill="#FFFFFF"
        letterSpacing="0.5"
      >
        {tagText}
      </text>
    </svg>
  );
};

type ContextMenuState = {
  x: number;
  y: number;
  itemId: number;
};

type MovePopupState = {
  itemIds: number[];
  anchorX: number;
  anchorY: number;
};

type SelectionBoxState = {
  originX: number;
  originY: number;
  originClientX: number;
  originClientY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  additive: boolean;
};

type DocumentMetadata = ProfileDocument & Partial<{
  updatedAt: string | null;
  modifiedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  modifiedBy: string | null;
  uploadedBy: string | null;
  author: string | null;
}>;

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
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const movePopupRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const draftFolderInputRef = useRef<HTMLInputElement>(null);
  const activeSelectionSurfaceRef = useRef<HTMLDivElement | null>(null);
  const dragSelectBaseIdsRef = useRef<number[]>([]);
  const didDragSelectRef = useRef(false);
  const draftFolderCommitInFlightRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [lastSelectedId, setLastSelectedId] = useState<number | null>(null);
  const [isApplyingBulkAction, setIsApplyingBulkAction] = useState(false);
  const [renamingItemId, setRenamingItemId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draftFolderName, setDraftFolderName] = useState<string | null>(null);
  const [showArchivedItems, setShowArchivedItems] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<{ id: number; filename: string } | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [movePopup, setMovePopup] = useState<MovePopupState | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [selectionBox, setSelectionBox] = useState<SelectionBoxState | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") {
      return "grid";
    }
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === "list" ? "list" : "grid";
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("cs-CZ");

  const filteredItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.itemKind !== b.itemKind) {
        return a.itemKind === "folder" ? -1 : 1;
      }
      return a.filename.localeCompare(b.filename, "cs-CZ", { numeric: true, sensitivity: "base" });
    });

    if (!normalizedSearch) {
      return sorted;
    }

    return sorted.filter((item) => item.filename.toLocaleLowerCase("cs-CZ").includes(normalizedSearch));
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

  const selectedItems = useMemo(
    () => items.filter((item) => selectedItemIds.includes(item.id)),
    [items, selectedItemIds]
  );

  const moveTargetsForSelection = useMemo(() => {
    if (selectedItems.length === 0) {
      return folderOptions;
    }
    return folderOptions.filter((target) => selectedItems.every((item) => canMoveDocumentTo(item.id, target.id)));
  }, [canMoveDocumentTo, folderOptions, selectedItems]);

  const moveTargetsForContextItem = useMemo(() => {
    if (!movePopup) {
      return folderOptions;
    }
    return folderOptions.filter((target) =>
      movePopup.itemIds.every((itemId) => canMoveDocumentTo(itemId, target.id))
    );
  }, [canMoveDocumentTo, folderOptions, movePopup]);

  useEffect(() => {
    setSelectedItemIds((previous) => previous.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closeMovePopup = useCallback(() => {
    setMovePopup(null);
    setMoveTargetId("");
  }, []);

  // Close context menu / move popup on outside click or escape
  useEffect(() => {
    if (!contextMenu && !movePopup) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (contextMenuRef.current && target && contextMenuRef.current.contains(target)) {
        return;
      }
      if (movePopupRef.current && target && movePopupRef.current.contains(target)) {
        return;
      }
      closeContextMenu();
      closeMovePopup();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
        closeMovePopup();
      }
    };

    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("resize", closeContextMenu);

    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", closeContextMenu, true);
      window.removeEventListener("resize", closeContextMenu);
    };
  }, [closeContextMenu, closeMovePopup, contextMenu, movePopup]);

  // Focus rename input when renaming starts
  useLayoutEffect(() => {
    if (renamingItemId !== null && renameInputRef.current) {
      renameInputRef.current.focus();
      const dot = renameValue.lastIndexOf(".");
      if (dot > 0) {
        renameInputRef.current.setSelectionRange(0, dot);
      } else {
        renameInputRef.current.select();
      }
    }
    // We intentionally only run this when the rename target switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renamingItemId]);

  useLayoutEffect(() => {
    if (draftFolderName !== null && draftFolderInputRef.current) {
      draftFolderInputRef.current.focus();
      draftFolderInputRef.current.select();
    }
  }, [draftFolderName]);

  useEffect(() => {
    if (!selectionBox) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const surface = activeSelectionSurfaceRef.current;
      if (!surface) {
        return;
      }

      const surfaceRect = surface.getBoundingClientRect();
      const currentX = event.clientX - surfaceRect.left + surface.scrollLeft;
      const currentY = event.clientY - surfaceRect.top + surface.scrollTop;
      const nextBox = {
        ...selectionBox,
        x: Math.min(selectionBox.originX, currentX),
        y: Math.min(selectionBox.originY, currentY),
        width: Math.abs(currentX - selectionBox.originX),
        height: Math.abs(currentY - selectionBox.originY)
      };
      setSelectionBox(nextBox);

      if (nextBox.width > 4 || nextBox.height > 4) {
        didDragSelectRef.current = true;
      }

      const selectionViewportRect = {
        left: Math.min(selectionBox.originClientX, event.clientX),
        right: Math.max(selectionBox.originClientX, event.clientX),
        top: Math.min(selectionBox.originClientY, event.clientY),
        bottom: Math.max(selectionBox.originClientY, event.clientY)
      };
      const intersectingIds = Array.from(surface.querySelectorAll<HTMLElement>("[data-document-id]"))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.left < selectionViewportRect.right &&
            rect.right > selectionViewportRect.left &&
            rect.top < selectionViewportRect.bottom &&
            rect.bottom > selectionViewportRect.top
          );
        })
        .map((element) => Number(element.dataset.documentId))
        .filter((id) => Number.isFinite(id));
      const mergedIds = selectionBox.additive
        ? Array.from(new Set([...dragSelectBaseIdsRef.current, ...intersectingIds]))
        : intersectingIds;
      setSelectedItemIds(mergedIds);
      setLastSelectedId(mergedIds[mergedIds.length - 1] ?? null);
    };

    const handleMouseUp = () => {
      setSelectionBox(null);
      activeSelectionSurfaceRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [selectionBox]);

  const getDraggedItemIds = (anchorItemId: number) => {
    if (selectedItemIds.includes(anchorItemId)) {
      return [...selectedItemIds];
    }
    return [anchorItemId];
  };

  const resetInteractionState = () => {
    setDraggedItemId(null);
    setDropTargetKey(null);
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

  const startDraftFolder = () => {
    if (!onCreateFolder || isApplyingBulkAction) {
      return;
    }
    closeContextMenu();
    closeMovePopup();
    setSearchQuery("");
    setSelectedItemIds([]);
    setLastSelectedId(null);
    setDraftFolderName(DEFAULT_NEW_FOLDER_NAME);
  };

  const commitDraftFolder = async () => {
    if (!onCreateFolder || draftFolderName === null || draftFolderCommitInFlightRef.current) {
      return;
    }

    const nextName = draftFolderName.trim() || DEFAULT_NEW_FOLDER_NAME;
    draftFolderCommitInFlightRef.current = true;
    setDraftFolderName(null);
    try {
      await Promise.resolve(onCreateFolder(nextName));
    } finally {
      draftFolderCommitInFlightRef.current = false;
    }
  };

  const cancelDraftFolder = () => {
    setDraftFolderName(null);
  };

  const openFile = (item: ProfileDocument) => {
    if (item.itemKind === "folder") {
      onOpenFolder(item.id);
      return;
    }
    if (downloadBaseUrl && isDocumentViewable(item.filename)) {
      setViewingDocument({ id: item.id, filename: item.filename });
      return;
    }
    if (downloadBaseUrl) {
      void apiDownload(`/documents/${item.id}/download`, item.filename);
    }
  };

  const handleTileClick = (item: ProfileDocument, event: React.MouseEvent) => {
    if (renamingItemId === item.id) {
      return;
    }
    closeContextMenu();
    closeMovePopup();

    const isCtrl = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;

    if (isShift && lastSelectedId !== null) {
      const ids = filteredItems.map((it) => it.id);
      const start = ids.indexOf(lastSelectedId);
      const end = ids.indexOf(item.id);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        const range = ids.slice(from, to + 1);
        setSelectedItemIds(range);
        setLastSelectedId(item.id);
        return;
      }
    }

    if (isCtrl) {
      setSelectedItemIds((prev) =>
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      );
      setLastSelectedId(item.id);
      return;
    }

    setSelectedItemIds([item.id]);
    setLastSelectedId(item.id);
  };

  const handleTileDoubleClick = (item: ProfileDocument) => {
    if (renamingItemId === item.id) {
      return;
    }
    openFile(item);
  };

  const handleTileContextMenu = (item: ProfileDocument, event: React.MouseEvent) => {
    event.preventDefault();
    if (!selectedItemIds.includes(item.id)) {
      setSelectedItemIds([item.id]);
      setLastSelectedId(item.id);
    }
    closeMovePopup();
    setContextMenu({ x: event.clientX, y: event.clientY, itemId: item.id });
  };

  const handleEmptyAreaClick = (event: React.MouseEvent) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (didDragSelectRef.current) {
      didDragSelectRef.current = false;
      return;
    }
    if (draftFolderName !== null) {
      void commitDraftFolder();
      return;
    }
    setSelectedItemIds([]);
    setLastSelectedId(null);
    closeContextMenu();
    closeMovePopup();
  };

  const startRename = (item: ProfileDocument) => {
    closeContextMenu();
    closeMovePopup();
    setRenamingItemId(item.id);
    setRenameValue(item.filename);
  };

  const cancelRename = () => {
    setRenamingItemId(null);
    setRenameValue("");
  };

  const handleRenameSubmit = async (item: ProfileDocument) => {
    if (!onRenameDocument) {
      cancelRename();
      return;
    }

    const nextName = renameValue.trim();
    if (!nextName || nextName === item.filename) {
      cancelRename();
      return;
    }

    await Promise.resolve(onRenameDocument(item.id, nextName));
    cancelRename();
  };

  const handleDeleteItems = async (targetItems: ProfileDocument[]) => {
    if (!onDeleteDocument || targetItems.length === 0) {
      return;
    }

    const message = targetItems.length === 1
      ? targetItems[0].itemKind === "folder"
        ? `Opravdu chcete odstranit složku "${targetItems[0].filename}" včetně jejího obsahu?`
        : `Opravdu chcete odstranit dokument "${targetItems[0].filename}"?`
      : `Opravdu chcete odstranit ${targetItems.length} vybraných položek${targetItems.some((it) => it.itemKind === "folder") ? " včetně obsahu složek" : ""}?`;

    if (!window.confirm(message)) {
      return;
    }

    setIsApplyingBulkAction(true);
    try {
      for (const it of targetItems) {
        await Promise.resolve(onDeleteDocument(it.id));
      }
      setSelectedItemIds([]);
      setLastSelectedId(null);
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const handleArchiveItems = async (targetItems: ProfileDocument[]) => {
    if (!onArchiveDocument) {
      return;
    }

    const filesToArchive = targetItems.filter((it) => it.itemKind === "file");
    if (filesToArchive.length === 0) {
      return;
    }

    const message = filesToArchive.length === 1
      ? `Opravdu chcete archivovat dokument "${filesToArchive[0].filename}"?`
      : `Opravdu chcete archivovat ${filesToArchive.length} vybraných dokumentů?`;

    if (!window.confirm(message)) {
      return;
    }

    setIsApplyingBulkAction(true);
    try {
      for (const it of filesToArchive) {
        await Promise.resolve(onArchiveDocument(it.id));
      }
      setSelectedItemIds([]);
      setLastSelectedId(null);
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const openMovePopupFor = (itemIds: number[], anchorX: number, anchorY: number) => {
    if (itemIds.length === 0) {
      return;
    }
    closeContextMenu();
    setMovePopup({ itemIds, anchorX, anchorY });
    setMoveTargetId("");
  };

  const handleMoveSubmit = async () => {
    if (!onMoveDocument || !movePopup) {
      return;
    }

    const targetId = moveTargetId === "" ? null : Number(moveTargetId);
    const normalizedTargetId = Number.isNaN(targetId as number) ? null : targetId;

    setIsApplyingBulkAction(true);
    try {
      for (const itemId of movePopup.itemIds) {
        if (canMoveDocumentTo(itemId, normalizedTargetId)) {
          await Promise.resolve(onMoveDocument(itemId, normalizedTargetId));
        }
      }
      setSelectedItemIds([]);
      setLastSelectedId(null);
      closeMovePopup();
    } finally {
      setIsApplyingBulkAction(false);
    }
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
    setLastSelectedId(null);
    resetInteractionState();
  };

  const handleSelectAll = () => {
    if (filteredItems.length === 0) {
      return;
    }
    setSelectedItemIds(filteredItems.map((it) => it.id));
    setLastSelectedId(filteredItems[filteredItems.length - 1]?.id ?? null);
  };

  const handleSelectionSurfaceMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      event.target !== event.currentTarget ||
      renamingItemId !== null ||
      draftFolderName !== null
    ) {
      return;
    }

    const surface = event.currentTarget;
    const rect = surface.getBoundingClientRect();
    const originX = event.clientX - rect.left + surface.scrollLeft;
    const originY = event.clientY - rect.top + surface.scrollTop;
    const additive = event.ctrlKey || event.metaKey;

    activeSelectionSurfaceRef.current = surface;
    dragSelectBaseIdsRef.current = additive ? selectedItemIds : [];
    didDragSelectRef.current = false;
    if (!additive) {
      setSelectedItemIds([]);
      setLastSelectedId(null);
    }
    setSelectionBox({
      originX,
      originY,
      originClientX: event.clientX,
      originClientY: event.clientY,
      x: originX,
      y: originY,
      width: 0,
      height: 0,
      additive
    });
    closeContextMenu();
    closeMovePopup();
    event.preventDefault();
  };

  const selectedSizeBytes = selectedItems.reduce((total, item) => total + (item.itemKind === "file" ? item.sizeBytes : 0), 0);
  const selectedFolderCount = selectedItems.filter((item) => item.itemKind === "folder").length;
  const selectedFileCount = selectedItems.length - selectedFolderCount;
  const inspectorItem = selectedItems.length === 1 ? selectedItems[0] : null;
  const inspectorMetadata = inspectorItem as DocumentMetadata | null;
  const inspectorChangedAt = inspectorMetadata?.updatedAt ?? inspectorMetadata?.modifiedAt ?? inspectorMetadata?.createdAt ?? null;
  const inspectorCreatedBy = inspectorMetadata?.createdBy ?? inspectorMetadata?.uploadedBy ?? inspectorMetadata?.author ?? null;
  const inspectorChangedBy = inspectorMetadata?.updatedBy ?? inspectorMetadata?.modifiedBy ?? inspectorCreatedBy;
  const inspectorPath = inspectorItem ? getDocumentPath(inspectorItem.id) || "Kořen" : breadcrumbs.map((crumb) => crumb.label).join(" / ");
  const inspectorStorageText = inspectorItem
    ? inspectorItem.itemKind === "folder"
      ? `${getFolderItemCount(inspectorItem.id)} položek`
      : formatFileSize(inspectorItem.sizeBytes)
    : selectedItems.length > 0
      ? `${selectedItems.length} položek · ${formatFileSize(selectedSizeBytes)}`
      : `${filteredItems.length} položek v této složce`;

  const contextMenuItem = useMemo(() => {
    if (!contextMenu) {
      return null;
    }
    return items.find((it) => it.id === contextMenu.itemId) ?? null;
  }, [contextMenu, items]);

  const contextMenuTargets = useMemo(() => {
    if (!contextMenuItem) {
      return [] as ProfileDocument[];
    }
    if (selectedItemIds.includes(contextMenuItem.id) && selectedItemIds.length > 1) {
      return items.filter((it) => selectedItemIds.includes(it.id));
    }
    return [contextMenuItem];
  }, [contextMenuItem, items, selectedItemIds]);

  const renderTile = (item: ProfileDocument) => {
    const isSelected = selectedItemIds.includes(item.id);
    const isFolder = item.itemKind === "folder";
    const folderDropKey = `folder:${item.id}`;
    const isDropTarget = dropTargetKey === folderDropKey;
    const isRenaming = renamingItemId === item.id;
    const folderItemCount = isFolder ? getFolderItemCount(item.id) : 0;
    const ext = getFileExtension(item.filename);
    const fileKind = isFolder ? "generic" : getFileKind(item.filename);

    const tileClassNames = [
      "ec-fs-tile",
      `ec-fs-tile--${item.itemKind}`,
      isSelected ? "is-selected" : "",
      isDropTarget ? "is-drop-target" : "",
      isRenaming ? "is-renaming" : ""
    ].filter(Boolean).join(" ");

    return (
      <div
        key={item.id}
        data-document-id={item.id}
        className={tileClassNames}
        title={item.filename}
        draggable={!isRenaming && !isApplyingBulkAction}
        onClick={(event) => handleTileClick(item, event)}
        onDoubleClick={() => handleTileDoubleClick(item)}
        onContextMenu={(event) => handleTileContextMenu(item, event)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(item.id));
          setDraggedItemId(item.id);
        }}
        onDragEnd={() => resetInteractionState()}
        onDragOver={(event) => {
          if (!isFolder || !canDropDraggedItemsTo(item.id)) {
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
          if (!isFolder || !canDropDraggedItemsTo(item.id)) {
            return;
          }
          event.preventDefault();
          void handleDropToFolder(item.id);
        }}
      >
        <div className="ec-fs-tile-icon">
          {isFolder ? <FolderGlyph /> : <FileGlyph kind={fileKind} extension={ext} />}
        </div>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            className="ec-fs-tile-rename-input"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                void handleRenameSubmit(item);
              } else if (event.key === "Escape") {
                cancelRename();
              }
            }}
            onBlur={() => void handleRenameSubmit(item)}
          />
        ) : (
          <div className="ec-fs-tile-name">{item.filename}</div>
        )}
        <div className="ec-fs-tile-meta">
          {isFolder
            ? `${folderItemCount} ${folderItemCount === 1 ? "položka" : folderItemCount >= 2 && folderItemCount <= 4 ? "položky" : "položek"}`
            : formatFileSize(item.sizeBytes)}
        </div>
      </div>
    );
  };

  const renderListRow = (item: ProfileDocument) => {
    const isSelected = selectedItemIds.includes(item.id);
    const isFolder = item.itemKind === "folder";
    const folderDropKey = `folder:${item.id}`;
    const isDropTarget = dropTargetKey === folderDropKey;
    const isRenaming = renamingItemId === item.id;
    const folderItemCount = isFolder ? getFolderItemCount(item.id) : 0;
    const ext = getFileExtension(item.filename);
    const fileKind = isFolder ? "generic" : getFileKind(item.filename);

    const rowClassNames = [
      "ec-fs-row",
      `ec-fs-row--${item.itemKind}`,
      isSelected ? "is-selected" : "",
      isDropTarget ? "is-drop-target" : "",
      isRenaming ? "is-renaming" : ""
    ].filter(Boolean).join(" ");

    return (
      <div
        key={item.id}
        data-document-id={item.id}
        className={rowClassNames}
        title={item.filename}
        draggable={!isRenaming && !isApplyingBulkAction}
        onClick={(event) => handleTileClick(item, event)}
        onDoubleClick={() => handleTileDoubleClick(item)}
        onContextMenu={(event) => handleTileContextMenu(item, event)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(item.id));
          setDraggedItemId(item.id);
        }}
        onDragEnd={() => resetInteractionState()}
        onDragOver={(event) => {
          if (!isFolder || !canDropDraggedItemsTo(item.id)) {
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
          if (!isFolder || !canDropDraggedItemsTo(item.id)) {
            return;
          }
          event.preventDefault();
          void handleDropToFolder(item.id);
        }}
      >
        <div className="ec-fs-row-icon">
          {isFolder ? <FolderGlyph small /> : <FileGlyph kind={fileKind} extension={ext} small />}
        </div>
        <div className="ec-fs-row-main">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              className="ec-fs-row-rename-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  void handleRenameSubmit(item);
                } else if (event.key === "Escape") {
                  cancelRename();
                }
              }}
              onBlur={() => void handleRenameSubmit(item)}
            />
          ) : (
            <span className="ec-fs-row-name">{item.filename}</span>
          )}
        </div>
        <div className="ec-fs-row-meta">
          {isFolder
            ? `${folderItemCount} ${folderItemCount === 1 ? "položka" : folderItemCount >= 2 && folderItemCount <= 4 ? "položky" : "položek"}`
            : formatFileSize(item.sizeBytes)}
        </div>
        <div className="ec-fs-row-date">{formatDate(item.createdAt)}</div>
      </div>
    );
  };

  const renderDraftFolderTile = () => {
    if (draftFolderName === null) {
      return null;
    }

    return (
      <div key="draft-folder" className="ec-fs-tile ec-fs-tile--folder ec-fs-tile--draft is-selected">
        <div className="ec-fs-tile-icon">
          <FolderGlyph />
        </div>
        <input
          ref={draftFolderInputRef}
          type="text"
          className="ec-fs-tile-rename-input"
          value={draftFolderName}
          onChange={(event) => setDraftFolderName(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              void commitDraftFolder();
            } else if (event.key === "Escape") {
              cancelDraftFolder();
            }
          }}
          onBlur={() => void commitDraftFolder()}
        />
        <div className="ec-fs-tile-meta">0 položek</div>
      </div>
    );
  };

  const renderAddFolderTile = () => {
    if (!onCreateFolder || normalizedSearch || draftFolderName !== null) {
      return null;
    }

    return (
      <button
        key="add-folder"
        type="button"
        className="ec-fs-tile ec-fs-add-tile"
        onClick={startDraftFolder}
        title="Nová složka"
      >
        <span className="ec-fs-add-icon" aria-hidden="true">+</span>
        <span className="ec-fs-add-label">Nová složka</span>
      </button>
    );
  };

  const renderDraftFolderRow = () => {
    if (draftFolderName === null) {
      return null;
    }

    return (
      <div key="draft-folder-row" className="ec-fs-row ec-fs-row--folder ec-fs-row--draft is-selected">
        <div className="ec-fs-row-icon">
          <FolderGlyph small />
        </div>
        <div className="ec-fs-row-main">
          <input
            ref={draftFolderInputRef}
            type="text"
            className="ec-fs-row-rename-input"
            value={draftFolderName}
            onChange={(event) => setDraftFolderName(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                void commitDraftFolder();
              } else if (event.key === "Escape") {
                cancelDraftFolder();
              }
            }}
            onBlur={() => void commitDraftFolder()}
          />
        </div>
        <div className="ec-fs-row-meta">0 položek</div>
        <div className="ec-fs-row-date">Právě teď</div>
      </div>
    );
  };

  const renderAddFolderRow = () => {
    if (!onCreateFolder || normalizedSearch || draftFolderName !== null) {
      return null;
    }

    return (
      <button
        key="add-folder-row"
        type="button"
        className="ec-fs-row ec-fs-add-row"
        onClick={startDraftFolder}
        title="Nová složka"
      >
        <span className="ec-fs-row-icon">
          <span className="ec-fs-add-row-icon" aria-hidden="true">+</span>
        </span>
        <span className="ec-fs-row-main">
          <span className="ec-fs-row-name">Nová složka</span>
        </span>
        <span className="ec-fs-row-meta">Složka</span>
        <span className="ec-fs-row-date">Přidat</span>
      </button>
    );
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
            title="Zpět do nadřazené složky"
          >
            ← Zpět
          </button>
          <div className="ec-fs-view-toggle" role="group" aria-label="Zobrazení">
            <button
              type="button"
              className={`ec-fs-view-toggle-btn ${viewMode === "grid" ? "is-active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Ikony"
              aria-pressed={viewMode === "grid"}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
                <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" />
                <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" />
                <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              className={`ec-fs-view-toggle-btn ${viewMode === "list" ? "is-active" : ""}`}
              onClick={() => setViewMode("list")}
              title="Seznam"
              aria-pressed={viewMode === "list"}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="1" y="2" width="14" height="2" rx="1" fill="currentColor" />
                <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" />
                <rect x="1" y="12" width="14" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
          </div>
          {onCreateFolder ? (
            <button
              type="button"
              className="ec-doc-toolbar-btn secondary"
              onClick={startDraftFolder}
              disabled={draftFolderName !== null || isApplyingBulkAction}
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

      <div className="ec-fs-workspace">
        <div className="ec-fs-browser-area">
          {isLoading ? (
            <p className="ec-empty-text">Načítám dokumenty…</p>
          ) : filteredItems.length > 0 || draftFolderName !== null || (onCreateFolder && !normalizedSearch) ? (
            viewMode === "grid" ? (
              <div
                ref={activeSelectionSurfaceRef}
                className="ec-fs-grid"
                onMouseDown={handleSelectionSurfaceMouseDown}
                onClick={handleEmptyAreaClick}
                onContextMenu={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }
                  event.preventDefault();
                }}
                onDragOver={(event) => {
                  if (!canDropDraggedItemsTo(currentFolderId)) {
                    return;
                  }
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }
                  if (!canDropDraggedItemsTo(currentFolderId)) {
                    return;
                  }
                  event.preventDefault();
                  void handleDropToFolder(currentFolderId);
                }}
              >
                {filteredItems.map(renderTile)}
                {renderDraftFolderTile()}
                {renderAddFolderTile()}
                {selectionBox ? <div className="ec-fs-selection-rect" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} /> : null}
              </div>
            ) : (
              <div
                ref={activeSelectionSurfaceRef}
                className="ec-fs-list"
                onMouseDown={handleSelectionSurfaceMouseDown}
                onClick={handleEmptyAreaClick}
                onContextMenu={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }
                  event.preventDefault();
                }}
              >
                <div className="ec-fs-list-header">
                  <span className="ec-fs-list-header-name">Název</span>
                  <span className="ec-fs-list-header-meta">Velikost</span>
                  <span className="ec-fs-list-header-date">Vytvořeno</span>
                </div>
                {filteredItems.map(renderListRow)}
                {renderDraftFolderRow()}
                {renderAddFolderRow()}
                {selectionBox ? <div className="ec-fs-selection-rect" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} /> : null}
              </div>
            )
          ) : items.length > 0 && normalizedSearch ? (
            <p className="ec-empty-text">Tomuto hledání neodpovídá žádná položka v aktuální složce.</p>
          ) : (
            <p className="ec-empty-text">Tato složka je prázdná.</p>
          )}
        </div>

        <aside className="ec-fs-inspector" aria-label="Akce a informace">
          <div className="ec-fs-inspector-summary">
            <span className="ec-fs-inspector-kicker">Výběr</span>
            <strong>{selectedItems.length > 0 ? `Vybráno ${selectedItems.length}` : "Nic vybráno"}</strong>
            <span>{selectedItems.length > 0 ? `${selectedFolderCount} složek · ${selectedFileCount} souborů` : "Kliknutím nebo tažením označíte položky."}</span>
          </div>

          <div className="ec-fs-inspector-actions">
            {onMoveDocument ? (
              <button
                type="button"
                className="ec-fs-inspector-action"
                onClick={(event) => {
                  const rect = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  openMovePopupFor(selectedItems.map((it) => it.id), rect.left, rect.bottom + 6);
                }}
                disabled={isApplyingBulkAction || selectedItems.length === 0 || moveTargetsForSelection.length === 0}
              >
                Přesunout
              </button>
            ) : null}
            {onArchiveDocument ? (
              <button
                type="button"
                className="ec-fs-inspector-action"
                onClick={() => void handleArchiveItems(selectedItems)}
                disabled={isApplyingBulkAction || !selectedItems.some((it) => it.itemKind === "file")}
              >
                Archivovat
              </button>
            ) : null}
            {onDeleteDocument ? (
              <button
                type="button"
                className="ec-fs-inspector-action danger"
                onClick={() => void handleDeleteItems(selectedItems)}
                disabled={isApplyingBulkAction || selectedItems.length === 0}
              >
                Odstranit
              </button>
            ) : null}
            {filteredItems.length > 0 ? (
              <button
                type="button"
                className="ec-fs-select-all-btn"
                onClick={handleSelectAll}
                disabled={selectedItemIds.length === filteredItems.length}
              >
                Vybrat vše
              </button>
            ) : null}
          </div>

          <div className="ec-fs-inspector-details">
            <div className="ec-fs-inspector-title">
              <span>{inspectorItem ? (inspectorItem.itemKind === "folder" ? "Složka" : "Soubor") : selectedItems.length > 1 ? "Více položek" : "Aktuální složka"}</span>
              <strong>{inspectorItem?.filename ?? (selectedItems.length > 1 ? `${selectedItems.length} vybraných položek` : breadcrumbs[breadcrumbs.length - 1]?.label ?? "Kořen")}</strong>
            </div>
            <dl className="ec-fs-meta-list">
              <div>
                <dt>Velikost</dt>
                <dd>{inspectorStorageText}</dd>
              </div>
              <div>
                <dt>Umístění</dt>
                <dd>{inspectorPath}</dd>
              </div>
              <div>
                <dt>Vytvořeno</dt>
                <dd>{inspectorItem ? formatDate(inspectorItem.createdAt) : "Není k dispozici"}</dd>
              </div>
              <div>
                <dt>Změněno</dt>
                <dd>{inspectorItem && inspectorChangedAt ? formatDate(inspectorChangedAt) : "Není k dispozici"}</dd>
              </div>
              <div>
                <dt>Vytvořil</dt>
                <dd>{inspectorCreatedBy || "Není k dispozici"}</dd>
              </div>
              <div>
                <dt>Změnil</dt>
                <dd>{inspectorChangedBy || "Není k dispozici"}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

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

      {contextMenu && contextMenuItem ? (
        <div
          ref={contextMenuRef}
          className="ec-fs-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {contextMenuItem.itemKind === "folder" ? (
            <button
              type="button"
              className="ec-fs-context-item"
              onClick={() => {
                closeContextMenu();
                onOpenFolder(contextMenuItem.id);
              }}
            >
              Otevřít
            </button>
          ) : null}
          {contextMenuItem.itemKind === "file" && downloadBaseUrl && isDocumentViewable(contextMenuItem.filename) ? (
            <button
              type="button"
              className="ec-fs-context-item"
              onClick={() => {
                closeContextMenu();
                setViewingDocument({ id: contextMenuItem.id, filename: contextMenuItem.filename });
              }}
            >
              Zobrazit
            </button>
          ) : null}
          {contextMenuItem.itemKind === "file" && downloadBaseUrl ? (
            <button
              type="button"
              className="ec-fs-context-item"
              onClick={() => {
                closeContextMenu();
                void apiDownload(`/documents/${contextMenuItem.id}/download`, contextMenuItem.filename);
              }}
            >
              Stáhnout
            </button>
          ) : null}
          {onMoveDocument ? (
            <button
              type="button"
              className="ec-fs-context-item"
              onClick={(event) => {
                const ids = contextMenuTargets.map((it) => it.id);
                const x = event.clientX;
                const y = event.clientY;
                openMovePopupFor(ids, x, y);
              }}
              disabled={moveTargetsForContextItem.length === 0 && contextMenuTargets.length > 0}
            >
              Přesunout{contextMenuTargets.length > 1 ? ` (${contextMenuTargets.length})` : ""}…
            </button>
          ) : null}
          {onRenameDocument && contextMenuTargets.length === 1 ? (
            <button
              type="button"
              className="ec-fs-context-item"
              onClick={() => {
                const target = contextMenuTargets[0];
                closeContextMenu();
                startRename(target);
              }}
            >
              Přejmenovat
            </button>
          ) : null}
          {onArchiveDocument && contextMenuTargets.some((it) => it.itemKind === "file") ? (
            <button
              type="button"
              className="ec-fs-context-item"
              onClick={() => {
                const targets = contextMenuTargets;
                closeContextMenu();
                void handleArchiveItems(targets);
              }}
            >
              Archivovat
            </button>
          ) : null}
          {onDeleteDocument ? (
            <>
              <div className="ec-fs-context-separator" />
              <button
                type="button"
                className="ec-fs-context-item ec-fs-context-item--danger"
                onClick={() => {
                  const targets = contextMenuTargets;
                  closeContextMenu();
                  void handleDeleteItems(targets);
                }}
              >
                Odstranit{contextMenuTargets.length > 1 ? ` (${contextMenuTargets.length})` : ""}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {movePopup ? (
        <div
          ref={movePopupRef}
          className="ec-fs-move-popup"
          style={{ left: movePopup.anchorX, top: movePopup.anchorY }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <div className="ec-fs-move-popup-title">
            Přesunout{movePopup.itemIds.length > 1 ? ` ${movePopup.itemIds.length} položek` : ""} do…
          </div>
          <select
            value={moveTargetId}
            onChange={(event) => setMoveTargetId(event.target.value)}
            className="ec-doc-move-select"
            disabled={isApplyingBulkAction}
            autoFocus
          >
            <option value="" disabled>
              Vyberte cílovou složku
            </option>
            {moveTargetsForContextItem.map((target) => (
              <option key={`move-${target.id ?? "root"}-${target.label}`} value={target.id === null ? "" : String(target.id)}>
                {target.label}
              </option>
            ))}
          </select>
          <div className="ec-fs-move-popup-actions">
            <button
              type="button"
              className="ec-doc-toolbar-btn primary"
              onClick={() => void handleMoveSubmit()}
              disabled={isApplyingBulkAction || moveTargetId === ""}
            >
              Přesunout
            </button>
            <button
              type="button"
              className="ec-doc-toolbar-btn secondary"
              onClick={() => closeMovePopup()}
              disabled={isApplyingBulkAction}
            >
              Zrušit
            </button>
          </div>
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

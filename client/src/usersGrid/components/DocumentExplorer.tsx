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
  onUpdateDocumentColor?: (documentId: number, labelColor: string | null) => Promise<boolean | void> | boolean | void;
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

type ViewMode = "grid" | "list" | "canvas";
type ZoomLevel = "small" | "normal" | "big";
type DocumentLabelColor = "red" | "yellow" | "green" | "blue" | "purple";

const VIEW_MODE_STORAGE_KEY = "ec-documents-view-mode";
const ZOOM_LEVEL_STORAGE_KEY = "ec-documents-zoom-level";
const FOLDER_COLOR_STORAGE_KEY = "ec-documents-folder-colors";
const CANVAS_POSITIONS_STORAGE_KEY = "ec-documents-canvas-positions";
const DEFAULT_NEW_FOLDER_NAME = "Nová složka";

const ZOOM_SCALES: Record<ZoomLevel, number> = {
  small: 0.78,
  normal: 1,
  big: 1.34
};

const ZOOM_VALUE_TO_LEVEL: Record<number, ZoomLevel> = {
  1: "small",
  2: "normal",
  3: "big"
};

const ZOOM_LEVEL_TO_VALUE: Record<ZoomLevel, number> = {
  small: 1,
  normal: 2,
  big: 3
};

const DOCUMENT_LABEL_COLORS: Array<{ value: DocumentLabelColor | null; label: string; color?: string }> = [
  { value: null, label: "Bez barvy" },
  { value: "red", label: "Červená", color: "#ef4444" },
  { value: "yellow", label: "Žlutá", color: "#facc15" },
  { value: "green", label: "Zelená", color: "#22c55e" },
  { value: "blue", label: "Modrá", color: "#3b82f6" },
  { value: "purple", label: "Fialová", color: "#a855f7" }
];

const FOLDER_COLOR_OPTIONS: Array<{ value: DocumentLabelColor | null; label: string; color?: string }> = [
  { value: null, label: "Výchozí modrá" },
  { value: "red", label: "Červená", color: "#ef4444" },
  { value: "yellow", label: "Žlutá", color: "#f5b301" },
  { value: "green", label: "Zelená", color: "#22c55e" },
  { value: "blue", label: "Modrá", color: "#3b82f6" },
  { value: "purple", label: "Fialová", color: "#a855f7" }
];

const DEFAULT_FOLDER_PALETTE = { top: "#6FB3E0", body: "#7EC4ED", shade: "#5FA1CE" };

const FOLDER_COLOR_PALETTE: Record<DocumentLabelColor, { top: string; body: string; shade: string }> = {
  red: { top: "#E07472", body: "#F08C8B", shade: "#C5524F" },
  yellow: { top: "#E8B43B", body: "#F5C658", shade: "#C8941D" },
  green: { top: "#5BB97A", body: "#7AD295", shade: "#3F9B5C" },
  blue: { top: "#6FB3E0", body: "#7EC4ED", shade: "#5FA1CE" },
  purple: { top: "#9C7AD6", body: "#B594E5", shade: "#7B5BB7" }
};

const readFolderColorMap = (): Record<string, DocumentLabelColor | null> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(FOLDER_COLOR_STORAGE_KEY);
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, DocumentLabelColor | null>;
    }
  } catch {
    /* ignore */
  }
  return {};
};

const readCanvasPositionsMap = (): Record<string, { x: number; y: number }> => {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const stored = window.localStorage.getItem(CANVAS_POSITIONS_STORAGE_KEY);
    if (!stored) {
      return {};
    }
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, { x: number; y: number }>;
    }
  } catch {
    /* ignore */
  }
  return {};
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

const getDocumentLabelColor = (item: ProfileDocument) => {
  return DOCUMENT_LABEL_COLORS.find((entry) => entry.value === item.labelColor) ?? DOCUMENT_LABEL_COLORS[0];
};

const getFolderPalette = (color: DocumentLabelColor | null | undefined) => {
  if (color && FOLDER_COLOR_PALETTE[color]) {
    return FOLDER_COLOR_PALETTE[color];
  }
  return DEFAULT_FOLDER_PALETTE;
};

const FolderGlyph: React.FC<{ small?: boolean; color?: DocumentLabelColor | null }> = ({ small, color }) => {
  const palette = getFolderPalette(color ?? null);
  return (
    <svg
      className={`ec-fs-glyph ec-fs-glyph--folder${small ? " ec-fs-glyph--small" : ""}`}
      viewBox="0 0 64 56"
      aria-hidden="true"
    >
      <path
        d="M5 14 a3 3 0 0 1 3 -3 h17 l5 5 h26 a3 3 0 0 1 3 3 v6 H5 z"
        fill={palette.top}
      />
      <path
        d="M5 20 h59 v28 a4 4 0 0 1 -4 4 h-51 a4 4 0 0 1 -4 -4 z"
        fill={palette.body}
      />
      <path
        d="M5 20 h59 v3 h-59 z"
        fill={palette.shade}
        opacity="0.55"
      />
    </svg>
  );
};

const FolderSwatch: React.FC<{ color: DocumentLabelColor | null; isEmpty?: boolean }> = ({ color, isEmpty }) => {
  if (isEmpty) {
    return (
      <span className="ec-fs-folder-swatch is-empty" aria-hidden="true">
        <svg viewBox="0 0 24 18" width="100%" height="100%">
          <path
            d="M2 4.5 a1.2 1.2 0 0 1 1.2 -1.2 h6.4 l1.8 1.8 h9.4 a1.2 1.2 0 0 1 1.2 1.2 v8.8 a1.2 1.2 0 0 1 -1.2 1.2 h-17.6 a1.2 1.2 0 0 1 -1.2 -1.2 z"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="2.5 2"
          />
        </svg>
      </span>
    );
  }
  const palette = getFolderPalette(color);
  return (
    <span className="ec-fs-folder-swatch" aria-hidden="true">
      <svg viewBox="0 0 24 18" width="100%" height="100%">
        <path
          d="M2 4.5 a1.2 1.2 0 0 1 1.2 -1.2 h6.4 l1.8 1.8 h9.4 a1.2 1.2 0 0 1 1.2 1.2 v2.2 H2 z"
          fill={palette.top}
        />
        <path
          d="M2 6.8 h21 v8.5 a1.2 1.2 0 0 1 -1.2 1.2 h-18.6 a1.2 1.2 0 0 1 -1.2 -1.2 z"
          fill={palette.body}
        />
      </svg>
    </span>
  );
};

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
  onUpdateDocumentColor,
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
  const wasDraftFolderActiveRef = useRef(false);

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
    if (stored === "list" || stored === "canvas" || stored === "grid") {
      return stored;
    }
    return "grid";
  });
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(() => {
    if (typeof window === "undefined") {
      return "normal";
    }
    const stored = window.localStorage.getItem(ZOOM_LEVEL_STORAGE_KEY);
    if (stored === "small" || stored === "normal" || stored === "big") {
      return stored;
    }
    return "normal";
  });
  const [folderColorMap, setFolderColorMap] = useState<Record<string, DocumentLabelColor | null>>(() => readFolderColorMap());
  const [canvasPositions, setCanvasPositions] = useState<Record<string, { x: number; y: number }>>(() => readCanvasPositionsMap());
  const [canvasDrag, setCanvasDrag] = useState<{
    itemIds: number[];
    initial: Record<number, { x: number; y: number }>;
    pointerStart: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(ZOOM_LEVEL_STORAGE_KEY, zoomLevel);
  }, [zoomLevel]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(FOLDER_COLOR_STORAGE_KEY, JSON.stringify(folderColorMap));
    } catch {
      /* ignore */
    }
  }, [folderColorMap]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(CANVAS_POSITIONS_STORAGE_KEY, JSON.stringify(canvasPositions));
    } catch {
      /* ignore */
    }
  }, [canvasPositions]);

  const getFolderColorFor = useCallback((item: ProfileDocument): DocumentLabelColor | null => {
    if (item.itemKind !== "folder") {
      return null;
    }
    const stored = folderColorMap[String(item.id)];
    if (stored === "red" || stored === "yellow" || stored === "green" || stored === "blue" || stored === "purple") {
      return stored;
    }
    return null;
  }, [folderColorMap]);

  const updateFolderColors = useCallback((targetItems: ProfileDocument[], color: DocumentLabelColor | null) => {
    const folderTargets = targetItems.filter((item) => item.itemKind === "folder");
    if (folderTargets.length === 0) {
      return;
    }
    setFolderColorMap((prev) => {
      const next = { ...prev };
      for (const item of folderTargets) {
        if (color === null) {
          delete next[String(item.id)];
        } else {
          next[String(item.id)] = color;
        }
      }
      return next;
    });
  }, []);

  const zoomScale = ZOOM_SCALES[zoomLevel];

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
    const isDraftFolderActive = draftFolderName !== null;
    if (isDraftFolderActive && !wasDraftFolderActiveRef.current && draftFolderInputRef.current) {
      draftFolderInputRef.current.focus();
      draftFolderInputRef.current.select();
    }
    wasDraftFolderActiveRef.current = isDraftFolderActive;
  }, [draftFolderName]);

  useEffect(() => {
    if (!canvasDrag) {
      return;
    }

    const handleMove = (event: MouseEvent) => {
      const dx = event.clientX - canvasDrag.pointerStart.x;
      const dy = event.clientY - canvasDrag.pointerStart.y;
      setCanvasPositions((prev) => {
        const next = { ...prev };
        for (const id of canvasDrag.itemIds) {
          const initial = canvasDrag.initial[id];
          if (!initial) continue;
          next[String(id)] = {
            x: Math.max(0, initial.x + dx),
            y: Math.max(0, initial.y + dy)
          };
        }
        return next;
      });
    };

    const handleUp = () => {
      setCanvasDrag(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [canvasDrag]);

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

  const handleColorItems = async (targetItems: ProfileDocument[], labelColor: DocumentLabelColor | null) => {
    if (!onUpdateDocumentColor || targetItems.length === 0) {
      return;
    }

    setIsApplyingBulkAction(true);
    try {
      for (const item of targetItems) {
        await Promise.resolve(onUpdateDocumentColor(item.id, labelColor));
      }
    } finally {
      setIsApplyingBulkAction(false);
    }
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
  const inspectorPath = inspectorItem ? getDocumentPath(inspectorItem.id) || "Hlavní Složka" : breadcrumbs.map((crumb) => crumb.label).join(" / ");
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

  const renderTile = (item: ProfileDocument, options?: { canvas?: boolean; canvasIndex?: number }) => {
    const isCanvas = options?.canvas === true;
    const canvasIndex = options?.canvasIndex ?? 0;
    const isSelected = selectedItemIds.includes(item.id);
    const isFolder = item.itemKind === "folder";
    const folderDropKey = `folder:${item.id}`;
    const isDropTarget = dropTargetKey === folderDropKey;
    const isRenaming = renamingItemId === item.id;
    const folderItemCount = isFolder ? getFolderItemCount(item.id) : 0;
    const ext = getFileExtension(item.filename);
    const fileKind = isFolder ? "generic" : getFileKind(item.filename);
    const labelColor = getDocumentLabelColor(item);
    const folderColor = getFolderColorFor(item);

    const tileClassNames = [
      "ec-fs-tile",
      `ec-fs-tile--${item.itemKind}`,
      isCanvas ? "ec-fs-tile--canvas" : "",
      isSelected ? "is-selected" : "",
      isDropTarget ? "is-drop-target" : "",
      isRenaming ? "is-renaming" : ""
    ].filter(Boolean).join(" ");

    const canvasPos = isCanvas ? canvasPositions[String(item.id)] : null;
    const fallbackTileWidth = Math.round(124 * zoomScale);
    const fallbackTileHeight = Math.round(118 * zoomScale);
    const fallbackPerRow = 5;
    const fallbackX = 16 + (canvasIndex % fallbackPerRow) * fallbackTileWidth;
    const fallbackY = 16 + Math.floor(canvasIndex / fallbackPerRow) * fallbackTileHeight;
    const tileStyle: React.CSSProperties | undefined = isCanvas
      ? {
          position: "absolute",
          left: canvasPos?.x ?? fallbackX,
          top: canvasPos?.y ?? fallbackY
        }
      : undefined;

    return (
      <div
        key={item.id}
        data-document-id={item.id}
        className={tileClassNames}
        title={item.filename}
        style={tileStyle}
        draggable={!isCanvas && !isRenaming && !isApplyingBulkAction}
        onMouseDown={(event) => {
          if (!isCanvas || event.button !== 0 || isRenaming) {
            return;
          }
          const targetEl = event.target as HTMLElement;
          if (targetEl.tagName === "INPUT" || targetEl.tagName === "TEXTAREA") {
            return;
          }
          event.stopPropagation();
          const movingIds = selectedItemIds.includes(item.id) && selectedItemIds.length > 0
            ? selectedItemIds
            : [item.id];
          if (!selectedItemIds.includes(item.id)) {
            setSelectedItemIds([item.id]);
            setLastSelectedId(item.id);
          }
          const initial: Record<number, { x: number; y: number }> = {};
          for (const id of movingIds) {
            const pos = canvasPositions[String(id)];
            initial[id] = pos ? { ...pos } : { x: 16, y: 16 };
          }
          setCanvasDrag({
            itemIds: movingIds,
            initial,
            pointerStart: { x: event.clientX, y: event.clientY }
          });
        }}
        onClick={(event) => handleTileClick(item, event)}
        onDoubleClick={() => handleTileDoubleClick(item)}
        onContextMenu={(event) => handleTileContextMenu(item, event)}
        onDragStart={(event) => {
          if (isCanvas) {
            event.preventDefault();
            return;
          }
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
          {isFolder ? <FolderGlyph color={folderColor} /> : <FileGlyph kind={fileKind} extension={ext} />}
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
          <div className="ec-fs-tile-name-wrap">
            {labelColor.value ? <span className="ec-fs-label-dot" style={{ backgroundColor: labelColor.color }} /> : null}
            <div className="ec-fs-tile-name">{item.filename}</div>
          </div>
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
    const labelColor = getDocumentLabelColor(item);
    const folderColor = getFolderColorFor(item);

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
          {isFolder ? <FolderGlyph small color={folderColor} /> : <FileGlyph kind={fileKind} extension={ext} small />}
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
            <span className="ec-fs-row-name">
              {labelColor.value ? <span className="ec-fs-label-dot" style={{ backgroundColor: labelColor.color }} /> : null}
              <span>{item.filename}</span>
            </span>
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
          <FolderGlyph color={null} />
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
          <FolderGlyph small color={null} />
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
      <div className="ec-fs-workspace">
        <div className="ec-fs-main-column">
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
              className={`ec-fs-view-toggle-btn ${viewMode === "list" ? "is-active" : ""}`}
              onClick={() => setViewMode("list")}
              title="Seznam (řádky)"
              aria-pressed={viewMode === "list"}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="1" y="2" width="14" height="2" rx="1" fill="currentColor" />
                <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" />
                <rect x="1" y="12" width="14" height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
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
              className={`ec-fs-view-toggle-btn ${viewMode === "canvas" ? "is-active" : ""}`}
              onClick={() => setViewMode("canvas")}
              title="Plátno (volné rozmístění)"
              aria-pressed={viewMode === "canvas"}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="1" y="1" width="14" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <rect x="3.5" y="3.5" width="4" height="4" rx="0.6" fill="currentColor" />
                <rect x="9" y="8" width="4" height="4" rx="0.6" fill="currentColor" />
              </svg>
            </button>
          </div>
          <div className="ec-fs-zoom-slider" role="group" aria-label="Velikost zobrazení">
            <span className="ec-fs-zoom-icon ec-fs-zoom-icon--small" aria-hidden="true">A</span>
            <input
              type="range"
              min={1}
              max={3}
              step={1}
              value={ZOOM_LEVEL_TO_VALUE[zoomLevel]}
              onChange={(event) => {
                const numeric = Number(event.target.value);
                const next = ZOOM_VALUE_TO_LEVEL[numeric] ?? "normal";
                setZoomLevel(next);
              }}
              className="ec-fs-zoom-input"
              aria-label="Přiblížení"
              title={`Velikost: ${zoomLevel === "small" ? "Malé" : zoomLevel === "big" ? "Velké" : "Normální"}`}
            />
            <span className="ec-fs-zoom-icon ec-fs-zoom-icon--big" aria-hidden="true">A</span>
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

        <div className="ec-fs-browser-area" style={{ ['--ec-fs-zoom' as string]: zoomScale }}>
          {isLoading ? (
            <p className="ec-empty-text">Načítám dokumenty…</p>
          ) : filteredItems.length > 0 || draftFolderName !== null || (onCreateFolder && !normalizedSearch) ? (
            viewMode === "grid" ? (
              <div
                ref={activeSelectionSurfaceRef}
                className={`ec-fs-grid ec-fs-zoom--${zoomLevel}`}
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
                {filteredItems.map((item) => renderTile(item))}
                {renderDraftFolderTile()}
                {renderAddFolderTile()}
                {selectionBox ? <div className="ec-fs-selection-rect" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} /> : null}
              </div>
            ) : viewMode === "canvas" ? (
              <div
                ref={activeSelectionSurfaceRef}
                className={`ec-fs-canvas ec-fs-zoom--${zoomLevel}`}
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
                {filteredItems.map((item, index) => renderTile(item, { canvas: true, canvasIndex: index }))}
                {selectionBox ? <div className="ec-fs-selection-rect" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} /> : null}
                <div className="ec-fs-canvas-label">Plátno</div>
              </div>
            ) : (
              <div
                ref={activeSelectionSurfaceRef}
                className={`ec-fs-list ec-fs-zoom--${zoomLevel}`}
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

          {onUpdateDocumentColor ? (
            <div className="ec-fs-color-section">
              <div className="ec-fs-color-section-label">Tečka</div>
              <div className="ec-fs-color-strip" aria-label="Barva tečky">
                {DOCUMENT_LABEL_COLORS.map((entry) => (
                  <button
                    key={`inspector-color-${entry.value ?? "none"}`}
                    type="button"
                    className={`ec-fs-color-dot-btn ${selectedItems.length > 0 && selectedItems.every((item) => (item.labelColor ?? null) === entry.value) ? "is-active" : ""}`}
                    title={entry.label}
                    aria-label={entry.label}
                    onClick={() => void handleColorItems(selectedItems, entry.value)}
                    disabled={selectedItems.length === 0 || isApplyingBulkAction}
                  >
                    <span className={`ec-fs-color-dot ${entry.value ? "" : "is-empty"}`} style={entry.color ? { backgroundColor: entry.color } : undefined} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="ec-fs-color-section">
            <div className="ec-fs-color-section-label">Složka</div>
            <div className="ec-fs-color-strip ec-fs-color-strip--folders" aria-label="Barva složky">
              {FOLDER_COLOR_OPTIONS.map((entry) => {
                const folderTargets = selectedItems.filter((item) => item.itemKind === "folder");
                const isActive = folderTargets.length > 0 && folderTargets.every((item) => (folderColorMap[String(item.id)] ?? null) === entry.value);
                return (
                  <button
                    key={`inspector-folder-color-${entry.value ?? "none"}`}
                    type="button"
                    className={`ec-fs-folder-swatch-btn ${isActive ? "is-active" : ""}`}
                    title={entry.label}
                    aria-label={entry.label}
                    onClick={() => updateFolderColors(selectedItems, entry.value)}
                    disabled={folderTargets.length === 0}
                  >
                    <FolderSwatch color={entry.value} isEmpty={entry.value === null} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ec-fs-inspector-details">
            <div className="ec-fs-inspector-title">
              <span>{inspectorItem ? (inspectorItem.itemKind === "folder" ? "Složka" : "Soubor") : selectedItems.length > 1 ? "Více položek" : "Aktuální složka"}</span>
              <strong>{inspectorItem?.filename ?? (selectedItems.length > 1 ? `${selectedItems.length} vybraných položek` : breadcrumbs[breadcrumbs.length - 1]?.label ?? "Hlavní Složka")}</strong>
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
                      {` · ${getDocumentPath(item.id) || "Hlavní Složka"}`}
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
          {onUpdateDocumentColor ? (
            <>
              <div className="ec-fs-context-separator" />
              <div className="ec-fs-context-label-title">Tečka</div>
              <div className="ec-fs-context-color-row" role="group" aria-label="Barva tečky">
                {DOCUMENT_LABEL_COLORS.map((entry) => (
                  <button
                    key={`context-color-${entry.value ?? "none"}`}
                    type="button"
                    className={`ec-fs-color-dot-btn ${contextMenuTargets.every((item) => (item.labelColor ?? null) === entry.value) ? "is-active" : ""}`}
                    title={entry.label}
                    aria-label={entry.label}
                    onClick={() => {
                      const targets = contextMenuTargets;
                      closeContextMenu();
                      void handleColorItems(targets, entry.value);
                    }}
                    disabled={isApplyingBulkAction}
                  >
                    <span className={`ec-fs-color-dot ${entry.value ? "" : "is-empty"}`} style={entry.color ? { backgroundColor: entry.color } : undefined} />
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {contextMenuTargets.some((item) => item.itemKind === "folder") ? (
            <>
              <div className="ec-fs-context-label-title">Složka</div>
              <div className="ec-fs-context-color-row ec-fs-context-color-row--folders" role="group" aria-label="Barva složky">
                {FOLDER_COLOR_OPTIONS.map((entry) => {
                  const folderTargets = contextMenuTargets.filter((item) => item.itemKind === "folder");
                  const isActive = folderTargets.length > 0 && folderTargets.every((item) => (folderColorMap[String(item.id)] ?? null) === entry.value);
                  return (
                    <button
                      key={`context-folder-color-${entry.value ?? "none"}`}
                      type="button"
                      className={`ec-fs-folder-swatch-btn ${isActive ? "is-active" : ""}`}
                      title={entry.label}
                      aria-label={entry.label}
                      onClick={() => {
                        const targets = contextMenuTargets;
                        closeContextMenu();
                        updateFolderColors(targets, entry.value);
                      }}
                    >
                      <FolderSwatch color={entry.value} isEmpty={entry.value === null} />
                    </button>
                  );
                })}
              </div>
            </>
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

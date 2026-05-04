import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "../../utils/api";
import type { ProfileDocument } from "../types/profile";

type DocumentResource = "clients" | "partners" | "tipers" | "project-clients" | "project-partners" | "project-tipers";

export type DocumentBreadcrumb = {
  id: number | null;
  label: string;
};

type UseProfileDocumentsResult = {
  documents: ProfileDocument[];
  archivedDocuments: ProfileDocument[];
  visibleDocuments: ProfileDocument[];
  allDocuments: ProfileDocument[];
  currentFolderId: number | null;
  breadcrumbs: DocumentBreadcrumb[];
  folderOptions: DocumentBreadcrumb[];
  isLoading: boolean;
  isUploading: boolean;
  downloadBaseUrl: string;
  uploadDocument: (file: File) => Promise<void>;
  uploadDocuments: (files: Iterable<File>) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameDocument: (documentId: number, filename: string) => Promise<boolean>;
  deleteDocument: (documentId: number) => Promise<boolean>;
  archiveDocument: (documentId: number) => Promise<boolean>;
  unarchiveDocument: (documentId: number) => Promise<boolean>;
  moveDocument: (documentId: number, parentId: number | null) => Promise<boolean>;
  openFolder: (folderId: number) => void;
  goToFolder: (folderId: number | null) => void;
  goBack: () => void;
  canMoveDocumentTo: (documentId: number, parentId: number | null) => boolean;
  getDocumentPath: (documentId: number) => string;
  getFolderItemCount: (folderId: number) => number;
};

const sortDocumentItems = (left: ProfileDocument, right: ProfileDocument) => {
  if (left.itemKind !== right.itemKind) {
    return left.itemKind === "folder" ? -1 : 1;
  }

  return left.filename.localeCompare(right.filename, 'cs', { sensitivity: 'base' });
};

const normalizeDocument = (item: ProfileDocument): ProfileDocument => ({
  ...item,
  itemKind: item.itemKind ?? (item.mimeType === 'inode/directory' ? 'folder' : 'file'),
  parentId: item.parentId ?? null,
  noteId: item.noteId ?? null,
  archivedAt: item.archivedAt ?? null
});

const buildDocumentPath = (itemsById: Map<number, ProfileDocument>, itemId: number): string => {
  const parts: string[] = [];
  let current = itemsById.get(itemId) ?? null;

  while (current) {
    parts.unshift(current.filename);
    current = current.parentId ? itemsById.get(current.parentId) ?? null : null;
  }

  return parts.join(" / ");
};

export const useProfileDocuments = (resource: DocumentResource, entityId: number | null): UseProfileDocumentsResult => {
  const [documents, setDocuments] = useState<ProfileDocument[]>([]);
  const [archivedDocuments, setArchivedDocuments] = useState<ProfileDocument[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const downloadBaseUrl = useMemo(() => `${API_BASE}/documents`, []);

  const fetchDocuments = useCallback(async () => {
    if (!entityId) {
      setDocuments([]);
      setArchivedDocuments([]);
      return;
    }
    setIsLoading(true);
    try {
      const payload = await apiGet<ProfileDocument[]>(`/${resource}/${entityId}/documents?includeArchived=true`);
      const all = (Array.isArray(payload) ? payload : []).map(normalizeDocument);
      setDocuments(all.filter((d) => !d.archivedAt));
      setArchivedDocuments(all.filter((d) => !!d.archivedAt));
    } catch (error) {
      console.error(`Error fetching ${resource} documents:`, error);
    } finally {
      setIsLoading(false);
    }
  }, [entityId, resource]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const activeDocumentMap = useMemo(() => {
    const map = new Map<number, ProfileDocument>();
    for (const item of documents) {
      map.set(item.id, item);
    }
    return map;
  }, [documents]);

  const allDocumentMap = useMemo(() => {
    const map = new Map<number, ProfileDocument>();
    for (const item of [...documents, ...archivedDocuments]) {
      map.set(item.id, item);
    }
    return map;
  }, [documents, archivedDocuments]);

  useEffect(() => {
    if (currentFolderId === null) {
      return;
    }

    const currentFolder = activeDocumentMap.get(currentFolderId);
    if (!currentFolder || currentFolder.itemKind !== "folder") {
      setCurrentFolderId(null);
    }
  }, [activeDocumentMap, currentFolderId]);

  const visibleDocuments = useMemo(
    () => documents.filter((item) => item.parentId === currentFolderId).slice().sort(sortDocumentItems),
    [currentFolderId, documents]
  );

  const breadcrumbs = useMemo(() => {
    const trail: DocumentBreadcrumb[] = [{ id: null, label: "Kořen" }];

    let current = currentFolderId ? activeDocumentMap.get(currentFolderId) ?? null : null;
    const parents: DocumentBreadcrumb[] = [];

    while (current) {
      parents.unshift({ id: current.id, label: current.filename });
      current = current.parentId ? activeDocumentMap.get(current.parentId) ?? null : null;
    }

    return trail.concat(parents);
  }, [activeDocumentMap, currentFolderId]);

  const folderOptions = useMemo(() => {
    const folders = documents
      .filter((item) => item.itemKind === "folder")
      .slice()
      .sort(sortDocumentItems)
      .map((item) => ({ id: item.id, label: buildDocumentPath(activeDocumentMap, item.id) }));

    return [{ id: null, label: "Kořen" }, ...folders];
  }, [activeDocumentMap, documents]);

  const uploadDocuments = useCallback(async (files: Iterable<File>) => {
    if (!entityId) {
      return;
    }

    const fileList = Array.from(files);
    if (fileList.length === 0) {
      return;
    }

    setIsUploading(true);
    try {
      for (const file of fileList) {
        const formData = new FormData();
        formData.append("file", file);
        if (currentFolderId !== null) {
          formData.append("parentId", String(currentFolderId));
        }
        await apiUpload(`/${resource}/${entityId}/documents`, formData);
      }
      await fetchDocuments();
    } catch (error) {
      console.error(`Error uploading ${resource} documents:`, error);
      alert("Nepodařilo se nahrát dokumenty. Zkuste to prosím znovu.");
    } finally {
      setIsUploading(false);
    }
  }, [currentFolderId, entityId, fetchDocuments, resource]);

  const uploadDocument = useCallback(async (file: File) => {
    await uploadDocuments([file]);
  }, [uploadDocuments]);

  const createFolder = useCallback(async (name: string) => {
    if (!entityId || !name.trim()) {
      return;
    }

    try {
      await apiPost(`/${resource}/${entityId}/document-folders`, {
        name,
        parentId: currentFolderId
      });
      await fetchDocuments();
    } catch (error) {
      console.error(`Error creating ${resource} folder:`, error);
      alert("Nepodařilo se vytvořit složku. Zkuste to prosím znovu.");
    }
  }, [currentFolderId, entityId, fetchDocuments, resource]);

  const renameDocument = useCallback(async (documentId: number, filename: string) => {
    const nextFilename = filename.trim();
    if (!nextFilename) {
      return false;
    }

    try {
      await apiPatch(`/documents/${documentId}`, { filename: nextFilename });
      await fetchDocuments();
      return true;
    } catch (error) {
      console.error("Error renaming document:", error);
      alert("Nepodařilo se přejmenovat položku. Zkuste to prosím znovu.");
      return false;
    }
  }, [fetchDocuments]);

  const deleteDocument = useCallback(async (documentId: number) => {
    try {
      await apiDelete(`/documents/${documentId}`);
      await fetchDocuments();
      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Nepodařilo se odstranit dokument. Zkuste to prosím znovu.");
      return false;
    }
  }, [fetchDocuments]);

  const archiveDocument = useCallback(async (documentId: number) => {
    try {
      await apiPost(`/documents/${documentId}/archive`);
      await fetchDocuments();
      return true;
    } catch (error) {
      console.error("Error archiving document:", error);
      alert("Nepodařilo se archivovat dokument. Zkuste to prosím znovu.");
      return false;
    }
  }, [fetchDocuments]);

  const unarchiveDocument = useCallback(async (documentId: number) => {
    try {
      await apiPost(`/documents/${documentId}/unarchive`);
      await fetchDocuments();
      return true;
    } catch (error) {
      console.error("Error unarchiving document:", error);
      alert("Nepodařilo se obnovit dokument. Zkuste to prosím znovu.");
      return false;
    }
  }, [fetchDocuments]);

  const moveDocument = useCallback(async (documentId: number, parentId: number | null) => {
    try {
      await apiPatch(`/documents/${documentId}`, { parentId });
      await fetchDocuments();
      return true;
    } catch (error) {
      console.error("Error moving document:", error);
      alert("Nepodařilo se přesunout položku. Zkuste to prosím znovu.");
      return false;
    }
  }, [fetchDocuments]);

  const openFolder = useCallback((folderId: number) => {
    setCurrentFolderId(folderId);
  }, []);

  const goToFolder = useCallback((folderId: number | null) => {
    setCurrentFolderId(folderId);
  }, []);

  const goBack = useCallback(() => {
    if (currentFolderId === null) {
      return;
    }

    const currentFolder = activeDocumentMap.get(currentFolderId);
    setCurrentFolderId(currentFolder?.parentId ?? null);
  }, [activeDocumentMap, currentFolderId]);

  const canMoveDocumentTo = useCallback((documentId: number, parentId: number | null) => {
    const target = parentId === null ? null : activeDocumentMap.get(parentId) ?? null;
    if (target && target.itemKind !== "folder") {
      return false;
    }

    if (parentId === documentId) {
      return false;
    }

    let current = parentId === null ? null : activeDocumentMap.get(parentId) ?? null;
    while (current) {
      if (current.id === documentId) {
        return false;
      }
      current = current.parentId ? activeDocumentMap.get(current.parentId) ?? null : null;
    }

    return true;
  }, [activeDocumentMap]);

  const getDocumentPath = useCallback((documentId: number) => {
    return buildDocumentPath(allDocumentMap, documentId);
  }, [allDocumentMap]);

  const getFolderItemCount = useCallback((folderId: number) => {
    return documents.filter((item) => item.parentId === folderId).length;
  }, [documents]);

  return {
    documents,
    archivedDocuments,
    visibleDocuments,
    allDocuments: [...documents, ...archivedDocuments],
    currentFolderId,
    breadcrumbs,
    folderOptions,
    isLoading,
    isUploading,
    downloadBaseUrl,
    uploadDocument,
    uploadDocuments,
    createFolder,
    renameDocument,
    deleteDocument,
    archiveDocument,
    unarchiveDocument,
    moveDocument,
    openFolder,
    goToFolder,
    goBack,
    canMoveDocumentTo,
    getDocumentPath,
    getFolderItemCount
  };
};

export default useProfileDocuments;

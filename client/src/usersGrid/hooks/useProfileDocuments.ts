import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, apiGet, apiDelete, apiPost, apiUpload } from "../../utils/api";
import type { ProfileDocument } from "../types/profile";

type DocumentResource = "clients" | "partners" | "tipers";

type UseProfileDocumentsResult = {
  documents: ProfileDocument[];
  isLoading: boolean;
  isUploading: boolean;
  downloadBaseUrl: string;
  uploadDocument: (file: File) => Promise<void>;
  deleteDocument: (documentId: number) => Promise<boolean>;
  archiveDocument: (documentId: number) => Promise<boolean>;
};

export const useProfileDocuments = (resource: DocumentResource, entityId: number | null): UseProfileDocumentsResult => {
  const [documents, setDocuments] = useState<ProfileDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const downloadBaseUrl = useMemo(() => `${API_BASE}/documents`, []);

  const fetchDocuments = useCallback(async () => {
    if (!entityId) {
      setDocuments([]);
      return;
    }
    setIsLoading(true);
    try {
      const payload = await apiGet<ProfileDocument[]>(`/${resource}/${entityId}/documents`);
      setDocuments(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error(`Error fetching ${resource} documents:`, error);
    } finally {
      setIsLoading(false);
    }
  }, [entityId, resource]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const uploadDocument = useCallback(async (file: File) => {
    if (!entityId) {
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiUpload(`/${resource}/${entityId}/documents`, formData);
      await fetchDocuments();
    } catch (error) {
      console.error(`Error uploading ${resource} document:`, error);
      alert("Nepodařilo se nahrát dokument. Zkuste to prosím znovu.");
    } finally {
      setIsUploading(false);
    }
  }, [entityId, resource, fetchDocuments]);

  const deleteDocument = useCallback(async (documentId: number) => {
    try {
      await apiDelete(`/documents/${documentId}`);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Nepodařilo se odstranit dokument. Zkuste to prosím znovu.");
      return false;
    }
  }, []);

  const archiveDocument = useCallback(async (documentId: number) => {
    try {
      await apiPost(`/documents/${documentId}/archive`);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      return true;
    } catch (error) {
      console.error("Error archiving document:", error);
      alert("Nepodařilo se archivovat dokument. Zkuste to prosím znovu.");
      return false;
    }
  }, []);

  return {
    documents,
    isLoading,
    isUploading,
    downloadBaseUrl,
    uploadDocument,
    deleteDocument,
    archiveDocument
  };
};

export default useProfileDocuments;

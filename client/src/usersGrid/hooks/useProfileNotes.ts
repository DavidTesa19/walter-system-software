import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "../../utils/api";

export interface ProfileNote {
  id: number;
  entityType: string;
  entityId: number;
  content: string;
  author: string;
  createdAt: string;
}

type NoteResource = "clients" | "partners" | "tipers";

type UseProfileNotesResult = {
  notes: ProfileNote[];
  isLoading: boolean;
  isCreating: boolean;
  createNote: (content: string) => Promise<void>;
  deleteNote: (noteId: number) => Promise<boolean>;
};

export const useProfileNotes = (resource: NoteResource, entityId: number | null): UseProfileNotesResult => {
  const [notes, setNotes] = useState<ProfileNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!entityId) {
      setNotes([]);
      return;
    }
    setIsLoading(true);
    try {
      const payload = await apiGet<ProfileNote[]>(`/${resource}/${entityId}/notes`);
      setNotes(Array.isArray(payload) ? payload : []);
    } catch (error) {
      console.error(`Error fetching ${resource} notes:`, error);
    } finally {
      setIsLoading(false);
    }
  }, [entityId, resource]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const createNote = useCallback(async (content: string) => {
    if (!entityId) {
      return;
    }
    setIsCreating(true);
    try {
      await apiPost(`/${resource}/${entityId}/notes`, { content });
      await fetchNotes();
    } catch (error) {
      console.error(`Error creating ${resource} note:`, error);
      alert("Nepodařilo se vytvořit poznámku. Zkuste to prosím znovu.");
    } finally {
      setIsCreating(false);
    }
  }, [entityId, resource, fetchNotes]);

  const deleteNote = useCallback(async (noteId: number) => {
    try {
      await apiDelete(`/notes/${noteId}`);
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      return true;
    } catch (error) {
      console.error("Error deleting note:", error);
      alert("Nepodařilo se odstranit poznámku. Zkuste to prosím znovu.");
      return false;
    }
  }, []);

  return {
    notes,
    isLoading,
    isCreating,
    createNote,
    deleteNote
  };
};

export default useProfileNotes;

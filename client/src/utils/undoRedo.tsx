import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type UndoRedoResource = "clients" | "partners" | "tipers" | "future-functions" | "all";

type UndoRedoAction = {
  label: string;
  resource: UndoRedoResource;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

type MutationSignal = {
  resource: UndoRedoResource;
  revision: number;
};

type UndoRedoContextValue = {
  canUndo: boolean;
  canRedo: boolean;
  isBusy: boolean;
  pushAction: (action: UndoRedoAction) => void;
  undo: () => void;
  redo: () => void;
  signal: MutationSignal;
  notifyMutation: (resource: UndoRedoResource) => void;
};

const UndoRedoContext = createContext<UndoRedoContextValue | null>(null);

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;

  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }

  return Boolean(element.isContentEditable);
};

export const UndoRedoProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const undoStackRef = useRef<UndoRedoAction[]>([]);
  const redoStackRef = useRef<UndoRedoAction[]>([]);

  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [signal, setSignal] = useState<MutationSignal>({ resource: "all", revision: 0 });

  const syncCounts = useCallback(() => {
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);

  const notifyMutation = useCallback((resource: UndoRedoResource) => {
    setSignal((current) => ({ resource, revision: current.revision + 1 }));
  }, []);

  const pushAction = useCallback(
    (action: UndoRedoAction) => {
      undoStackRef.current.push(action);
      redoStackRef.current = [];
      syncCounts();
    },
    [syncCounts]
  );

  const undo = useCallback(() => {
    if (isBusy) return;
    const action = undoStackRef.current.pop();
    if (!action) return;

    setIsBusy(true);
    syncCounts();

    void (async () => {
      try {
        await action.undo();
        redoStackRef.current.push(action);
        notifyMutation(action.resource);
      } catch (error) {
        undoStackRef.current.push(action);
        console.error("Undo failed:", error);
        alert("Nepodařilo se vrátit změnu (Undo). Zkuste to prosím znovu.");
      } finally {
        setIsBusy(false);
        syncCounts();
      }
    })();
  }, [isBusy, notifyMutation, syncCounts]);

  const redo = useCallback(() => {
    if (isBusy) return;
    const action = redoStackRef.current.pop();
    if (!action) return;

    setIsBusy(true);
    syncCounts();

    void (async () => {
      try {
        await action.redo();
        undoStackRef.current.push(action);
        notifyMutation(action.resource);
      } catch (error) {
        redoStackRef.current.push(action);
        console.error("Redo failed:", error);
        alert("Nepodařilo se zopakovat změnu (Redo). Zkuste to prosím znovu.");
      } finally {
        setIsBusy(false);
        syncCounts();
      }
    })();
  }, [isBusy, notifyMutation, syncCounts]);

  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedo) {
            redo();
          }
          return;
        }

        if (canUndo) {
          undo();
        }
        return;
      }

      if (key === "y") {
        event.preventDefault();
        if (canRedo) {
          redo();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canRedo, canUndo, redo, undo]);

  const value = useMemo<UndoRedoContextValue>(
    () => ({
      canUndo,
      canRedo,
      isBusy,
      pushAction,
      undo,
      redo,
      signal,
      notifyMutation
    }),
    [canRedo, canUndo, isBusy, notifyMutation, pushAction, redo, signal, undo]
  );

  return <UndoRedoContext.Provider value={value}>{children}</UndoRedoContext.Provider>;
};

export const useUndoRedo = (): UndoRedoContextValue => {
  const ctx = useContext(UndoRedoContext);
  if (!ctx) {
    throw new Error("useUndoRedo must be used within an UndoRedoProvider");
  }
  return ctx;
};

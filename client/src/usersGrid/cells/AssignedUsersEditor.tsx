import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ICellEditorParams } from "ag-grid-community";
import { normalizeAssignedUserIds, type AssignableUser } from "../assignmentUtils";
import "./AssignedUsersEditor.css";

interface AssignedUsersEditorRef {
  getValue: () => number[];
  isPopup: () => boolean;
}

interface AssignedUsersEditorParams extends ICellEditorParams {
  users?: AssignableUser[];
}

const sameIds = (left: number[], right: number[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

// Grid-cell counterpart to the profile panel's "Přiřazení uživatelé" picker:
// the same set of users, checked/unchecked inline, persisted through the same
// update path. Committed with node.setDataValue rather than through ag-grid's
// own edit commit so the popup can close on an outside click without the value
// being thrown away (the pattern OptionSelectEditor already uses here).
const AssignedUsersEditor = forwardRef<AssignedUsersEditorRef, AssignedUsersEditorParams>((params, ref) => {
  const users = useMemo<AssignableUser[]>(() => {
    const direct = Array.isArray(params.users) ? params.users : undefined;
    const nested = (params as unknown as { cellEditorParams?: { users?: AssignableUser[] } }).cellEditorParams?.users;
    const list = direct ?? (Array.isArray(nested) ? nested : []);
    return [...list].sort((left, right) => left.username.localeCompare(right.username, "cs"));
  }, [params]);

  const initial = useMemo(() => normalizeAssignedUserIds(params.value), [params.value]);
  const [selected, setSelected] = useState<number[]>(initial);
  // The ref is written by the handlers themselves rather than during render, so
  // a commit that lands in the same tick as the last toggle still sees it.
  const selectedRef = useRef(selected);

  const applySelection = useCallback((next: number[]) => {
    selectedRef.current = next;
    setSelected(next);
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      // Only reached when ag-grid commits on its own; the same "unchanged means
      // unchanged" rule as commit() so an accidental open never saves.
      getValue: () => (sameIds(selectedRef.current, initial) ? initial : selectedRef.current),
      isPopup: () => true,
    }),
    [initial]
  );

  const commit = useCallback(() => {
    const next = selectedRef.current;
    const colId = params.column?.getColId?.() ?? params.column?.getId?.();

    if (!sameIds(next, initial) && params.node && colId != null) {
      params.node.setDataValue(colId, next);
    }

    params.api.stopEditing(true);
  }, [initial, params.api, params.column, params.node]);

  const cancel = useCallback(() => {
    params.api.stopEditing(true);
  }, [params.api]);

  const toggle = useCallback((userId: number) => {
    const prev = selectedRef.current;
    applySelection(prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  }, [applySelection]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current || containerRef.current.contains(event.target as Node)) {
        return;
      }
      commit();
    };

    document.addEventListener("mousedown", handleOutsideClick, true);
    return () => document.removeEventListener("mousedown", handleOutsideClick, true);
  }, [commit]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    };

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [cancel, commit]);

  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="assigned-users-editor" ref={containerRef} tabIndex={-1}>
      <div className="assigned-users-editor-header">Přiřazení uživatelé</div>
      <div className="assigned-users-editor-list">
        {users.map((user) => {
          const isSelected = selected.includes(user.id);
          return (
            <button
              key={user.id}
              type="button"
              className={`assigned-users-editor-option${isSelected ? " selected" : ""}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                toggle(user.id);
              }}
            >
              <span className="assigned-users-editor-check">{isSelected ? "✓" : ""}</span>
              <span>{user.username}</span>
              {user.role ? <span className="assigned-users-editor-role">{user.role}</span> : null}
            </button>
          );
        })}
        {users.length === 0 && <div className="assigned-users-editor-empty">Žádní uživatelé</div>}
      </div>
      <div className="assigned-users-editor-footer">
        <button
          type="button"
          className="assigned-users-editor-action"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            applySelection([]);
          }}
        >
          Zrušit výběr
        </button>
        <button
          type="button"
          className="assigned-users-editor-action primary"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            commit();
          }}
        >
          Hotovo
        </button>
      </div>
    </div>
  );
});

AssignedUsersEditor.displayName = "AssignedUsersEditor";

export default AssignedUsersEditor;

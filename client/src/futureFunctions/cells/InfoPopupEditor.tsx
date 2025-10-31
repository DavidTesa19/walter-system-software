import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import type { ICellEditorParams } from "ag-grid-community";

interface InfoEditorRef {
  getValue: () => string;
  afterGuiAttached?: () => void;
  isPopup?: () => boolean;
}

const InfoPopupEditor = forwardRef<InfoEditorRef, ICellEditorParams>((params, ref) => {
  const editorConfig = params as unknown as {
    maxLength?: number;
    rows?: number;
    cols?: number;
  };

  const maxLength = editorConfig?.maxLength ?? 1000;
  const rows = editorConfig?.rows ?? 8;
  const cols = editorConfig?.cols ?? 60;

  const [value, setValue] = useState(String(params.value ?? ""));
  const valueRef = useRef(String(params.value ?? ""));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const commitEdit = useCallback(() => {
    const latest = textareaRef.current?.value ?? valueRef.current;
    valueRef.current = latest;
    setValue(latest);

    // For popup editors, we must explicitly set the value before stopping edit
    const node = params.node;
    const column = params.column;
    
    if (node && column) {
      const colId = column.getColId();
      node.setDataValue(colId, latest);
    }

    // Use stopEditing(true) to cancel the edit - we already applied the value above
    // This prevents AG Grid from trying to apply the old value again
    params.api.stopEditing(true);
  }, [params.api, params.value, params.node, params.column]);

  const cancelEdit = useCallback(() => {
    params.api.stopEditing(true);
  }, [params.api]);

  useImperativeHandle(ref, () => ({
    getValue: () => textareaRef.current?.value ?? valueRef.current,
    afterGuiAttached: () => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    },
    isPopup: () => true
  }));

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      if (!containerRef.current.contains(event.target as Node)) {
        commitEdit();
      }
    };

    document.addEventListener("mousedown", handleOutside, true);
    return () => document.removeEventListener("mousedown", handleOutside, true);
  }, [commitEdit]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        cancelEdit();
      }
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [cancelEdit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "enter") {
        event.preventDefault();
        commitEdit();
        return;
      }

      if (event.key === "Tab") {
        commitEdit();
      }
    },
    [commitEdit]
  );

  return (
    <div className="info-editor-container" ref={containerRef}>
      <textarea
        ref={textareaRef}
        className="info-editor-textarea"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          valueRef.current = next;
          setValue(next);
        }}
        onKeyDown={handleKeyDown}
        rows={rows}
        maxLength={maxLength}
        style={{ minWidth: `${Math.min(640, Math.max(320, cols * 6))}px` }}
      />
      <div className="info-editor-actions">
        <button
          type="button"
          className="info-editor-btn confirm"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            commitEdit();
          }}
          aria-label="Potvrdit úpravu"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 4L6.5 10.5L4 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="info-editor-btn cancel"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            cancelEdit();
          }}
          aria-label="Zrušit úpravu"
        >
          <svg width="16" height="16" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
});

InfoPopupEditor.displayName = "InfoPopupEditor";

export default InfoPopupEditor;

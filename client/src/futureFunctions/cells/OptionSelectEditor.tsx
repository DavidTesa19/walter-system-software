import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import type { ICellEditorParams } from "ag-grid-community";

type OptionValue = string;

interface OptionSelectEditorRef {
  getValue: () => OptionValue;
  isPopup: () => boolean;
}

interface OptionSelectEditorParams extends ICellEditorParams {
  values?: OptionValue[];
}

const OptionSelectEditor = forwardRef<OptionSelectEditorRef, OptionSelectEditorParams>((params, ref) => {
  const options = useMemo<OptionValue[]>(() => {
    if (Array.isArray(params.values)) {
      return params.values as OptionValue[];
    }
    const candidate = (params as unknown as { cellEditorParams?: { values?: OptionValue[] } }).cellEditorParams?.values;
    return Array.isArray(candidate) ? candidate : [];
  }, [params]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<OptionValue>(() => String(params.value ?? ""));

  useEffect(() => {
    setSelected(String(params.value ?? ""));
  }, [params.value]);

  const commitSelection = useCallback(
    (value: OptionValue) => {
      const node = params.node;
      const column = params.column;
      const colId = column?.getColId?.() ?? column?.getId?.();

      if (node && colId != null) {
        node.setDataValue(colId, value);
      }

      setSelected(value);
      params.api.stopEditing(true);
    },
    [params.api, params.column, params.node]
  );

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => selected,
      isPopup: () => true
    }),
    [selected]
  );

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      if (!containerRef.current.contains(event.target as Node)) {
        params.api.stopEditing(true);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick, true);
    return () => document.removeEventListener("mousedown", handleOutsideClick, true);
  }, [params.api]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        params.api.stopEditing(true);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        commitSelection(selected);
      }
    };

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [commitSelection, params.api, selected]);

  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="select-editor-container" ref={containerRef} tabIndex={-1}>
      {options.map((option) => {
        const isActive = option === selected;
        return (
          <button
            key={option}
            type="button"
            className={`select-option${isActive ? " active" : ""}`}
            onMouseDown={(event) => event.stopPropagation()}
            onMouseEnter={() => setSelected(option)}
            onClick={(event) => {
              event.stopPropagation();
              commitSelection(option);
            }}
          >
            {option}
          </button>
        );
      })}
      {options.length === 0 && <div className="select-option empty">Žádné možnosti</div>}
    </div>
  );
});

OptionSelectEditor.displayName = "OptionSelectEditor";

export default OptionSelectEditor;

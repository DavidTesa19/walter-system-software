import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MultiValueEditor,
  type EditableField,
  type FieldSaveHandler,
  type SpecializationPickerConfig,
} from "./EntityCommissionProfilePanel";
import HierarchyEditor from "./HierarchyEditor";
import type { FieldPickerConfig } from "./FieldSelectInput";
import "./SubjectFieldPopover.css";

// Rect of the grid cell the popover is anchored to.
export interface FieldEditorAnchor {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

interface SubjectFieldPopoverProps {
  anchor: FieldEditorAnchor;
  title: string;
  field: EditableField;
  fieldPicker?: FieldPickerConfig;
  specializationPicker?: SpecializationPickerConfig;
  onSave: FieldSaveHandler;
  onClose: () => void;
}

const MIN_WIDTH = 300;
const MAX_WIDTH = 380;
const MARGIN = 8;

// Grid-cell counterpart to a nested block of the profile panel: the very same
// editor the panel uses for that field (the Společnost → Obor → Zaměření tree,
// the Kraj → Lokalita tree, or a flat multi-value list), floated under the
// clicked cell.
//
// It is rendered by the section rather than by the cell renderer on purpose —
// saving refetches and replaces the grid's whole rowData, which destroys and
// recreates every cell renderer. A popover owned by a cell would vanish after
// each edit; owned by the section, it stays open and simply re-renders with the
// freshly-saved values.
const SubjectFieldPopover: React.FC<SubjectFieldPopoverProps> = ({
  anchor,
  title,
  field,
  fieldPicker,
  specializationPicker,
  onSave,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [flipUp, setFlipUp] = useState(false);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const height = panel.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - anchor.bottom - MARGIN;
    const spaceAbove = anchor.top - MARGIN;
    setFlipUp(height > spaceBelow && spaceAbove > spaceBelow);
  }, [anchor.bottom, anchor.top]);

  useEffect(() => {
    const isInsidePanel = (target: Node | null) => Boolean(target && panelRef.current?.contains(target));

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (isInsidePanel(target)) return;
      // The Obor / Zaměření pickers nested in this panel open their own
      // body-appended dropdown (see fieldDropdown.ts). It lives outside this
      // panel's DOM subtree, so without this check every click inside it would
      // read as a click "outside" and close the panel mid-selection.
      if (target?.closest?.("[data-field-dropdown]")) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Let the nested dropdown consume Escape first — it closes itself.
      if (document.querySelector("[data-field-dropdown]")) return;
      onClose();
    };

    // The anchor rect is captured at click time, so any scroll or resize would
    // leave the panel floating away from its cell — close instead of drifting.
    const handleReflow = (event: Event) => {
      const target = event.target as HTMLElement | null;
      // Scrolling the panel itself, or the option list of a picker opened from
      // it, must not count as the surroundings moving.
      if (isInsidePanel(target)) return;
      if (target?.closest?.("[data-field-dropdown]")) return;
      onClose();
    };

    // Deferred so the click that opened the panel doesn't immediately close it.
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("resize", handleReflow);
      document.addEventListener("scroll", handleReflow, true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReflow);
      document.removeEventListener("scroll", handleReflow, true);
    };
  }, [onClose]);

  const width = Math.min(Math.max(anchor.width, MIN_WIDTH), MAX_WIDTH);
  const style: React.CSSProperties = {
    left: Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN)),
    width,
    maxHeight: `${Math.max(180, (flipUp ? anchor.top : window.innerHeight - anchor.bottom) - 2 * MARGIN)}px`,
    ...(flipUp
      ? { bottom: Math.max(MARGIN, window.innerHeight - anchor.top + 2) }
      : { top: anchor.bottom + 2 }),
  };

  return createPortal(
    <div ref={panelRef} className="subject-field-popover" style={style} role="dialog" aria-label={title}>
      <div className="subject-field-popover-header">
        <span className="subject-field-popover-title">{title}</span>
        <button
          type="button"
          className="subject-field-popover-close"
          onClick={onClose}
          title="Zavřít"
          aria-label="Zavřít"
        >
          ×
        </button>
      </div>
      {field.type === "hierarchy" ? (
        <HierarchyEditor
          kind={field.hierarchyKind ?? "company"}
          source={field.hierarchySource}
          onSave={(updates) => onSave(updates)}
          fieldPicker={fieldPicker}
          specializationPicker={specializationPicker}
          regionOptions={field.hierarchyParentOptions}
          parentPlaceholder={field.placeholder}
        />
      ) : (
        <MultiValueEditor
          field={field}
          onSave={onSave}
          fieldPicker={fieldPicker}
          specializationPicker={specializationPicker}
        />
      )}
    </div>,
    document.body
  );
};

export default SubjectFieldPopover;

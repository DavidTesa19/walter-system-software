import React from "react";
import { formatMultiValue } from "../multiValue";
import type { FieldEditorAnchor } from "../components/SubjectFieldPopover";

interface HierarchyCellParams {
  value?: unknown;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Opens the section-owned tree editor popover for this row — the same one the
   * sibling column opens, since the two levels are edited together.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onOpenEditor?: (data: any, anchorRect: FieldEditorAnchor) => void;
  // Ag-grid params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/**
 * Grid cell for one level of a nested subject tree (Kraj / Lokalita).
 *
 * Shows the joined values and, on click, opens the popover holding the whole
 * tree — so a subject with several kraje or several addresses is as editable
 * from the table as a single-valued one, and every write goes through the same
 * entity-update path the profile panel uses. Mirrors what the Obor and Zaměření
 * cells already do for the Společnost tree.
 */
const HierarchyCellRenderer: React.FC<HierarchyCellParams> = (params) => {
  const text = formatMultiValue(params.value);
  const canOpenEditor = typeof params.onOpenEditor === "function" && !params.disabled;

  const handleClick = (event: React.MouseEvent) => {
    if (!canOpenEditor) return;

    const cellRect = (event.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    event.stopPropagation();
    event.preventDefault();

    params.onOpenEditor!(params.data, cellRect);
  };

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  return (
    <div
      onClick={handleClick}
      className={`field-cell-renderer ${text ? "" : "placeholder"}`}
      title={text || undefined}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        cursor: canOpenEditor ? "pointer" : "default",
        padding: "0 8px",
        borderRadius: "4px",
        transition: "all 0.2s ease",
        opacity: params.disabled ? 0.7 : 1,
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: text ? "inherit" : isDark ? "#888" : "#999",
        }}
      >
        {text || params.placeholder || "—"}
      </span>
      {canOpenEditor ? (
        <span style={{ marginLeft: "auto", opacity: 0.5, display: "flex", alignItems: "center" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      ) : null}
    </div>
  );
};

export default HierarchyCellRenderer;

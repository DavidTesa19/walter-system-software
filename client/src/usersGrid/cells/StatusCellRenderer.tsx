import React from "react";
import { getWorkflowStatusOption, WORKFLOW_STATUS_OPTIONS } from "../workflowStatus";

const StatusCellRenderer: React.FC<any> = (params) => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const usesGridCellEditor = Boolean(params?.colDef?.cellEditor);

  const current = getWorkflowStatusOption(params.value);

  const handleClick = (e: React.MouseEvent) => {
    if (usesGridCellEditor) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    const dropdown = document.createElement("div");
    dropdown.style.cssText = `
      position: fixed;
      top: ${cellRect.bottom + 4}px;
      left: ${cellRect.left}px;
      min-width: ${cellRect.width}px;
      z-index: 10000;
      font-family: var(--font-body, 'Inter', system-ui, sans-serif);
      background: ${isDark ? "#1e2333" : "#ffffff"};
      border: 1px solid ${isDark ? "#2d3550" : "#e2e8f0"};
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,${isDark ? "0.5" : "0.12"});
      padding: 4px 0;
      overflow: hidden;
    `;

    const cleanup = () => {
      if (document.body.contains(dropdown)) {
        document.removeEventListener("click", onOutside);
        document.removeEventListener("keydown", onKey);
        document.body.removeChild(dropdown);
      }
    };

    WORKFLOW_STATUS_OPTIONS.forEach((option) => {
      const row = document.createElement("div");
      row.style.cssText = `
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 6px 12px;
        cursor: pointer;
        font-family: inherit;
        font-weight: 500;
        font-size: 12px;
        color: ${isDark ? "#e2e8f0" : "#1e293b"};
        transition: background 0.15s;
      `;

      const dot = document.createElement("span");
      dot.style.cssText = `
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${option.dotColor};
        flex-shrink: 0;
        display: inline-block;
      `;

      const label = document.createElement("span");
      label.textContent = option.label;

      row.appendChild(dot);
      row.appendChild(label);

      row.addEventListener("mouseenter", () => {
        row.style.background = isDark ? "#2a3047" : "#f1f5f9";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
      });
      row.addEventListener("click", () => {
        params.setValue(option.value);
        cleanup();
      });

      dropdown.appendChild(row);
    });

    document.body.appendChild(dropdown);

    const onOutside = (ev: MouseEvent) => {
      if (!dropdown.contains(ev.target as Node)) cleanup();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") cleanup();
    };
    setTimeout(() => {
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 100);
  };

  return (
    <span
      onClick={handleClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontWeight: 500,
        fontSize: "12px",
        cursor: usesGridCellEditor ? "default" : "pointer",
        userSelect: "none",
        height: "100%",
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          borderRadius: "50%",
          backgroundColor: current.dotColor,
          flexShrink: 0,
        }}
      />
      {current.label}
    </span>
  );
};

export default StatusCellRenderer;

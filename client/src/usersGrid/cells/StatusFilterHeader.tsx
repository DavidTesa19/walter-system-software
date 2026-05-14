import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IHeaderParams } from "ag-grid-community";
import { WORKFLOW_STATUS_OPTIONS } from "../workflowStatus";

const ALL_STATUS_VALUES = WORKFLOW_STATUS_OPTIONS.map((o) => o.value);

export interface StatusFilterHeaderParams extends IHeaderParams {
  activeFilters: Set<string>;
  onFilterChange: (newSet: Set<string>) => void;
}

interface DropdownPos {
  top?: number;
  bottom?: number;
  left: number;
}

const StatusFilterHeader = forwardRef<any, StatusFilterHeaderParams>((props, ref) => {
  const [localFilters, setLocalFilters] = useState<Set<string>>(() => new Set(props.activeFilters));
  const [isOpen, setIsOpen] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    refresh(newParams: StatusFilterHeaderParams) {
      setLocalFilters(new Set(newParams.activeFilters));
      return true;
    },
  }));

  useEffect(() => {
    const { column } = props;
    const onSortChanged = () => {
      setSortDir(column.isSortAscending() ? "asc" : column.isSortDescending() ? "desc" : null);
    };
    column.addEventListener("sortChanged", onSortChanged);
    return () => column.removeEventListener("sortChanged", onSortChanged);
  }, [props.column]);

  useEffect(() => {
    if (!isOpen) return;
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("keydown", onKey);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const openDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const estimatedHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const maxLeft = window.innerWidth - 210;
    const left = Math.min(rect.left, maxLeft);

    if (spaceBelow >= estimatedHeight || rect.top < estimatedHeight) {
      setDropdownPos({ top: rect.bottom + 4, left });
    } else {
      setDropdownPos({ bottom: window.innerHeight - rect.top + 4, left });
    }
    setIsOpen((prev) => !prev);
  };

  const toggle = (value: string) => {
    const next = new Set(localFilters);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    setLocalFilters(next);
    props.onFilterChange(next);
  };

  const selectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const all = new Set(ALL_STATUS_VALUES);
    setLocalFilters(all);
    props.onFilterChange(all);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const empty = new Set<string>();
    setLocalFilters(empty);
    props.onFilterChange(empty);
  };

  const isFilterActive = localFilters.size > 0 && localFilters.size < ALL_STATUS_VALUES.length;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  const iconColor = isFilterActive ? "#793bf6" : isDark ? "#9ca3af" : "#8b9cb3";
  const iconBg = isFilterActive
    ? isDark
      ? "rgba(121,59,246,0.2)"
      : "rgba(121,59,246,0.1)"
    : "transparent";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        gap: "2px",
        overflow: "hidden",
      }}
    >
      <div
        onClick={(e) => props.progressSort(e.shiftKey)}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: "4px",
          cursor: "pointer",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: "12px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: isDark ? "#e2e8f0" : "#1e293b",
          }}
        >
          {props.displayName}
        </span>
        {sortDir && (
          <span
            style={{
              fontSize: "9px",
              flexShrink: 0,
              color: isDark ? "#9ca3af" : "#6b7280",
              lineHeight: 1,
            }}
          >
            {sortDir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </div>

      <button
        ref={buttonRef}
        onClick={openDropdown}
        title={isFilterActive ? `Filtr aktivní (${localFilters.size}/${ALL_STATUS_VALUES.length})` : "Filtrovat stavy"}
        style={{
          background: iconBg,
          border: "none",
          borderRadius: "4px",
          padding: "3px 4px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: iconColor,
          flexShrink: 0,
          lineHeight: 1,
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!isFilterActive) {
            (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isFilterActive) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }
        }}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
          <path d="M1 2.5h14l-5.25 6.3V14l-3.5-1.75V8.8L1 2.5z" />
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownPos.top,
              bottom: dropdownPos.bottom,
              left: dropdownPos.left,
              minWidth: "200px",
              zIndex: 10001,
              background: isDark ? "#1e2333" : "#ffffff",
              border: `1px solid ${isDark ? "#2d3550" : "#e2e8f0"}`,
              borderRadius: "8px",
              boxShadow: `0 4px 20px rgba(0,0,0,${isDark ? "0.55" : "0.14"})`,
              fontFamily: "var(--font-body, 'Inter', system-ui, sans-serif)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "9px 12px 8px",
                borderBottom: `1px solid ${isDark ? "#2d3550" : "#f0f4f8"}`,
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: isDark ? "#9ca3af" : "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Filtrovat stav
              </span>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={selectAll}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "11px",
                    color: "#793bf6",
                    fontWeight: 600,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  Vše
                </button>
                <button
                  onClick={clearAll}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "11px",
                    color: isDark ? "#9ca3af" : "#94a3b8",
                    fontWeight: 500,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  Žádné
                </button>
              </div>
            </div>

            <div style={{ padding: "4px 0" }}>
              {WORKFLOW_STATUS_OPTIONS.map((option) => {
                const checked = localFilters.has(option.value);
                return (
                  <div
                    key={option.value}
                    onClick={() => toggle(option.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "6px 12px",
                      cursor: "pointer",
                      userSelect: "none",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = isDark ? "#2a3047" : "#f8fafc";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(option.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        cursor: "pointer",
                        width: "14px",
                        height: "14px",
                        accentColor: "#793bf6",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: option.dotColor,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        color: isDark ? "#e2e8f0" : "#1e293b",
                        flex: 1,
                      }}
                    >
                      {option.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});

StatusFilterHeader.displayName = "StatusFilterHeader";
export default StatusFilterHeader;

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { IHeaderParams } from "ag-grid-community";

const EMPTY_VALUE = "";
const EMPTY_LABEL = "(Žádný)";

export interface FieldFilterHeaderParams extends IHeaderParams {
  filterRef: React.MutableRefObject<Set<string> | null>;
  onFilterChange: (newSet: Set<string> | null) => void;
  fieldOptions: string[];
  // Optional wording overrides so the same component can filter other columns
  // (e.g. "Kraj"). Default to the "Obor" wording.
  filterButtonTitle?: string;
  filterPanelLabel?: string;
}

interface DropdownPos {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
}

const FieldFilterHeader = forwardRef<any, FieldFilterHeaderParams>((props, ref) => {
  const [localFilters, setLocalFilters] = useState<Set<string> | null>(() => props.filterRef.current);
  const [isOpen, setIsOpen] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [dropdownPos, setDropdownPos] = useState<DropdownPos>({ top: 0, left: 0, maxHeight: 400 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // All available option values including blank
  const allValues = [...props.fieldOptions, EMPTY_VALUE];

  useImperativeHandle(ref, () => ({
    refresh(newParams: FieldFilterHeaderParams) {
      setLocalFilters(newParams.filterRef.current !== null ? new Set(newParams.filterRef.current) : null);
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
    const MARGIN = 12;
    const MIN_HEIGHT = 180;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const maxLeft = window.innerWidth - 220;
    const left = Math.min(rect.left, maxLeft);

    if (spaceBelow >= spaceAbove || spaceBelow >= MIN_HEIGHT) {
      setDropdownPos({
        top: rect.bottom + 4,
        left,
        maxHeight: Math.max(spaceBelow, MIN_HEIGHT),
      });
    } else {
      setDropdownPos({
        bottom: window.innerHeight - rect.top + 4,
        left,
        maxHeight: Math.max(spaceAbove, MIN_HEIGHT),
      });
    }
    setIsOpen((prev) => !prev);
  };

  const getChecked = (value: string) => {
    if (localFilters === null) return true;
    return localFilters.has(value);
  };

  const toggle = (value: string) => {
    if (localFilters === null) {
      // All currently shown — uncheck this one
      const next = new Set(allValues.filter((v) => v !== value));
      setLocalFilters(next);
      props.onFilterChange(next);
      return;
    }
    const next = new Set(localFilters);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    // Normalize back to null if all are selected
    const normalized = next.size >= allValues.length ? null : next;
    setLocalFilters(normalized);
    props.onFilterChange(normalized);
  };

  const selectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalFilters(null);
    props.onFilterChange(null);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const empty = new Set<string>();
    setLocalFilters(empty);
    props.onFilterChange(empty);
  };

  const isFilterActive = localFilters !== null;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  const iconColor = isFilterActive ? "#793bf6" : "var(--ag-header-foreground-color, rgba(255,255,255,0.65))";
  const iconBg = isFilterActive
    ? isDark
      ? "rgba(121,59,246,0.25)"
      : "rgba(121,59,246,0.15)"
    : "transparent";

  const activeCount = localFilters === null ? allValues.length : localFilters.size;

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
          justifyContent: "center",
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
            color: "inherit",
          }}
        >
          {props.displayName}
        </span>
        {sortDir && (
          <span
            style={{
              fontSize: "9px",
              flexShrink: 0,
              color: "inherit",
              opacity: 0.75,
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
        title={
          isFilterActive
            ? `Filtr aktivní (${activeCount}/${allValues.length})`
            : (props.filterButtonTitle ?? "Filtrovat obory")
        }
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
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)";
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
              minWidth: "210px",
              maxHeight: `${dropdownPos.maxHeight}px`,
              zIndex: 10001,
              background: isDark ? "#1e2333" : "#ffffff",
              border: `1px solid ${isDark ? "#2d3550" : "#e2e8f0"}`,
              borderRadius: "8px",
              boxShadow: `0 4px 20px rgba(0,0,0,${isDark ? "0.55" : "0.14"})`,
              fontFamily: "var(--font-body, 'Inter', system-ui, sans-serif)",
              display: "flex",
              flexDirection: "column",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed header — never scrolls away */}
            <div
              style={{
                flexShrink: 0,
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
                {props.filterPanelLabel ?? "Filtrovat obor"}
              </span>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
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
                  onMouseDown={(e) => e.stopPropagation()}
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

            {/* Scrollable list — takes all remaining height */}
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
              {props.fieldOptions.map((value) => {
                const checked = getChecked(value);
                return (
                  <div
                    key={value}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => toggle(value)}
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
                      onChange={() => toggle(value)}
                      onMouseDown={(e) => e.stopPropagation()}
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
                        fontSize: "12px",
                        fontWeight: 500,
                        color: isDark ? "#e2e8f0" : "#1e293b",
                        flex: 1,
                      }}
                    >
                      {value}
                    </span>
                  </div>
                );
              })}

              {/* Empty-value option — separated by a thin rule */}
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => toggle(EMPTY_VALUE)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 12px",
                  cursor: "pointer",
                  userSelect: "none",
                  transition: "background 0.1s",
                  borderTop: `1px solid ${isDark ? "#2d3550" : "#f0f4f8"}`,
                  marginTop: "2px",
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
                  checked={getChecked(EMPTY_VALUE)}
                  onChange={() => toggle(EMPTY_VALUE)}
                  onMouseDown={(e) => e.stopPropagation()}
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
                    fontSize: "12px",
                    fontWeight: 500,
                    color: isDark ? "#6b7280" : "#94a3b8",
                    flex: 1,
                    fontStyle: "italic",
                  }}
                >
                  {EMPTY_LABEL}
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});

FieldFilterHeader.displayName = "FieldFilterHeader";
export default FieldFilterHeader;

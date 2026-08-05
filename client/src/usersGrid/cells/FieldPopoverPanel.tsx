import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

interface FieldPopoverPanelProps {
  anchorRect: AnchorRect;
  minWidth?: number;
  onClose: () => void;
  children: React.ReactNode;
}

// Floating panel anchored under an ag-grid cell, used to host the same
// multi-value editing UI as the profile panel (MultiValueEditor) directly
// inside the grid. Mirrors the positioning/outside-click behaviour of the
// vanilla openFieldDropdown() so both feel like the same control family.
const FieldPopoverPanel: React.FC<FieldPopoverPanelProps> = ({ anchorRect, minWidth = 280, onClose, children }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [flipUp, setFlipUp] = useState(false);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      // The Obor/Zaměření picker nested inside this panel opens its own
      // body-appended dropdown (see fieldDropdown.ts) — that dropdown lives
      // outside this panel's DOM subtree, so without this check every click
      // inside it would look like a click "outside" and close this panel out
      // from under the in-progress selection.
      if (target.closest?.("[data-field-dropdown]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Small delay so the click that opened the panel doesn't immediately close it.
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("keydown", onKey);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const height = panel.getBoundingClientRect().height;
    const spaceBelow = window.innerHeight - anchorRect.bottom - 8;
    const spaceAbove = anchorRect.top - 8;
    setFlipUp(spaceBelow < height && spaceAbove > spaceBelow);
    // Only needs to run once, right after mount, when the panel has its real size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(anchorRect.left, Math.max(8, window.innerWidth - Math.max(anchorRect.width, minWidth) - 8)),
    minWidth: Math.max(anchorRect.width, minWidth),
    maxWidth: 380,
    maxHeight: "min(70vh, 480px)",
    overflowY: "auto",
    zIndex: 10000,
    background: isDark ? "#1a1a1a" : "white",
    border: isDark ? "1px solid #2d2d2d" : "1px solid #ccc",
    borderRadius: 10,
    boxShadow: isDark ? "0 8px 24px rgba(0, 0, 0, 0.45)" : "0 8px 24px rgba(0, 0, 0, 0.18)",
    padding: "10px 12px",
    fontFamily: "var(--font-body)",
    visibility: "visible",
    ...(flipUp ? { bottom: window.innerHeight - anchorRect.top + 2 } : { top: anchorRect.bottom + 2 }),
  };

  return createPortal(
    <div ref={panelRef} style={style} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body
  );
};

export default FieldPopoverPanel;

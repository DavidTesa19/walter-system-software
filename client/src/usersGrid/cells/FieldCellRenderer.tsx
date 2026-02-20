import React from "react";
import { fieldOptions, groupedFieldOptions } from "../fieldOptions";
import type { FieldCategory } from "../fieldOptions";

interface FieldCellParams {
  value: string;
  setValue: (value: string) => void;
  // Ag-grid params
  colDef: any;
  data: any;
  node: any;
}

const FieldCellRenderer: React.FC<FieldCellParams> = (params) => {
  const getCurrentField = () => {
    return (
      fieldOptions.find((option) => option.value === params.value) || {
        value: params.value || "",
        label: params.value || "Vyberte obor"
      }
    );
  };

  const handleFieldClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    // --- State ---
    let currentView: 'categories' | 'suboptions' | 'search' = 'categories';
    let activeCategory: FieldCategory | null = null;
    let searchTerm: string = "";

    // --- DOM Elements ---
    const dropdown = document.createElement("div");
    dropdown.style.position = "fixed";
    dropdown.style.top = `${cellRect.bottom + 2}px`;
    dropdown.style.left = `${cellRect.left}px`;
    dropdown.style.width = `${Math.max(cellRect.width, 260)}px`;
    dropdown.style.zIndex = "10000";
    dropdown.style.backgroundColor = isDark ? "#1a1a1a" : "white";
    dropdown.style.border = isDark ? "1px solid #2d2d2d" : "1px solid #ccc";
    dropdown.style.borderRadius = "4px";
    dropdown.style.boxShadow = isDark ? "0 4px 12px rgba(0, 0, 0, 0.4)" : "0 4px 12px rgba(0, 0, 0, 0.15)";
    dropdown.style.maxHeight = "400px";
    dropdown.style.display = "flex";
    dropdown.style.flexDirection = "column";
    dropdown.style.fontFamily = "var(--font-body)";
    dropdown.style.overflow = "hidden"; // Container handles overflow

    // Search input container (sticky top)
    const searchContainer = document.createElement("div");
    searchContainer.style.padding = "8px";
    searchContainer.style.backgroundColor = isDark ? "#1a1a1a" : "white";
    searchContainer.style.borderBottom = isDark ? "1px solid #2d2d2d" : "1px solid #eee";
    searchContainer.style.flexShrink = "0";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Hledat obor...";
    searchInput.style.width = "100%";
    searchInput.style.padding = "8px 12px";
    searchInput.style.border = isDark ? "1px solid #3d3d3d" : "1px solid #ccc";
    searchInput.style.borderRadius = "4px";
    searchInput.style.backgroundColor = isDark ? "#0d0d0d" : "#f8f9fa";
    searchInput.style.color = isDark ? "#e0e0e0" : "#333";
    searchInput.style.fontSize = "14px";
    searchInput.style.outline = "none";
    searchInput.style.boxSizing = "border-box";
    searchInput.style.fontFamily = "var(--font-body)";

    searchContainer.appendChild(searchInput);
    dropdown.appendChild(searchContainer);

    // List container (scrollable)
    const listContainer = document.createElement("div");
    listContainer.style.overflowY = "auto";
    listContainer.style.flexGrow = "1";
    listContainer.style.maxHeight = "350px";
    dropdown.appendChild(listContainer);

    // Add to DOM
    document.body.appendChild(dropdown);

    // --- Render Logic ---
    const render = () => {
      listContainer.innerHTML = ""; // Clear list

      // 1. Search Mode
      if (searchTerm.trim().length > 0) {
        currentView = 'search';
        
        const filteredOptions = fieldOptions.filter(opt => 
          opt.label.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (filteredOptions.length === 0) {
          const emptyDiv = document.createElement("div");
          emptyDiv.style.padding = "12px";
          emptyDiv.style.color = isDark ? "#888" : "#666";
          emptyDiv.style.textAlign = "center";
          emptyDiv.style.fontStyle = "italic";
          emptyDiv.textContent = "Žádné výsledky";
          listContainer.appendChild(emptyDiv);
        } else {
          filteredOptions.forEach(opt => {
            const item = createItem(opt.label, false, false, () => selectValue(opt.value));
            listContainer.appendChild(item);
          });
        }
      } 
      // 2. Sub-options Mode (Drill down)
      else if (currentView === 'suboptions' && activeCategory) {
        // Back Header
        const backHeader = document.createElement("div");
        backHeader.style.padding = "8px 12px";
        backHeader.style.cursor = "pointer";
        backHeader.style.backgroundColor = isDark ? "#252525" : "#f0f0f0";
        backHeader.style.color = isDark ? "#e0e0e0" : "#333";
        backHeader.style.fontWeight = "bold";
        backHeader.style.borderBottom = isDark ? "1px solid #2d2d2d" : "1px solid #eee";
        backHeader.style.display = "flex";
        backHeader.style.alignItems = "center";
        
        // Back Icon
        const backIcon = document.createElement("span");
        backIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
        backIcon.style.marginRight = "8px";
        backIcon.style.display = "flex";
        
        backHeader.appendChild(backIcon);
        const headerText = document.createElement("span");
        headerText.textContent = activeCategory.label;
        backHeader.appendChild(headerText);

        backHeader.onmouseenter = () => { backHeader.style.backgroundColor = isDark ? "#333" : "#e0e0e0"; };
        backHeader.onmouseleave = () => { backHeader.style.backgroundColor = isDark ? "#252525" : "#f0f0f0"; };
        backHeader.onclick = (e) => {
          e.stopPropagation();
          currentView = 'categories';
          activeCategory = null;
          render();
        };
        listContainer.appendChild(backHeader);

        // Options in category
        activeCategory.options.forEach(opt => {
          const item = createItem(opt.label, false, true, () => selectValue(opt.value));
          listContainer.appendChild(item);
        });
      }
      // 3. Categories Mode (Top level)
      else {
        currentView = 'categories';
        groupedFieldOptions.forEach(group => {
          const item = createItem(group.label, true, false, () => {
            activeCategory = group;
            currentView = 'suboptions';
            render();
            // Scroll to top when entering category
            listContainer.scrollTop = 0; 
          });
          listContainer.appendChild(item);
        });
      }
    };

    // Helper to create list items
    const createItem = (text: string, isGroup: boolean, isSubItem: boolean, onClick: () => void) => {
      const el = document.createElement("div");
      
      // Dynamic styles
      const padding = isSubItem ? "8px 12px 8px 16px" : "10px 12px";
      const fontSize = isSubItem ? "13px" : "14px";
      const fontWeight = isGroup ? "600" : "400";
      const color = isSubItem 
        ? (isDark ? "#b0b0b0" : "#555") 
        : (isDark ? "#e0e0e0" : "#333");

      el.style.padding = padding;
      el.style.fontSize = fontSize;
      el.style.fontWeight = fontWeight;
      el.style.color = color;
      
      el.style.cursor = "pointer";
      el.style.backgroundColor = isDark ? "#1a1a1a" : "white";
      el.style.borderBottom = isDark ? "1px solid #2d2d2d" : "1px solid #eee";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "space-between";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = text;
      el.appendChild(labelSpan);

      if (isGroup) {
         const arrow = document.createElement("span");
         arrow.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
         arrow.style.opacity = "0.6";
         el.appendChild(arrow);
      }

      el.onmouseenter = () => { el.style.backgroundColor = isDark ? "#2d2d2d" : "#f8f9fa"; };
      el.onmouseleave = () => { el.style.backgroundColor = isDark ? "#1a1a1a" : "white"; };
      el.onclick = (e) => {
        e.stopPropagation();
        onClick();
      };
      return el;
    };

    const selectValue = (val: string) => {
      params.setValue(val);
      cleanup();
    };

    // Initial render
    render();

    // Event Listeners
    searchInput.addEventListener("input", (e) => {
      searchTerm = (e.target as HTMLInputElement).value;
      if (searchTerm && currentView !== 'search') currentView = 'search';
      if (!searchTerm && currentView === 'search') currentView = 'categories';
      render();
    });
    
    // Prevent dropdown closing when clicking input
    searchInput.onclick = (e) => e.stopPropagation();

    // Cleanup Logic
    const cleanup = () => {
      if (document.body.contains(dropdown)) {
        document.body.removeChild(dropdown);
      }
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdown.contains(event.target as Node)) {
        cleanup();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cleanup();
      }
    };

    // Add global listeners after short delay to avoid immediate trigger
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      searchInput.focus();
    }, 50);
  };

  const currentField = getCurrentField();
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  return (
    <div
      onClick={handleFieldClick}
      className={`field-cell-renderer ${params.value ? '' : 'placeholder'}`}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        cursor: "pointer",
        padding: "0 8px",
        borderRadius: "4px",
        transition: "all 0.2s ease"
      }}
    >
      <span style={{ 
        overflow: "hidden", 
        textOverflow: "ellipsis", 
        whiteSpace: "nowrap",
        color: !params.value ? (isDark ? "#888" : "#999") : "inherit"
      }}>
        {currentField.label}
      </span>
      {/* Down chevron icon to indicate it's a dropdown */}
      <span style={{ marginLeft: "auto", opacity: 0.5, display: "flex", alignItems: "center" }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </span>
    </div>
  );
};

export default FieldCellRenderer;

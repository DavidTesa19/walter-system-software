import React from "react";
import {
  fieldOptions as defaultFieldOptions,
  groupedFieldOptions as defaultGroupedFieldOptions,
} from "../fieldOptions";
import type { FieldCategory, FieldOption } from "../fieldOptions";

interface FieldCellParams {
  value: string;
  setValue?: (value: string) => void;
  fieldOptions?: FieldOption[];
  groupedFieldOptions?: FieldCategory[];
  onCreateFieldOption?: (value: string) => Promise<FieldOption | void> | FieldOption | void;
  onDeleteFieldOption?: (optionId: number) => Promise<void> | void;
  disabled?: boolean;
  // Ag-grid params
  colDef: any;
  data: any;
  node: any;
}

const REMOVED_FIELD_LABEL = "Odstraněno";

const FieldCellRenderer: React.FC<FieldCellParams> = (params) => {
  const availableFieldOptions = params.fieldOptions ?? defaultFieldOptions;
  const availableGroupedFieldOptions = params.groupedFieldOptions ?? defaultGroupedFieldOptions;
  const flatFieldOptions = availableFieldOptions.length > 0
    ? availableFieldOptions
    : availableGroupedFieldOptions.flatMap((group) => group.options);
  const menuGroups = availableGroupedFieldOptions.filter((group) => group.options.length > 0);
  const showCategories = menuGroups.length > 1;
  const canCreateFieldOptions = !params.disabled && typeof params.onCreateFieldOption === "function";
  const canDeleteFieldOptions = !params.disabled && typeof params.onDeleteFieldOption === "function";

  const getCurrentField = () => {
    return (
      flatFieldOptions.find((option) => option.value === params.value) || {
        value: params.value || "",
        label: params.value || "Vyberte obor"
      }
    );
  };

  const handleFieldClick = (e: React.MouseEvent) => {
    if (params.disabled) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    // --- State ---
    let currentView: 'categories' | 'suboptions' | 'search' = 'categories';
    let activeCategory: FieldCategory | null = null;
    let searchTerm: string = "";
    let isAddingOption = false;
    let isSubmittingOption = false;
    let pendingFieldOptionName = "";
    let footerErrorMessage = "";

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

    const footerContainer = document.createElement("div");
    footerContainer.style.padding = "8px";
    footerContainer.style.borderTop = isDark ? "1px solid #2d2d2d" : "1px solid #eee";
    footerContainer.style.backgroundColor = isDark ? "#1a1a1a" : "white";
    footerContainer.style.flexShrink = "0";
    dropdown.appendChild(footerContainer);

    // Add to DOM
    document.body.appendChild(dropdown);

    // --- Render Logic ---
    const render = () => {
      listContainer.innerHTML = ""; // Clear list

      // 1. Search Mode
      if (searchTerm.trim().length > 0) {
        currentView = 'search';
        
        const filteredOptions = flatFieldOptions.filter(opt => 
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
            const item = createOptionItem(opt, false);
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
          const item = createOptionItem(opt, true);
          listContainer.appendChild(item);
        });
      }
      // 3. Categories Mode (Top level)
      else {
        currentView = 'categories';
        const rootOptions = showCategories
          ? menuGroups
          : (menuGroups[0]?.options ?? flatFieldOptions);

        rootOptions.forEach((entry) => {
          const isGroup = showCategories;
          const item = createItem(isGroup ? entry.label : entry.label, isGroup, false, () => {
            if (showCategories) {
              activeCategory = entry as FieldCategory;
              currentView = 'suboptions';
              render();
              listContainer.scrollTop = 0;
              return;
            }

            selectValue((entry as FieldOption).value);
          });
          listContainer.appendChild(item);
        });
      }

      renderFooter();
    };

    const renderFooter = () => {
      footerContainer.innerHTML = "";

      if (!canCreateFieldOptions) {
        return;
      }

      if (!isAddingOption) {
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = "+ Přidat";
        addButton.style.width = "100%";
        addButton.style.padding = "10px 12px";
        addButton.style.border = "none";
        addButton.style.borderRadius = "6px";
        addButton.style.cursor = "pointer";
        addButton.style.fontSize = "14px";
        addButton.style.fontWeight = "600";
        addButton.style.fontFamily = "var(--font-body)";
        addButton.style.backgroundColor = isDark ? "#252525" : "#f3f7fb";
        addButton.style.color = isDark ? "#e0e0e0" : "#22577a";
        addButton.onclick = (event) => {
          event.stopPropagation();
          isAddingOption = true;
          pendingFieldOptionName = searchTerm.trim();
          footerErrorMessage = "";
          renderFooter();
        };
        footerContainer.appendChild(addButton);
        return;
      }

      const formContainer = document.createElement("div");
      formContainer.style.display = "flex";
      formContainer.style.flexDirection = "column";
      formContainer.style.gap = "8px";

      const input = document.createElement("input");
      input.type = "text";
      input.value = pendingFieldOptionName;
      input.placeholder = "Název nového oboru";
      input.style.width = "100%";
      input.style.padding = "8px 12px";
      input.style.border = isDark ? "1px solid #3d3d3d" : "1px solid #ccc";
      input.style.borderRadius = "6px";
      input.style.backgroundColor = isDark ? "#0d0d0d" : "#f8f9fa";
      input.style.color = isDark ? "#e0e0e0" : "#333";
      input.style.fontSize = "14px";
      input.style.fontFamily = "var(--font-body)";
      input.oninput = (event) => {
        pendingFieldOptionName = (event.target as HTMLInputElement).value;
        footerErrorMessage = "";
      };
      input.onkeydown = (event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          void submitNewFieldOption();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          isAddingOption = false;
          pendingFieldOptionName = "";
          footerErrorMessage = "";
          renderFooter();
        }
      };
      formContainer.appendChild(input);

      if (footerErrorMessage) {
        const errorLabel = document.createElement("div");
        errorLabel.textContent = footerErrorMessage;
        errorLabel.style.fontSize = "12px";
        errorLabel.style.color = "#d14343";
        formContainer.appendChild(errorLabel);
      }

      const actionsRow = document.createElement("div");
      actionsRow.style.display = "flex";
      actionsRow.style.gap = "8px";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = "Zrušit";
      cancelButton.disabled = isSubmittingOption;
      cancelButton.style.flex = "1";
      cancelButton.style.padding = "8px 12px";
      cancelButton.style.border = isDark ? "1px solid #3d3d3d" : "1px solid #ccc";
      cancelButton.style.borderRadius = "6px";
      cancelButton.style.cursor = isSubmittingOption ? "default" : "pointer";
      cancelButton.style.backgroundColor = isDark ? "#1a1a1a" : "white";
      cancelButton.style.color = isDark ? "#e0e0e0" : "#333";
      cancelButton.onclick = (event) => {
        event.stopPropagation();
        isAddingOption = false;
        pendingFieldOptionName = "";
        footerErrorMessage = "";
        renderFooter();
      };
      actionsRow.appendChild(cancelButton);

      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.textContent = isSubmittingOption ? "Ukládám..." : "Uložit";
      saveButton.disabled = isSubmittingOption;
      saveButton.style.flex = "1";
      saveButton.style.padding = "8px 12px";
      saveButton.style.border = "none";
      saveButton.style.borderRadius = "6px";
      saveButton.style.cursor = isSubmittingOption ? "default" : "pointer";
      saveButton.style.backgroundColor = "#0ea5e9";
      saveButton.style.color = "white";
      saveButton.onclick = (event) => {
        event.stopPropagation();
        void submitNewFieldOption();
      };
      actionsRow.appendChild(saveButton);

      formContainer.appendChild(actionsRow);
      footerContainer.appendChild(formContainer);

      requestAnimationFrame(() => input.focus());
    };

    // Helper to create list items
    const createItem = (
      text: string,
      isGroup: boolean,
      isSubItem: boolean,
      onClick: () => void,
      action?: { label: string; onClick: () => void }
    ) => {
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
      labelSpan.style.flex = "1";
      labelSpan.style.minWidth = "0";
      labelSpan.style.overflow = "hidden";
      labelSpan.style.textOverflow = "ellipsis";
      labelSpan.style.whiteSpace = "nowrap";
      el.appendChild(labelSpan);

      if (isGroup) {
         const arrow = document.createElement("span");
         arrow.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
         arrow.style.opacity = "0.6";
         el.appendChild(arrow);
      } else if (action) {
        const actionButton = document.createElement("button");
        actionButton.type = "button";
        actionButton.textContent = action.label;
        actionButton.style.marginLeft = "12px";
        actionButton.style.border = "none";
        actionButton.style.background = "transparent";
        actionButton.style.color = isDark ? "#fca5a5" : "#c2410c";
        actionButton.style.cursor = "pointer";
        actionButton.style.fontSize = "12px";
        actionButton.style.fontWeight = "600";
        actionButton.onclick = (event) => {
          event.stopPropagation();
          action.onClick();
        };
        el.appendChild(actionButton);
      }

      el.onmouseenter = () => { el.style.backgroundColor = isDark ? "#2d2d2d" : "#f8f9fa"; };
      el.onmouseleave = () => { el.style.backgroundColor = isDark ? "#1a1a1a" : "white"; };
      el.onclick = (e) => {
        e.stopPropagation();
        onClick();
      };
      return el;
    };

    const createOptionItem = (option: FieldOption, isSubItem: boolean) => createItem(
      option.label,
      false,
      isSubItem,
      () => selectValue(option.value),
      option.isCustom && canDeleteFieldOptions && option.id != null
        ? {
            label: "Odstranit",
            onClick: () => {
              void deleteFieldOption(option);
            },
          }
        : undefined
    );

    const submitNewFieldOption = async () => {
      if (!params.onCreateFieldOption) {
        return;
      }

      const normalizedName = pendingFieldOptionName.trim();
      if (!normalizedName) {
        footerErrorMessage = "Zadejte název oboru.";
        renderFooter();
        return;
      }

      isSubmittingOption = true;
      footerErrorMessage = "";
      renderFooter();

      try {
        const createdOption = await params.onCreateFieldOption(normalizedName);
        selectValue(createdOption?.value ?? normalizedName);
      } catch (error) {
        footerErrorMessage = error instanceof Error ? error.message : "Nepodařilo se přidat obor.";
        isSubmittingOption = false;
        renderFooter();
      }
    };

    const deleteFieldOption = async (option: FieldOption) => {
      if (!params.onDeleteFieldOption || option.id == null) {
        return;
      }

      const confirmed = window.confirm(`Opravdu chcete odstranit obor \"${option.label}\"?`);
      if (!confirmed) {
        return;
      }

      try {
        await params.onDeleteFieldOption(option.id);
        if (params.value === option.value) {
          if (typeof params.setValue === "function") {
            params.setValue(REMOVED_FIELD_LABEL);
          } else if (params.colDef?.field && typeof params.node?.setDataValue === "function") {
            params.node.setDataValue(params.colDef.field, REMOVED_FIELD_LABEL);
          }
        }
        cleanup();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "Nepodařilo se odstranit obor.");
      }
    };

    const selectValue = (val: string) => {
      if (typeof params.setValue === "function") {
        params.setValue(val);
      } else if (params.colDef?.field && typeof params.node?.setDataValue === "function") {
        params.node.setDataValue(params.colDef.field, val);
      }

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
        transition: "all 0.2s ease",
        opacity: params.disabled ? 0.7 : 1,
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

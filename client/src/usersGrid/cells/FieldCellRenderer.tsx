import React from "react";
import { fieldOptions } from "../fieldOptions";

const FieldCellRenderer: React.FC<any> = (params) => {
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

    const dropdown = document.createElement("div");
    dropdown.style.position = "fixed";
    dropdown.style.top = `${cellRect.bottom + 2}px`;
    dropdown.style.left = `${cellRect.left}px`;
    dropdown.style.width = `${Math.max(cellRect.width, 200)}px`;
    dropdown.style.zIndex = "10000";
    dropdown.style.backgroundColor = isDark ? "#1a1a1a" : "white";
    dropdown.style.border = isDark ? "1px solid #2d2d2d" : "1px solid #ccc";
    dropdown.style.borderRadius = "4px";
    dropdown.style.boxShadow = isDark ? "0 2px 8px rgba(0, 0, 0, 0.4)" : "0 2px 8px rgba(0, 0, 0, 0.15)";
    dropdown.style.maxHeight = "300px";
    dropdown.style.overflowY = "auto";
    dropdown.style.fontFamily = "var(--font-body)";

    let currentLetter = "";
    fieldOptions.forEach((option) => {
      const firstLetter = option.label.charAt(0).toUpperCase();

      if (firstLetter !== currentLetter) {
        currentLetter = firstLetter;

        const headerDiv = document.createElement("div");
        headerDiv.style.padding = "8px 12px";
        headerDiv.style.backgroundColor = isDark ? "#0d0d0d" : "#e9ecef";
        headerDiv.style.color = isDark ? "#b0b0b0" : "#495057";
        headerDiv.style.fontWeight = "bold";
        headerDiv.style.fontSize = "14px";
        headerDiv.style.borderBottom = isDark ? "2px solid #2d2d2d" : "2px solid #dee2e6";
        headerDiv.style.fontFamily = "var(--font-subheading)";
        headerDiv.style.position = "sticky";
        headerDiv.style.top = "0";
        headerDiv.style.zIndex = "1";
        headerDiv.textContent = currentLetter;
        headerDiv.style.cursor = "default";

        dropdown.appendChild(headerDiv);
      }

      const optionDiv = document.createElement("div");
      optionDiv.style.padding = "8px 12px";
      optionDiv.style.cursor = "pointer";
      optionDiv.style.backgroundColor = isDark ? "#1a1a1a" : "white";
      optionDiv.style.color = isDark ? "#e0e0e0" : "#333";
      optionDiv.style.borderBottom = isDark ? "1px solid #2d2d2d" : "1px solid #eee";
      optionDiv.style.fontFamily = "var(--font-body)";
      optionDiv.textContent = option.label;

      optionDiv.addEventListener("mouseenter", () => {
        optionDiv.style.backgroundColor = isDark ? "#2d2d2d" : "#f8f9fa";
      });

      optionDiv.addEventListener("mouseleave", () => {
        optionDiv.style.backgroundColor = isDark ? "#1a1a1a" : "white";
      });

      optionDiv.addEventListener("click", () => {
        params.setValue(option.value);
        cleanup();
      });

      dropdown.appendChild(optionDiv);
    });

    document.body.appendChild(dropdown);

    // Create search input container
    const searchContainer = document.createElement("div");
    searchContainer.style.position = "sticky";
    searchContainer.style.top = "0";
    searchContainer.style.zIndex = "2";
    searchContainer.style.padding = "8px";
    searchContainer.style.backgroundColor = isDark ? "#1a1a1a" : "white";
    searchContainer.style.borderBottom = isDark ? "1px solid #2d2d2d" : "1px solid #ddd";

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
    dropdown.insertBefore(searchContainer, dropdown.firstChild);

    // Store all option elements for filtering
    const allOptionElements: { element: HTMLElement; label: string; headerBefore?: HTMLElement }[] = [];
    let currentHeader: HTMLElement | undefined;

    // Collect all options and headers
    const children = Array.from(dropdown.children);
    children.forEach((child) => {
      if (child === searchContainer) return;
      const el = child as HTMLElement;
      if (el.style.fontWeight === "bold") {
        currentHeader = el;
      } else if (el.textContent) {
        allOptionElements.push({
          element: el,
          label: el.textContent,
          headerBefore: currentHeader
        });
      }
    });

    // Filter function
    const filterOptions = (searchTerm: string) => {
      const term = searchTerm.toLowerCase().trim();
      const visibleHeaders = new Set<HTMLElement>();

      allOptionElements.forEach(({ element, label, headerBefore }) => {
        const matches = term === "" || label.toLowerCase().includes(term);
        element.style.display = matches ? "block" : "none";
        if (matches && headerBefore) {
          visibleHeaders.add(headerBefore);
        }
      });

      // Show/hide headers based on whether they have visible options
      children.forEach((child) => {
        if (child === searchContainer) return;
        const el = child as HTMLElement;
        if (el.style.fontWeight === "bold") {
          el.style.display = visibleHeaders.has(el) ? "block" : "none";
        }
      });
    };

    searchInput.addEventListener("input", (e) => {
      filterOptions((e.target as HTMLInputElement).value);
    });

    // Prevent dropdown from closing when clicking in search
    searchInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Focus search input after dropdown is shown
    setTimeout(() => {
      searchInput.focus();
    }, 50);

    const cleanup = () => {
      if (document.body.contains(dropdown)) {
        document.removeEventListener("click", handleClickOutside);
  document.removeEventListener("keydown", handleKeyDown);
        document.body.removeChild(dropdown);
      }
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

    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 100);
  };

  const currentField = getCurrentField();
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  return (
    <div
      onClick={handleFieldClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        cursor: "pointer",
        backgroundColor: isDark ? "#0d0d0d" : "white",
        color: isDark ? "#e0e0e0" : "#333",
        padding: "0 8px",
        borderRadius: "4px",
        border: "1px solid transparent",
        transition: "all 0.2s ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isDark ? "#2d2d2d" : "#f8f9fa";
        e.currentTarget.style.border = isDark ? "1px solid #4a4a4a" : "1px solid #ccc";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = isDark ? "#0d0d0d" : "white";
        e.currentTarget.style.border = "1px solid transparent";
      }}
    >
      {currentField.label}
    </div>
  );
};

export default FieldCellRenderer;

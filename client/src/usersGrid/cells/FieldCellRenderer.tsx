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

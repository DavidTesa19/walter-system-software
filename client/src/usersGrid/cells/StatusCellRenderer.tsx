import React from "react";

const StatusCellRenderer: React.FC<any> = (params) => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const statusOptions = isDark
    ? [
        { value: "Not Started", label: "Nezahájeno", color: "#9ca3af", bgColor: "#1f2937" },
        { value: "In Process", label: "V procesu", color: "#60a5fa", bgColor: "#1e3a8a" },
        { value: "Done", label: "Dokončeno", color: "#34d399", bgColor: "#064e3b" }
      ]
    : [
        { value: "Not Started", label: "Nezahájeno", color: "#6c757d", bgColor: "#f8f9fa" },
        { value: "In Process", label: "V procesu", color: "#0d6efd", bgColor: "#e7f1ff" },
        { value: "Done", label: "Dokončeno", color: "#198754", bgColor: "#d1eddb" }
      ];

  const getCurrentStatus = () => {
    return statusOptions.find((option) => option.value === params.value) || statusOptions[0];
  };

  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const cellRect = (e.target as HTMLElement).closest(".ag-cell")?.getBoundingClientRect();
    if (!cellRect) return;

    const dropdown = document.createElement("div");
    dropdown.style.position = "fixed";
    dropdown.style.top = `${cellRect.bottom + 2}px`;
    dropdown.style.left = `${cellRect.left}px`;
    dropdown.style.width = `${cellRect.width}px`;
    dropdown.style.zIndex = "10000";
    dropdown.style.backgroundColor = isDark ? "#1a1a1a" : "white";
    dropdown.style.border = isDark ? "1px solid #2d2d2d" : "1px solid #ccc";
    dropdown.style.borderRadius = "4px";
    dropdown.style.boxShadow = isDark ? "0 2px 8px rgba(0, 0, 0, 0.4)" : "0 2px 8px rgba(0, 0, 0, 0.15)";
    dropdown.style.maxHeight = "150px";
    dropdown.style.overflowY = "auto";

    statusOptions.forEach((option) => {
      const optionDiv = document.createElement("div");
      optionDiv.style.padding = "8px 12px";
      optionDiv.style.cursor = "pointer";
      optionDiv.style.backgroundColor = option.bgColor;
      optionDiv.style.color = option.color;
      optionDiv.style.fontWeight = "500";
      optionDiv.style.borderBottom = "1px solid #eee";
      optionDiv.textContent = option.label;

      optionDiv.addEventListener("mouseenter", () => {
        optionDiv.style.opacity = "0.8";
      });

      optionDiv.addEventListener("mouseleave", () => {
        optionDiv.style.opacity = "1";
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

  const currentStatus = getCurrentStatus();

  return (
    <div
      onClick={handleStatusClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        cursor: "pointer",
        backgroundColor: currentStatus.bgColor,
        color: currentStatus.color,
        fontWeight: "500",
        padding: "4px 8px",
        borderRadius: "4px",
        border: "1px solid transparent",
        transition: "all 0.2s ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = "0.8";
        e.currentTarget.style.border = "1px solid #ccc";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.border = "1px solid transparent";
      }}
    >
      {currentStatus.label}
    </div>
  );
};

export default StatusCellRenderer;

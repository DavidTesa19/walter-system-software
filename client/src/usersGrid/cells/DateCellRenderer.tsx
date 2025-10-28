import React from "react";

const DateCellRenderer: React.FC<any> = (params) => {
  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const iconRect = (e.target as HTMLElement).closest("svg")?.getBoundingClientRect();
    if (!iconRect) return;

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.style.position = "fixed";
    dateInput.style.top = `${iconRect.bottom + 5}px`;
    dateInput.style.left = `${iconRect.left - 100}px`;
    dateInput.style.zIndex = "10000";
    dateInput.style.border = "2px solid #007acc";
    dateInput.style.borderRadius = "4px";
    dateInput.style.padding = "8px";
    dateInput.style.backgroundColor = "white";
  dateInput.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    dateInput.style.fontSize = "14px";
    dateInput.style.outline = "none";

    if (params.value) {
      const formatDateForInput = (dateStr: string) => {
        if (!dateStr) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          return dateStr;
        }
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split("T")[0];
        }
        return "";
      };
      dateInput.value = formatDateForInput(params.value);
    }

    document.body.appendChild(dateInput);
    dateInput.focus();

    setTimeout(() => {
      if (dateInput.showPicker) {
        dateInput.showPicker();
      }
    }, 10);

    const cleanup = () => {
      if (document.body.contains(dateInput)) {
        dateInput.removeEventListener("change", handleChange);
        document.removeEventListener("click", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
        document.body.removeChild(dateInput);
      }
    };

    const handleChange = () => {
      if (dateInput.value) {
        params.setValue(dateInput.value);
      }
      cleanup();
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (!dateInput.contains(event.target as Node)) {
        cleanup();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cleanup();
      }
    };

    dateInput.addEventListener("change", handleChange);

    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }, 100);
  };

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const date = new Date(`${dateStr}T00:00:00`);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("cs-CZ");
      }
    }

    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("cs-CZ");
    }

    return dateStr;
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "4px 8px"
      }}
    >
      <span>{formatDisplayDate(params.value)}</span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          marginLeft: "4px",
          opacity: 0.6,
          cursor: "pointer",
          padding: "2px",
          borderRadius: "2px"
        }}
        onClick={handleIconClick}
        onMouseEnter={(e) => {
          const isDark = document.documentElement.getAttribute("data-theme") === "dark";
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.backgroundColor = isDark ? "#2d2d2d" : "#f0f0f0";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "0.6";
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <path
          d="M8 2V5M16 2V5M3.5 9.09H20.5M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M15.6947 13.7H15.7037M11.9955 13.7H12.0045M8.29431 13.7H8.30329M15.6947 17.3H15.7037M11.9955 17.3H12.0045M8.29431 17.3H8.30329"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

export default DateCellRenderer;

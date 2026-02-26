import React from "react";

/**
 * Read-only status badge renderer for the system's record statuses
 * (accepted/pending/archived). This is NOT the same as StatusCellRenderer
 * which is for task statuses (Not Started/In Process/Done) used in FutureFunctions.
 * 
 * Record status should ONLY be changed via approve/archive/restore actions,
 * never by direct editing in the grid.
 */
const RecordStatusCellRenderer: React.FC<any> = (params) => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  
  const statusMap: Record<string, { label: string; color: string; bgColor: string }> = isDark
    ? {
        accepted: { label: "Schváleno", color: "#34d399", bgColor: "#064e3b" },
        pending: { label: "Čeká na schválení", color: "#fbbf24", bgColor: "#78350f" },
        archived: { label: "Archivováno", color: "#9ca3af", bgColor: "#1f2937" },
        // Legacy values from the StatusCellRenderer bug - display them so records can be found
        "Not Started": { label: "Nezahájeno (chyba)", color: "#f87171", bgColor: "#7f1d1d" },
        "In Process": { label: "V procesu (chyba)", color: "#f87171", bgColor: "#7f1d1d" },
        "Done": { label: "Dokončeno (chyba)", color: "#f87171", bgColor: "#7f1d1d" }
      }
    : {
        accepted: { label: "Schváleno", color: "#198754", bgColor: "#d1eddb" },
        pending: { label: "Čeká na schválení", color: "#b45309", bgColor: "#fef3c7" },
        archived: { label: "Archivováno", color: "#6c757d", bgColor: "#f8f9fa" },
        "Not Started": { label: "Nezahájeno (chyba)", color: "#dc3545", bgColor: "#f8d7da" },
        "In Process": { label: "V procesu (chyba)", color: "#dc3545", bgColor: "#f8d7da" },
        "Done": { label: "Dokončeno (chyba)", color: "#dc3545", bgColor: "#f8d7da" }
      };

  const current = statusMap[params.value] || statusMap["pending"];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: current.bgColor,
        color: current.color,
        fontWeight: "500",
        padding: "4px 8px",
        borderRadius: "4px",
        userSelect: "none"
      }}
    >
      {current.label}
    </div>
  );
};

export default RecordStatusCellRenderer;

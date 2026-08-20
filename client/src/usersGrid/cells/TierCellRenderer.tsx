import React from "react";
import { getTierOption } from "../tiers";

/**
 * Úroveň cell — a coloured dot plus the tier label, matching how the Stav and
 * Schválení columns render their options. Untiered subjects show a dash so the
 * cell still reads as "editable but empty" rather than broken.
 */
const TierCellRenderer: React.FC<any> = (params) => {
  const option = getTierOption(params.value);

  if (!option) {
    return <span style={{ opacity: 0.45 }}>—</span>;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontWeight: 500,
        fontSize: "12px",
        userSelect: "none",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: option.dotColor,
          flexShrink: 0,
        }}
      />
      {option.label}
    </span>
  );
};

export default TierCellRenderer;

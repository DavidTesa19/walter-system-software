import React from "react";
import { getApprovalStatusMeta } from "../utils/approvalStatus";

const ApprovalStatusCellRenderer: React.FC<any> = (params) => {
  const meta = getApprovalStatusMeta(params.value);

  if (!meta) {
    return <span>-</span>;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: meta.color,
          flexShrink: 0,
        }}
      />
      {meta.label}
    </span>
  );
};

export default ApprovalStatusCellRenderer;
import React from "react";
import type { ICellRendererParams } from "ag-grid-community";

type ViewMode = "active" | "pending" | "archived";

type RowActionsContext = {
  viewMode: ViewMode;
  entityAccusative: string;
  entityOnlyAccusative?: string;
  onApprove?: (id: number) => void;
  onRestore?: (id: number) => void;
  onDelete?: (id: number) => void;
};

type GridContext = {
  rowActions?: RowActionsContext;
};

const getRowId = (params: ICellRendererParams<any, any>): number | null => {
  const id = params.data?.id;
  return typeof id === "number" ? id : null;
};

export const ApproveRestoreCellRenderer: React.FC<ICellRendererParams<any, any, GridContext>> = (params) => {
  const ctx = params.context?.rowActions;
  const id = getRowId(params);
  const label = params.data?.entityOnly ? ctx?.entityOnlyAccusative ?? ctx?.entityAccusative : ctx?.entityAccusative;

  if (!ctx || id === null || !label) {
    return null;
  }

  if (ctx.viewMode === "pending") {
    return (
      <button
        type="button"
        onClick={() => ctx.onApprove?.(id)}
        className="inrow-approve-btn"
        title={`Schválit ${label}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M20 6L9 17L4 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  }

  if (ctx.viewMode === "archived") {
    return (
      <button
        type="button"
        onClick={() => ctx.onRestore?.(id)}
        className="inrow-approve-btn"
        title={`Obnovit ${label}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M21 3v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M3 21v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return null;
};

export const DeleteArchiveCellRenderer: React.FC<ICellRendererParams<any, any, GridContext>> = (params) => {
  const ctx = params.context?.rowActions;
  const id = getRowId(params);
  const label = params.data?.entityOnly ? ctx?.entityOnlyAccusative ?? ctx?.entityAccusative : ctx?.entityAccusative;

  if (!ctx || id === null || !label) {
    return null;
  }

  const title =
    params.data?.subjectRow
      ? `Smazat ${label}`
      : ctx.viewMode === "pending"
      ? `Zamítnout ${label}`
      : ctx.viewMode === "archived"
        ? `Trvale smazat ${label}`
        : `Archivovat ${label}`;

  return (
    <button
      type="button"
      onClick={() => ctx.onDelete?.(id)}
      className="inrow-delete-btn"
      title={title}
    >
      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M9 3L3 9M3 3L9 9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

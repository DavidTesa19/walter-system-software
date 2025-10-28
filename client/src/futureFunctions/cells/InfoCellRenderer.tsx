import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import type { ICellRendererParams } from "ag-grid-community";

const InfoCellRenderer: React.FC<ICellRendererParams> = (params) => {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo(() => String(params.value ?? ""), [params.value]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setIsOpen(true);
    },
    []
  );

  const handleClose = useCallback((event?: React.MouseEvent | React.KeyboardEvent) => {
    event?.stopPropagation();
    setIsOpen(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(true);
      }
    },
    []
  );

  const handleRequestEdit = useCallback(() => {
    const rowIndex = params.node?.rowIndex;
    const colId = params.column?.getId();

    if (rowIndex == null || colId == null) {
      return;
    }

    params.api.startEditingCell({ rowIndex, colKey: colId });
  }, [params.api, params.column, params.node]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEsc, true);
    return () => window.removeEventListener("keydown", handleEsc, true);
  }, [isOpen]);

  const modal =
    isOpen &&
    ReactDOM.createPortal(
      <div className="info-modal-backdrop" onClick={handleClose} role="presentation">
        <div className="info-modal" role="dialog" aria-modal="true" aria-label="Detail informace" onClick={(event) => event.stopPropagation()}>
          <div className="info-modal-header">
            <h3>Detail informace</h3>
            <button type="button" className="info-modal-close" onClick={handleClose} aria-label="Zavřít detail">
              x
            </button>
          </div>
          <div className="info-modal-content">
            {value ? <p>{value}</p> : <p>Žádný popis není k dispozici.</p>}
          </div>
          <div className="info-modal-actions">
            <button type="button" className="info-modal-edit" onClick={() => {
              handleClose();
              handleRequestEdit();
            }}>
              Upravit položku
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      <button
        type="button"
        className="info-cell"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDoubleClick={(event) => {
          event.stopPropagation();
          handleRequestEdit();
        }}
        title="Zobrazit detail popisu"
      >
        {value || "—"}
      </button>
      {modal}
    </>
  );
};

export default InfoCellRenderer;

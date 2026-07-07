import React from "react";
import "./ActivityIndicator.css";

interface ActivityConfirmAllButtonProps {
  count: number;
  onConfirm: () => void;
}

/**
 * Toolbar button shown above a grid. Confirms every unseen change in the current
 * table as seen (clearing all row and cell dots). Hidden when nothing is unseen.
 */
const ActivityConfirmAllButton: React.FC<ActivityConfirmAllButtonProps> = ({ count, onConfirm }) => {
  if (count <= 0) {
    return null;
  }

  return (
    <button
      type="button"
      className="activity-confirm-all-btn"
      onClick={onConfirm}
      title="Označit všechny nové a změněné položky jako přečtené"
    >
      <span className="activity-confirm-all-btn__dot" aria-hidden="true" />
      Potvrdit vše
      <span className="activity-confirm-all-btn__count">{count > 99 ? "99+" : count}</span>
    </button>
  );
};

export default ActivityConfirmAllButton;

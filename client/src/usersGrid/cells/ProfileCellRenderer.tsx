import React, { useCallback } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import { UserRound } from "lucide-react";
import ActivityCellRenderer from "../../activity/ActivityCellRenderer";
import type { UserInterface } from "../user.interface";

interface ProfileGridContext {
  openProfile?: (user: UserInterface) => void;
}

type ProfileCellRendererParams = ICellRendererParams<UserInterface, unknown> & {
  context?: ProfileGridContext;
};

// The row's first cell: the button that opens the profile panel, with the
// change dot (new / edited, click to confirm) as a small badge on its corner.
// The dot used to have a pinned column of its own, which sat empty on almost
// every row and read as a blank strip down the left edge of the table.
const ProfileCellRenderer: React.FC<ProfileCellRendererParams> = (params) => {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!params.data) {
        return;
      }
      params.context?.openProfile?.(params.data);
    },
    [params]
  );

  if (!params.data) {
    return null;
  }

  return (
    <span className="profile-cell-inner">
      <button type="button" className="profile-cell-btn" onClick={handleClick} title="Otevřít profil" aria-label="Otevřít profil">
        <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <span className="profile-cell-dot">
        <ActivityCellRenderer {...(params as unknown as ICellRendererParams)} />
      </span>
    </span>
  );
};

export default ProfileCellRenderer;

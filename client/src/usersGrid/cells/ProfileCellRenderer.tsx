import React, { useCallback } from "react";
import type { ICellRendererParams } from "ag-grid-community";
import type { UserInterface } from "../user.interface";

interface ProfileGridContext {
  openProfile?: (user: UserInterface) => void;
}

type ProfileCellRendererParams = ICellRendererParams<UserInterface, unknown> & {
  context?: ProfileGridContext;
};

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
    <button type="button" className="profile-cell-btn" onClick={handleClick} title="Otevřít profil" aria-label="Otevřít profil">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 12C14.4853 12 16.5 9.98528 16.5 7.5C16.5 5.01472 14.4853 3 12 3C9.51472 3 7.5 5.01472 7.5 7.5C7.5 9.98528 9.51472 12 12 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 20.25C4.5 16.7982 7.29822 14 10.75 14H13.25C16.7018 14 19.5 16.7982 19.5 20.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
};

export default ProfileCellRenderer;

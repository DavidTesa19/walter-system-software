import React from 'react';
import UsersGrid from '../usersGrid/UsersGrid';
import type { GridSearchNavigationTarget } from '../types/globalSearch';

interface PendingApprovalsViewProps {
  searchTarget?: GridSearchNavigationTarget | null;
}

const PendingApprovalsView: React.FC<PendingApprovalsViewProps> = ({ searchTarget }) => {
  return <UsersGrid viewMode="pending" searchTarget={searchTarget} />;
};

export default PendingApprovalsView;

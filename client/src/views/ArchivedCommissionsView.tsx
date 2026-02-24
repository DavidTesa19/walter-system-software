import React from 'react';
import UsersGrid from '../usersGrid/UsersGrid';
import type { GridSearchNavigationTarget } from '../types/globalSearch';

interface ArchivedCommissionsViewProps {
  searchTarget?: GridSearchNavigationTarget | null;
}

const ArchivedCommissionsView: React.FC<ArchivedCommissionsViewProps> = ({ searchTarget }) => {
  return <UsersGrid viewMode="archived" searchTarget={searchTarget} />;
};

export default ArchivedCommissionsView;

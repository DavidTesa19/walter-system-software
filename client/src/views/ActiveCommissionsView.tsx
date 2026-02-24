import React from 'react';
import UsersGrid from '../usersGrid/UsersGrid';
import type { GridSearchNavigationTarget } from '../types/globalSearch';

interface ActiveCommissionsViewProps {
  searchTarget?: GridSearchNavigationTarget | null;
}

const ActiveCommissionsView: React.FC<ActiveCommissionsViewProps> = ({ searchTarget }) => {
  return <UsersGrid viewMode="active" searchTarget={searchTarget} />;
};

export default ActiveCommissionsView;

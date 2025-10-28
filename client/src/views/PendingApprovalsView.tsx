import React from 'react';
import UsersGrid from '../usersGrid/UsersGrid';

const PendingApprovalsView: React.FC = () => {
  return <UsersGrid viewMode="pending" />;
};

export default PendingApprovalsView;

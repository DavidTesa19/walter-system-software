import React from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Login from './auth/Login';
import UsersGrid from "./usersGrid/UsersGrid";

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <>
      <UsersGrid />
    </>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;

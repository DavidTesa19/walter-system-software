import React, { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import Login from './auth/Login';
import UsersGrid from "./usersGrid/UsersGrid";
import Sidebar from './components/Sidebar';
import './components/Sidebar.css';

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [viewMode, setViewMode] = useState<'active' | 'pending'>('active');

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar activeView={viewMode} onViewChange={setViewMode} />
      <div className="main-content">
        <UsersGrid viewMode={viewMode} />
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;

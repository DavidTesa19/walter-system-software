import React, { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import Login from './auth/Login';
import UsersGrid from './usersGrid/UsersGrid';
import Sidebar from './components/Sidebar';
import PaletteManager from './theme/PaletteManager';
import './components/Sidebar.css';

type AppView = 'active' | 'pending' | 'archived' | 'palettes';

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [viewMode, setViewMode] = useState<AppView>('active');

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar activeView={viewMode} onViewChange={setViewMode} />
      <div className="main-content">
        {(() => {
          switch (viewMode) {
            case 'active':
            case 'pending':
            case 'archived':
              return <UsersGrid viewMode={viewMode} />;
            case 'palettes':
              return <PaletteManager />;
            default:
              return null;
          }
        })()}
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

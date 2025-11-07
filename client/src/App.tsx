import React, { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import Login from './auth/Login';
import Sidebar from './components/Sidebar';
import PaletteManager from './theme/PaletteManager';
import ActiveCommissionsView from './views/ActiveCommissionsView';
import PendingApprovalsView from './views/PendingApprovalsView';
import ArchivedCommissionsView from './views/ArchivedCommissionsView';
import ChatbotView from './views/ChatbotView';
import type { AppView } from './types/appView';
import './components/Sidebar.css';

const FutureFunctionsView: React.FC = () => {
  return <div>Future functions coming soon.</div>;
};

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
              return <ActiveCommissionsView />;
            case 'pending':
              return <PendingApprovalsView />;
            case 'archived':
              return <ArchivedCommissionsView />;
            case 'future':
              return <FutureFunctionsView />;
            case 'palettes':
              return <PaletteManager />;
            case 'chatbot':
              return <ChatbotView />;
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

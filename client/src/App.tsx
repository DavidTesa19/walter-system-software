import React, { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import Login from './auth/Login';
import Sidebar from './components/Sidebar';
import Footer from './components/Footer';
import PaletteManager from './theme/PaletteManager';
import ActiveCommissionsView from './views/ActiveCommissionsView';
import PendingApprovalsView from './views/PendingApprovalsView';
import ArchivedCommissionsView from './views/ArchivedCommissionsView';
import FutureFunctionsView from './views/FutureFunctionsView';
import ChatbotView from './views/ChatbotView';
import TeamChatView from './views/TeamChatView';
import FullCalendarView from './views/FullCalendarView';
import type { AppView } from './types/appView';
import './components/Sidebar.css';

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [viewMode, setViewMode] = useState<AppView>('active');

  if (!isAuthenticated) {
    return <Login />;
  }

  const isFullscreenView = viewMode === 'chatbot' || viewMode === 'teamchat' || viewMode === 'calendar';

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar activeView={viewMode} onViewChange={setViewMode} />
      <div className={`main-content ${isFullscreenView ? 'main-content--fullscreen' : ''}`}>
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
            case 'teamchat':
              return <TeamChatView />;
            case 'calendar':
              return <FullCalendarView />;
            default:
              return null;
          }
        })()}
      </div>
      {!isFullscreenView && <Footer />}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  );
};

export default App;

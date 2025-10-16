import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (code: string) => boolean;
  logout: () => void;
  resetSessionTimer: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Simple verification code (you can change this)
const VERIFICATION_CODE = 'Walter2025';
const SESSION_DURATION = 1 * 60 * 1000; // 10 minutes in milliseconds

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [sessionTimer, setSessionTimer] = useState<number | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const savedAuth = localStorage.getItem('walterAuth');
    const savedSessionStart = localStorage.getItem('walterSessionStart');
    
    if (savedAuth === 'true' && savedSessionStart) {
      const sessionStartTime = parseInt(savedSessionStart, 10);
      const elapsed = Date.now() - sessionStartTime;
      
      if (elapsed < SESSION_DURATION) {
        setIsAuthenticated(true);
        startSessionTimer(SESSION_DURATION - elapsed);
      } else {
        // Session expired
        logout();
      }
    }
  }, []);

  const startSessionTimer = (duration: number = SESSION_DURATION) => {
    if (sessionTimer) {
      clearTimeout(sessionTimer);
    }

    const timer = setTimeout(() => {
      logout();
    }, duration);

    setSessionTimer(timer);
  };

  const login = (code: string): boolean => {
    if (code === VERIFICATION_CODE) {
      const now = Date.now();
      setIsAuthenticated(true);
      localStorage.setItem('walterAuth', 'true');
      localStorage.setItem('walterSessionStart', now.toString());
      startSessionTimer();
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('walterAuth');
    localStorage.removeItem('walterSessionStart');
    
    if (sessionTimer) {
      clearTimeout(sessionTimer);
      setSessionTimer(null);
    }
  };

  const resetSessionTimer = () => {
    if (isAuthenticated) {
      const now = Date.now();
      localStorage.setItem('walterSessionStart', now.toString());
      startSessionTimer();
    }
  };

  // Reset timer on user activity
  useEffect(() => {
    if (isAuthenticated) {
      const handleActivity = () => {
        resetSessionTimer();
      };

      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
      events.forEach(event => {
        document.addEventListener(event, handleActivity, true);
      });

      return () => {
        events.forEach(event => {
          document.removeEventListener(event, handleActivity, true);
        });
      };
    }
  }, [isAuthenticated]);

  const value: AuthContextType = {
    isAuthenticated,
    login,
    logout,
    resetSessionTimer
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
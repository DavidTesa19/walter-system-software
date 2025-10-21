import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
const SESSION_DURATION = 30 * 60 * 1000; // 10 minutes in milliseconds

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [sessionTimer, setSessionTimer] = useState<number | null>(null);

  const startSessionTimer = (duration: number = SESSION_DURATION) => {
    if (sessionTimer) {
      clearTimeout(sessionTimer);
    }

    const timer = setTimeout(() => {
      logout();
    }, duration);

    setSessionTimer(timer);
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = () => {
      const authValue = localStorage.getItem('walterAuth');
      const sessionStart = localStorage.getItem('walterSessionStart');
      
      if (authValue === 'true' && sessionStart) {
        const startTime = parseInt(sessionStart, 10);
        const now = Date.now();
        const elapsed = now - startTime;
        const remaining = SESSION_DURATION - elapsed;
        
        // If session is still valid
        if (remaining > 0) {
          setIsAuthenticated(true);
          startSessionTimer(remaining);
        } else {
          // Session expired, clean up
          localStorage.removeItem('walterAuth');
          localStorage.removeItem('walterSessionStart');
        }
      }
    };
    
    checkExistingSession();
  }, []); // Empty dependency array - only run on mount

  const login = (code: string): boolean => {
    if (code === VERIFICATION_CODE) {
      // Clear any existing timer first
      if (sessionTimer) {
        clearTimeout(sessionTimer);
        setSessionTimer(null);
      }
      
      // Clear any existing session data
      localStorage.removeItem('walterAuth');
      localStorage.removeItem('walterSessionStart');
      
      // Set new session data
      const now = Date.now();
      localStorage.setItem('walterAuth', 'true');
      localStorage.setItem('walterSessionStart', now.toString());
      
      setIsAuthenticated(true);
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

  const resetSessionTimer = useCallback(() => {
    if (isAuthenticated) {
      const now = Date.now();
      localStorage.setItem('walterSessionStart', now.toString());
      startSessionTimer();
    }
  }, [isAuthenticated]);

  // Reset timer on user activity
  useEffect(() => {
    let activityCleanup: (() => void) | null = null;

    if (isAuthenticated) {
      const handleActivity = () => {
        resetSessionTimer();
      };

      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
      events.forEach(event => {
        document.addEventListener(event, handleActivity, true);
      });

      activityCleanup = () => {
        events.forEach(event => {
          document.removeEventListener(event, handleActivity, true);
        });
      };
    }

    return () => {
      if (activityCleanup) {
        activityCleanup();
      }
    };
  }, [isAuthenticated, resetSessionTimer]);

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
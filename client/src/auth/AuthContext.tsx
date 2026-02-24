import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { API_BASE } from '../usersGrid/constants';
import { trackEvent, startActiveTimeTracking, stopActiveTimeTracking, flushSectionTime } from '../utils/analytics';

// Define available roles
export type UserRole = 'admin' | 'manager' | 'employee' | 'viewer';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  token?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  resetSessionTimer: () => void;
  hasRole: (allowedRoles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const sessionTimerRef = useRef<number | undefined>(undefined);

  const clearSessionTimer = useCallback(() => {
    if (sessionTimerRef.current !== undefined) {
      window.clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = undefined;
    }
  }, []);

  const logout = useCallback(() => {
    flushSectionTime();
    stopActiveTimeTracking();
    setUser(null);
    localStorage.removeItem('walterUser');
    localStorage.removeItem('walterSessionStart');
    clearSessionTimer();
  }, [clearSessionTimer]);

  const startSessionTimer = useCallback((duration: number = SESSION_DURATION) => {
    clearSessionTimer();
    sessionTimerRef.current = window.setTimeout(() => {
      logout();
    }, duration);
  }, [clearSessionTimer, logout]);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        // Expecting backend to return { user: { id, username, role }, token: "..." }
        const userData: User = { ...data.user, token: data.token };
        
        // Save to state and local storage
        setUser(userData);
        const now = Date.now();
        localStorage.setItem('walterUser', JSON.stringify(userData));
        localStorage.setItem('walterSessionStart', now.toString());
        
        startSessionTimer();
        // Track successful login & start active time
        trackEvent('login_success');
        startActiveTimeTracking();
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login failed:", error);
      return false;
    }
  };

  // Validate token with the server
  const validateToken = async (userData: User): Promise<boolean> => {
    if (!userData.token) return false;
    
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${userData.token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        return true;
      }
      
      // Token is invalid or expired
      return false;
    } catch (error) {
      console.error("Token validation failed:", error);
      return false;
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      const storedUser = localStorage.getItem('walterUser');
      const sessionStart = localStorage.getItem('walterSessionStart');
      
      if (storedUser && sessionStart) {
        const startTime = parseInt(sessionStart, 10);
        const now = Date.now();
        const elapsed = now - startTime;
        const remaining = SESSION_DURATION - elapsed;
        
        if (remaining > 0) {
          const userData = JSON.parse(storedUser);
          
          // Validate the token with the server before trusting it
          const isValid = await validateToken(userData);
          
          if (isValid) {
            setUser(userData);
            startSessionTimer(remaining);
            startActiveTimeTracking();
          } else {
            // Token is invalid, clear session
            logout();
          }
        } else {
          logout();
        }
      }
    };
    
    checkExistingSession();
  }, [startSessionTimer, logout]);

  const resetSessionTimer = useCallback(() => {
    if (user) {
      const now = Date.now();
      localStorage.setItem('walterSessionStart', now.toString());
      startSessionTimer();
    }
  }, [user, startSessionTimer]);

  // Reset timer on user activity
  useEffect(() => {
    let activityCleanup: (() => void) | null = null;

    if (user) {
      let lastActivity = 0;
      const THROTTLE_MS = 30000; // Throttle updates to every 30 seconds

      const handleActivity = () => {
        const now = Date.now();
        if (now - lastActivity > THROTTLE_MS) {
          lastActivity = now;
          resetSessionTimer();
        }
      };

      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
      events.forEach(event => {
        // Use capture=true to ensure we catch events even if propagation is stopped
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
  }, [user, resetSessionTimer]);

  // Helper to check permissions
  const hasRole = (allowedRoles: UserRole[]) => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    resetSessionTimer,
    hasRole
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
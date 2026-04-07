import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { API_BASE } from '../usersGrid/constants';
import { trackEvent, startActiveTimeTracking, stopActiveTimeTracking, flushSectionTime } from '../utils/analytics';
import { clearStoredTableViews } from '../utils/tableViewState';
import { clearStoredNavigationState } from '../utils/navigationState';
import type { AppView } from '../types/appView';

// Define available roles
export type UserRole = 'admin' | 'manager' | 'employee' | 'salesman' | 'viewer';
export type UserAccessScope = 'all' | 'standard' | 'projects';

const DEFAULT_ACCESS_SCOPE: UserAccessScope = 'all';

export const normalizeUserAccessScope = (value: unknown): UserAccessScope => {
  if (value === 'standard' || value === 'projects' || value === 'all') {
    return value;
  }

  return DEFAULT_ACCESS_SCOPE;
};

export const canAccessStandardSystem = (scope: UserAccessScope | null | undefined): boolean => {
  const normalizedScope = normalizeUserAccessScope(scope);
  return normalizedScope === 'all' || normalizedScope === 'standard';
};

export const canAccessProjectsSystem = (scope: UserAccessScope | null | undefined): boolean => {
  const normalizedScope = normalizeUserAccessScope(scope);
  return normalizedScope === 'all' || normalizedScope === 'projects';
};

export const isViewAllowedForScope = (
  scope: UserAccessScope | null | undefined,
  view: AppView
): boolean => {
  if (view === 'active' || view === 'pending' || view === 'archived') {
    return canAccessStandardSystem(scope);
  }

  if (view === 'entities_active' || view === 'entities_pending' || view === 'entities_archived') {
    return canAccessStandardSystem(scope);
  }

  if (view === 'projects_active' || view === 'projects_pending' || view === 'projects_archived') {
    return canAccessProjectsSystem(scope);
  }

  if (view === 'projects_subjects_active' || view === 'projects_subjects_pending' || view === 'projects_subjects_archived') {
    return canAccessProjectsSystem(scope);
  }

  return true;
};

export const getDefaultViewForScope = (scope: UserAccessScope | null | undefined): AppView => {
  if (canAccessStandardSystem(scope)) {
    return 'active';
  }

  if (canAccessProjectsSystem(scope)) {
    return 'projects_subjects_active';
  }

  return 'future';
};

export interface User {
  id: number;
  username: string;
  role: UserRole;
  accessScope: UserAccessScope;
  token?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  resetSessionTimer: () => void;
  hasRole: (allowedRoles: UserRole[]) => boolean;
  hasAccessScope: (allowedScopes: UserAccessScope[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_DURATION = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const sessionTimerRef = useRef<number | undefined>(undefined);

  const normalizeUser = useCallback((rawUser: Partial<User> | null | undefined): User | null => {
    if (!rawUser || typeof rawUser.id !== 'number' || typeof rawUser.username !== 'string' || typeof rawUser.role !== 'string') {
      return null;
    }

    return {
      id: rawUser.id,
      username: rawUser.username,
      role: rawUser.role as UserRole,
      accessScope: normalizeUserAccessScope(rawUser.accessScope),
      token: rawUser.token,
    };
  }, []);

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
    clearStoredTableViews();
    clearStoredNavigationState();
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
        const userData = normalizeUser({ ...data.user, token: data.token });
        if (!userData) {
          return false;
        }
        clearStoredTableViews();
        clearStoredNavigationState();
        
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
  const validateToken = async (userData: User): Promise<User | null> => {
    if (!userData.token) return null;
    
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${userData.token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const currentUser = await response.json();
        return normalizeUser({ ...currentUser, token: userData.token });
      }
      
      // Token is invalid or expired
      return null;
    } catch (error) {
      console.error("Token validation failed:", error);
      return null;
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
          const userData = normalizeUser(JSON.parse(storedUser));
          if (!userData) {
            logout();
            return;
          }
          
          // Validate the token with the server before trusting it
          const validatedUser = await validateToken(userData);
          
          if (validatedUser) {
            setUser(validatedUser);
            localStorage.setItem('walterUser', JSON.stringify(validatedUser));
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

  const hasAccessScope = (allowedScopes: UserAccessScope[]) => {
    if (!user) return false;
    return allowedScopes.includes(user.accessScope);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    resetSessionTimer,
    hasRole,
    hasAccessScope
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
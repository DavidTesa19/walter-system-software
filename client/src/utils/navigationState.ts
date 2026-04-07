import type { AppView } from "../types/appView";

const VALID_APP_VIEWS: AppView[] = [
  "active",
  "pending",
  "archived",
  "future",
  "palettes",
  "chatbot",
  "calendar",
  "teamchat",
  "analytics",
  "entities_active",
  "entities_pending",
  "entities_archived",
  "projects_active",
  "projects_pending",
  "projects_archived",
  "admin_users"
];

type FutureFunctionsViewMode = "active" | "archive";

const VALID_FUTURE_FUNCTIONS_VIEWS: FutureFunctionsViewMode[] = ["active", "archive"];

export const APP_VIEW_STORAGE_KEY = "walterApp.activeView";
export const FUTURE_FUNCTIONS_VIEW_STORAGE_KEY = "walterFutureFunctions.view";

export const getStoredAppView = (fallback: AppView = "active"): AppView => {
  try {
    const storedValue = localStorage.getItem(APP_VIEW_STORAGE_KEY);
    if (storedValue && VALID_APP_VIEWS.includes(storedValue as AppView)) {
      return storedValue as AppView;
    }
  } catch {
    // Ignore storage access errors.
  }

  return fallback;
};

export const setStoredAppView = (view: AppView): void => {
  try {
    localStorage.setItem(APP_VIEW_STORAGE_KEY, view);
  } catch {
    // Ignore storage access errors.
  }
};

export const getStoredFutureFunctionsView = (
  fallback: FutureFunctionsViewMode = "active"
): FutureFunctionsViewMode => {
  try {
    const storedValue = localStorage.getItem(FUTURE_FUNCTIONS_VIEW_STORAGE_KEY);
    if (storedValue && VALID_FUTURE_FUNCTIONS_VIEWS.includes(storedValue as FutureFunctionsViewMode)) {
      return storedValue as FutureFunctionsViewMode;
    }
  } catch {
    // Ignore storage access errors.
  }

  return fallback;
};

export const setStoredFutureFunctionsView = (view: FutureFunctionsViewMode): void => {
  try {
    localStorage.setItem(FUTURE_FUNCTIONS_VIEW_STORAGE_KEY, view);
  } catch {
    // Ignore storage access errors.
  }
};

export const clearStoredNavigationState = (): void => {
  try {
    localStorage.removeItem(APP_VIEW_STORAGE_KEY);
    localStorage.removeItem(FUTURE_FUNCTIONS_VIEW_STORAGE_KEY);
  } catch {
    // Ignore storage access errors.
  }
};

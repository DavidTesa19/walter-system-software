export type SubjectTableType = "clients" | "partners" | "tipers";

const VALID_TABLES: SubjectTableType[] = ["clients", "partners", "tipers"];

export const USERS_GRID_TABLE_STORAGE_KEY = "walterUsersGrid.activeTable";
export const ENTITIES_SYSTEM_TABLE_STORAGE_KEY = "walterEntitiesSystem.activeTable";
export const PROJECTS_COMMISSIONS_TABLE_STORAGE_KEY = "walterProjectsCommissions.activeTable";
export const PROJECTS_SUBJECTS_TABLE_STORAGE_KEY = "walterProjectsSubjects.activeTable";

export const getStoredTableView = (
  storageKey: string,
  fallback: SubjectTableType = "clients"
): SubjectTableType => {
  try {
    const storedValue = localStorage.getItem(storageKey);
    if (storedValue && VALID_TABLES.includes(storedValue as SubjectTableType)) {
      return storedValue as SubjectTableType;
    }
  } catch {
    // Ignore storage access errors and use fallback.
  }

  return fallback;
};

export const setStoredTableView = (storageKey: string, table: SubjectTableType): void => {
  try {
    localStorage.setItem(storageKey, table);
  } catch {
    // Ignore storage access errors.
  }
};

export const clearStoredTableViews = (): void => {
  try {
    localStorage.removeItem(USERS_GRID_TABLE_STORAGE_KEY);
    localStorage.removeItem(ENTITIES_SYSTEM_TABLE_STORAGE_KEY);
    localStorage.removeItem(PROJECTS_COMMISSIONS_TABLE_STORAGE_KEY);
    localStorage.removeItem(PROJECTS_SUBJECTS_TABLE_STORAGE_KEY);
  } catch {
    // Ignore storage access errors.
  }
};
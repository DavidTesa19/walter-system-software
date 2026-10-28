// Which list the Úkoly section (and the widget) last showed, per browser.

export type StoredTaskScope = 'mine' | 'team' | { userId: number };

const SECTION_KEY = 'walterTasks.scope';

export const readTaskScope = (key = SECTION_KEY): StoredTaskScope => {
  try {
    const value = localStorage.getItem(key);
    if (value === 'team' || value === 'mine') return value;
    const userId = Number(value?.startsWith('user:') ? value.slice(5) : NaN);
    if (Number.isInteger(userId) && userId > 0) return { userId };
  } catch {
    // Ignore storage access errors.
  }
  return 'mine';
};

export const writeTaskScope = (scope: StoredTaskScope, key = SECTION_KEY) => {
  try {
    localStorage.setItem(key, typeof scope === 'object' ? `user:${scope.userId}` : scope);
  } catch {
    // Ignore storage access errors.
  }
};

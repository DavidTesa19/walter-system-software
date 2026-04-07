export interface AssignableUser {
  id: number;
  username: string;
  role: string;
}

export interface AssignmentOption {
  value: string;
  label: string;
  description?: string;
}

export const normalizeAssignedUserIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0))];
};

export const toAssignmentDraftValue = (value: unknown): string[] => (
  normalizeAssignedUserIds(value).map((item) => String(item))
);

export const fromAssignmentDraftValue = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return normalizeAssignedUserIds(value);
};

export const buildAssignmentOptions = (users: AssignableUser[]): AssignmentOption[] => (
  [...users]
    .sort((left, right) => left.username.localeCompare(right.username, 'cs'))
    .map((user) => ({
      value: String(user.id),
      label: user.username,
      description: user.role,
    }))
);

export const formatAssignedUsernames = (
  assignedUserIds: unknown,
  users: AssignableUser[],
  fallbackAssignedTo?: string | null
): string | null => {
  const ids = normalizeAssignedUserIds(assignedUserIds);
  if (ids.length === 0) {
    const fallback = typeof fallbackAssignedTo === 'string' ? fallbackAssignedTo.trim() : '';
    return fallback || null;
  }

  const usersById = new Map(users.map((user) => [user.id, user.username]));
  const labels = ids
    .map((id) => usersById.get(id))
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) {
    const fallback = typeof fallbackAssignedTo === 'string' ? fallbackAssignedTo.trim() : '';
    return fallback || null;
  }

  return labels.join(', ');
};
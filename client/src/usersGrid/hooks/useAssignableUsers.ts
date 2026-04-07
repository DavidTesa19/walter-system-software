import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../utils/api';
import {
  buildAssignmentOptions,
  type AssignableUser,
  type AssignmentOption,
} from '../assignmentUtils';

export default function useAssignableUsers() {
  const [users, setUsers] = useState<AssignableUser[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      try {
        const data = await apiGet<AssignableUser[]>('/api/team-users');
        if (!cancelled) {
          setUsers(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error('Error fetching assignable users:', error);
        if (!cancelled) {
          setUsers([]);
        }
      }
    };

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo<AssignmentOption[]>(() => buildAssignmentOptions(users), [users]);

  return {
    users,
    options,
  };
}
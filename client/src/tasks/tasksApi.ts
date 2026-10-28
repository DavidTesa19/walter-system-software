// Úkoly: personal and team to-do lists (server/tasks/).

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../utils/api';

export type TaskList = 'personal' | 'team';
export type TaskStatus = 'todo' | 'later' | 'done';

export interface Task {
  id: number;
  list: TaskList;
  ownerUserId: number | null;
  title: string;
  note: string | null;
  status: TaskStatus;
  dueDate: string | null;
  important: boolean;
  assigneeUserId: number | null;
  createdByUserId: number | null;
  createdByName: string | null;
  completedAt: string | null;
  completedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskInput = Partial<Pick<Task, 'list' | 'title' | 'note' | 'status' | 'dueDate' | 'important' | 'assigneeUserId'>>;

export interface TeamUser {
  id: number;
  username: string;
  role: string;
}

/** Which list is on screen: one person's, or the team's. */
export type TaskScope = { list: 'team' } | { list: 'personal'; ownerUserId: number };

// The widget and the section show the same lists; a change in one tells the
// other to reload. Announced on the next tick, after the caller has applied
// the saved task (see useTaskList's invalidate).
const TASKS_CHANGED_EVENT = 'walter:tasks-changed';
const announceChange = () => window.setTimeout(() => window.dispatchEvent(new Event(TASKS_CHANGED_EVENT)), 0);

export const tasksApi = {
  list: (scope: TaskScope) =>
    apiGet<{ tasks: Task[]; canEdit: boolean }>(
      scope.list === 'team' ? '/api/tasks?list=team' : `/api/tasks?list=personal&owner=${scope.ownerUserId}`
    ),
  create: async (input: TaskInput & { list: TaskList; title: string }) => {
    const task = await apiPost<Task>('/api/tasks', input);
    announceChange();
    return task;
  },
  update: async (id: number, input: TaskInput) => {
    const task = await apiPatch<Task>(`/api/tasks/${id}`, input);
    announceChange();
    return task;
  },
  remove: async (id: number) => {
    await apiDelete(`/api/tasks/${id}`);
    announceChange();
  },
  teamUsers: () => apiGet<TeamUser[]>('/api/team-users'),
};

// ---------- dates (the browser's own calendar day) ----------

const pad = (value: number) => String(value).padStart(2, '0');
export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const dayOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};
export const todayKey = () => dayOffset(0);
export const tomorrowKey = () => dayOffset(1);
/** Next Monday (a week from today when today is Monday). */
export const nextWeekKey = () => {
  const date = new Date();
  date.setDate(date.getDate() + (((8 - date.getDay()) % 7) || 7));
  return toDateKey(date);
};

export type TaskBucket = 'todo' | 'later' | 'done';

/**
 * Where a task is shown. A task put off to a day comes back to "K udělání" on
 * that day by itself, without anyone having to move it.
 */
export const taskBucket = (task: Task, today = todayKey()): TaskBucket => {
  if (task.status === 'done') return 'done';
  if (task.status === 'later' && (!task.dueDate || task.dueDate > today)) return 'later';
  return 'todo';
};

/** Important first, then by date (overdue first, undated last), then oldest. */
export const compareOpenTasks = (a: Task, b: Task) =>
  Number(b.important) - Number(a.important) ||
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
  a.createdAt.localeCompare(b.createdAt);

const WEEKDAYS = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

export type DueTone = 'overdue' | 'today' | 'soon' | 'later';

export const describeDue = (dueDate: string | null, today = todayKey()): { label: string; tone: DueTone } | null => {
  if (!dueDate) return null;
  const [year, month, day] = dueDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const [ty, tm, td] = today.split('-').map(Number);
  const diff = Math.round((date.getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  if (diff < 0) return { label: diff === -1 ? 'včera' : `${-diff} dní po termínu`, tone: 'overdue' };
  if (diff === 0) return { label: 'dnes', tone: 'today' };
  if (diff === 1) return { label: 'zítra', tone: 'soon' };
  if (diff < 7) return { label: `${WEEKDAYS[date.getDay()]} ${day}. ${month}.`, tone: 'soon' };
  return { label: `${day}. ${month}.${year !== ty ? ` ${year}` : ''}`, tone: 'later' };
};

export const formatDoneAt = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return toDateKey(date) === todayKey()
    ? `dnes ${pad(date.getHours())}:${pad(date.getMinutes())}`
    : `${date.getDate()}. ${date.getMonth() + 1}.`;
};

// ---------- the hook both screens use ----------

const scopeKey = (scope: TaskScope | null) => (scope ? (scope.list === 'team' ? 'team' : `personal:${scope.ownerUserId}`) : '');

/**
 * One list, kept fresh: reloaded when another screen changes tasks, when the
 * window regains focus, and every minute while `live` (colleagues' changes to
 * the team list). Changes are applied to the screen at once and rolled back if
 * the server refuses them.
 */
export function useTaskList(scope: TaskScope | null, live = true) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = scopeKey(scope);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // Bumped by every reload and every change: a reload that started before a
  // change finished would answer with a list missing it, so its answer is
  // dropped (the change itself triggers a fresh reload when it is saved).
  const requestRef = useRef(0);
  const invalidate = () => {
    requestRef.current += 1;
  };

  const reload = useCallback(async () => {
    const current = scopeRef.current;
    if (!current) return;
    const request = ++requestRef.current;
    try {
      const result = await tasksApi.list(current);
      if (request !== requestRef.current) return;
      setTasks(result.tasks);
      setCanEdit(result.canEdit);
      setError(null);
    } catch (err) {
      if (request === requestRef.current) setError(err instanceof Error ? err.message : 'Úkoly se nepodařilo načíst.');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setTasks([]);
    void reload();
  }, [key, reload]);

  useEffect(() => {
    if (!live || !key) return undefined;
    const onChange = () => void reload();
    window.addEventListener(TASKS_CHANGED_EVENT, onChange);
    window.addEventListener('focus', onChange);
    const timer = window.setInterval(onChange, 60_000);
    return () => {
      window.removeEventListener(TASKS_CHANGED_EVENT, onChange);
      window.removeEventListener('focus', onChange);
      window.clearInterval(timer);
    };
  }, [key, live, reload]);

  const run = useCallback(async (optimistic: (list: Task[]) => Task[], work: () => Promise<unknown>) => {
    let previous: Task[] = [];
    setTasks((list) => {
      previous = list;
      return optimistic(list);
    });
    invalidate();
    try {
      await work();
      setError(null);
    } catch (err) {
      setTasks(previous);
      setError(err instanceof Error ? err.message : 'Změnu se nepodařilo uložit.');
    } finally {
      invalidate();
    }
  }, []);

  const add = useCallback(async (input: TaskInput & { title: string }) => {
    const current = scopeRef.current;
    if (!current) return false;
    invalidate();
    try {
      const task = await tasksApi.create({ ...input, list: current.list });
      invalidate();
      setTasks((list) => (list.some((item) => item.id === task.id) ? list : [...list, task]));
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Úkol se nepodařilo přidat.');
      return false;
    }
  }, []);

  const update = useCallback(
    (task: Task, input: TaskInput) =>
      run(
        (list) =>
          list.map((item) =>
            item.id === task.id
              ? {
                  ...item,
                  ...input,
                  completedAt: input.status === 'done' && item.status !== 'done' ? new Date().toISOString() : input.status && input.status !== 'done' ? null : item.completedAt,
                }
              : item
          ),
        async () => {
          const saved = await tasksApi.update(task.id, input);
          // Moved to another list: it no longer belongs on this one.
          setTasks((list) =>
            scopeKey(scopeRef.current) === scopeKey(saved.list === 'team' ? { list: 'team' } : { list: 'personal', ownerUserId: saved.ownerUserId ?? 0 })
              ? list.map((item) => (item.id === saved.id ? saved : item))
              : list.filter((item) => item.id !== saved.id)
          );
        }
      ),
    [run]
  );

  const remove = useCallback(
    (task: Task) => run((list) => list.filter((item) => item.id !== task.id), () => tasksApi.remove(task.id)),
    [run]
  );

  return { tasks, canEdit, loading, error, setError, reload, add, update, remove };
}

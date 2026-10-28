// The two floating buttons in the top-right corner: Úkoly, which opens into a
// small task window (and folds back into the button), and the bug button,
// which opens the "Nahlásit chybu" dialog from any screen.
//
// They sit below the profile panel and other right-hand overlays (z-index
// 1000), so an open panel covers them instead of the other way round.

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import BugReportDialog from '../bugs/BugReportDialog';
import TaskQuickAdd from '../tasks/TaskQuickAdd';
import TaskRow from '../tasks/TaskRow';
import type { Task, TaskScope, TeamUser } from '../tasks/tasksApi';
import { compareOpenTasks, taskBucket, tasksApi, todayKey, toDateKey, useTaskList } from '../tasks/tasksApi';
import { readTaskScope, writeTaskScope } from '../tasks/taskScope';
import type { AppView } from '../types/appView';
import '../tasks/Tasks.css';
import './FloatingTools.css';

const OPEN_KEY = 'walterTasks.widgetOpen';
const WIDGET_SCOPE_KEY = 'walterTasks.widgetScope';

const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
};

interface FloatingToolsProps {
  viewId: AppView;
  viewLabel: string;
  onNavigate: (view: AppView) => void;
}

const FloatingTools: React.FC<FloatingToolsProps> = ({ viewId, viewLabel, onNavigate }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(readOpen);
  const [reporting, setReporting] = useState(false);
  const [tab, setTab] = useState<'mine' | 'team'>(() => (readTaskScope(WIDGET_SCOPE_KEY) === 'team' ? 'team' : 'mine'));
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [showLater, setShowLater] = useState(false);

  const setOpenAndRemember = (value: boolean) => {
    setOpen(value);
    try {
      localStorage.setItem(OPEN_KEY, value ? '1' : '0');
    } catch {
      // Ignore storage access errors.
    }
  };

  const selectTab = (value: 'mine' | 'team') => {
    setTab(value);
    writeTaskScope(value, WIDGET_SCOPE_KEY);
  };

  useEffect(() => {
    if (open && users.length === 0) tasksApi.teamUsers().then(setUsers).catch(() => {});
  }, [open, users.length]);

  // The personal list is always loaded: its count is the button's badge.
  const mineScope: TaskScope | null = useMemo(() => (user ? { list: 'personal', ownerUserId: user.id } : null), [user]);
  const teamScope: TaskScope | null = useMemo(() => (open && tab === 'team' ? { list: 'team' } : null), [open, tab]);
  const mine = useTaskList(mineScope);
  const team = useTaskList(teamScope);
  const current = tab === 'team' ? team : mine;

  const today = todayKey();
  const myOpenCount = mine.tasks.filter((task) => taskBucket(task, today) === 'todo').length;
  const groups = useMemo(() => {
    const todo: Task[] = [];
    const later: Task[] = [];
    const doneToday: Task[] = [];
    current.tasks.forEach((task) => {
      const bucket = taskBucket(task, today);
      if (bucket === 'todo') todo.push(task);
      else if (bucket === 'later') later.push(task);
      else if (task.completedAt && toDateKey(new Date(task.completedAt)) === today) doneToday.push(task);
    });
    todo.sort(compareOpenTasks);
    later.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
    return { todo, later, doneToday };
  }, [current.tasks, today]);

  // Alt+T opens and folds the task window.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyT') {
        event.preventDefault();
        setOpen((value) => {
          try {
            localStorage.setItem(OPEN_KEY, value ? '0' : '1');
          } catch {
            // Ignore storage access errors.
          }
          return !value;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const renderRows = (tasks: Task[]) =>
    tasks.map((task) => (
      <TaskRow key={task.id} task={task} canEdit={current.canEdit} users={users} compact onUpdate={current.update} onDelete={current.remove} />
    ));

  return (
    <>
      <div className="floating-tools">
        <button
          type="button"
          className="floating-tool floating-tool--bug"
          onClick={() => setReporting(true)}
          title="Nahlásit chybu"
          aria-label="Nahlásit chybu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 2l1.88 1.88M14.12 3.88L16 2" />
            <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
            <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z" />
            <path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4" />
          </svg>
        </button>

        {!open && (
          <button
            type="button"
            className="floating-tool floating-tool--tasks"
            onClick={() => setOpenAndRemember(true)}
            title="Úkoly (Alt+T)"
            aria-label={`Úkoly, ${myOpenCount} k udělání`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span className="floating-tool-label">Úkoly</span>
            {myOpenCount > 0 && <span className="floating-tool-badge">{myOpenCount > 99 ? '99+' : myOpenCount}</span>}
          </button>
        )}

        {open && (
          <section className="tasks-widget" aria-label="Úkoly">
            <header className="tasks-widget-header">
              <div className="tasks-widget-tabs" role="tablist" aria-label="Čí úkoly">
                <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'is-active' : ''} onClick={() => selectTab('mine')}>
                  Moje
                  {myOpenCount > 0 && <span className="tasks-widget-count">{myOpenCount}</span>}
                </button>
                <button type="button" role="tab" aria-selected={tab === 'team'} className={tab === 'team' ? 'is-active' : ''} onClick={() => selectTab('team')}>
                  Tým
                </button>
              </div>
              <div className="tasks-widget-header-actions">
                <button
                  type="button"
                  className="task-action"
                  onClick={() => {
                    writeTaskScope(tab);
                    onNavigate('tasks');
                  }}
                  title="Otevřít sekci Úkoly"
                  aria-label="Otevřít sekci Úkoly"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </button>
                <button type="button" className="task-action" onClick={() => setOpenAndRemember(false)} title="Minimalizovat (Alt+T)" aria-label="Minimalizovat">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </header>

            {current.canEdit && (
              <div className="tasks-widget-add">
                <TaskQuickAdd onAdd={current.add} compact placeholder={tab === 'team' ? 'Nový týmový úkol…' : 'Nový úkol…'} />
              </div>
            )}

            {current.error && (
              <div className="tasks-widget-error" role="alert" onClick={() => current.setError(null)}>
                {current.error}
              </div>
            )}

            <div className="tasks-widget-list">
              {current.loading && current.tasks.length === 0 ? (
                <div className="tasks-widget-empty">Načítám…</div>
              ) : groups.todo.length === 0 ? (
                <div className="tasks-widget-empty">{groups.later.length ? 'Na teď je hotovo. 🎉' : 'Žádné úkoly. Přidejte první nahoře.'}</div>
              ) : (
                renderRows(groups.todo)
              )}

              {groups.later.length > 0 && (
                <>
                  <button type="button" className="tasks-widget-group" onClick={() => setShowLater((value) => !value)} aria-expanded={showLater}>
                    <span className={`tasks-widget-chevron${showLater ? ' is-open' : ''}`} aria-hidden="true">›</span>
                    Později <span className="tasks-widget-group-count">{groups.later.length}</span>
                  </button>
                  {showLater && renderRows(groups.later)}
                </>
              )}

              {groups.doneToday.length > 0 && (
                <>
                  <div className="tasks-widget-group tasks-widget-group--static">
                    Hotovo dnes <span className="tasks-widget-group-count">{groups.doneToday.length}</span>
                  </div>
                  {renderRows(groups.doneToday)}
                </>
              )}
            </div>
          </section>
        )}
      </div>

      {reporting && (
        <BugReportDialog viewId={viewId} viewLabel={viewLabel} onClose={() => setReporting(false)} onShowReports={() => onNavigate('bugs')} />
      )}
    </>
  );
};

export default FloatingTools;

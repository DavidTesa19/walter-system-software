// The floating buttons in the top-right corner: the bug button, which opens
// the "Nahlásit chybu" dialog from any screen, and Úkoly, which opens into a
// small task window (and folds back into the button). The help panel lives
// here too: the ? key and the sidebar's "?" next to the account open it.
//
// They sit below the profile panel and other right-hand overlays (z-index
// 1000), so an open panel covers them instead of the other way round.

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Flag, Minus, Search, SquareCheckBig } from 'lucide-react';
import { openSearch, SEARCH_SHORTCUT } from './SearchPalette';
import { OPEN_HELP_EVENT } from '../help/openHelp';
import { useAuth } from '../auth/AuthContext';
import { BUTTON_ICON, TAB_ICON } from '../ui/icons';
import BugReportDialog from '../bugs/BugReportDialog';
import HelpPanel from '../help/HelpPanel';
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
  const [helpOpen, setHelpOpen] = useState(false);
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

  // The sidebar's "?" next to the account (help/openHelp.ts).
  useEffect(() => {
    const onOpen = () => setHelpOpen(true);
    window.addEventListener(OPEN_HELP_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_HELP_EVENT, onOpen);
  }, []);

  // "?" (outside a text field) opens the help for this screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return;
      event.preventDefault();
      setHelpOpen((value) => !value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
          className="floating-tool floating-tool--search"
          onClick={openSearch}
          title={`Hledat v aplikaci (${SEARCH_SHORTCUT})`}
          aria-label="Hledat v aplikaci"
        >
          <Search {...BUTTON_ICON} />
          <span className="floating-tool-label floating-tool-search-label">Hledat…</span>
          <kbd className="floating-tool-kbd">{SEARCH_SHORTCUT}</kbd>
        </button>

        <button
          type="button"
          className="floating-tool floating-tool--bug"
          onClick={() => setReporting(true)}
          title="Nahlásit chybu"
          aria-label="Nahlásit chybu"
        >
          <Flag {...BUTTON_ICON} />
        </button>

        {!open && (
          <button
            type="button"
            className="floating-tool floating-tool--tasks"
            onClick={() => setOpenAndRemember(true)}
            title="Úkoly (Alt+T)"
            aria-label={`Úkoly, ${myOpenCount} k udělání`}
          >
            <SquareCheckBig {...BUTTON_ICON} />
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
                  <ExternalLink {...TAB_ICON} />
                </button>
                <button type="button" className="task-action" onClick={() => setOpenAndRemember(false)} title="Minimalizovat (Alt+T)" aria-label="Minimalizovat">
                  <Minus {...TAB_ICON} />
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
      {helpOpen && (
        <HelpPanel
          view={viewId}
          viewLabel={viewLabel}
          onClose={() => setHelpOpen(false)}
          onOpenAll={() => {
            setHelpOpen(false);
            onNavigate('help');
          }}
        />
      )}
    </>
  );
};

export default FloatingTools;

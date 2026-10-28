import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import TaskRow from '../tasks/TaskRow';
import TaskQuickAdd from '../tasks/TaskQuickAdd';
import type { Task, TaskBucket, TaskInput, TaskScope, TeamUser } from '../tasks/tasksApi';
import { compareOpenTasks, taskBucket, tasksApi, todayKey, useTaskList } from '../tasks/tasksApi';
import { readTaskScope, writeTaskScope } from '../tasks/taskScope';
import type { StoredTaskScope } from '../tasks/taskScope';
import '../tasks/Tasks.css';
import './TasksView.css';

const COLUMNS: Array<{ id: TaskBucket; title: string; empty: string }> = [
  { id: 'todo', title: 'K udělání', empty: 'Nic tu není. Přidejte úkol nahoře.' },
  { id: 'later', title: 'Později', empty: 'Odložené úkoly se vrátí do K udělání v den, na který jsou naplánované.' },
  { id: 'done', title: 'Hotovo', empty: 'Zatím nic hotového.' },
];

const DONE_PREVIEW = 12;

// What moving a card into a column means.
const DROP_CHANGES: Record<TaskBucket, (task: Task) => TaskInput> = {
  todo: (task) => ({ status: 'todo', dueDate: task.dueDate && task.dueDate > todayKey() ? null : task.dueDate }),
  later: () => ({ status: 'later' }),
  done: () => ({ status: 'done' }),
};

const TasksView: React.FC = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [stored, setStored] = useState<StoredTaskScope>(() => readTaskScope());
  const [showAllDone, setShowAllDone] = useState(false);
  const [dropTarget, setDropTarget] = useState<TaskBucket | null>(null);

  useEffect(() => {
    tasksApi.teamUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const scope: TaskScope | null = useMemo(() => {
    if (!user) return null;
    if (stored === 'team') return { list: 'team' };
    if (stored === 'mine') return { list: 'personal', ownerUserId: user.id };
    return { list: 'personal', ownerUserId: stored.userId };
  }, [stored, user]);

  const selectScope = (next: StoredTaskScope) => {
    setStored(next);
    writeTaskScope(next);
    setShowAllDone(false);
  };

  const { tasks, canEdit, loading, error, setError, add, update, remove } = useTaskList(scope);

  const columns = useMemo(() => {
    const today = todayKey();
    const grouped: Record<TaskBucket, Task[]> = { todo: [], later: [], done: [] };
    tasks.forEach((task) => grouped[taskBucket(task, today)].push(task));
    grouped.todo.sort(compareOpenTasks);
    grouped.later.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || compareOpenTasks(a, b));
    grouped.done.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    return grouped;
  }, [tasks]);

  const colleagues = users.filter((item) => item.id !== user?.id);
  const viewedColleague = typeof stored === 'object' ? colleagues.find((item) => item.id === stored.userId) : null;
  const isTeam = stored === 'team';
  const isMine = stored === 'mine';
  const isAdmin = user?.role === 'admin';

  const subtitle = isTeam
    ? 'Společný seznam celého týmu. Úkol si může kdokoli vzít, odškrtnout nebo přeplánovat.'
    : isMine
      ? 'Vaše vlastní úkoly. Ostatní je vidí, ale měnit je můžete jen vy.'
      : `Úkoly uživatele ${viewedColleague?.username ?? ''}.${canEdit ? '' : ' Jen pro čtení.'}`;

  const handleDrop = (bucket: TaskBucket, taskId: number) => {
    setDropTarget(null);
    const task = tasks.find((item) => item.id === taskId);
    if (!task || taskBucket(task) === bucket) return;
    void update(task, DROP_CHANGES[bucket](task));
  };

  return (
    <div className="tasks-view">
      <header className="tasks-header">
        <div>
          <span className="tasks-eyebrow">Úkoly</span>
          <h1>{isTeam ? 'Týmové úkoly' : isMine ? 'Moje úkoly' : `Úkoly: ${viewedColleague?.username ?? 'kolega'}`}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="tasks-scope" role="tablist" aria-label="Čí úkoly">
          <button type="button" role="tab" aria-selected={isMine} className={isMine ? 'is-active' : ''} onClick={() => selectScope('mine')}>
            Moje
          </button>
          <button type="button" role="tab" aria-selected={isTeam} className={isTeam ? 'is-active' : ''} onClick={() => selectScope('team')}>
            Tým
          </button>
          {colleagues.length > 0 && (
            <select
              className={`tasks-scope-select${viewedColleague ? ' is-active' : ''}`}
              value={viewedColleague ? String(viewedColleague.id) : ''}
              onChange={(event) => (event.target.value ? selectScope({ userId: Number(event.target.value) }) : selectScope('mine'))}
              aria-label="Úkoly kolegy"
            >
              <option value="">Kolegové…</option>
              {colleagues.map((item) => (
                <option key={item.id} value={item.id}>{item.username}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {canEdit && (
        <div className="tasks-add-card">
          <TaskQuickAdd onAdd={add} isTeam={isTeam} users={users} placeholder={isTeam ? 'Přidat týmový úkol… (Enter)' : 'Přidat úkol… (Enter)'} />
        </div>
      )}

      {error && (
        <div className="tasks-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)} aria-label="Zavřít">×</button>
        </div>
      )}

      <div className="tasks-board">
        {COLUMNS.map((column) => {
          const items = columns[column.id];
          const visible = column.id === 'done' && !showAllDone ? items.slice(0, DONE_PREVIEW) : items;
          return (
            <section
              key={column.id}
              className={`tasks-column tasks-column--${column.id}${dropTarget === column.id ? ' is-drop-target' : ''}`}
              onDragOver={(event) => {
                if (!canEdit || !event.dataTransfer.types.includes('text/x-walter-task')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTarget(column.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = Number(event.dataTransfer.getData('text/x-walter-task'));
                if (id) handleDrop(column.id, id);
              }}
            >
              <h2 className="tasks-column-title">
                <span className="tasks-column-dot" aria-hidden="true" />
                {column.title}
                <span className="tasks-column-count">{items.length}</span>
              </h2>
              <div className="tasks-column-list">
                {loading && items.length === 0 ? (
                  <div className="tasks-empty">Načítám…</div>
                ) : items.length === 0 ? (
                  <div className="tasks-empty">{column.empty}</div>
                ) : (
                  visible.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      canEdit={canEdit}
                      users={users}
                      draggable
                      canMoveToTeam={task.list === 'personal' && user?.role !== 'viewer' && (isMine || isAdmin)}
                      canMoveToMine={task.list === 'team'}
                      onUpdate={update}
                      onDelete={remove}
                    />
                  ))
                )}
                {column.id === 'done' && items.length > DONE_PREVIEW && (
                  <button type="button" className="tasks-show-more" onClick={() => setShowAllDone((value) => !value)}>
                    {showAllDone ? 'Zobrazit méně' : `Zobrazit všech ${items.length}`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {canEdit && <p className="tasks-hint">Tip: úkoly jde přetahovat mezi sloupci. Odložený úkol s datem se v ten den sám vrátí do K udělání.</p>}
    </div>
  );
};

export default TasksView;

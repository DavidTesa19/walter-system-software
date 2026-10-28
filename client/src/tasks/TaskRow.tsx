// One task, as the Úkoly section and the floating widget both show it: a
// round checkbox, the title and note, its date and (team list) who took it,
// and the quick moves — to tomorrow, to later, back to now.

import { useEffect, useRef, useState } from 'react';
import type { Task, TaskInput, TeamUser } from './tasksApi';
import { describeDue, formatDoneAt, taskBucket, todayKey, tomorrowKey } from './tasksApi';
import { Icon } from './taskIcons';

interface TaskRowProps {
  task: Task;
  canEdit: boolean;
  users: TeamUser[];
  /** The widget: smaller, no full editor (title edit only). */
  compact?: boolean;
  /** Offers "move to the team list" / "move to my list" in the editor. */
  canMoveToTeam?: boolean;
  canMoveToMine?: boolean;
  onUpdate: (task: Task, input: TaskInput) => void;
  onDelete: (task: Task) => void;
  draggable?: boolean;
}

const TaskRow: React.FC<TaskRowProps> = ({
  task,
  canEdit,
  users,
  compact = false,
  canMoveToTeam = false,
  canMoveToMine = false,
  onUpdate,
  onDelete,
  draggable = false,
}) => {
  const [editing, setEditing] = useState(false);
  const bucket = taskBucket(task);
  const done = bucket === 'done';
  const due = done ? null : describeDue(task.dueDate);
  const assignee = task.assigneeUserId ? users.find((user) => user.id === task.assigneeUserId)?.username : null;

  if (editing) {
    return (
      <TaskEditor
        task={task}
        users={users}
        compact={compact}
        canMoveToTeam={canMoveToTeam}
        canMoveToMine={canMoveToMine}
        onSave={(input) => {
          setEditing(false);
          if (Object.keys(input).length) onUpdate(task, input);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className={`task-row${done ? ' task-row--done' : ''}${task.important && !done ? ' task-row--important' : ''}${compact ? ' task-row--compact' : ''}`}
      draggable={draggable && canEdit}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/x-walter-task', String(task.id));
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <button
        type="button"
        className="task-check"
        disabled={!canEdit}
        onClick={() => onUpdate(task, { status: done ? 'todo' : 'done' })}
        title={done ? 'Vrátit mezi nehotové' : 'Označit jako hotové'}
        aria-label={done ? 'Vrátit mezi nehotové' : 'Označit jako hotové'}
        aria-pressed={done}
      >
        {done && <Icon.Check />}
      </button>

      <div className="task-body">
        <button
          type="button"
          className="task-title"
          onClick={() => canEdit && !done && setEditing(true)}
          disabled={!canEdit || done}
          title={canEdit && !done ? 'Upravit' : task.title}
        >
          {task.important && !done && (
            <span className="task-important-mark" title="Důležité">
              <Icon.Star filled />
            </span>
          )}
          {task.title}
        </button>
        {task.note && !compact && <div className="task-note">{task.note}</div>}
        {(due || assignee || (done && task.completedAt) || (task.note && compact)) && (
          <div className="task-meta">
            {due && <span className={`task-chip task-chip--${due.tone}`}>{due.label}</span>}
            {assignee && <span className="task-chip task-chip--person">{assignee}</span>}
            {task.note && compact && <span className="task-meta-text" title={task.note}>poznámka</span>}
            {done && task.completedAt && (
              <span className="task-meta-text">
                hotovo {formatDoneAt(task.completedAt)}
                {task.list === 'team' && task.completedByName ? ` · ${task.completedByName}` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="task-actions">
        {!done && canEdit && (
          <button
            type="button"
            className={`task-action task-star${task.important ? ' is-on' : ''}`}
            onClick={() => onUpdate(task, { important: !task.important })}
            title={task.important ? 'Zrušit důležité' : 'Označit jako důležité'}
            aria-label={task.important ? 'Zrušit důležité' : 'Označit jako důležité'}
          >
            <Icon.Star filled={task.important} />
          </button>
        )}
        {canEdit && bucket === 'todo' && (
          <button type="button" className="task-action" onClick={() => onUpdate(task, { status: 'later', dueDate: tomorrowKey() })} title="Odložit na zítra" aria-label="Odložit na zítra">
            <Icon.Tomorrow />
          </button>
        )}
        {canEdit && bucket === 'todo' && !compact && (
          <button type="button" className="task-action" onClick={() => onUpdate(task, { status: 'later', dueDate: null })} title="Přesunout na později" aria-label="Přesunout na později">
            <Icon.Later />
          </button>
        )}
        {canEdit && bucket === 'later' && (
          <button type="button" className="task-action" onClick={() => onUpdate(task, { status: 'todo', dueDate: null })} title="Vrátit do K udělání" aria-label="Vrátit do K udělání">
            <Icon.Now />
          </button>
        )}
        {canEdit && !compact && !done && (
          <button type="button" className="task-action" onClick={() => setEditing(true)} title="Upravit" aria-label="Upravit">
            <Icon.Edit />
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className="task-action task-action--danger"
            onClick={() => {
              if (done || window.confirm(`Smazat úkol „${task.title}“?`)) onDelete(task);
            }}
            title="Smazat"
            aria-label="Smazat"
          >
            <Icon.Trash />
          </button>
        )}
      </div>
    </div>
  );
};

interface TaskEditorProps {
  task: Task;
  users: TeamUser[];
  compact: boolean;
  canMoveToTeam: boolean;
  canMoveToMine: boolean;
  onSave: (input: TaskInput) => void;
  onCancel: () => void;
}

/** Edit in place. Saves only what changed. */
const TaskEditor: React.FC<TaskEditorProps> = ({ task, users, compact, canMoveToTeam, canMoveToMine, onSave, onCancel }) => {
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? '');
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [assignee, setAssignee] = useState(task.assigneeUserId ? String(task.assigneeUserId) : '');
  const [moveTo, setMoveTo] = useState<'' | 'team' | 'personal'>('');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  const save = () => {
    const input: TaskInput = {};
    const trimmed = title.trim();
    if (!trimmed) return;
    if (trimmed !== task.title) input.title = trimmed;
    if (!compact) {
      const nextNote = note.trim() || null;
      if (nextNote !== (task.note ?? null)) input.note = nextNote;
      const nextDue = dueDate || null;
      if (nextDue !== task.dueDate) {
        input.dueDate = nextDue;
        // A date in the future puts the task off until then; today or earlier
        // keeps it in front of you.
        if (nextDue && nextDue > todayKey() && task.status === 'todo') input.status = 'later';
      }
      if (task.list === 'team') {
        const nextAssignee = assignee ? Number(assignee) : null;
        if (nextAssignee !== task.assigneeUserId) input.assigneeUserId = nextAssignee;
      }
      if (moveTo) input.list = moveTo;
    }
    onSave(input);
  };

  return (
    <form
      className={`task-editor${compact ? ' task-editor--compact' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <input ref={titleRef} className="task-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={500} aria-label="Název úkolu" />
      {!compact && (
        <>
          <textarea className="task-input task-textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Poznámka (nepovinné)" rows={2} maxLength={5000} />
          <div className="task-editor-fields">
            <label>
              <span>Termín</span>
              <input type="date" className="task-input" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
            {task.list === 'team' && (
              <label>
                <span>Kdo to dělá</span>
                <select className="task-input" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
                  <option value="">Nikdo konkrétní</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.username}</option>
                  ))}
                </select>
              </label>
            )}
            {(canMoveToTeam || canMoveToMine) && (
              <label>
                <span>Seznam</span>
                <select className="task-input" value={moveTo} onChange={(event) => setMoveTo(event.target.value as typeof moveTo)}>
                  <option value="">Ponechat</option>
                  {canMoveToTeam && <option value="team">Přesunout do týmových</option>}
                  {canMoveToMine && <option value="personal">Přesunout do mých</option>}
                </select>
              </label>
            )}
          </div>
        </>
      )}
      <div className="task-editor-buttons">
        <button type="button" className="task-btn task-btn--ghost" onClick={onCancel}>Zrušit</button>
        <button type="submit" className="task-btn task-btn--primary" disabled={!title.trim()}>Uložit</button>
      </div>
    </form>
  );
};

export default TaskRow;

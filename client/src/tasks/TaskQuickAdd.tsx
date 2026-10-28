// The "add a task" line: type, Enter. In the section it also asks when (now,
// tomorrow, later, a date), whether it is important and — on the team list —
// who takes it.

import { useRef, useState } from 'react';
import type { TaskInput, TeamUser } from './tasksApi';
import { nextWeekKey, todayKey, tomorrowKey } from './tasksApi';
import { Icon } from './taskIcons';

type When = 'now' | 'tomorrow' | 'week' | 'later' | 'date';

const WHEN_OPTIONS: Array<{ id: When; label: string }> = [
  { id: 'now', label: 'Teď' },
  { id: 'tomorrow', label: 'Zítra' },
  { id: 'week', label: 'Příští týden' },
  { id: 'later', label: 'Později' },
  { id: 'date', label: 'Datum…' },
];

interface TaskQuickAddProps {
  /** Resolves false when the task was not saved; the text is then put back. */
  onAdd: (input: TaskInput & { title: string }) => Promise<boolean>;
  compact?: boolean;
  isTeam?: boolean;
  users?: TeamUser[];
  placeholder?: string;
  autoFocus?: boolean;
}

const TaskQuickAdd: React.FC<TaskQuickAddProps> = ({ onAdd, compact = false, isTeam = false, users = [], placeholder, autoFocus }) => {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<When>('now');
  const [date, setDate] = useState('');
  const [important, setImportant] = useState(false);
  const [assignee, setAssignee] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const input: TaskInput & { title: string } = { title: trimmed, important };
    if (when === 'tomorrow') Object.assign(input, { status: 'later', dueDate: tomorrowKey() });
    else if (when === 'week') Object.assign(input, { status: 'later', dueDate: nextWeekKey() });
    else if (when === 'later') input.status = 'later';
    else if (when === 'date' && date) Object.assign(input, { status: date > todayKey() ? 'later' : 'todo', dueDate: date });
    if (isTeam && assignee) input.assigneeUserId = Number(assignee);
    // Cleared at once, so the next task can be typed while this one saves.
    setTitle('');
    setImportant(false);
    inputRef.current?.focus();
    if (!(await onAdd(input))) setTitle((current) => current || trimmed);
  };

  return (
    <form
      className={`task-quick-add${compact ? ' task-quick-add--compact' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="task-quick-add-line">
        <span className="task-quick-add-plus" aria-hidden="true">+</span>
        <input
          ref={inputRef}
          className="task-quick-add-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={placeholder ?? 'Přidat úkol… (Enter)'}
          maxLength={500}
          autoFocus={autoFocus}
          aria-label="Nový úkol"
        />
        <button
          type="button"
          className={`task-action task-star${important ? ' is-on' : ''}`}
          // Focus stays in the text box, so Enter still adds the task.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setImportant((value) => !value)}
          title={important ? 'Důležité' : 'Označit jako důležité'}
          aria-label="Důležité"
          aria-pressed={important}
        >
          <Icon.Star filled={important} />
        </button>
        {!compact && (
          <button type="submit" className="task-btn task-btn--primary" disabled={!title.trim()}>
            Přidat
          </button>
        )}
      </div>
      {!compact && (
        <div className="task-quick-add-options">
          <div className="task-segmented" role="radiogroup" aria-label="Kdy">
            {WHEN_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={when === option.id}
                className={when === option.id ? 'is-active' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setWhen(option.id);
                  if (option.id !== 'date') inputRef.current?.focus();
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {when === 'date' && (
            <input type="date" className="task-input task-input--inline" value={date} min={todayKey()} onChange={(event) => setDate(event.target.value)} aria-label="Datum" />
          )}
          {isTeam && (
            <select className="task-input task-input--inline" value={assignee} onChange={(event) => setAssignee(event.target.value)} aria-label="Kdo to dělá">
              <option value="">Kdo to dělá: kdokoli</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.username}</option>
              ))}
            </select>
          )}
        </div>
      )}
    </form>
  );
};

export default TaskQuickAdd;

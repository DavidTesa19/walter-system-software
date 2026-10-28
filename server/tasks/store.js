// Storage for Úkoly, the team's to-do lists. One table holds every list:
//   list = 'personal'  a user's own list (owner_user_id)
//   list = 'team'      the shared list; assignee_user_id optionally says who
//                      took the task on
// A task is 'todo', 'later' (put off, optionally to due_date) or 'done'.
//
// Postgres in production; a JSON file next to the dev store otherwise.

import fs from 'node:fs';
import path from 'node:path';

// Done tasks pile up for months; a list shows the most recent ones.
export const DONE_LIMIT = 100;

export async function installTaskSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      list TEXT NOT NULL DEFAULT 'personal',
      owner_user_id INTEGER,
      title TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      due_date DATE,
      important BOOLEAN NOT NULL DEFAULT false,
      assignee_user_id INTEGER,
      created_by_user_id INTEGER,
      created_by_name TEXT,
      completed_at TIMESTAMPTZ,
      completed_by_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_list_owner ON tasks (list, owner_user_id, status)`);
}

// API field <-> column. due_date travels as 'YYYY-MM-DD' both ways.
const TASK_COLUMNS = {
  list: 'list',
  ownerUserId: 'owner_user_id',
  title: 'title',
  note: 'note',
  status: 'status',
  dueDate: 'due_date',
  important: 'important',
  assigneeUserId: 'assignee_user_id',
  createdByUserId: 'created_by_user_id',
  createdByName: 'created_by_name',
  completedAt: 'completed_at',
  completedByName: 'completed_by_name',
};

const TASK_SELECT = `
  SELECT id, list, owner_user_id, title, note, status, to_char(due_date, 'YYYY-MM-DD') AS due_date, important,
         assignee_user_id, created_by_user_id, created_by_name, completed_at, completed_by_name, created_at, updated_at
    FROM tasks`;

const iso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

const toTask = (row) => ({
  id: row.id,
  list: row.list,
  ownerUserId: row.owner_user_id,
  title: row.title,
  note: row.note,
  status: row.status,
  dueDate: row.due_date,
  important: row.important,
  assigneeUserId: row.assignee_user_id,
  createdByUserId: row.created_by_user_id,
  createdByName: row.created_by_name,
  completedAt: iso(row.completed_at),
  completedByName: row.completed_by_name,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
});

const pick = (data) => Object.fromEntries(Object.entries(data).filter(([field]) => TASK_COLUMNS[field]));

export function createPgTaskStore(pool) {
  return {
    // Open tasks, then the most recently finished ones.
    async listTasks({ list, ownerUserId }) {
      const scope = list === 'team' ? `list = 'team'` : `list = 'personal' AND owner_user_id = $1`;
      const params = list === 'team' ? [] : [ownerUserId];
      const [open, done] = await Promise.all([
        pool.query(`${TASK_SELECT} WHERE ${scope} AND status <> 'done' ORDER BY created_at`, params),
        pool.query(`${TASK_SELECT} WHERE ${scope} AND status = 'done' ORDER BY completed_at DESC NULLS LAST LIMIT ${DONE_LIMIT}`, params),
      ]);
      return [...open.rows, ...done.rows].map(toTask);
    },

    async getTask(id) {
      const { rows } = await pool.query(`${TASK_SELECT} WHERE id = $1`, [id]);
      return rows[0] ? toTask(rows[0]) : null;
    },

    async createTask(input) {
      const data = pick(input);
      const fields = Object.keys(data);
      const { rows } = await pool.query(
        `INSERT INTO tasks (${fields.map((field) => TASK_COLUMNS[field]).join(', ')})
         VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})
         RETURNING id`,
        fields.map((field) => data[field])
      );
      return this.getTask(rows[0].id);
    },

    async updateTask(id, input) {
      const data = pick(input);
      const fields = Object.keys(data);
      if (!fields.length) return this.getTask(id);
      const { rowCount } = await pool.query(
        `UPDATE tasks
            SET ${fields.map((field, index) => `${TASK_COLUMNS[field]} = $${index + 2}`).join(', ')}, updated_at = now()
          WHERE id = $1`,
        [id, ...fields.map((field) => data[field])]
      );
      return rowCount ? this.getTask(id) : null;
    },

    async deleteTask(id) {
      const { rowCount } = await pool.query(`DELETE FROM tasks WHERE id = $1`, [id]);
      return rowCount > 0;
    },
  };
}

// Local development: one JSON file, rewritten on every change.
export function createFileTaskStore(dataDir) {
  const file = path.join(dataDir, 'tasks.json');
  const read = () => {
    try {
      return { tasks: [], nextId: 1, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      return { tasks: [], nextId: 1 };
    }
  };
  const write = (data) => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  };

  return {
    async listTasks({ list, ownerUserId }) {
      const tasks = read().tasks.filter((task) =>
        list === 'team' ? task.list === 'team' : task.list === 'personal' && task.ownerUserId === ownerUserId
      );
      const open = tasks.filter((task) => task.status !== 'done').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const done = tasks
        .filter((task) => task.status === 'done')
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        .slice(0, DONE_LIMIT);
      return [...open, ...done];
    },

    async getTask(id) {
      return read().tasks.find((task) => task.id === id) ?? null;
    },

    async createTask(input) {
      const data = read();
      const now = new Date().toISOString();
      const task = {
        id: data.nextId,
        list: 'personal', ownerUserId: null, note: null, status: 'todo', dueDate: null, important: false,
        assigneeUserId: null, createdByUserId: null, createdByName: null, completedAt: null, completedByName: null,
        ...pick(input),
        createdAt: now,
        updatedAt: now,
      };
      data.nextId += 1;
      data.tasks.push(task);
      write(data);
      return task;
    },

    async updateTask(id, input) {
      const data = read();
      const task = data.tasks.find((item) => item.id === id);
      if (!task) return null;
      Object.assign(task, pick(input), { updatedAt: new Date().toISOString() });
      write(data);
      return task;
    },

    async deleteTask(id) {
      const data = read();
      const next = data.tasks.filter((task) => task.id !== id);
      const removed = next.length < data.tasks.length;
      data.tasks = next;
      write(data);
      return removed;
    },
  };
}

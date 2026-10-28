// API for Úkoly, the to-do lists. Every signed-in user has a personal list and
// shares one team list with everybody else.
//
// Who may do what:
//   - anyone may read any list (the switch on the screen shows colleagues'
//     lists too), but a personal list is changed only by its owner or an admin
//   - the team list is changed by anyone except the read-only viewer role
//   - a new personal task always goes on the author's own list

import { z } from 'zod/v4';
import { createFileTaskStore, createPgTaskStore } from './store.js';

export const TASK_LISTS = ['personal', 'team'];
export const TASK_STATUSES = ['todo', 'later', 'done'];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum musí být ve tvaru RRRR-MM-DD.');

const taskFields = z
  .object({
    list: z.enum(TASK_LISTS),
    title: z.string().trim().min(1, 'Napište, co je potřeba udělat.').max(500),
    note: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(TASK_STATUSES),
    dueDate: dateString.nullable().optional(),
    important: z.boolean().optional(),
    assigneeUserId: z.number().int().positive().nullable().optional(),
  })
  .strict();

const createInput = taskFields.extend({ status: z.enum(TASK_STATUSES).optional() });
const updateInput = taskFields.partial();

const firstIssue = (error) => error.issues[0]?.message ?? 'Neplatná data.';

const wrap = (fallback, handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error(fallback, error);
    res.status(500).json({ error: fallback });
  }
};

const canEditList = (user, list, ownerUserId) => {
  if (list === 'team') return user.role !== 'viewer';
  return ownerUserId === user.id || user.role === 'admin';
};

// Finishing a task records when and by whom; reopening it clears both.
const completionFields = (status, user) => {
  if (status === undefined) return {};
  return status === 'done'
    ? { completedAt: new Date().toISOString(), completedByName: user.username }
    : { completedAt: null, completedByName: null };
};

/**
 * pool: the Postgres pool, or null in the JSON development backend (the data
 * then lives in tasks.json in dataDir).
 */
export function registerTaskRoutes(app, { authenticateToken, pool, dataDir }) {
  const store = pool ? createPgTaskStore(pool) : createFileTaskStore(dataDir);

  app.get('/api/tasks', authenticateToken, wrap('Úkoly se nepodařilo načíst.', async (req, res) => {
    const list = req.query.list === 'team' ? 'team' : 'personal';
    const ownerUserId = req.query.owner ? Number(req.query.owner) : req.user.id;
    if (!Number.isInteger(ownerUserId)) return res.status(400).json({ error: 'Neplatný uživatel.' });
    res.json({
      tasks: await store.listTasks({ list, ownerUserId }),
      canEdit: canEditList(req.user, list, ownerUserId),
    });
  }));

  app.post('/api/tasks', authenticateToken, wrap('Úkol se nepodařilo uložit.', async (req, res) => {
    const parsed = createInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const input = parsed.data;
    if (!canEditList(req.user, input.list, req.user.id)) {
      return res.status(403).json({ error: 'Do týmového seznamu nemůžete přidávat.' });
    }
    const status = input.status ?? 'todo';
    const task = await store.createTask({
      ...input,
      status,
      ownerUserId: input.list === 'personal' ? req.user.id : null,
      assigneeUserId: input.list === 'team' ? input.assigneeUserId ?? null : null,
      createdByUserId: req.user.id,
      createdByName: req.user.username,
      ...(status === 'done' ? completionFields('done', req.user) : {}),
    });
    res.status(201).json(task);
  }));

  app.patch('/api/tasks/:id', authenticateToken, wrap('Úkol se nepodařilo uložit.', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Neplatné ID.' });
    const parsed = updateInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
    const task = await store.getTask(id);
    if (!task) return res.status(404).json({ error: 'Úkol neexistuje.' });
    if (!canEditList(req.user, task.list, task.ownerUserId)) {
      return res.status(403).json({ error: 'Tento úkol nemůžete měnit.' });
    }

    const changes = { ...parsed.data };
    // Moving a task between lists: onto the team list it loses its owner, onto
    // a personal list it becomes the mover's own.
    if (changes.list && changes.list !== task.list) {
      if (!canEditList(req.user, changes.list, req.user.id)) {
        return res.status(403).json({ error: 'Do týmového seznamu nemůžete přesouvat.' });
      }
      changes.ownerUserId = changes.list === 'personal' ? req.user.id : null;
      if (changes.list === 'personal') changes.assigneeUserId = null;
    }
    if ((changes.list ?? task.list) === 'personal') delete changes.assigneeUserId;
    if (changes.status !== undefined && changes.status !== task.status) {
      Object.assign(changes, completionFields(changes.status, req.user));
    }

    res.json(await store.updateTask(id, changes));
  }));

  app.delete('/api/tasks/:id', authenticateToken, wrap('Úkol se nepodařilo smazat.', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Neplatné ID.' });
    const task = await store.getTask(id);
    if (!task) return res.status(404).json({ error: 'Úkol neexistuje.' });
    if (!canEditList(req.user, task.list, task.ownerUserId)) {
      return res.status(403).json({ error: 'Tento úkol nemůžete smazat.' });
    }
    await store.deleteTask(id);
    res.status(204).end();
  }));
}

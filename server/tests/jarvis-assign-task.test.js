// Jarvis's assignment and Úkoly proposals (propose_assign, propose_task):
// names resolve against the team, the cards read in names, and confirming
// writes through the app's own routes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProposal, buildAssignProposal, buildTaskProposal, ProposalError } from '../jarvis/proposals.js';

const team = [
  { id: 1, username: 'david' },
  { id: 2, username: 'Petr.Novák' },
  { id: 3, username: 'jana' },
];
const commission = { id: 9, commission_id: 'K012-003', assigned_user_ids: [1] };

test('assignment: names are matched without case or accents; replace, add, remove', () => {
  const replace = buildAssignProposal({ kind: 'commission', section: 'public', role: 'clients', record: commission, names: ['petr.novak'], team, label: 'K012-003' });
  assert.deepEqual(replace.changes[0].to, [2]);
  assert.equal(replace.changes[0].fromText, 'david');
  assert.equal(replace.changes[0].toText, 'Petr.Novák');

  const add = buildAssignProposal({ kind: 'commission', section: 'public', role: 'clients', record: commission, names: ['JANA'], mode: 'add', team, label: 'x' });
  assert.deepEqual(add.changes[0].to, [1, 3]);

  const remove = buildAssignProposal({ kind: 'commission', section: 'public', role: 'clients', record: commission, names: ['david'], mode: 'remove', team, label: 'x' });
  assert.deepEqual(remove.changes[0].to, []);
  assert.equal(remove.changes[0].toText, '—');
});

test('assignment: an unknown name returns the team; no change is refused', () => {
  assert.throws(
    () => buildAssignProposal({ kind: 'commission', section: 'public', role: 'clients', record: commission, names: ['Karel'], team, label: 'x' }),
    (error) => error instanceof ProposalError && /david, Petr\.Novák, jana/.test(error.message)
  );
  assert.throws(
    () => buildAssignProposal({ kind: 'commission', section: 'public', role: 'clients', record: commission, names: ['david'], team, label: 'x' }),
    /není co měnit/
  );
});

test('assignment: confirming writes the ids; a reassignment since is not overwritten', async () => {
  const proposal = buildAssignProposal({ kind: 'commission', section: 'public', role: 'clients', record: commission, names: ['jana'], mode: 'add', team, label: 'x' });
  const calls = [];
  const api = (current) => ({ request: async (method, path, body) => { calls.push({ method, path, body }); return method === 'GET' ? current : {}; } });
  await applyProposal(proposal, api({ ...commission, assigned_user_ids: [1] }));
  assert.deepEqual(calls.find((call) => call.method === 'PUT').body, { assigned_user_ids: [1, 3] });
  await assert.rejects(applyProposal(proposal, api({ ...commission, assigned_user_ids: [2] })), /mezitím změnil/);
});

test('a new task: title, Czech date, team assignee; confirming posts it', async () => {
  const proposal = buildTaskProposal({ action: 'add', list: 'team', title: 'Zavolat Novákovi', dueDate: '30.11.2026', important: true, assignee: 'jana', team });
  assert.equal(proposal.type, 'task');
  assert.deepEqual(proposal.payload, { list: 'team', title: 'Zavolat Novákovi', dueDate: '2026-11-30', important: true, assigneeUserId: 3 });
  const calls = [];
  await applyProposal(proposal, { request: async (method, path, body) => { calls.push({ method, path, body }); return {}; } });
  assert.deepEqual(calls, [{ method: 'POST', path: '/api/tasks', body: { list: 'team', title: 'Zavolat Novákovi', dueDate: '2026-11-30', important: true, assigneeUserId: 3 } }]);
  assert.throws(() => buildTaskProposal({ action: 'add', list: 'personal', title: 'x', assignee: 'jana', team }), /týmovém seznamu/);
});

test('ticking a task off: patched only while it is still there and open', async () => {
  const task = { id: 5, list: 'personal', title: 'Poslat nabídku', status: 'todo' };
  const proposal = buildTaskProposal({ action: 'done', task });
  const calls = [];
  const api = (tasks) => ({ request: async (method, path, body) => { calls.push({ method, path, body }); return method === 'GET' ? { tasks: path.includes('personal') ? tasks : [] } : {}; } });
  await applyProposal(proposal, api([task]));
  assert.deepEqual(calls.filter((call) => call.method === 'PATCH'), [{ method: 'PATCH', path: '/api/tasks/5', body: { status: 'done' } }]);
  await assert.rejects(applyProposal(proposal, api([])), /už v seznamu není/);
  assert.throws(() => buildTaskProposal({ action: 'done', task: { ...task, status: 'done' } }), /už je hotový/);
});

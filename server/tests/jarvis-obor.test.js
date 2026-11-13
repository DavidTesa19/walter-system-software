// Jarvis's Obor proposals (propose_obor): the company tree the server writes
// must be what the profile panel would write, the catalog is enforced, and a
// confirmed card writes the tree with its flat mirrors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companyTreeUpdates, readCompanyTree, withObor } from '../jarvis/companyTree.js';
import { applyProposal, buildOborProposal, ProposalError } from '../jarvis/proposals.js';

const catalog = {
  obors: ['Automatizace', 'Stavebnictví', 'Fintech'],
  specializations: new Map([['Stavebnictví', ['Pozemní stavby', 'Rekonstrukce']]]),
};

const record = {
  id: 12,
  entity_id: 'K012',
  company_name: 'Stavby Novák s.r.o.',
  field: 'Automatizace',
  field_specialization: null,
  company_structure: JSON.stringify([{ company: 'Stavby Novák s.r.o.', fields: [{ field: 'Automatizace', specialization: '' }] }]),
};

test('an obor is added under the company, existing ones stay', () => {
  const tree = withObor(readCompanyTree(record), { obor: 'Stavebnictví', specialization: 'Rekonstrukce' });
  const updates = companyTreeUpdates(tree);
  assert.deepEqual(JSON.parse(updates.company_structure), [
    { company: 'Stavby Novák s.r.o.', fields: [{ field: 'Automatizace', specialization: '' }, { field: 'Stavebnictví', specialization: 'Rekonstrukce' }] },
  ]);
  assert.equal(updates.field, JSON.stringify(['Automatizace', 'Stavebnictví']));
  assert.equal(updates.field_specialization, JSON.stringify({ Stavebnictví: 'Rekonstrukce' }));
});

test('a subject with only flat columns (no tree yet) gets a tree', () => {
  const flat = { id: 3, company_name: 'ABC', field: null, company_structure: null };
  const updates = companyTreeUpdates(withObor(readCompanyTree(flat), { obor: 'Fintech' }));
  assert.deepEqual(JSON.parse(updates.company_structure), [{ company: 'ABC', fields: [{ field: 'Fintech', specialization: '' }] }]);
  assert.equal(updates.field, 'Fintech');
  assert.equal(updates.field_specialization, null);
});

test('the card: one row, readable before and after, mirrors written alongside', () => {
  const proposal = buildOborProposal({ section: 'public', role: 'clients', record, obor: 'stavebnictví', specialization: 'rekonstrukce', catalog, label: 'K012 · Novák' });
  assert.equal(proposal.changes.length, 1);
  assert.equal(proposal.changes[0].fromText, 'Automatizace');
  assert.equal(proposal.changes[0].toText, 'Automatizace, Stavebnictví (Rekonstrukce)');
  assert.equal(proposal.alsoWrite.field, JSON.stringify(['Automatizace', 'Stavebnictví']));
});

test('the catalog is enforced, and the list comes back to choose from', () => {
  assert.throws(
    () => buildOborProposal({ section: 'public', role: 'clients', record, obor: 'Pekařství', catalog, label: 'x' }),
    (error) => error instanceof ProposalError && /Automatizace, Stavebnictví, Fintech/.test(error.message)
  );
  assert.throws(
    () => buildOborProposal({ section: 'public', role: 'clients', record, obor: 'Stavebnictví', specialization: 'Mosty', catalog, label: 'x' }),
    (error) => error instanceof ProposalError && /Pozemní stavby, Rekonstrukce/.test(error.message)
  );
  assert.throws(
    () => buildOborProposal({ section: 'public', role: 'clients', record, obor: 'Automatizace', catalog, label: 'x' }),
    /už subjekt má/
  );
});

test('confirming writes the tree and mirrors; a tree edited since is not overwritten', async () => {
  const proposal = buildOborProposal({ section: 'public', role: 'clients', record, obor: 'Fintech', catalog, label: 'x' });
  const calls = [];
  const api = (current) => ({
    request: async (method, path, body) => {
      calls.push({ method, path, body });
      return method === 'GET' ? current : {};
    },
  });

  await applyProposal(proposal, api(record));
  const put = calls.find((call) => call.method === 'PUT');
  assert.ok(put.path.endsWith('/12'));
  assert.deepEqual(Object.keys(put.body).sort(), ['company_structure', 'field', 'field_specialization']);

  const edited = { ...record, company_structure: JSON.stringify([{ company: 'Stavby Novák s.r.o.', fields: [] }]) };
  await assert.rejects(applyProposal(proposal, api(edited)), /mezitím změnil/);
});

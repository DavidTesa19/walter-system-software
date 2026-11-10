// Jarvis proposing new subjects and zakázky: what the card shows, what the
// app's API receives on "Potvrdit", and what is refused.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ProposalError,
  applyProposal,
  buildCreateCommissionProposal,
  buildCreateSubjectProposal,
  describeProposal,
} from '../jarvis/proposals.js';

const me = { id: 7, name: 'vám (david)' };

test('a new subject with its first zakázka: payload columns, card rows, assignment', () => {
  const proposal = buildCreateSubjectProposal({
    section: 'public',
    role: 'client',
    subject: { name: 'Jan Novák', company: 'Alza.cz a.s.', ico: '27082440', phone: '+420 777 123 456', region: 'Hlavní město Praha', location: 'Praha 7' },
    commission: { position: 'Nový e-shop', priority: 'vysoká', deadline: '30.11.2026' },
    assignee: me,
  });
  assert.equal(proposal.type, 'create_subject');
  assert.equal(proposal.recordId, null);
  assert.deepEqual(proposal.payload.entity, {
    first_name: 'Jan Novák',
    company_name: 'Alza.cz a.s.',
    ico: '27082440',
    phone: '+420 777 123 456',
    region: 'Praha',
    location: 'Praha 7',
    status: 'accepted',
    assigned_user_ids: [7],
  });
  assert.deepEqual(proposal.payload.commission, {
    position: 'Nový e-shop',
    priority: 'Vysoká',
    deadline: '2026-11-30',
    status: 'accepted',
    assigned_user_ids: [7],
  });
  assert.ok(proposal.changes.some((row) => row.label === 'Zařadit do' && row.toText === 'Aktivní'));
  assert.ok(proposal.changes.every((row) => row.fromText === ''), 'a new record has no "from"');
  assert.match(describeProposal(proposal), /nový klient Alza\.cz a\.s\. · Jan Novák .*se zakázkou Nový e-shop/);
});

test('what a new subject refuses', () => {
  const build = (subject, extra = {}) => () => buildCreateSubjectProposal({ section: 'public', role: 'partner', subject, ...extra });
  assert.throws(build({ email: 'a@b.cz' }), (error) => error instanceof ProposalError && /jméno nebo společnost/.test(error.message));
  assert.throws(build({ company: 'X', ico: '12345678' }), /IČO 12345678 není platné/);
  assert.throws(build({ company: 'X', region: 'Bavorsko' }), /Povolené hodnoty/);
  assert.throws(build({ company: 'X', location: 'Brno' }), /zadej i Kraj/);
  assert.throws(build({ company: 'X', field: 'IT' }), /Pole field/);
  assert.throws(build({ company: 'X' }, { commission: { priority: 'Nízká' } }), /název \(position\)/);
  const noCommission = buildCreateSubjectProposal({ section: 'growth', role: 'tiper', subject: { name: 'Eva' }, commission: {}, status: 'pending' });
  assert.equal(noCommission.payload.commission, undefined, 'an empty commission object is no commission');
  assert.equal(noCommission.payload.entity.status, 'pending');
  assert.deepEqual(noCommission.payload.entity.assigned_user_ids, []);
});

const fakeApi = (handlers) => {
  const calls = [];
  return {
    calls,
    async request(method, path, body) {
      calls.push([method, path, body]);
      const handler = handlers[`${method} ${path}`];
      if (!handler) throw Object.assign(new Error(`unexpected ${method} ${path}`), { status: 500 });
      return handler(body);
    },
  };
};

test('confirming a new subject posts it with its zakázka through the app API', async () => {
  const proposal = buildCreateSubjectProposal({
    section: 'public',
    role: 'client',
    subject: { company: 'Firma s.r.o.' },
    commission: { position: 'Web' },
  });
  const api = fakeApi({
    'POST /api/client-entities/with-commission': () => ({ entity: { id: 45, entity_id: 'K045' }, commission: { id: 90, commission_id: 'K045-001' } }),
  });
  const result = await applyProposal(proposal, api);
  assert.deepEqual(result.created, { kind: 'subject', section: 'public', role: 'client', id: 45, code: 'K045 / K045-001' });
  assert.deepEqual(api.calls[0][2], proposal.payload);
});

test('a new zakázka checks its subject still exists', async () => {
  const subject = { id: 12, entity_id: 'P012' };
  const proposal = buildCreateCommissionProposal({
    section: 'projects',
    role: 'partner',
    record: subject,
    commission: { position: 'Audit', state: 'plánováno' },
    label: 'P012 · Firma',
  });
  assert.equal(proposal.payload.entity_id, 12);
  assert.equal(proposal.payload.state, 'Plánováno');

  const ok = fakeApi({
    'GET /api/projects/partner-entities/12': () => subject,
    'POST /api/projects/partner-commissions': () => ({ id: 31 }),
    'GET /api/projects/partner-commissions/31': () => ({ id: 31, commission_id: 'P012-002' }),
  });
  assert.equal((await applyProposal(proposal, ok)).created.code, 'P012-002');

  const gone = fakeApi({
    'GET /api/projects/partner-entities/12': () => {
      throw Object.assign(new Error('Not found'), { status: 404 });
    },
  });
  await assert.rejects(applyProposal(proposal, gone), (error) => error instanceof ProposalError && /smazal/.test(error.message));
  assert.equal(gone.calls.length, 1, 'nothing posted');
});

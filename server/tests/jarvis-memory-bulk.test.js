// Jarvis's bulk changes (one card for many records), its memory and the
// e-mails sent from its drafts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyProposal, buildBulkProposal, describeProposal, ProposalError } from '../jarvis/proposals.js';
import { createFileMemoryStore, memoryContextLines } from '../jarvis/memory.js';
import { buildContextBlock, emailOutcomes } from '../jarvis/routes.js';

const team = [
  { id: 1, username: 'david' },
  { id: 2, username: 'jana' },
];
const commission = (id, data = {}) => ({ id, commission_id: `K00${id}-001`, state: 'Probíhá', deadline: '2026-11-01', assigned_user_ids: [1], ...data });
const entry = (record, changes = {}) => ({ record, label: record.commission_id, changes });

test('bulk: shared and own values, records already right are skipped, bad values reported', () => {
  const proposal = buildBulkProposal({
    kind: 'commission',
    section: 'public',
    role: 'client',
    entries: [
      entry(commission(1), { state: 'Odloženo' }),
      entry(commission(2, { state: 'Odloženo' }), { state: 'Odloženo' }),
      entry(commission(3), { state: 'Odloženo', deadline: '30.11.2026' }),
      entry(commission(4), { state: 'Nesmysl' }),
    ],
    reason: 'Klient se ozve až v lednu',
  });
  assert.equal(proposal.type, 'bulk');
  assert.deepEqual(proposal.items.map((item) => item.recordId), [1, 3]);
  assert.equal(proposal.items[1].changes.length, 2);
  assert.deepEqual(proposal.skipped, ['K002-001']);
  assert.match(proposal.errors[0], /K004-001: Stav: Povolené hodnoty/);
  assert.match(proposal.label, /Stav, Termín · 2 zakázky/);
  assert.match(describeProposal(proposal), /hromadná změna/);
});

test('bulk: an assignment for all records; nothing to change is refused', () => {
  const proposal = buildBulkProposal({
    kind: 'commission',
    section: 'public',
    role: 'client',
    entries: [entry(commission(1)), entry(commission(2, { assigned_user_ids: [2] }))],
    assign: { names: ['jana'], mode: 'replace', team },
  });
  assert.equal(proposal.items.length, 1, 'the one already assigned to Jana is skipped');
  assert.deepEqual(proposal.items[0].changes[0].to, [2]);
  assert.throws(
    () => buildBulkProposal({ kind: 'commission', section: 'public', role: 'client', entries: [entry(commission(2, { state: 'Odloženo' }), { state: 'Odloženo' })] }),
    ProposalError
  );
});

test('bulk apply: each record checked on its own, a changed one is left alone', async () => {
  const stored = new Map([
    [1, commission(1)],
    [3, commission(3, { state: 'Uzavřeno' })], // someone changed it after the card
  ]);
  const writes = [];
  const api = {
    async request(method, url, body) {
      const id = Number(url.split('/').pop());
      if (method === 'GET') return stored.get(id);
      writes.push({ id, body });
      return {};
    },
  };
  const proposal = buildBulkProposal({
    kind: 'commission',
    section: 'public',
    role: 'client',
    entries: [entry(commission(1), { state: 'Odloženo' }), entry(commission(3), { state: 'Odloženo' })],
  });
  const { results } = await applyProposal(proposal, api);
  assert.deepEqual(results.map((result) => result.status), ['applied', 'failed']);
  assert.equal(results[1].error, 'mezitím změněno');
  assert.deepEqual(writes, [{ id: 1, body: { state: 'Odloženo' } }]);
});

test('memory: the file store, and what the context block says', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-memory-'));
  try {
    const store = createFileMemoryStore(dir);
    const first = await store.create(7, { text: '  Chce  stručné odpovědi. ', source: 'jarvis' });
    await store.create(8, { text: 'Někdo jiný', source: 'user' });
    assert.equal(first.text, 'Chce stručné odpovědi.');
    assert.deepEqual((await store.list(7)).map((memory) => memory.text), ['Chce stručné odpovědi.']);
    assert.equal((await store.update(first.id, 8, { text: 'cizí' })), null, 'only the owner changes a note');
    assert.equal((await store.remove(first.id, 7)).id, first.id);
    assert.deepEqual(await store.list(7), []);

    const lines = memoryContextLines([{ id: 3, text: 'Podepisuje se <b>Jan</b>' }]);
    assert.match(lines[1], /^- \[3\] Podepisuje se bJan\/b$/);
    assert.deepEqual(memoryContextLines([]), []);
    assert.match(memoryContextLines([{ id: 1, text: 'x' }], { enabled: false })[0], /vypnutou/);

    const block = buildContextBlock({ id: 7, username: 'jan', role: 'admin', accessScope: 'all' }, {}, [], [], lines);
    assert.match(block, /Paměť \(tvoje poznámky/);
    assert.match(block, /\[3\] Podepisuje se/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('e-mail outcomes: only sends since the last question reach the next turn', () => {
  const transcript = [
    { type: 'question', text: 'a' },
    { type: 'email_status', id: 'e1', status: 'sent', subject: 'Staré', to: ['a@b.cz'] },
    { type: 'question', text: 'b' },
    { type: 'email', draft: { id: 'e2' } },
    { type: 'email_status', id: 'e2', status: 'sent', subject: 'Schůzka', to: ['novak@firma.cz'] },
  ];
  assert.deepEqual(emailOutcomes(transcript), ['E-mail „Schůzka“ uživatel odeslal z karty (komu: novak@firma.cz).']);
});

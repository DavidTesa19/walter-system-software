// Which model answers a question (jarvis/models.js): no API calls involved.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseModel, profileFor, resolveModel } from '../jarvis/models.js';

const route = (question, extra = {}) => chooseModel({ question, ...extra }).key;

test('short one-fact look-ups go to Haiku', () => {
  for (const question of [
    'Jaký je telefon na Pekárnu Novák?',
    'Jaké číslo má Novák?',
    'Jaké IČO má Hotel Vltava?',
    'Kolik máme partnerů?',
    'najdi mi klienta dvorak stavby',
    'Co mám zítra v kalendáři?',
  ]) {
    assert.equal(route(question), 'haiku', question);
  }
});

test('lists, deadlines and opening records stay off Haiku', () => {
  // Haiku answered these with a bare pointer to a button in the eval set.
  for (const question of [
    'Jaké zakázky mám přiřazené já?',
    'Jaké máme partnery v Praze?',
    'Které zakázky jsou po termínu?',
    'Co mám dneska udělat?',
    'Vypiš všechny klienty z Brna',
    'Otevři mi kartu Vinařství Horák',
  ]) {
    assert.equal(route(question), 'sonnet', question);
  }
});

test('changes and web searches go to Sonnet, analysis and drafting to Opus', () => {
  assert.equal(route('Změň telefon u K005 na +420 777 888 999'), 'sonnet');
  assert.equal(route('Připomeň mi za týden zavolat do Tiskárny'), 'sonnet');
  assert.equal(route('Najdi na webu sazbu DPH na pečivo'), 'sonnet');
  assert.equal(route('Analyzuj rizika u zakázek po termínu a navrhni postup'), 'opus');
  assert.equal(route('Napiš Janu Novákovi e-mail o termínu'), 'opus');
  assert.equal(route('Co je v příloze?', { hasAttachments: true }), 'opus');
  assert.equal(route(`Kolik ${'a '.repeat(220)}`), 'opus');
});

test('a manual choice wins; an unknown one falls back to automatic', () => {
  assert.deepEqual(resolveModel({ requested: 'haiku', question: 'Analyzuj vše' }).routing, { mode: 'manual', key: 'haiku' });
  const fallback = resolveModel({ requested: 'gpt-4', question: 'Kolik máme partnerů?' });
  assert.equal(fallback.routing.mode, 'auto');
  assert.equal(fallback.model, 'claude-haiku-5-5');
});

test('a conversation Haiku may not read is moved to Sonnet, by hand or not', () => {
  const compacted = [{ role: 'assistant', content: [{ type: 'compaction', content: 'summary' }, { type: 'text', text: 'x' }] }];
  const webbed = [{ role: 'assistant', content: [{ type: 'server_tool_use', name: 'code_execution', id: 'a', input: {} }] }];
  const plain = [{ role: 'assistant', content: [{ type: 'thinking', thinking: 't', signature: 's' }, { type: 'text', text: 'x' }] }];

  assert.equal(resolveModel({ question: 'Kolik máme partnerů?', history: compacted }).routing.key, 'sonnet');
  const manual = resolveModel({ requested: 'haiku', question: 'x', history: webbed });
  assert.equal(manual.routing.mode, 'manual');
  assert.equal(manual.routing.key, 'sonnet');
  assert.ok(manual.routing.reason);
  // Thinking blocks alone are fine: the API drops what a model cannot read.
  assert.equal(resolveModel({ requested: 'haiku', question: 'x', history: plain }).routing.key, 'haiku');
  assert.equal(resolveModel({ requested: 'opus', question: 'x', history: compacted }).routing.key, 'opus');
});

test('Haiku gets the plain request shape', () => {
  assert.deepEqual(profileFor('claude-haiku-5-5'), { fallbacks: false, webVersion: 'basic', contextManagement: false });
  assert.deepEqual(profileFor('claude-opus-5-5'), { fallbacks: true, webVersion: 'current', contextManagement: true });
  assert.deepEqual(profileFor('claude-sonnet-5-5'), { fallbacks: true, webVersion: 'current', contextManagement: true });
});

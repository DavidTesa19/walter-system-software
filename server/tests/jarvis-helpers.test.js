// Small Jarvis helpers that are easy to break: Prague time, typo-tolerant
// search, how a turn ended, and which answer a rating belongs to.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEventTime, pragueMidnight, pragueParts } from '../jarvis/time.js';
import { codeVariants, matchToken, recordWords } from '../jarvis/fuzzy.js';
import { JARVIS_MENTION, answerOfTurn, turnStatus } from '../jarvis/routes.js';

test('a zone-less event time means Prague time, summer and winter', () => {
  // 10:00 in Prague is 08:00 UTC in summer time and 09:00 UTC in winter.
  assert.equal(parseEventTime('2026-07-15T10:00').toISOString(), '2026-07-15T08:00:00.000Z');
  assert.equal(parseEventTime('2026-12-15T10:00').toISOString(), '2026-12-15T09:00:00.000Z');
  assert.equal(parseEventTime('2026-12-15').toISOString(), '2026-12-14T23:00:00.000Z');
  // A time with its own offset is taken as it is.
  assert.equal(parseEventTime('2026-12-15T10:00:00Z').toISOString(), '2026-12-15T10:00:00.000Z');
});

test('Prague midnight on the days the clocks change', () => {
  assert.equal(pragueMidnight({ year: 2026, month: 3, day: 29 }).toISOString(), '2026-03-28T23:00:00.000Z');
  assert.equal(pragueMidnight({ year: 2026, month: 10, day: 25 }).toISOString(), '2026-10-24T22:00:00.000Z');
  assert.deepEqual(
    (({ year, month, day }) => ({ year, month, day }))(pragueParts(new Date('2026-10-28T23:30:00Z'))),
    { year: 2026, month: 10, day: 29 },
    'half past midnight in Prague is still 28 October in UTC'
  );
});

test('search: codes without zeros, sound-alike names, exact numbers', () => {
  assert.deepEqual(codeVariants('k12'), ['k012']);
  assert.deepEqual(codeVariants('k12-3'), ['k012-003']);
  assert.deepEqual(codeVariants('k012'), []);

  const text = 'k012 pekarna novak s.r.o. jan novak +420 602 111 222';
  const words = recordWords(text);
  assert.equal(matchToken('k12', text, words).score, 1);
  assert.ok(matchToken('nowak', text, words).score > 0.8, 'w/v sounds alike');
  assert.ok(matchToken('novakovi', text, words).score > 0.6, 'a Czech case ending comes off');
  assert.equal(matchToken('602', text, words).score, 1);
  assert.equal(matchToken('603', text, words).score, 0, 'numbers only ever match exactly');
});

test('how a turn ended, for the usage view', () => {
  assert.equal(turnStatus('end_turn', true), 'ok');
  assert.equal(turnStatus('end_turn', false), 'empty');
  assert.equal(turnStatus('aborted', false), 'stopped');
  assert.equal(turnStatus('max_tokens', true), 'truncated');
  assert.equal(turnStatus('tool_limit', false), 'tool_limit');
  assert.equal(turnStatus(undefined, false), 'error');
});

test('a rating finds its own question and answer', () => {
  const transcript = [
    { type: 'question', text: 'první' },
    { type: 'tool', name: 'search' },
    { type: 'answer', text: 'odpověď 1', model: 'claude-opus-5-5' },
    { type: 'question', text: 'druhá' },
    { type: 'answer', text: 'část A', model: 'claude-haiku-5-5' },
    { type: 'answer', text: 'část B', model: 'claude-haiku-5-5' },
    { type: 'feedback', turn: 0, rating: 'up' },
    { type: 'question', text: 'třetí, bez odpovědi' },
  ];
  assert.deepEqual(answerOfTurn(transcript, 0), { question: 'první', answer: 'odpověď 1', model: 'claude-opus-5-5' });
  assert.deepEqual(answerOfTurn(transcript, 1), { question: 'druhá', answer: 'část A\n\nčást B', model: 'claude-haiku-5-5' });
  assert.equal(answerOfTurn(transcript, 2), null);
  assert.equal(answerOfTurn(transcript, 9), null);
});

test('@Jarvis is a mention only as a word of its own', () => {
  assert.ok(JARVIS_MENTION.test('@Jarvis kolik máme partnerů?'));
  assert.ok(JARVIS_MENTION.test('Ahoj, @jarvis poradíš?'));
  assert.ok(!JARVIS_MENTION.test('napiš na jan@jarvis.cz'));
  assert.ok(!JARVIS_MENTION.test('@Jarvisek'));
});

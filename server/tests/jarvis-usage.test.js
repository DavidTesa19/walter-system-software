// The admins' Jarvis usage view (finance/jarvis-usage.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeJarvisUsage } from '../finance/jarvis-usage.js';

const turn = (data) => ({
  at: '2026-10-29T08:00:00Z', userId: 1, conversationId: 'c1', question: 'q', voice: false, status: 'ok',
  durationMs: 4000, firstTextMs: 3000, tools: [], failedTools: 0, costUsd: 0.05, ...data,
});

test('totals, failures and answer times', () => {
  const summary = summarizeJarvisUsage(
    {
      turns: [
        turn({ durationMs: 2000, costUsd: 0.01 }),
        turn({ durationMs: 10000, costUsd: 0.2, tools: ['search', 'search', 'get_subject'] }),
        turn({ status: 'error', error: 'boom', userId: 2 }),
        turn({ status: 'stopped', durationMs: 999999 }),
      ],
      usage: [
        { userId: 1, feature: 'jarvis', calls: 3, costUsd: 0.3 },
        { userId: 1, feature: 'voice_tts', calls: 1, costUsd: 0.1 },
        { userId: 2, feature: 'jarvis', calls: 1, costUsd: 0.05 },
      ],
    },
    30
  );
  assert.equal(summary.totals.questions, 4);
  assert.equal(summary.totals.failed, 1, 'a stop by the user is not a failure');
  assert.equal(summary.totals.stopped, 1);
  assert.equal(summary.totals.medianMs, 4000, 'a stopped answer does not count towards the times');
  assert.equal(summary.failures[0].error, 'boom');
  assert.equal(summary.expensive[0].costUsd, 0.2);
  assert.deepEqual(summary.expensive[0].tools, ['search', 'get_subject']);
  const first = summary.byUser.find((row) => row.userId === 1);
  assert.equal(first.questions, 3);
  assert.equal(Math.round(first.costUsd * 100), 40);
  assert.equal(Math.round(first.features.voice_tts * 100), 10);
});

test('ratings: the newest per answer counts, "none" takes one back', () => {
  const rating = (data) => ({ at: '2026-10-29T08:00:00Z', userId: 1, conversationId: 'c1', turn: 0, question: 'q', answer: 'a', comment: null, model: 'claude-haiku-5-5', ...data });
  const { feedback } = summarizeJarvisUsage(
    {
      turns: [],
      usage: [],
      // newest first, as the store returns them
      feedback: [
        rating({ rating: 'down', comment: 'Nerozepsal sekce.' }),
        rating({ rating: 'up' }),
        rating({ conversationId: 'c2', rating: 'none', model: 'claude-opus-5-5' }),
        rating({ conversationId: 'c2', rating: 'up', model: 'claude-opus-5-5' }),
        rating({ conversationId: 'c3', rating: 'up', model: 'claude-opus-5-5' }),
      ],
    },
    7
  );
  assert.equal(feedback.up, 1);
  assert.equal(feedback.down, 1);
  assert.deepEqual(feedback.byModel.find((row) => row.model === 'claude-haiku-5-5'), { model: 'claude-haiku-5-5', up: 0, down: 1 });
  assert.deepEqual(feedback.byModel.find((row) => row.model === 'claude-opus-5-5'), { model: 'claude-opus-5-5', up: 1, down: 0 });
  assert.equal(feedback.recentDown[0].comment, 'Nerozepsal sekce.');
});

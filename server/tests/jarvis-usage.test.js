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

// ---------------------------------------------------------------------------
// The per-question breakdown (Jarvis › Analýza).
// ---------------------------------------------------------------------------
import { costBreakdown, enrichTurn, lastPragueDays, listJarvisQuestions, pragueDayHour } from '../finance/jarvis-usage.js';
import { partsTotal, turnCostParts, turnDetails } from '../finance/jarvis-turns.js';
import { estimateCostUsd } from '../finance/pricing.js';

const round = (data) => ({ model: 'claude-opus-5-5', ms: 1000, input: 100, output: 200, cacheRead: 20000, cacheWrite: 3000, cacheWrite1h: 0, webSearches: 0, webFetches: 0, stop: 'end_turn', tools: [], compaction: false, ...data });

test('cost parts add up to the call price, per model that answered', () => {
  const rounds = [round({ tools: ['search'], stop: 'tool_use' }), round({ model: 'claude-sonnet-5-5', webSearches: 2 })];
  const parts = turnCostParts({ model: 'claude-opus-5-5', rounds, ocr: [{ provider: 'anthropic', model: 'claude-opus-5-5', feature: 'jarvis_ocr', input: 1000, output: 500 }] });
  const expected =
    estimateCostUsd({ provider: 'anthropic', model: 'claude-opus-5-5', ...rounds[0] }) +
    estimateCostUsd({ provider: 'anthropic', model: 'claude-sonnet-5-5', ...rounds[1] });
  assert.ok(Math.abs(parts.input + parts.cacheWrite + parts.cacheRead + parts.output - expected) < 1e-12);
  assert.equal(parts.webSearch, 0.02);
  assert.ok(parts.ocr > 0);
  assert.ok(Math.abs(partsTotal(parts) - (expected + 0.02 + parts.ocr)) < 1e-12);
});

test('an old question without details gets estimated parts that add up to its logged cost', () => {
  const item = enrichTurn(turn({ input: 1000, output: 2000, cacheRead: 20000, cacheWrite: 5000, webSearches: 1, costUsd: 0.2 }));
  assert.equal(item.estimated, true);
  assert.equal(item.parts.webSearch, 0.01);
  assert.ok(Math.abs(partsTotal(item.parts) - 0.2) < 1e-9);
});

test('Prague days and hours', () => {
  assert.deepEqual(pragueDayHour('2026-11-13T23:30:00Z'), { day: '2026-11-14', hour: 0 });
  assert.deepEqual(pragueDayHour('2026-07-01T21:59:00Z'), { day: '2026-07-01', hour: 23 });
  const days = lastPragueDays(3, Date.parse('2026-11-14T10:00:00Z'));
  assert.deepEqual(days, ['2026-11-12', '2026-11-13', '2026-11-14']);
});

const detailed = (data, { rounds = [round()], depth = 0, view = 'Kalendář', routing = { mode: 'auto', key: 'opus', reason: 'x' } } = {}) => {
  const parts = turnCostParts({ model: 'claude-opus-5-5', rounds });
  return turn({
    model: 'claude-opus-5-5',
    costUsd: partsTotal(parts),
    details: turnDetails({ rounds, toolRuns: [], view, depth, routing, parts }),
    ...data,
  });
};

test('breakdown by model, day, hour, tool, screen and depth, with insights', () => {
  const now = Date.parse('2026-11-14T12:00:00Z');
  const turns = [
    // Short first questions on Opus without tools (Sonnet would do).
    ...[0, 1, 2].map((index) => detailed({ at: `2026-11-14T0${index}:10:00Z` }, { rounds: [round({ cacheRead: 0, cacheWrite: 0 })] })),
    // Deep questions in a long conversation, with a big context.
    ...[7, 8, 9].map((depth) =>
      detailed(
        { at: '2026-11-13T09:00:00Z', tools: ['search'] },
        { depth, view: 'Zakázky', rounds: [round({ tools: ['search'], stop: 'tool_use', cacheRead: 90000, cacheWrite: 40000 }), round({ cacheRead: 120000 })] }
      )
    ),
  ];
  const breakdown = costBreakdown(turns, 7, now);
  assert.equal(breakdown.byDay.length, 7);
  assert.equal(breakdown.byDay.at(-1).day, '2026-11-14');
  assert.equal(breakdown.byDay.at(-1).questions, 3);
  assert.equal(breakdown.byHour[10].questions, 3, '09:00 UTC is 10:00 in Prague');
  assert.equal(breakdown.byModel[0].family, 'opus');
  assert.equal(breakdown.byTool[0].name, 'search');
  assert.equal(breakdown.byView.find((row) => row.view === 'Zakázky').questions, 3);
  assert.equal(breakdown.byDepth.find((row) => row.key === 'deep').questions, 3);
  const kinds = breakdown.insights.map((insight) => insight.kind);
  assert.ok(kinds.includes('depth'), 'deep questions cost much more than first ones');
  assert.ok(kinds.includes('opus_simple'), 'Opus answered questions without tools');
  assert.ok(kinds.includes('cache_write'));
  const total = Object.values(breakdown.parts).reduce((sum, value) => sum + value, 0);
  const logged = turns.reduce((sum, item) => sum + item.costUsd, 0);
  assert.ok(Math.abs(total - logged) < 1e-9);
});

test('the question list filters, sorts and pages', () => {
  const turns = [
    detailed({ at: '2026-11-14T08:00:00Z', question: 'Kolik má Novák zakázek?', costUsd: 0.05, userId: 1 }),
    detailed({ at: '2026-11-14T09:00:00Z', question: 'Přehled pipeline', costUsd: 0.5, userId: 2, tools: ['list_records'] }),
    detailed({ at: '2026-11-14T10:00:00Z', question: 'Chyba', status: 'error', costUsd: 0.01, userId: 1, model: 'claude-haiku-5-5' }),
  ];
  assert.equal(listJarvisQuestions(turns).items[0].question, 'Chyba', 'newest first by default');
  assert.equal(listJarvisQuestions(turns, { sort: 'cost' }).items[0].question, 'Přehled pipeline');
  assert.equal(listJarvisQuestions(turns, { userId: 1 }).total, 2);
  assert.equal(listJarvisQuestions(turns, { status: 'failed' }).total, 1);
  assert.equal(listJarvisQuestions(turns, { model: 'haiku' }).total, 1);
  assert.equal(listJarvisQuestions(turns, { tool: 'list_records' }).total, 1);
  assert.equal(listJarvisQuestions(turns, { q: 'novak' }).total, 1, 'accents ignored');
  const page = listJarvisQuestions(turns, { limit: 2, offset: 2 });
  assert.equal(page.total, 3);
  assert.equal(page.items.length, 1);
});

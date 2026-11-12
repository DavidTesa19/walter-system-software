// Prompt-cache writes are priced by TTL: 5 minutes at 1.25x input, 1 hour at
// 2x (Jarvis keeps its system prompt and tools for an hour).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCostUsd } from '../finance/pricing.js';

const opus = { provider: 'anthropic', model: 'claude-opus-5-5', feature: 'jarvis' };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('5-minute cache writes cost 1.25x input', () => {
  close(estimateCostUsd({ ...opus, cacheWrite: 1_000_000 }), 5);
});

test('1-hour cache writes cost 2x input', () => {
  close(estimateCostUsd({ ...opus, cacheWrite: 1_000_000, cacheWrite1h: 1_000_000 }), 8);
});

test('a mixed write is split by TTL, reads and output priced as before', () => {
  // 23k tokens of system prompt for an hour, 2k of conversation for 5 minutes,
  // 40k read from the cache, 500 output.
  const cost = estimateCostUsd({ ...opus, cacheWrite: 25_000, cacheWrite1h: 23_000, cacheRead: 40_000, output: 500 });
  close(cost, (23_000 * 8 + 2_000 * 5 + 40_000 * 0.2 + 500 * 20) / 1_000_000);
});

test('a 1-hour count larger than the writes is capped', () => {
  close(estimateCostUsd({ ...opus, cacheWrite: 1_000, cacheWrite1h: 5_000 }), (1_000 * 8) / 1_000_000);
});

// Password guessing at the login form (login-guard.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoginGuard, lockedMessage } from '../login-guard.js';

const MINUTE = 60 * 1000;

const clock = () => {
  let time = Date.UTC(2026, 9, 29, 10, 0);
  return { now: () => time, advance: (ms) => { time += ms; } };
};

test('five wrong passwords lock that username for fifteen minutes', async () => {
  const time = clock();
  const guard = createLoginGuard({ now: time.now, failureDelayMs: 0 });
  for (let attempt = 0; attempt < 4; attempt += 1) await guard.recordFailure('jana');
  assert.equal(guard.lockedFor('jana'), 0);
  await guard.recordFailure('Jana ');
  assert.equal(guard.lockedFor('jana'), 15 * MINUTE, 'names are compared trimmed and in lower case');
  time.advance(15 * MINUTE);
  assert.equal(guard.lockedFor('jana'), 0);
});

test('failures older than the window do not count', async () => {
  const time = clock();
  const guard = createLoginGuard({ now: time.now, failureDelayMs: 0 });
  for (let attempt = 0; attempt < 4; attempt += 1) await guard.recordFailure('petr');
  time.advance(16 * MINUTE);
  await guard.recordFailure('petr');
  assert.equal(guard.lockedFor('petr'), 0);
});

test('a successful login clears the count; other names are unaffected', async () => {
  const guard = createLoginGuard({ failureDelayMs: 0 });
  for (let attempt = 0; attempt < 4; attempt += 1) await guard.recordFailure('eva');
  guard.recordSuccess('eva');
  await guard.recordFailure('eva');
  assert.equal(guard.lockedFor('eva'), 0);
  for (let attempt = 0; attempt < 5; attempt += 1) await guard.recordFailure('nobody-here');
  assert.ok(guard.lockedFor('nobody-here') > 0, 'unknown usernames are counted the same way');
  assert.equal(guard.lockedFor('eva'), 0);
});

test('the message names the wait in whole minutes', () => {
  assert.match(lockedMessage(15 * MINUTE), /15 min/);
  assert.match(lockedMessage(1000), /1 min/);
});

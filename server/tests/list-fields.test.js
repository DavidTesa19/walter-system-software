// `?fields=activity`: the lean subject/zakázka lists behind the change bubbles.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityListFields, isActivityListRequest, pickActivityFields } from '../list-fields.js';

const request = (path, query = { fields: 'activity' }, method = 'GET') => ({ method, path, query });

test('only the list routes of all three sections are trimmed', () => {
  for (const path of [
    '/api/client-entities',
    '/api/partner-commissions',
    '/api/projects/tiper-entities',
    '/api/growth/client-commissions/',
  ]) {
    assert.equal(isActivityListRequest(request(path)), true, path);
  }
  for (const path of [
    '/api/client-entities/12',
    '/api/client-entities/12/notes',
    '/api/projects/client-entities/with-commission',
    '/api/jarvis/conversations',
    '/clients',
  ]) {
    assert.equal(isActivityListRequest(request(path)), false, path);
  }
  assert.equal(isActivityListRequest(request('/api/client-entities', {})), false, 'without the parameter');
  assert.equal(isActivityListRequest(request('/api/client-entities', { fields: 'all' })), false);
  assert.equal(isActivityListRequest(request('/api/client-entities', undefined, 'POST')), false, 'not a write');
});

test('a row keeps its id, state, times and actors, nothing else', () => {
  const row = {
    id: 7,
    status: 'pending',
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-09T10:00:00Z',
    created_by_user_id: 3,
    updated_by_user_id: null,
    name: 'Jan Novák',
    notes: 'tajné',
    company_structure: '[]',
  };
  assert.deepEqual(pickActivityFields(row), {
    id: 7,
    status: 'pending',
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-09T10:00:00Z',
    created_by_user_id: 3,
    updated_by_user_id: null,
  });
});

test('the middleware trims an array response and leaves other answers alone', () => {
  const sent = [];
  const res = { json: (body) => sent.push(body) };
  let nextCalled = false;
  activityListFields(request('/api/growth/partner-entities'), res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  res.json([{ id: 1, status: 'accepted', name: 'X' }]);
  res.json({ error: 'Failed' });
  assert.deepEqual(sent, [[{ id: 1, status: 'accepted' }], { error: 'Failed' }]);

  const untouched = { json: () => {} };
  const original = untouched.json;
  activityListFields(request('/api/client-entities/5'), untouched, () => {});
  assert.equal(untouched.json, original, 'a detail route keeps its own json');
});

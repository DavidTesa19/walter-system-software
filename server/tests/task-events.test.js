// The live Úkoly stream (tasks/events.js): a change reaches every open
// stream as "which list", and a closed stream stops listening.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { publishTaskChange, streamTaskEvents, taskListenerCount } from '../tasks/events.js';

const fakeStream = () => {
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.headers = {};
  res.chunks = [];
  res.status = (code) => { res.code = code; return res; };
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
  res.flushHeaders = () => {};
  res.write = (chunk) => { res.chunks.push(chunk); return true; };
  return { req, res };
};

test('a change reaches every open stream, with only the list it concerns', () => {
  const a = fakeStream();
  const b = fakeStream();
  const before = taskListenerCount();
  streamTaskEvents(a.req, a.res);
  streamTaskEvents(b.req, b.res);
  assert.equal(a.res.headers['content-type'], 'text/event-stream; charset=utf-8');

  publishTaskChange({ id: 7, list: 'team', ownerUserId: null, title: 'Tajný název' });
  for (const { res } of [a, b]) {
    const last = res.chunks.at(-1);
    assert.equal(last, 'data: {"list":"team","ownerUserId":null}\n\n');
    assert.ok(!last.includes('Tajný'), 'the task itself is never sent');
  }

  a.req.emit('close');
  b.req.emit('close');
  assert.equal(taskListenerCount(), before);
});

test('publishing with nothing to say is a no-op', () => {
  assert.doesNotThrow(() => publishTaskChange(null));
});

test('a successful write to app data tells the open apps which area changed', async () => {
  const { dataArea, dataChangeMiddleware } = await import('../tasks/events.js');
  assert.equal(dataArea('/api/client-entities/5'), 'client-entities');
  assert.equal(dataArea('/api/projects/partner-commissions/2'), 'projects');
  assert.equal(dataArea('/growth-documents/4/notes'), 'growth-documents');
  for (const path of ['/api/tasks/1', '/api/jarvis/chat', '/auth/login', '/api/palettes/ai']) assert.equal(dataArea(path), null, path);

  const stream = fakeStream();
  streamTaskEvents(stream.req, stream.res);
  const run = (method, path, status) => {
    const res = new EventEmitter();
    res.statusCode = status;
    dataChangeMiddleware({ method, path }, res, () => {});
    res.emit('finish');
  };
  run('PUT', '/api/client-entities/5', 200);
  run('PUT', '/api/client-entities/6', 200); // same area: one message
  run('GET', '/api/partner-entities', 200); // a read is not a change
  run('PUT', '/api/tiper-entities/1', 403); // a refused write changed nothing
  await new Promise((resolve) => setTimeout(resolve, 400));
  const data = stream.res.chunks.filter((chunk) => chunk.includes('"kind":"data"'));
  assert.deepEqual(data, ['data: {"kind":"data","area":"client-entities"}\n\n']);
  stream.req.emit('close');
});

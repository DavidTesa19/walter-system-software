// Live updates for Úkoly: every open app keeps one Server-Sent Events stream
// (GET /api/tasks/events) and is told the moment any list changes, so a task a
// colleague adds to the team list shows up at once instead of on the next
// minute's poll.
//
// The message only says WHICH list changed ({ list, ownerUserId }), never its
// content: the browser then reloads that list through the normal, permission-
// checked GET /api/tasks. (Every list is readable by everyone signed in anyway.)
//
// The signal is in-process: it reaches the browsers connected to this server
// process. Railway runs one instance; with several replicas this would need
// Postgres LISTEN/NOTIFY between them.

import { EventEmitter } from 'node:events';

const bus = new EventEmitter();
// One listener per open browser tab; there is no meaningful cap.
bus.setMaxListeners(0);

// Proxies (Railway's included) close a connection that stays silent for long;
// a comment line every 25 s keeps it open and lets a dead one be noticed.
const HEARTBEAT_MS = 25_000;

/** Tells every connected browser that one list changed. Never throws. */
export function publishTaskChange(task) {
  if (!task) return;
  try {
    bus.emit('change', { list: task.list, ownerUserId: task.ownerUserId ?? null });
  } catch (error) {
    console.error('Task change broadcast failed:', error);
  }
}

/** The stream route's handler (after authenticateToken). */
export function streamTaskEvents(req, res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Tells nginx-style proxies not to buffer the stream.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write('event: ready\ndata: {}\n\n');

  const send = (change) => {
    res.write(`data: ${JSON.stringify(change)}\n\n`);
  };
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  bus.on('change', send);

  const close = () => {
    clearInterval(heartbeat);
    bus.off('change', send);
  };
  req.on('close', close);
  res.on('error', close);
}

export const taskListenerCount = () => bus.listenerCount('change');

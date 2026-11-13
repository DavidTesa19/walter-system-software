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

// ---- The same stream for the rest of the app's data ------------------------
//
// Clients, partners, tipaři, zakázky, documents and the Obor lists: after a
// successful change the stream says only "data changed" with the area of the
// app (`{ kind: 'data', area }`), never the data; open tables then refresh
// themselves through their normal, permission-checked GETs. (The tasks' own
// messages carry `list`, so the two never mix.)

// Write routes whose success changes data a colleague may be looking at.
const DATA_ROUTE = /^\/(?:api\/)?(?:(?:client|partner|tiper)-(?:entities|commissions)|(?:projects|growth)(?:\/|$)|(?:clients|partners|tipers)(?:\/|$)|project-|growth-|documents(?:\/|$)|field-(?:specialization-)?options)/;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The area of the app a path belongs to ("client-entities", "projects", …). */
export const dataArea = (path) => {
  const match = DATA_ROUTE.exec(path);
  if (!match) return null;
  return path.replace(/^\/(?:api\/)?/, '').split('/')[0] || null;
};

// Coalesces a burst (a bulk ARES fill, an import) into a few messages.
let pending = new Set();
let timer = null;
const flush = () => {
  timer = null;
  const areas = [...pending];
  pending = new Set();
  for (const area of areas) {
    try {
      bus.emit('change', { kind: 'data', area });
    } catch (error) {
      console.error('Data change broadcast failed:', error);
    }
  }
};

/** Tells every open app that one area's data changed (coalesced over 300 ms). */
export function publishDataChange(area) {
  if (!area) return;
  pending.add(area);
  if (!timer) timer = setTimeout(flush, 300);
}

/** Express middleware: after a successful write to a data route, publish it. */
export function dataChangeMiddleware(req, res, next) {
  if (WRITE_METHODS.has(req.method)) {
    const area = dataArea(req.path);
    if (area) {
      res.on('finish', () => {
        if (res.statusCode < 400) publishDataChange(area);
      });
    }
  }
  next();
}

// Live updates for Úkoly: one stream per browser tab from
// GET /api/tasks/events (server/tasks/events.js), shared by every task list on
// screen. The server says which list changed; the list reloads itself.
//
// fetch, not EventSource: EventSource cannot send the Authorization header
// the API needs. The stream reconnects on its own, with a growing pause, and
// a reconnect is reported too, since changes may have been missed meanwhile.

import { API_BASE } from '../utils/api';

export type TaskChange =
  | { type: 'change'; list: 'personal' | 'team'; ownerUserId: number | null }
  | { type: 'reconnected' };

type Listener = (change: TaskChange) => void;

const listeners = new Set<Listener>();
let controller: AbortController | null = null;

const token = (): string | null => {
  try {
    return JSON.parse(localStorage.getItem('walterUser') || 'null')?.token ?? null;
  } catch {
    return null;
  }
};

const notify = (change: TaskChange) => {
  listeners.forEach((listener) => {
    try {
      listener(change);
    } catch {
      // One list's failure must not stop the others.
    }
  });
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });

async function run(signal: AbortSignal) {
  let pause = 1_000;
  let connectedBefore = false;
  while (!signal.aborted) {
    const auth = token();
    if (!auth) {
      // Signed out: check again later rather than hammering the server.
      await sleep(30_000, signal);
      continue;
    }
    try {
      const response = await fetch(`${API_BASE}/api/tasks/events`, {
        headers: { Authorization: `Bearer ${auth}`, Accept: 'text/event-stream' },
        signal,
        cache: 'no-store',
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      if (connectedBefore) notify({ type: 'reconnected' });
      connectedBefore = true;
      pause = 1_000;

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const message = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = message
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('');
          if (!data || /^event: ready/m.test(message)) continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed && (parsed.list === 'team' || parsed.list === 'personal')) {
              notify({ type: 'change', list: parsed.list, ownerUserId: parsed.ownerUserId ?? null });
            }
          } catch {
            // Not ours; ignore.
          }
        }
      }
    } catch {
      // Network drop, server restart, expired token: retry below.
    }
    if (signal.aborted) break;
    await sleep(pause, signal);
    pause = Math.min(pause * 2, 30_000);
  }
}

/** Calls `listener` on every task change; the stream runs while anyone listens. */
export function subscribeTaskChanges(listener: Listener): () => void {
  listeners.add(listener);
  if (!controller) {
    controller = new AbortController();
    void run(controller.signal);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && controller) {
      controller.abort();
      controller = null;
    }
  };
}

// Who is making a change, carried from the HTTP request down to the database.
//
// Every write in the app ends up in Postgres, where triggers record it in the
// change log (see pg-install.js). The triggers cannot see the HTTP request, so
// the request's actor is handed to them through a session setting
// (`walter.ctx`) that is applied on every pool checkout — see
// installDbContextHook. AsyncLocalStorage is what lets that hook know which
// request a query belongs to without threading `req` through ~60 call sites.

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

const storage = new AsyncLocalStorage();

export const ACTOR_TYPES = Object.freeze({
  user: 'user',
  aiAgent: 'ai_agent',
  public: 'public',
  system: 'system',
});

// An AI agent (or any other client) may group several requests into one
// changeset, so a whole agent run can be reviewed and reverted as one unit.
const CHANGESET_HEADER = 'x-walter-changeset';
const NOTE_HEADER = 'x-walter-change-note';
const CHANGESET_PATTERN = /^[A-Za-z0-9:._-]{6,80}$/;
const MAX_NOTE_LENGTH = 500;

const cleanNote = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_NOTE_LENGTH) : null;
};

export function requestContextMiddleware(req, _res, next) {
  const store = { req, requestId: crypto.randomUUID(), overrides: {} };
  req.walterContext = store;
  storage.run(store, next);
}

// Middleware that resumes the chain from a stream event (multer) runs outside
// the request's async context; put it back so the upload's actor is logged.
export function reenterRequestContext(req, _res, next) {
  if (req.walterContext && storage.getStore() !== req.walterContext) {
    storage.run(req.walterContext, next);
    return;
  }
  next();
}

// Run `fn` with extra context on top of the current one: a revert keeps the
// admin who clicked it as the actor but gets its own changeset, and the
// nightly backup job runs as the system.
export function runWithContext(overrides, fn) {
  const current = storage.getStore();
  const store = {
    req: overrides?.detachRequest ? null : current?.req ?? null,
    requestId: current?.requestId ?? crypto.randomUUID(),
    overrides: { ...(current?.overrides ?? {}), ...(overrides ?? {}) },
  };
  return storage.run(store, fn);
}

// For the future AI agent running inside this server (a chat tool call, say):
// everything `fn` writes is tagged as the agent's, grouped under `runId`, and
// still attributed to the human the agent acts for.
export function runAsAgent({ runId, note, onBehalfOf } = {}, fn) {
  const changesetId = typeof runId === 'string' && CHANGESET_PATTERN.test(runId)
    ? runId
    : `ai-run-${crypto.randomUUID()}`;
  return runWithContext({
    type: ACTOR_TYPES.aiAgent,
    changesetId,
    note: cleanNote(note),
    ...(onBehalfOf ? { userId: onBehalfOf.id, username: onBehalfOf.username } : {}),
  }, fn);
}

export const isAgentUser = (user) =>
  Boolean(user) && (user.role === 'ai_agent' || user.actorType === ACTOR_TYPES.aiAgent);

export function describeActor(store = storage.getStore()) {
  if (!store) {
    return { type: ACTOR_TYPES.system, userId: null, username: null, requestId: null, changesetId: null, route: null, note: null, reverts: null };
  }

  const { req, overrides } = store;
  const user = req?.user ?? null;
  const headerChangeset = req?.get?.(CHANGESET_HEADER);
  const type = overrides.type
    ?? (user ? (isAgentUser(user) ? ACTOR_TYPES.aiAgent : ACTOR_TYPES.user) : (req ? ACTOR_TYPES.public : ACTOR_TYPES.system));
  const userIdValue = Number(overrides.userId ?? user?.id);

  return {
    type,
    userId: Number.isInteger(userIdValue) && userIdValue > 0 ? userIdValue : null,
    username: overrides.username ?? user?.username ?? null,
    requestId: store.requestId,
    changesetId: overrides.changesetId
      ?? (typeof headerChangeset === 'string' && CHANGESET_PATTERN.test(headerChangeset) ? headerChangeset : null)
      ?? store.requestId,
    route: overrides.route ?? (req ? `${req.method} ${String(req.originalUrl || req.url || '').split('?')[0]}` : null),
    note: overrides.note ?? cleanNote(req?.get?.(NOTE_HEADER)),
    reverts: overrides.reverts ?? null,
  };
}

export const currentActor = () => describeActor(storage.getStore());

// The JSON the change-log trigger reads back with current_setting('walter.ctx').
// Short keys keep the per-checkout round trip small. `extra` lets a revert
// re-tag single statements inside its transaction (see SET LOCAL in pg-store).
export function currentDbContextValue(extra = null) {
  const current = storage.getStore();
  if (!current && !extra) return '';
  const store = extra
    ? { req: current?.req ?? null, requestId: current?.requestId ?? crypto.randomUUID(), overrides: { ...(current?.overrides ?? {}), ...extra } }
    : current;
  const actor = describeActor(store);
  return JSON.stringify({
    t: actor.type,
    u: actor.userId,
    n: actor.username,
    r: actor.requestId,
    c: actor.changesetId,
    p: actor.route,
    note: actor.note,
    rv: actor.reverts,
  });
}

// Wrap pool.connect so every checked-out client carries the current actor.
// pg-pool's own query() goes through this.connect(), so this covers both
// pool.query(...) and explicit pool.connect() transactions. The value is
// captured synchronously at checkout, before any await can switch contexts.
export function installDbContextHook(pool) {
  if (!pool || pool.walterContextHookInstalled) return;
  const originalConnect = pool.connect.bind(pool);

  const applyContext = async (client, value) => {
    if (client.walterContextValue === value) return;
    await client.query("SELECT set_config('walter.ctx', $1, false)", [value]);
    client.walterContextValue = value;
  };

  pool.connect = function connectWithContext(callback) {
    const value = currentDbContextValue();

    if (typeof callback === 'function') {
      originalConnect((err, client, release) => {
        if (err) {
          callback(err, client, release);
          return;
        }
        applyContext(client, value).then(
          () => callback(undefined, client, release),
          (applyError) => {
            release(applyError);
            callback(applyError);
          }
        );
      });
      return undefined;
    }

    return originalConnect().then(async (client) => {
      try {
        await applyContext(client, value);
        return client;
      } catch (applyError) {
        client.release(applyError);
        throw applyError;
      }
    });
  };

  pool.walterContextHookInstalled = true;
}

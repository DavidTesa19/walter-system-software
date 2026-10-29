// Stops password guessing at the login form. After MAX_FAILURES wrong
// passwords for one username within WINDOW_MS, that username is refused for
// LOCK_MS, even with the right password, and every failure is answered a
// little late.
//
// Counted by username, not by address: on Railway every request arrives from
// the proxy, so an address limit would lock everyone out together. Unknown
// usernames are counted the same way, so the answer does not reveal which
// accounts exist. Kept in memory: a restart clears it.

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const FAILURE_DELAY_MS = 600;
const MAX_TRACKED = 10000;

export function createLoginGuard({ now = () => Date.now(), failureDelayMs = FAILURE_DELAY_MS } = {}) {
  // username -> { failures: timestamps within the window, lockedUntil }
  const entries = new Map();
  const keyOf = (username) => String(username ?? '').trim().toLowerCase().slice(0, 200);

  return {
    /** Milliseconds until this username may try again, or 0. */
    lockedFor(username) {
      const entry = entries.get(keyOf(username));
      const left = entry ? entry.lockedUntil - now() : 0;
      return left > 0 ? left : 0;
    },

    async recordFailure(username) {
      const key = keyOf(username);
      const at = now();
      const entry = entries.get(key) ?? { failures: [], lockedUntil: 0 };
      entry.failures = entry.failures.filter((time) => at - time < WINDOW_MS);
      entry.failures.push(at);
      if (entry.failures.length >= MAX_FAILURES) {
        entry.lockedUntil = at + LOCK_MS;
        entry.failures = [];
      }
      // Re-inserted so the oldest entry is the first to go when the map is full.
      entries.delete(key);
      entries.set(key, entry);
      if (entries.size > MAX_TRACKED) entries.delete(entries.keys().next().value);
      if (failureDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, failureDelayMs));
    },

    recordSuccess(username) {
      entries.delete(keyOf(username));
    },
  };
}

export const lockedMessage = (ms) =>
  `Příliš mnoho neúspěšných pokusů o přihlášení. Zkuste to znovu za ${Math.max(1, Math.ceil(ms / 60000))} min.`;

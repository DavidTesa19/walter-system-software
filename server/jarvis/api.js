// The app's own HTTP API, called from inside the server on behalf of a user.
//
// Jarvis authenticates with a short-lived token carrying the user's own
// claims plus actorType: 'ai_agent'. Every route then applies the user's
// section and role checks, and every write is logged in the change log as the
// AI agent acting for that user, grouped under the run's changeset.

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;

export function createApiClient({ baseUrl, token, changesetId, note }) {
  // GETs are cached for the length of one agent run: a question that searches
  // twice should not load every table twice.
  const cache = new Map();

  async function request(method, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(changesetId ? { 'X-Walter-Changeset': changesetId } : {}),
        ...(note ? { 'X-Walter-Change-Note': encodeURIComponent(note).slice(0, 500) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      throw new ApiError(response.status, (data && typeof data === 'object' && data.error) || `HTTP ${response.status}`);
    }
    return data;
  }

  return {
    get(path) {
      if (!cache.has(path)) {
        cache.set(path, request('GET', path).catch((error) => {
          cache.delete(path);
          throw error;
        }));
      }
      return cache.get(path);
    },
    request,
  };
}

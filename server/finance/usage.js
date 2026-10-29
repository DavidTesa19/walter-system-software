// The AI usage log: every call to Anthropic, OpenAI or Brave that the app
// makes is counted here with its tokens and an estimated price, so the finance
// screen can show what each feature costs before (or without) the providers'
// own bills.
//
// recordAiUsage never throws and never delays the caller: logging is
// fire-and-forget, and a failed insert only prints a warning.

import { estimateCostUsd } from './pricing.js';

let sink = null;
let stateSink = null;
let turnSink = null;

/** Called once by registerFinanceRoutes with the store's recordUsage. */
export function setUsageSink(fn) {
  sink = fn;
}

/** Called once by registerFinanceRoutes with the store's recordTurn. */
export function setTurnSink(fn) {
  turnSink = fn;
}

/** Called once by registerFinanceRoutes with the store's setState. */
export function setStateSink(fn) {
  stateSink = fn;
}

// Brave sends the plan's quota with every search: "1, 2000" is one request a
// second and 2 000 a month; remaining and reset (seconds) follow the same
// order. The monthly figure is Brave's own count, so it is kept as is.
export function recordBraveQuota(headers) {
  if (!stateSink || !headers) return;
  const read = (name) => (typeof headers.get === 'function' ? headers.get(name) : headers[name]);
  const values = (name) => String(read(name) ?? '').split(',').map((part) => Number(part.trim()));
  const limit = values('x-ratelimit-limit');
  const remaining = values('x-ratelimit-remaining');
  const reset = values('x-ratelimit-reset');
  const monthlyLimit = limit.at(-1);
  const monthlyRemaining = remaining.at(-1);
  if (limit.length < 2 || !Number.isFinite(monthlyLimit) || !Number.isFinite(monthlyRemaining)) return;
  const snapshot = {
    limit: monthlyLimit,
    remaining: monthlyRemaining,
    used: Math.max(monthlyLimit - monthlyRemaining, 0),
    resetsAt: Number.isFinite(reset.at(-1)) ? new Date(Date.now() + reset.at(-1) * 1000).toISOString() : null,
    at: new Date().toISOString(),
  };
  Promise.resolve()
    .then(() => stateSink('brave_quota', snapshot))
    .catch((error) => console.error('Brave quota not recorded:', error.message));
}

const count = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0);

/**
 * provider   'anthropic' | 'openai' | 'brave' | 'elevenlabs'
 * feature    'jarvis' | 'jarvis_ocr' | 'chat' | 'voice_stt' | 'voice_tts' | 'web_search'
 * input/output/cacheRead/cacheWrite  token counts (input excludes cached tokens)
 * units      characters (read-aloud), seconds (transcription without tokens)
 *            or requests (web search)
 */
export function recordAiUsage({ provider, model = null, feature, userId = null, input, output, cacheRead, cacheWrite, units }) {
  if (!sink) return;
  const entry = {
    provider,
    model,
    feature,
    userId: Number.isInteger(userId) ? userId : null,
    input: count(input),
    output: count(output),
    cacheRead: count(cacheRead),
    cacheWrite: count(cacheWrite),
    units: Number(units) > 0 ? Number(units) : 0,
  };
  entry.costUsd = estimateCostUsd(entry);
  Promise.resolve()
    .then(() => sink(entry))
    .catch((error) => console.error('AI usage not recorded:', error.message));
}

// One Jarvis question: who asked, how long the answer took, which tools it
// used, how it ended and what it cost. The admins' usage view reads these;
// the per-call log above stays the source of the cost totals.
export function recordJarvisTurn(turn) {
  if (!turnSink) return;
  Promise.resolve()
    .then(() => turnSink(turn))
    .catch((error) => console.error('Jarvis turn not recorded:', error.message));
}

// OpenAI chat usage counts cached tokens inside prompt_tokens; the log keeps
// them apart so each is priced at its own rate.
export function openAiUsageTokens(usage) {
  const prompt = count(usage?.prompt_tokens ?? usage?.input_tokens);
  const cached = count(usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens);
  return {
    input: Math.max(prompt - cached, 0),
    cacheRead: cached,
    output: count(usage?.completion_tokens ?? usage?.output_tokens),
  };
}

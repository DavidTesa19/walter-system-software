// List prices for the AI calls the app makes, used to estimate what each call
// cost when it is logged (usage.js). Estimates only: the real bill comes from
// the providers' cost APIs (providers.js) once their admin keys are set.
//
// USD per million tokens, from the providers' public price lists (checked
// 2026-10-24). A dated model id ("gpt-5-2025-08-07") matches the longest key
// it starts with, so "gpt-4o-mini" is never priced as "gpt-4o".

const anthropic = (input, cacheWrite, cacheRead, output) => ({ input, cacheWrite, cacheRead, output });

export const ANTHROPIC_PRICES = {
  'claude-fable-5-1': anthropic(10, 12.5, 0.25, 50),
  'claude-fable-5': anthropic(10, 12.5, 1, 50),
  'claude-opus-5-5': anthropic(4, 5, 0.2, 20),
  'claude-opus-5': anthropic(5, 6.25, 0.5, 25),
  'claude-opus-4': anthropic(5, 6.25, 0.5, 25),
  'claude-sonnet-5-5': anthropic(2, 2.5, 0.1, 10),
  'claude-sonnet-5': anthropic(2, 2.5, 0.2, 10),
  'claude-sonnet-4': anthropic(3, 3.75, 0.3, 15),
  'claude-haiku-5-5': anthropic(0.1, 0.125, 0.01, 0.5),
  'claude-haiku-4-5': anthropic(1, 1.25, 0.1, 5),
  'claude-3-5-sonnet': anthropic(3, 3.75, 0.3, 15),
  'claude-3-haiku': anthropic(0.25, 0.3, 0.03, 1.25),
};

// cacheRead is OpenAI's "cached input"; it has no separate cache-write price.
export const OPENAI_PRICES = {
  'gpt-5-mini': { input: 0.25, cacheRead: 0.025, output: 2 },
  'gpt-5': { input: 1.25, cacheRead: 0.125, output: 10 },
  'gpt-4o-mini-tts': { input: 0.6, cacheRead: 0.6, output: 12 },
  'gpt-4o-mini': { input: 0.15, cacheRead: 0.075, output: 0.6 },
  'gpt-4o-transcribe': { input: 2.5, cacheRead: 2.5, output: 10 },
  'gpt-4o': { input: 2.5, cacheRead: 1.25, output: 10 },
};

// Read-aloud returns audio, not a token count. OpenAI estimates
// gpt-4o-mini-tts at about $0.015 a minute; Czech speech runs at roughly
// 900 characters a minute.
const TTS_USD_PER_MINUTE = 0.015;
const TTS_CHARS_PER_MINUTE = 900;
// Whisper-style transcription reports seconds instead of tokens.
const STT_USD_PER_MINUTE = 0.006;
// Brave Search: $5 per 1 000 requests (with $5 of free credit a month).
const BRAVE_USD_PER_SEARCH = 0.005;

const findPrice = (table, model) => {
  const id = String(model ?? '').toLowerCase();
  let best = null;
  for (const key of Object.keys(table)) {
    if (id.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? table[best] : null;
};

/**
 * Estimated cost in USD of one logged call, or null when the model is not in
 * the price list (the call is still counted; it just has no price).
 */
export function estimateCostUsd({ provider, model, feature, input = 0, output = 0, cacheRead = 0, cacheWrite = 0, units = 0 }) {
  if (provider === 'brave') return units * BRAVE_USD_PER_SEARCH;
  if (feature === 'voice_tts') return (units / TTS_CHARS_PER_MINUTE) * TTS_USD_PER_MINUTE;
  if (feature === 'voice_stt' && units > 0 && !input && !output) return (units / 60) * STT_USD_PER_MINUTE;

  const table = provider === 'anthropic' ? ANTHROPIC_PRICES : provider === 'openai' ? OPENAI_PRICES : null;
  const price = table ? findPrice(table, model) : null;
  if (!price) return null;
  const perToken = (rate) => (rate ?? 0) / 1_000_000;
  return (
    input * perToken(price.input) +
    output * perToken(price.output) +
    cacheRead * perToken(price.cacheRead) +
    cacheWrite * perToken(price.cacheWrite ?? price.input)
  );
}

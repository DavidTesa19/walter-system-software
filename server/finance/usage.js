// The AI usage log: every call to Anthropic, OpenAI or Brave that the app
// makes is counted here with its tokens and an estimated price, so the finance
// screen can show what each feature costs before (or without) the providers'
// own bills.
//
// recordAiUsage never throws and never delays the caller: logging is
// fire-and-forget, and a failed insert only prints a warning.

import { estimateCostUsd } from './pricing.js';

let sink = null;

/** Called once by registerFinanceRoutes with the store's recordUsage. */
export function setUsageSink(fn) {
  sink = fn;
}

const count = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0);

/**
 * provider   'anthropic' | 'openai' | 'brave'
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

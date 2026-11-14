// What one Jarvis question cost, part by part, and the details kept with it
// for Jarvis › Analýza: every API call of the turn (model, tokens, time, the
// tools it asked for), each tool's run time, the screen it was asked from and
// how deep in its conversation it was. Pure: routes.js hands in what the turn
// did, finance_ai_turns stores the result.

import { ANTHROPIC_USD_PER_WEB_SEARCH, anthropicCostParts, estimateCostUsd } from './pricing.js';

export const COST_PARTS = ['input', 'cacheWrite', 'cacheRead', 'output', 'webSearch', 'ocr'];

export const zeroParts = () => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0, webSearch: 0, ocr: 0 });

export const partsTotal = (parts) => COST_PARTS.reduce((sum, key) => sum + (parts?.[key] ?? 0), 0);

/**
 * rounds   the turn's API calls (agent.js roundRecord), each priced with the
 *          model that actually answered it (a fallback may differ)
 * usage    the turn's token totals, used when no call finished (an error)
 * ocr      scans read by read_document during the turn (recordAiUsage entries)
 */
export function turnCostParts({ model, usage = {}, rounds = [], ocr = [] }) {
  const parts = zeroParts();
  const calls = rounds.length ? rounds : [{ ...usage, model }];
  for (const call of calls) {
    const priced = anthropicCostParts({ ...call, model: call.model ?? model });
    if (priced) for (const key of Object.keys(priced)) parts[key] += priced[key];
  }
  const searches = rounds.length ? rounds.reduce((sum, call) => sum + (call.webSearches ?? 0), 0) : usage.webSearches ?? 0;
  parts.webSearch = searches * ANTHROPIC_USD_PER_WEB_SEARCH;
  parts.ocr = ocr.reduce((sum, entry) => sum + (estimateCostUsd(entry) ?? 0), 0);
  return parts;
}

const contextOf = (call) => (call.input ?? 0) + (call.cacheRead ?? 0) + (call.cacheWrite ?? 0);

export function turnDetails({ rounds = [], toolRuns = [], ocr = [], view = null, depth = 0, attachments = 0, routing = null, usage = {}, parts }) {
  return {
    v: 1,
    view: typeof view === 'string' && view.trim() ? view.trim().slice(0, 80) : null,
    depth,
    attachments,
    routing: routing ? { mode: routing.mode ?? null, key: routing.key ?? null, reason: routing.reason ?? null } : null,
    cacheWrite1h: usage.cacheWrite1h ?? 0,
    // The largest prompt of the turn: how much context the question carried.
    contextMax: rounds.reduce((max, call) => Math.max(max, contextOf(call)), 0),
    parts,
    rounds: rounds.map((call) => ({
      model: call.model ?? null,
      ms: call.ms ?? 0,
      input: call.input ?? 0,
      output: call.output ?? 0,
      cacheRead: call.cacheRead ?? 0,
      cacheWrite: call.cacheWrite ?? 0,
      cacheWrite1h: call.cacheWrite1h ?? 0,
      webSearches: call.webSearches ?? 0,
      webFetches: call.webFetches ?? 0,
      stop: call.stop ?? null,
      tools: call.tools ?? [],
      compaction: Boolean(call.compaction),
    })),
    toolRuns: toolRuns.map((run) => ({ name: run.name, ms: run.ms, ok: run.ok !== false, round: run.round ?? null })),
    ocr: ocr.length
      ? { calls: ocr.length, input: ocr.reduce((sum, entry) => sum + (entry.input ?? 0), 0), output: ocr.reduce((sum, entry) => sum + (entry.output ?? 0), 0) }
      : null,
  };
}

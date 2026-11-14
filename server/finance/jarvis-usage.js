// The admins' view of how Jarvis is used: questions and cost per person and
// feature, the slowest and most expensive answers, and the ones that failed.
// Plain sums over the turn log and the per-call log; both stores hand the
// same shapes, so this works the same on Postgres and the JSON dev store.

import { anthropicCostParts, anthropicPrice, ANTHROPIC_USD_PER_WEB_SEARCH } from './pricing.js';
import { COST_PARTS, partsTotal, zeroParts } from './jarvis-turns.js';

export const USAGE_DAYS = [7, 30, 90];
// Questions logged before 2026-11-14 have no model: Jarvis then answered with
// its default model.
const LEGACY_MODEL = 'claude-opus-5-5';
const LIST_SIZE = 10;
const FAILED_LIST_SIZE = 20;

// Statuses that are an answer the user got; everything else is a failure,
// apart from 'stopped' (the user cut it off), which is counted on its own.
const ANSWERED = new Set(['ok']);

const percentile = (sorted, share) => {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
};

const listItem = (turn) => ({
  at: turn.at,
  userId: turn.userId,
  conversationId: turn.conversationId,
  question: turn.question,
  voice: Boolean(turn.voice),
  status: turn.status,
  error: turn.error ?? null,
  durationMs: turn.durationMs,
  firstTextMs: turn.firstTextMs ?? null,
  tools: [...new Set(turn.tools ?? [])],
  failedTools: turn.failedTools ?? 0,
  costUsd: turn.costUsd ?? 0,
  model: turn.model ?? null,
});

// 👍/👎 per model, and the latest answers rated 👎. Only the newest rating of
// an answer counts: a user may change their mind, and 'none' takes it back.
function summarizeFeedback(feedback) {
  const latest = new Map();
  for (const row of feedback) {
    const key = `${row.conversationId}#${row.turn}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  const rated = [...latest.values()].filter((row) => row.rating === 'up' || row.rating === 'down');
  const models = new Map();
  for (const row of rated) {
    const entry = models.get(row.model ?? '') ?? { model: row.model ?? null, up: 0, down: 0 };
    entry[row.rating] += 1;
    models.set(row.model ?? '', entry);
  }
  return {
    up: rated.filter((row) => row.rating === 'up').length,
    down: rated.filter((row) => row.rating === 'down').length,
    byModel: [...models.values()].sort((a, b) => b.up + b.down - (a.up + a.down)),
    recentDown: rated
      .filter((row) => row.rating === 'down')
      .slice(0, FAILED_LIST_SIZE)
      .map(({ at, userId, question, answer, comment, model }) => ({ at, userId, question, answer, comment: comment ?? null, model: model ?? null })),
  };
}

// ---------------------------------------------------------------------------
// The per-question breakdown (Jarvis › Analýza).
// ---------------------------------------------------------------------------

const PRAGUE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function pragueDayHour(value) {
  const parts = Object.fromEntries(PRAGUE.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}

// Prague dates of the last `days` days, oldest first.
export function lastPragueDays(days, now = Date.now()) {
  const today = pragueDayHour(now).day;
  const [year, month, day] = today.split('-').map(Number);
  const base = Date.UTC(year, month - 1, day);
  return Array.from({ length: days }, (_, index) => new Date(base - (days - 1 - index) * 86400000).toISOString().slice(0, 10));
}

export const modelFamily = (model) => {
  const id = String(model ?? '').toLowerCase();
  if (id.includes('opus')) return 'opus';
  if (id.includes('sonnet')) return 'sonnet';
  if (id.includes('haiku')) return 'haiku';
  if (id.includes('fable')) return 'fable';
  return id ? 'other' : 'unknown';
};

// A question older than the breakdown has only its token totals: its parts are
// priced with the default model and scaled to the cost it was logged with.
function estimatedParts(turn) {
  const parts = zeroParts();
  parts.webSearch = (turn.webSearches ?? 0) * ANTHROPIC_USD_PER_WEB_SEARCH;
  const priced = anthropicCostParts({
    model: turn.model ?? LEGACY_MODEL,
    input: turn.input ?? 0,
    output: turn.output ?? 0,
    cacheRead: turn.cacheRead ?? 0,
    cacheWrite: turn.cacheWrite ?? 0,
  });
  if (!priced) return parts;
  const tokenCost = priced.input + priced.cacheWrite + priced.cacheRead + priced.output;
  const target = Number.isFinite(turn.costUsd) ? Math.max(turn.costUsd - parts.webSearch, 0) : tokenCost;
  const scale = tokenCost > 0 ? target / tokenCost : 0;
  for (const key of ['input', 'cacheWrite', 'cacheRead', 'output']) parts[key] = priced[key] * scale;
  return parts;
}

const countBy = (names) => {
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
};

// One question with everything the analysis needs, old or new.
export function enrichTurn(turn) {
  const details = turn.details ?? null;
  const parts = details?.parts ? { ...zeroParts(), ...details.parts } : estimatedParts(turn);
  // Each API call with its own price (tokens at its model's rates plus searches).
  const rounds = (details?.rounds ?? []).map((call) => {
    const priced = anthropicCostParts({ ...call, model: call.model ?? turn.model ?? LEGACY_MODEL });
    const tokenCost = priced ? priced.input + priced.cacheWrite + priced.cacheRead + priced.output : 0;
    return { ...call, costUsd: tokenCost + (call.webSearches ?? 0) * ANTHROPIC_USD_PER_WEB_SEARCH };
  });
  const toolRuns = details?.toolRuns ?? [];
  return {
    at: turn.at,
    userId: turn.userId ?? null,
    conversationId: turn.conversationId ?? null,
    question: turn.question ?? '',
    voice: Boolean(turn.voice),
    status: turn.status,
    error: turn.error ?? null,
    model: turn.model ?? null,
    family: modelFamily(turn.model),
    routing: details?.routing ?? null,
    durationMs: turn.durationMs ?? 0,
    firstTextMs: turn.firstTextMs ?? null,
    tools: countBy(turn.tools ?? []),
    failedTools: turn.failedTools ?? 0,
    tokens: {
      input: turn.input ?? 0,
      output: turn.output ?? 0,
      cacheRead: turn.cacheRead ?? 0,
      cacheWrite: turn.cacheWrite ?? 0,
      cacheWrite1h: details?.cacheWrite1h ?? 0,
    },
    webSearches: turn.webSearches ?? 0,
    costUsd: Number.isFinite(turn.costUsd) ? turn.costUsd : partsTotal(parts),
    parts,
    estimated: !details?.parts,
    view: details?.view ?? null,
    depth: Number.isInteger(details?.depth) ? details.depth : null,
    attachments: details?.attachments ?? 0,
    contextMax: details?.contextMax ?? (turn.input ?? 0) + (turn.cacheRead ?? 0) + (turn.cacheWrite ?? 0),
    rounds,
    toolRuns,
    ocr: details?.ocr ?? null,
  };
}

const isFailedStatus = (status) => !ANSWERED.has(status) && status !== 'stopped';
const average = (sum, count) => (count ? sum / count : 0);
const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

const DEPTH_BUCKETS = [
  { key: 'first', label: '1. otázka', from: 0, to: 0 },
  { key: 'early', label: '2.–3.', from: 1, to: 2 },
  { key: 'middle', label: '4.–7.', from: 3, to: 6 },
  { key: 'deep', label: '8. a další', from: 7, to: Infinity },
];

const MIN_SAMPLE = 3;

// Plain rules over the breakdown: what makes the money go, in numbers the
// screen turns into sentences.
export function costInsights(questions) {
  const insights = [];
  const total = questions.reduce((sum, item) => sum + item.costUsd, 0);
  if (total <= 0 || questions.length < MIN_SAMPLE) return insights;
  const parts = zeroParts();
  for (const item of questions) for (const key of COST_PARTS) parts[key] += item.parts[key] ?? 0;
  const share = (value) => value / total;

  if (share(parts.cacheWrite) >= 0.25) insights.push({ kind: 'cache_write', share: share(parts.cacheWrite), costUsd: parts.cacheWrite });
  if (share(parts.output) >= 0.35) insights.push({ kind: 'output', share: share(parts.output), costUsd: parts.output });

  const depthOf = (bucket) => questions.filter((item) => item.depth !== null && item.depth >= bucket.from && item.depth <= bucket.to);
  const first = depthOf(DEPTH_BUCKETS[0]);
  const deep = questions.filter((item) => item.depth !== null && item.depth >= 5);
  if (first.length >= MIN_SAMPLE && deep.length >= MIN_SAMPLE) {
    const firstAvg = average(first.reduce((sum, item) => sum + item.costUsd, 0), first.length);
    const deepAvg = average(deep.reduce((sum, item) => sum + item.costUsd, 0), deep.length);
    if (firstAvg > 0 && deepAvg / firstAvg >= 1.8) {
      insights.push({ kind: 'depth', ratio: deepAvg / firstAvg, firstAvgUsd: firstAvg, deepAvgUsd: deepAvg, deepCount: deep.length });
    }
  }

  // Opus answering without a single tool: a question Sonnet or Haiku would
  // have handled. The saving is the price difference of the same tokens.
  const opus = anthropicPrice('claude-opus-5-5');
  const sonnet = anthropicPrice('claude-sonnet-5-5');
  const simpleOpus = questions.filter(
    (item) => item.family === 'opus' && item.status === 'ok' && item.tools.length === 0 && item.attachments === 0
  );
  if (simpleOpus.length >= MIN_SAMPLE && opus && sonnet) {
    const costUsd = simpleOpus.reduce((sum, item) => sum + item.costUsd - item.parts.webSearch, 0);
    const savingsUsd = costUsd * (1 - sonnet.input / opus.input);
    const manual = simpleOpus.filter((item) => item.routing?.mode === 'manual').length;
    if (savingsUsd > 0) insights.push({ kind: 'opus_simple', count: simpleOpus.length, manual, costUsd, savingsUsd });
  }

  if (share(parts.webSearch) >= 0.15) {
    insights.push({
      kind: 'web_search',
      share: share(parts.webSearch),
      costUsd: parts.webSearch,
      searches: questions.reduce((sum, item) => sum + item.webSearches, 0),
    });
  }

  const averageCost = total / questions.length;
  const tools = new Map();
  for (const item of questions) {
    for (const { name } of item.tools) {
      const entry = tools.get(name) ?? { name, questions: 0, costUsd: 0 };
      entry.questions += 1;
      entry.costUsd += item.costUsd;
      tools.set(name, entry);
    }
  }
  const dearTool = [...tools.values()]
    .filter((entry) => entry.questions >= MIN_SAMPLE)
    .map((entry) => ({ ...entry, averageCostUsd: entry.costUsd / entry.questions }))
    .sort((a, b) => b.averageCostUsd - a.averageCostUsd)[0];
  if (dearTool && dearTool.averageCostUsd >= averageCost * 2) {
    insights.push({ kind: 'tool', name: dearTool.name, questions: dearTool.questions, averageCostUsd: dearTool.averageCostUsd, ratio: dearTool.averageCostUsd / averageCost });
  }

  const failed = questions.filter((item) => isFailedStatus(item.status));
  const failedCost = failed.reduce((sum, item) => sum + item.costUsd, 0);
  if (failed.length && share(failedCost) >= 0.05) insights.push({ kind: 'failures', count: failed.length, costUsd: failedCost, share: share(failedCost) });

  const dearest = [...questions].sort((a, b) => b.costUsd - a.costUsd)[0];
  if (dearest && questions.length >= 10 && share(dearest.costUsd) >= 0.1) {
    insights.push({ kind: 'single', costUsd: dearest.costUsd, share: share(dearest.costUsd), question: dearest.question, at: dearest.at });
  }
  return insights;
}

/** Where the money went: by part, model, day, hour, tool, screen and conversation depth. */
export function costBreakdown(turns, days, now = Date.now()) {
  const questions = turns.map(enrichTurn);
  const parts = zeroParts();
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const item of questions) {
    for (const key of COST_PARTS) parts[key] += item.parts[key] ?? 0;
    for (const key of Object.keys(tokens)) tokens[key] += item.tokens[key] ?? 0;
  }

  const group = (keyOf, init) => {
    const map = new Map();
    for (const item of questions) {
      const key = keyOf(item);
      if (key === undefined) continue;
      const entry = map.get(key) ?? { ...init(key), questions: 0, costUsd: 0, durations: [] };
      entry.questions += 1;
      entry.costUsd += item.costUsd;
      if (item.status !== 'stopped') entry.durations.push(item.durationMs);
      map.set(key, entry);
    }
    return [...map.values()].map(({ durations, ...entry }) => ({
      ...entry,
      averageCostUsd: average(entry.costUsd, entry.questions),
      medianMs: median(durations),
    }));
  };

  const byModel = group((item) => item.model ?? '', (key) => ({ model: key || null, family: modelFamily(key), parts: zeroParts() }));
  for (const entry of byModel) {
    for (const item of questions) {
      if ((item.model ?? '') !== (entry.model ?? '')) continue;
      for (const key of COST_PARTS) entry.parts[key] += item.parts[key] ?? 0;
    }
  }

  const dayIndex = new Map(lastPragueDays(days, now).map((day) => [day, { day, questions: 0, costUsd: 0 }]));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, questions: 0, costUsd: 0 }));
  for (const item of questions) {
    const { day, hour } = pragueDayHour(item.at);
    const entry = dayIndex.get(day);
    if (entry) {
      entry.questions += 1;
      entry.costUsd += item.costUsd;
    }
    hours[hour].questions += 1;
    hours[hour].costUsd += item.costUsd;
  }

  const tools = new Map();
  for (const item of questions) {
    for (const { name, count } of item.tools) {
      const entry = tools.get(name) ?? { name, uses: 0, questions: 0, costUsd: 0, runs: 0, totalMs: 0, failed: 0 };
      entry.uses += count;
      entry.questions += 1;
      entry.costUsd += item.costUsd;
      tools.set(name, entry);
    }
    for (const run of item.toolRuns) {
      const entry = tools.get(run.name);
      if (!entry) continue;
      entry.runs += 1;
      entry.totalMs += run.ms ?? 0;
      if (!run.ok) entry.failed += 1;
    }
  }

  const byDepth = DEPTH_BUCKETS.map((bucket) => {
    const items = questions.filter((item) => item.depth !== null && item.depth >= bucket.from && item.depth <= bucket.to);
    return {
      key: bucket.key,
      label: bucket.label,
      questions: items.length,
      costUsd: items.reduce((sum, item) => sum + item.costUsd, 0),
      averageCostUsd: average(items.reduce((sum, item) => sum + item.costUsd, 0), items.length),
      averageContext: Math.round(average(items.reduce((sum, item) => sum + item.contextMax, 0), items.length)),
    };
  });

  return {
    parts,
    tokens,
    estimatedQuestions: questions.filter((item) => item.estimated).length,
    byModel: byModel.sort((a, b) => b.costUsd - a.costUsd),
    byDay: [...dayIndex.values()],
    byHour: hours,
    byTool: [...tools.values()]
      .map((entry) => ({ ...entry, averageCostUsd: average(entry.costUsd, entry.questions), averageMs: entry.runs ? Math.round(entry.totalMs / entry.runs) : null }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byView: group((item) => item.view ?? undefined, (key) => ({ view: key })).sort((a, b) => b.costUsd - a.costUsd),
    byDepth,
    routing: {
      auto: questions.filter((item) => item.routing?.mode === 'auto').length,
      manual: questions.filter((item) => item.routing?.mode === 'manual').length,
      unknown: questions.filter((item) => !item.routing).length,
    },
    insights: costInsights(questions),
  };
}

const QUESTION_SORTS = {
  at: (item) => new Date(item.at).getTime(),
  cost: (item) => item.costUsd,
  duration: (item) => item.durationMs,
  tokens: (item) => item.tokens.input + item.tokens.output + item.tokens.cacheRead + item.tokens.cacheWrite,
  context: (item) => item.contextMax,
};
export const QUESTION_SORT_KEYS = Object.keys(QUESTION_SORTS);

const fold = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Every question of the period, filtered, sorted and one page of it.
 * status: 'ok' | 'failed' | 'stopped' | a raw status; model: a family key.
 */
export function listJarvisQuestions(turns, { sort = 'at', dir = 'desc', offset = 0, limit = 50, userId = null, model = null, status = null, q = '', tool = null } = {}) {
  const needle = fold(q).trim();
  const matches = turns.map(enrichTurn).filter((item) => {
    if (userId !== null && item.userId !== userId) return false;
    if (model && item.family !== model) return false;
    if (status === 'failed' ? !isFailedStatus(item.status) : status && item.status !== status) return false;
    if (tool && !item.tools.some((entry) => entry.name === tool)) return false;
    if (needle && !fold(`${item.question} ${item.error ?? ''} ${item.view ?? ''}`).includes(needle)) return false;
    return true;
  });
  const key = QUESTION_SORTS[sort] ?? QUESTION_SORTS.at;
  const sign = dir === 'asc' ? 1 : -1;
  matches.sort((a, b) => sign * (key(a) - key(b)));
  const start = Math.max(0, Math.floor(offset));
  const size = Math.min(Math.max(1, Math.floor(limit)), 200);
  return {
    total: matches.length,
    costUsd: matches.reduce((sum, item) => sum + item.costUsd, 0),
    items: matches.slice(start, start + size),
  };
}

export function summarizeJarvisUsage({ turns, usage, feedback = [] }, days) {
  const durations = turns.filter((turn) => turn.status !== 'stopped').map((turn) => turn.durationMs).sort((a, b) => a - b);
  const firstText = turns.map((turn) => turn.firstTextMs).filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b);
  const isFailure = (turn) => !ANSWERED.has(turn.status) && turn.status !== 'stopped';

  const users = new Map();
  const userRow = (userId) => {
    const key = userId ?? null;
    if (!users.has(key)) {
      users.set(key, { userId: key, questions: 0, voiceQuestions: 0, failed: 0, totalMs: 0, timedQuestions: 0, features: {}, costUsd: 0 });
    }
    return users.get(key);
  };
  for (const turn of turns) {
    const row = userRow(turn.userId);
    row.questions += 1;
    if (turn.voice) row.voiceQuestions += 1;
    if (isFailure(turn)) row.failed += 1;
    if (turn.status !== 'stopped') {
      row.totalMs += turn.durationMs;
      row.timedQuestions += 1;
    }
  }
  const features = new Map();
  for (const entry of usage) {
    const row = userRow(entry.userId);
    row.features[entry.feature] = (row.features[entry.feature] ?? 0) + entry.costUsd;
    row.costUsd += entry.costUsd;
    const feature = features.get(entry.feature) ?? { feature: entry.feature, calls: 0, costUsd: 0 };
    feature.calls += entry.calls;
    feature.costUsd += entry.costUsd;
    features.set(entry.feature, feature);
  }

  const tools = new Map();
  for (const turn of turns) {
    for (const name of turn.tools ?? []) {
      const tool = tools.get(name) ?? { name, uses: 0 };
      tool.uses += 1;
      tools.set(name, tool);
    }
  }

  const turnsCostUsd = turns.reduce((sum, turn) => sum + (turn.costUsd ?? 0), 0);
  const byCost = [...turns].sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
  const bySlowness = turns.filter((turn) => turn.status !== 'stopped').sort((a, b) => b.durationMs - a.durationMs);

  return {
    days,
    totals: {
      questions: turns.length,
      voiceQuestions: turns.filter((turn) => turn.voice).length,
      failed: turns.filter(isFailure).length,
      stopped: turns.filter((turn) => turn.status === 'stopped').length,
      jarvisCostUsd: turnsCostUsd,
      aiCostUsd: [...features.values()].reduce((sum, feature) => sum + feature.costUsd, 0),
      averageCostUsd: turns.length ? turnsCostUsd / turns.length : 0,
      medianMs: percentile(durations, 0.5),
      p90Ms: percentile(durations, 0.9),
      medianFirstTextMs: percentile(firstText, 0.5),
    },
    byUser: [...users.values()]
      .map(({ totalMs, timedQuestions, ...row }) => ({ ...row, averageMs: timedQuestions ? Math.round(totalMs / timedQuestions) : null }))
      .sort((a, b) => b.costUsd - a.costUsd || b.questions - a.questions),
    byFeature: [...features.values()].sort((a, b) => b.costUsd - a.costUsd),
    tools: [...tools.values()].sort((a, b) => b.uses - a.uses),
    expensive: byCost.slice(0, LIST_SIZE).filter((turn) => (turn.costUsd ?? 0) > 0).map(listItem),
    slowest: bySlowness.slice(0, LIST_SIZE).map(listItem),
    failures: turns.filter(isFailure).slice(0, FAILED_LIST_SIZE).map(listItem),
    feedback: summarizeFeedback(feedback),
    breakdown: costBreakdown(turns, days),
  };
}

// Jarvis › Analýza (and Finance › Jarvis): what each question cost and why.
// Shapes of server/finance/jarvis-usage.js (summarizeJarvisUsage,
// costBreakdown, listJarvisQuestions). Admin-only routes.

import { apiGet } from '../../utils/api';

export type TurnStatus = 'ok' | 'stopped' | 'empty' | 'truncated' | 'error' | 'refusal' | 'tool_limit';
export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'other' | 'unknown';
export type CostPart = 'input' | 'cacheWrite' | 'cacheRead' | 'output' | 'webSearch' | 'ocr';
export type CostParts = Record<CostPart, number>;

export interface Routing {
  mode: 'auto' | 'manual' | null;
  key: string | null;
  reason: string | null;
}

export interface Round {
  model: string | null;
  ms: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  webSearches: number;
  webFetches: number;
  stop: string | null;
  tools: string[];
  compaction: boolean;
  costUsd: number;
}

export interface Question {
  at: string;
  userId: number | null;
  conversationId: string | null;
  question: string;
  voice: boolean;
  status: TurnStatus;
  error: string | null;
  model: string | null;
  family: ModelFamily;
  routing: Routing | null;
  durationMs: number;
  firstTextMs: number | null;
  tools: Array<{ name: string; count: number }>;
  failedTools: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number };
  webSearches: number;
  costUsd: number;
  parts: CostParts;
  estimated: boolean;
  view: string | null;
  depth: number | null;
  attachments: number;
  contextMax: number;
  rounds: Round[];
  toolRuns: Array<{ name: string; ms: number; ok: boolean; round: number | null }>;
  ocr: { calls: number; input: number; output: number } | null;
}

export type Insight =
  | { kind: 'cache_write'; share: number; costUsd: number }
  | { kind: 'output'; share: number; costUsd: number }
  | { kind: 'depth'; ratio: number; firstAvgUsd: number; deepAvgUsd: number; deepCount: number }
  | { kind: 'opus_simple'; count: number; manual: number; costUsd: number; savingsUsd: number }
  | { kind: 'web_search'; share: number; costUsd: number; searches: number }
  | { kind: 'tool'; name: string; questions: number; averageCostUsd: number; ratio: number }
  | { kind: 'failures'; count: number; costUsd: number; share: number }
  | { kind: 'single'; costUsd: number; share: number; question: string; at: string };

interface Group {
  questions: number;
  costUsd: number;
  averageCostUsd: number;
  medianMs: number | null;
}

export interface Breakdown {
  parts: CostParts;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  estimatedQuestions: number;
  byModel: Array<Group & { model: string | null; family: ModelFamily; parts: CostParts }>;
  byDay: Array<{ day: string; questions: number; costUsd: number }>;
  byHour: Array<{ hour: number; questions: number; costUsd: number }>;
  byTool: Array<{
    name: string;
    uses: number;
    questions: number;
    costUsd: number;
    averageCostUsd: number;
    runs: number;
    averageMs: number | null;
    failed: number;
  }>;
  byView: Array<Group & { view: string }>;
  byDepth: Array<{ key: string; label: string; questions: number; costUsd: number; averageCostUsd: number; averageContext: number }>;
  routing: { auto: number; manual: number; unknown: number };
  insights: Insight[];
}

export interface UsageSummary {
  days: number;
  usdCzk: number;
  totals: {
    questions: number;
    voiceQuestions: number;
    failed: number;
    stopped: number;
    jarvisCostUsd: number;
    aiCostUsd: number;
    averageCostUsd: number;
    medianMs: number | null;
    p90Ms: number | null;
    medianFirstTextMs: number | null;
  };
  byUser: Array<{
    userId: number | null;
    questions: number;
    voiceQuestions: number;
    failed: number;
    averageMs: number | null;
    features: Record<string, number>;
    costUsd: number;
  }>;
  byFeature: Array<{ feature: string; calls: number; costUsd: number }>;
  feedback: {
    up: number;
    down: number;
    byModel: Array<{ model: string | null; up: number; down: number }>;
    recentDown: Array<{ at: string; userId: number | null; question: string; answer: string; comment: string | null; model: string | null }>;
  };
  breakdown: Breakdown;
}

export type QuestionSort = 'at' | 'cost' | 'duration' | 'tokens' | 'context';

export interface QuestionQuery {
  days: number;
  sort: QuestionSort;
  dir: 'asc' | 'desc';
  offset: number;
  limit: number;
  user: number | null;
  model: ModelFamily | '';
  status: '' | 'ok' | 'failed' | 'stopped';
  tool: string;
  q: string;
}

export interface QuestionPage {
  total: number;
  costUsd: number;
  items: Question[];
}

export const analyticsApi = {
  summary: (days: number) => apiGet<UsageSummary>(`/api/finance/jarvis?days=${days}`),
  questions: (query: QuestionQuery) => {
    const params = new URLSearchParams({
      days: String(query.days),
      sort: query.sort,
      dir: query.dir,
      offset: String(query.offset),
      limit: String(query.limit),
    });
    if (query.user !== null) params.set('user', String(query.user));
    if (query.model) params.set('model', query.model);
    if (query.status) params.set('status', query.status);
    if (query.tool) params.set('tool', query.tool);
    if (query.q.trim()) params.set('q', query.q.trim());
    return apiGet<QuestionPage>(`/api/finance/jarvis/questions?${params.toString()}`);
  },
};

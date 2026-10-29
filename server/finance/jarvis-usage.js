// The admins' view of how Jarvis is used: questions and cost per person and
// feature, the slowest and most expensive answers, and the ones that failed.
// Plain sums over the turn log and the per-call log; both stores hand the
// same shapes, so this works the same on Postgres and the JSON dev store.

export const USAGE_DAYS = [7, 30, 90];
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
  };
}

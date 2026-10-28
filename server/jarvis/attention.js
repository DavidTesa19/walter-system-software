// What needs the user's attention — the reminders Jarvis's launcher shows as a
// number and its panel lists. Plain rules over the user's own data, no AI, so
// it costs nothing to check on every page load:
// - their zakázky past their deadline, due today or in the next three days
// - their zakázky nobody has touched for 30 days
// - their personal to-dos due today or earlier
// "Their" means assigned to them; closed or cancelled zakázky never count.

import { commissionName, recordRef, subjectName, truncate } from './catalog.js';
import { DAY_MS, formatPrague, pragueMidnight, pragueParts } from './time.js';

const FINISHED_STATES = new Set(['Uzavřeno', 'Zrušeno']);
const PAUSED_STATES = new Set(['Uzavřeno', 'Zrušeno', 'Odloženo']);
const STALE_DAYS = 30;
const SOON_DAYS = 3;
const CACHE_MS = 5 * 60 * 1000;

// Deadlines are ISO timestamps, "YYYY-MM-DD" or hand-typed "1.12.2026".
function deadlineDay(value) {
  if (!value) return null;
  const text = String(value).trim();
  const czech = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(text);
  if (czech) return pragueMidnight({ year: Number(czech[3]), month: Number(czech[2]), day: Number(czech[1]) });
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00Z` : text);
  if (Number.isNaN(date.getTime())) return null;
  return pragueMidnight(pragueParts(date));
}

const openAction = (item, label) => ({
  type: 'open_record',
  section: item.section,
  role: item.role,
  kind: 'commission',
  id: item.row.id,
  entityId: item.row.entity_id,
  status: item.row.status ?? 'accepted',
  label: truncate(label, 120),
});

/**
 * The user's attention items. `loadRows` and `sections` come from the tools
 * module (the same data access Jarvis's tools use, as the user).
 */
export async function computeAttention({ api, user, sections, loadRows, roles }) {
  const userId = Number(user.id);
  const today = pragueMidnight(pragueParts(new Date())).getTime();
  const soonEnd = today + (SOON_DAYS + 1) * DAY_MS;
  const staleBefore = Date.now() - STALE_DAYS * DAY_MS;
  const items = [];

  const rows = await loadRows({ api }, { sections, roles, kinds: ['commission'], statuses: ['accepted', 'pending'] });
  for (const item of rows) {
    const assigned = (item.row.assigned_user_ids ?? []).map(Number).includes(userId);
    if (!assigned || FINISHED_STATES.has(item.row.state)) continue;
    // A zakázka without a name is called by its code; do not say it twice.
    const name = commissionName(item.row);
    const label = [item.row.commission_id, name === item.row.commission_id ? null : name, subjectName(item.row)].filter(Boolean).join(' · ');
    const due = deadlineDay(item.row.deadline)?.getTime();
    if (due !== undefined && due !== null && due < soonEnd) {
      const kind = due < today ? 'overdue' : due === today ? 'today' : 'soon';
      items.push({ kind, at: due, label, detail: `Termín ${formatPrague(new Date(due), { dateOnly: true })}`, ref: recordRef({ ...item, kind: 'commission', id: item.row.id }), action: openAction(item, label) });
      continue;
    }
    const touched = Date.parse(item.row.updated_at ?? item.row.created_at ?? '');
    if (!PAUSED_STATES.has(item.row.state) && Number.isFinite(touched) && touched < staleBefore) {
      const days = Math.floor((Date.now() - touched) / DAY_MS);
      items.push({ kind: 'stale', at: touched, label, detail: `Beze změny ${days} dní`, ref: recordRef({ ...item, kind: 'commission', id: item.row.id }), action: openAction(item, label) });
    }
  }

  // Personal to-dos due today or earlier (a "later" one comes back on its day).
  const tasks = await api.get('/api/tasks?list=personal').catch(() => null);
  for (const task of tasks?.tasks ?? []) {
    if (task.status === 'done' || !task.dueDate) continue;
    const due = deadlineDay(task.dueDate)?.getTime();
    if (due === null || due === undefined || due > today) continue;
    items.push({ kind: 'task', at: due, label: truncate(task.title, 120), detail: due < today ? `Úkol po termínu (${formatPrague(new Date(due), { dateOnly: true })})` : 'Úkol na dnes' });
  }

  const order = { overdue: 0, today: 1, task: 2, soon: 3, stale: 4 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || a.at - b.at);
  return {
    // The launcher's number: what is late or due today.
    urgent: items.filter((item) => item.kind === 'overdue' || item.kind === 'today' || item.kind === 'task').length,
    counts: Object.fromEntries(Object.keys(order).map((kind) => [kind, items.filter((item) => item.kind === kind).length])),
    items: items.slice(0, 25).map(({ at, ...item }) => {
      void at;
      return item;
    }),
  };
}

// One answer per user for a few minutes: every page load asks.
export function createAttentionCache() {
  const cache = new Map();
  return {
    async get(userId, compute, { fresh = false } = {}) {
      const hit = cache.get(userId);
      if (!fresh && hit && hit.at > Date.now() - CACHE_MS) return hit.value;
      const value = await compute();
      cache.set(userId, { at: Date.now(), value });
      return value;
    },
  };
}

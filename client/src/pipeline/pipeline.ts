// Analýza › Pipeline: the business, not the app's usage. Every zakázka the user
// can open (all their sections and roles, archive left out), counted once even
// when a deal links it to a client, a partner and a tipař, then summed by
// state, by month and by value. Pure: PipelineView loads, this computes.

import { commissionRef, type RecordRef, type SectionData } from '../dataQuality/dataQuality';

type Row = Record<string, unknown>;

// The workflow, in the order a zakázka moves through it.
export const PIPELINE_STATES = ['Plánováno', 'Aktuální', 'Probíhá', 'Před podepsáním', 'Podepsáno', 'Uzavřeno'] as const;
export const SIDE_STATES = ['Odloženo', 'Zrušeno'] as const;
const OPEN = new Set(['Plánováno', 'Aktuální', 'Probíhá', 'Před podepsáním']);
const WON = new Set(['Podepsáno', 'Uzavřeno']);
const LOST = new Set(['Zrušeno']);

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim());

/**
 * A money amount typed by hand: "150 000 Kč", "1,5 mil", "50k", "2 500,50".
 * Null when there is no number in it. Ranges ("100–200 tis.") take the first.
 */
export function parseAmount(raw: unknown): number | null {
  const value = text(raw).toLowerCase().replace(/[\u00a0\u202f]/g, ' ');
  if (!value) return null;
  const match = value.match(/(\d[\d\s.]*(?:,\d+)?|\d+(?:\.\d+)?)/);
  if (!match) return null;
  let number = match[1].replace(/\s/g, '');
  // "1.500.000" (dots as thousands) vs "1.5" (a decimal point).
  if (/^\d{1,3}(\.\d{3})+$/.test(number)) number = number.replace(/\./g, '');
  number = number.replace(',', '.');
  let amount = Number.parseFloat(number);
  if (!Number.isFinite(amount)) return null;
  const rest = value.slice((match.index ?? 0) + match[1].length);
  // A unit only on its own: "k" in "50k", never the "k" of "Kč".
  if (/^\s*(mil|mio|m(?!\p{L}))/u.test(rest)) amount *= 1_000_000;
  else if (/^\s*(tis|k(?!\p{L})|t(?!\p{L}))/u.test(rest)) amount *= 1_000;
  return amount;
}

export interface PipelineItem {
  ref: RecordRef;
  state: string;
  value: number | null;
  createdAt: number | null;
  closedAt: number | null;
  deadline: number | null;
}

export interface StateRow {
  state: string;
  count: number;
  value: number;
}

export interface MonthRow {
  key: string; // 2026-11
  label: string; // "lis 26"
  created: number;
  won: number;
}

export interface PipelineSummary {
  items: PipelineItem[];
  byState: StateRow[];
  side: StateRow[];
  months: MonthRow[];
  open: { count: number; value: number; withoutValue: number; overdue: number };
  winRate: number | null; // last 12 months, won / (won + lost)
  wonValue12: number;
  biggestOpen: PipelineItem[];
}

const time = (raw: unknown): number | null => {
  const value = text(raw);
  if (!value) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed) ? null : parsed;
};

const MONTHS_CS = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

export function summarise(data: SectionData[], now = new Date()): PipelineSummary {
  // One zakázka once: a deal (deal_id) is the same business in every role.
  const seen = new Set<string>();
  const items: PipelineItem[] = [];
  for (const block of data) {
    for (const row of block.commissions as Row[]) {
      if (text(row.status) === 'archived') continue;
      const deal = text(row.deal_id);
      const key = deal ? `deal:${deal}` : `${block.section}:${block.role}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const state = text(row.state) || 'Plánováno';
      items.push({
        ref: commissionRef(block, row),
        state,
        value: parseAmount(row.commission_value) ?? parseAmount(row.budget),
        createdAt: time(row.created_at),
        closedAt: WON.has(state) || LOST.has(state) ? time(row.updated_at) : null,
        deadline: time(row.deadline),
      });
    }
  }

  const sumState = (state: string): StateRow => {
    const matching = items.filter((item) => item.state === state);
    return { state, count: matching.length, value: matching.reduce((sum, item) => sum + (item.value ?? 0), 0) };
  };

  // The last 12 months, oldest first.
  const months: MonthRow[] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - back, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTHS_CS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`,
      created: 0,
      won: 0,
    });
  }
  const monthOf = (at: number | null) => {
    if (at === null) return null;
    const date = new Date(at);
    return months.find((month) => month.key === `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`) ?? null;
  };
  for (const item of items) {
    const created = monthOf(item.createdAt);
    if (created) created.created += 1;
    if (WON.has(item.state)) {
      const won = monthOf(item.closedAt);
      if (won) won.won += 1;
    }
  }

  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime();
  const closedLastYear = items.filter((item) => item.closedAt !== null && item.closedAt >= yearAgo);
  const won = closedLastYear.filter((item) => WON.has(item.state));
  const lost = closedLastYear.filter((item) => LOST.has(item.state));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const openItems = items.filter((item) => OPEN.has(item.state));

  return {
    items,
    byState: PIPELINE_STATES.map(sumState),
    side: SIDE_STATES.map(sumState),
    months,
    open: {
      count: openItems.length,
      value: openItems.reduce((sum, item) => sum + (item.value ?? 0), 0),
      withoutValue: openItems.filter((item) => item.value === null).length,
      overdue: openItems.filter((item) => item.deadline !== null && item.deadline < today).length,
    },
    winRate: won.length + lost.length > 0 ? won.length / (won.length + lost.length) : null,
    wonValue12: won.reduce((sum, item) => sum + (item.value ?? 0), 0),
    biggestOpen: openItems
      .filter((item) => item.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, 8),
  };
}

const czk = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
/** "1,5 mil. Kč", "350 tis. Kč", "800 Kč". */
export function formatMoney(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
  if (value >= 10_000) return `${czk.format(Math.round(value / 1000))} tis. Kč`;
  return `${czk.format(value)} Kč`;
}

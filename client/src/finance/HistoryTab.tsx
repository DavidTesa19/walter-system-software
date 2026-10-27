import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { financeApi } from './financeApi';
import type { FinanceHistory, HistoryEntry, HistoryKind, PaymentInput } from './financeApi';
import { HistoryChart } from './HistoryChart';
import type { HistoryMonth, HistorySeries } from './HistoryChart';
import PaymentModal from './PaymentModal';
import { currentMonth, formatCzk, formatDate, formatMoney, monthLabel } from './financeMath';

type GroupBy = 'category' | 'service';

const KIND_INFO: Record<HistoryKind, { label: string; tone: string; title: string }> = {
  bill: { label: 'Faktura', tone: 'active', title: 'Vyúčtování načtené z napojené služby' },
  recurring: { label: 'Pevná cena', tone: 'planned', title: 'Měsíc doplněný z potvrzené pevné ceny služby' },
  manual: { label: 'Ručně', tone: 'paused', title: 'Platba přidaná ručně' },
};

const OTHER_KEY = '__other';
const SERVICE_SLOTS = 7;

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });

const payments = (count: number) => `${count} ${count === 1 ? 'platba' : count >= 2 && count <= 4 ? 'platby' : 'plateb'}`;

const wholeCzk = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });

/** Change against the previous month: an arrow carries the direction, the amount is whole crowns. */
const formatChange = (change: number) => (Math.round(change) === 0 ? 'beze změny' : `${change > 0 ? '▲' : '▼'} ${wholeCzk.format(Math.abs(change))}`);

export default function HistoryTab() {
  const [history, setHistory] = useState<FinanceHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<HistoryKind | ''>('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([currentMonth()]));
  const [editing, setEditing] = useState<HistoryEntry | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHistory(await financeApi.history());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Historii výdajů se nepodařilo načíst.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const model = useMemo(() => (history ? buildModel(history, groupBy, categoryFilter, kindFilter) : null), [history, groupBy, categoryFilter, kindFilter]);

  const toggleMonth = (month: string, open?: boolean) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (open ?? !next.has(month)) next.add(month);
      else next.delete(month);
      return next;
    });

  const selectMonth = (month: string) => {
    toggleMonth(month, true);
    window.setTimeout(() => document.getElementById(`finance-month-${month}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  };

  const savePayment = async (input: PaymentInput) => {
    if (editing && editing !== 'new' && editing.paymentId) await financeApi.updatePayment(editing.paymentId, input);
    else await financeApi.createPayment(input);
    setEditing(null);
    await load();
  };

  const removePayment = async (entry: HistoryEntry) => {
    if (confirmDelete !== entry.id) return setConfirmDelete(entry.id);
    setConfirmDelete(null);
    try {
      await financeApi.deletePayment(entry.paymentId!);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Platbu se nepodařilo smazat.');
    }
  };

  if (!history || !model) {
    return error ? <div className="finance-callout finance-callout--error">{error}</div> : <div className="finance-empty">Načítám historii výdajů…</div>;
  }

  return (
    <div className="finance-panel">
      {error && <div className="finance-callout finance-callout--error">{error}</div>}

      <div className="finance-toolbar">
        <div className="finance-filters">
          <div className="finance-segmented" role="group" aria-label="Rozdělit graf podle">
            {(['category', 'service'] as GroupBy[]).map((value) => (
              <button
                key={value}
                type="button"
                className={groupBy === value ? 'is-active' : undefined}
                aria-pressed={groupBy === value}
                onClick={() => setGroupBy(value)}
              >
                {value === 'category' ? 'Podle kategorií' : 'Podle služeb'}
              </button>
            ))}
          </div>
          <label className="finance-field finance-field--inline">
            Kategorie
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">Všechny</option>
              {Object.entries(history.categories).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <label className="finance-field finance-field--inline">
            Zdroj
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as HistoryKind | '')}>
              <option value="">Vše</option>
              <option value="bill">Faktury napojených služeb</option>
              <option value="recurring">Pevné ceny</option>
              <option value="manual">Ručně přidané</option>
            </select>
          </label>
        </div>
        <button type="button" className="finance-button finance-button--primary finance-button--small" onClick={() => setEditing('new')}>
          Přidat platbu
        </button>
      </div>

      <div className="finance-metrics finance-metrics--compact">
        <div className="finance-metric">
          <span className="finance-metric-label">Celkem od {monthLabel(history.start, 'long')}</span>
          <span className="finance-metric-value">{formatCzk(model.total)}</span>
          <span className="finance-metric-note">{payments(model.entryCount)} za {history.months.length} měs.</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Průměr za měsíc</span>
          <span className="finance-metric-value">{formatCzk(model.average)}</span>
          <span className="finance-metric-note">z {model.completeMonths} uzavřených měsíců</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">Nejdražší měsíc</span>
          <span className="finance-metric-value">{model.peak ? formatCzk(model.peak.total) : '—'}</span>
          <span className="finance-metric-note">{model.peak ? monthLabel(model.peak.month, 'long') : 'zatím žádný'}</span>
        </div>
        <div className="finance-metric">
          <span className="finance-metric-label">{monthLabel(currentMonth(), 'long')} dosud</span>
          <span className="finance-metric-value">{formatCzk(model.thisMonth)}</span>
          <span className="finance-metric-note">
            {model.lastMonth !== null ? `minulý měsíc ${formatCzk(model.lastMonth)}` : 'první měsíc historie'}
          </span>
        </div>
      </div>

      <section>
        <h2 className="finance-section-title">Výdaje po měsících</h2>
        <HistoryChart months={model.chartMonths} series={model.series} selected={null} onSelect={selectMonth} />
        <p className="finance-muted">
          Faktury napojených služeb se doplňují samy od {monthLabel(history.start, 'long')}, potvrzené pevné ceny (záložka Náklady) po
          měsících od data začátku. Ručně přidejte, co jinde není. Cizí měny jsou přepočtené kurzem ČNB ke dni platby. Kliknutím na sloupec
          otevřete rozpis měsíce.
        </p>
      </section>

      <section>
        <h2 className="finance-section-title">Rozpis po měsících a kategoriích</h2>
        {model.entryCount === 0 ? (
          <div className="finance-empty">
            Zatím tu nic není. Historie se plní z napojených služeb (záložka Napojení) a z potvrzených pevných cen (u nákladu v záložce
            Náklady vyplňte datum začátku a odškrtněte „Částka je jen odhad“). Ostatní platby přidejte tlačítkem „Přidat platbu“.
          </div>
        ) : (
          <div className="finance-table-wrap">
            <table className="finance-table finance-history-table">
              <thead>
                <tr>
                  <th>Měsíc</th>
                  {model.columns.map((key) => (
                    <th key={key} className="finance-num">{history.categories[key] ?? key}</th>
                  ))}
                  <th className="finance-num">Celkem</th>
                  <th className="finance-num">Proti min. měsíci</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map((row) => {
                  const open = expanded.has(row.month);
                  return (
                    <Fragment key={row.month}>
                      <tr
                        id={`finance-month-${row.month}`}
                        className={`finance-row${open ? ' finance-row--open' : ''}`}
                        onClick={() => toggleMonth(row.month)}
                        tabIndex={0}
                        aria-expanded={open}
                        onKeyDown={(event) => event.key === 'Enter' && toggleMonth(row.month)}
                      >
                        <td>
                          <span className={`finance-caret${open ? ' finance-caret--open' : ''}`} aria-hidden="true">›</span>
                          <strong>{monthLabel(row.month, 'long')}</strong>
                          <div className="finance-row-sub">{payments(row.entries.length)}</div>
                        </td>
                        {model.columns.map((key) => (
                          <td key={key} className="finance-num">{row.byCategory[key] ? formatCzk(row.byCategory[key]) : <span className="finance-muted">—</span>}</td>
                        ))}
                        <td className="finance-num"><strong>{formatCzk(row.total)}</strong></td>
                        <td className="finance-num">
                          {row.change === null ? <span className="finance-muted">—</span> : formatChange(row.change)}
                        </td>
                      </tr>
                      {open && (
                        <tr className="finance-detail-row">
                          <td colSpan={model.columns.length + 3}>
                            {row.entries.length === 0 ? (
                              <span className="finance-muted">V tomto měsíci žádné platby.</span>
                            ) : (
                              <MonthDetail
                                entries={row.entries}
                                categories={history.categories}
                                confirmDelete={confirmDelete}
                                onEdit={setEditing}
                                onDelete={(entry) => void removePayment(entry)}
                              />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th>Celkem</th>
                  {model.columns.map((key) => (
                    <th key={key} className="finance-num">{formatCzk(model.columnTotals[key] ?? 0)}</th>
                  ))}
                  <th className="finance-num">{formatCzk(model.total)}</th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <PaymentModal
          entry={editing === 'new' ? null : editing}
          start={history.start}
          categories={history.categories}
          services={history.services}
          onClose={() => setEditing(null)}
          onSave={savePayment}
        />
      )}
    </div>
  );
}

function MonthDetail({
  entries,
  categories,
  confirmDelete,
  onEdit,
  onDelete,
}: {
  entries: HistoryEntry[];
  categories: Record<string, string>;
  confirmDelete: string | null;
  onEdit: (entry: HistoryEntry) => void;
  onDelete: (entry: HistoryEntry) => void;
}) {
  const groups = Object.keys(categories)
    .map((key) => ({ key, entries: entries.filter((entry) => entry.category === key).sort((a, b) => b.czk - a.czk) }))
    .filter((group) => group.entries.length > 0);
  return (
    <div className="finance-month-detail">
      {groups.map((group) => (
        <div key={group.key} className="finance-month-group">
          <div className="finance-month-group-head">
            <span>{categories[group.key]}</span>
            <strong>{formatCzk(group.entries.reduce((sum, entry) => sum + entry.czk, 0))}</strong>
          </div>
          <ul className="finance-entry-list">
            {group.entries.map((entry) => {
              const info = KIND_INFO[entry.kind];
              return (
                <li key={entry.id} className="finance-entry">
                  <span className="finance-entry-date">{shortDate(entry.date)}</span>
                  <span className="finance-entry-main">
                    <strong>{entry.service}</strong>
                    {entry.description && entry.description !== entry.service && entry.kind !== 'bill' && (
                      <span className="finance-muted"> · {entry.description}</span>
                    )}
                    {entry.lines && (
                      <span className="finance-row-sub">
                        {entry.lines.slice(0, 4).map((line) => `${line.lineItem}: ${formatCzk(line.czk)}`).join(' · ')}
                        {entry.lines.length > 4 && ` · a ${entry.lines.length - 4} dalších`}
                      </span>
                    )}
                    {entry.note && <span className="finance-row-sub">{entry.note}</span>}
                  </span>
                  <span className={`finance-chip finance-chip--${info.tone}`} title={info.title}>{info.label}</span>
                  <span className="finance-entry-amount">
                    <strong>{formatCzk(entry.czk)}</strong>
                    {entry.currency !== 'CZK' && (
                      <span className="finance-row-sub">
                        {formatMoney(entry.amount, entry.currency)}
                        {entry.exactCzk
                          ? ' · strženo v Kč'
                          : entry.rate
                            ? ` · kurz ${entry.rate.value.toFixed(3).replace('.', ',')}${entry.rate.day ? ` (${formatDate(entry.rate.day)})` : ''}`
                            : ' · kurz ČNB ke dni faktury'}
                      </span>
                    )}
                  </span>
                  <span className="finance-entry-actions">
                    {entry.paymentId !== null && (
                      <>
                        <button type="button" className="finance-link-button" onClick={() => onEdit(entry)}>Upravit</button>
                        <button
                          type="button"
                          className={`finance-link-button${confirmDelete === entry.id ? ' finance-link-button--danger' : ''}`}
                          onClick={() => onDelete(entry)}
                        >
                          {confirmDelete === entry.id ? 'Opravdu?' : entry.kind === 'recurring' ? 'Odebrat měsíc' : 'Smazat'}
                        </button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------- derived numbers ----------

function buildModel(history: FinanceHistory, groupBy: GroupBy, categoryFilter: string, kindFilter: HistoryKind | '') {
  const entries = history.entries.filter(
    (entry) => (!categoryFilter || entry.category === categoryFilter) && (!kindFilter || entry.kind === kindFilter)
  );
  const categoryKeys = Object.keys(history.categories);

  // Fixed colour slots: categories in catalog order ("other" grey); services
  // by their all-time total, the smaller ones folded into "Ostatní".
  const categorySlot = (key: string) => (key === 'other' ? 0 : (categoryKeys.filter((item) => item !== 'other').indexOf(key) % 8) + 1);
  const serviceTotals = new Map<string, number>();
  for (const entry of history.entries) serviceTotals.set(entry.service, (serviceTotals.get(entry.service) ?? 0) + entry.czk);
  const rankedServices = [...serviceTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const topServices = new Map(rankedServices.slice(0, SERVICE_SLOTS).map((name, index) => [name, index + 1]));
  const seriesKey = (entry: HistoryEntry) =>
    groupBy === 'category' ? entry.category : topServices.has(entry.service) ? entry.service : OTHER_KEY;

  const months = history.months;
  const chartMonths: HistoryMonth[] = months.map((month) => ({ month, values: {} }));
  const monthIndex = new Map(months.map((month, index) => [month, index]));
  for (const entry of entries) {
    const index = monthIndex.get(entry.month);
    if (index === undefined) continue;
    const key = seriesKey(entry);
    chartMonths[index].values[key] = (chartMonths[index].values[key] ?? 0) + entry.czk;
  }
  const present = new Set(entries.map(seriesKey));
  const series: HistorySeries[] =
    groupBy === 'category'
      ? categoryKeys.filter((key) => present.has(key)).map((key) => ({ key, label: history.categories[key] ?? key, slot: categorySlot(key) }))
      : [
          ...rankedServices.filter((name) => topServices.has(name) && present.has(name)).map((name) => ({ key: name, label: name, slot: topServices.get(name)! })),
          ...(present.has(OTHER_KEY) ? [{ key: OTHER_KEY, label: 'Ostatní', slot: 0 }] : []),
        ];

  const columns = categoryKeys.filter((key) => entries.some((entry) => entry.category === key));
  const totalsByMonth = months.map((month) => entries.filter((entry) => entry.month === month).reduce((sum, entry) => sum + entry.czk, 0));
  const rows = months
    .map((month, index) => {
      const monthEntries = entries.filter((entry) => entry.month === month);
      const byCategory: Record<string, number> = {};
      for (const entry of monthEntries) byCategory[entry.category] = (byCategory[entry.category] ?? 0) + entry.czk;
      return {
        month,
        entries: monthEntries,
        byCategory,
        total: totalsByMonth[index],
        change: index > 0 ? totalsByMonth[index] - totalsByMonth[index - 1] : null,
      };
    })
    .reverse();
  const columnTotals: Record<string, number> = {};
  for (const entry of entries) columnTotals[entry.category] = (columnTotals[entry.category] ?? 0) + entry.czk;

  const current = currentMonth();
  const complete = months.map((month, index) => ({ month, total: totalsByMonth[index] })).filter((item) => item.month < current);
  const total = totalsByMonth.reduce((sum, value) => sum + value, 0);
  const peak = months
    .map((month, index) => ({ month, total: totalsByMonth[index] }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total)[0] ?? null;
  const currentIndex = months.indexOf(current);

  return {
    entries,
    entryCount: entries.length,
    series,
    chartMonths,
    columns,
    rows,
    columnTotals,
    total,
    completeMonths: complete.length,
    average: complete.length ? complete.reduce((sum, item) => sum + item.total, 0) / complete.length : 0,
    peak,
    thisMonth: currentIndex >= 0 ? totalsByMonth[currentIndex] : 0,
    lastMonth: currentIndex > 0 ? totalsByMonth[currentIndex - 1] : null,
  };
}

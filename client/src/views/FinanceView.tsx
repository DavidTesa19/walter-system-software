import { useCallback, useEffect, useMemo, useState } from 'react';
import { financeApi } from '../finance/financeApi';
import type { Expense, ExpenseInput, FinanceOverview } from '../finance/financeApi';
import ConnectionsTab from '../finance/ConnectionsTab';
import ExpenseModal from '../finance/ExpenseModal';
import HistoryTab from '../finance/HistoryTab';
import JarvisUsageTab from '../finance/JarvisUsageTab';
import { AiCostChart, CategoryBars } from '../finance/FinanceCharts';
import type { AiMonth } from '../finance/FinanceCharts';
import {
  BILLING_LABELS,
  CHART_PROVIDERS,
  COST_STATUS_INFO,
  FEATURE_LABELS,
  PROVIDER_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  costRows,
  currentMonth,
  daysUntil,
  domainCheckFor,
  formatCount,
  formatCzk,
  formatDate,
  formatMoney,
  formatUsd,
  isCounted,
  measuredByMonth,
  monthLabel,
  nextPayment,
  overviewMonths,
  toCzk,
} from '../finance/financeMath';
import type { MeasuredMonths } from '../finance/financeMath';
import './FinanceView.css';

type FinanceTab = 'overview' | 'history' | 'costs' | 'connections' | 'ai' | 'jarvis' | 'keys';

const TABS: Array<{ id: FinanceTab; label: string }> = [
  { id: 'overview', label: 'Přehled' },
  { id: 'history', label: 'Historie' },
  { id: 'costs', label: 'Náklady' },
  { id: 'connections', label: 'Napojení' },
  { id: 'ai', label: 'AI spotřeba' },
  { id: 'jarvis', label: 'Jarvis' },
  { id: 'keys', label: 'Klíče a služby' },
];

const TAB_STORAGE_KEY = 'walterFinanceTab';
const UPCOMING_DAYS = 60;
// A .cz domain keeps working for about 30 days after it expires and is
// cancelled after about 60.
const DOMAIN_GRACE_DAYS = 30;
const DOMAIN_DELETE_DAYS = 61;

const readStoredTab = (): FinanceTab => {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    return TABS.some((tab) => tab.id === stored) ? (stored as FinanceTab) : 'overview';
  } catch {
    return 'overview';
  }
};

const addDays = (iso: string, days: number) => {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
};

const pluralCosts = (count: number) => (count === 1 ? 'náklad je' : count < 5 ? 'náklady jsou' : 'nákladů je');

export default function FinanceView() {
  const [tab, setTab] = useState<FinanceTab>(readStoredTab);
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await financeApi.overview());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Finanční přehled se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectTab = (next: FinanceTab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // Remembering the tab is a convenience only.
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      setOverview(await financeApi.sync());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Náklady se nepodařilo načíst.');
    } finally {
      setSyncing(false);
    }
  };

  const importCatalog = async () => {
    setImporting(true);
    try {
      await financeApi.importCatalog();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Služby se nepodařilo přidat.');
    } finally {
      setImporting(false);
    }
  };

  const saveExpense = async (input: ExpenseInput) => {
    if (editing && editing !== 'new') await financeApi.updateExpense(editing.id, input);
    else await financeApi.createExpense(input);
    setEditing(null);
    await load();
  };

  const deleteExpense = async () => {
    if (!editing || editing === 'new') return;
    await financeApi.deleteExpense(editing.id);
    setEditing(null);
    await load();
  };

  const model = useMemo(() => (overview ? buildModel(overview) : null), [overview]);

  if (loading && !overview) {
    return (
      <div className="finance-view">
        <div className="finance-empty">Načítám finanční přehled a vyúčtování ze služeb…</div>
      </div>
    );
  }

  return (
    <div className="finance-view">
      <div className="finance-header">
        <div>
          <span className="finance-eyebrow">Analýza</span>
          <h1>Finance</h1>
          <p>
            Všechno, co aplikace stojí, na jednom místě. U každého nákladu je vidět, odkud částka je: napojená služba posílá
            vlastní vyúčtování, pevnou cenu potvrzuje faktura. Částky v USD a EUR se přepočítávají denním kurzem ČNB.
          </p>
        </div>
        <div className="finance-header-actions">
          <button type="button" className="finance-button finance-button--ghost" onClick={() => void sync()} disabled={syncing}>
            {syncing ? 'Načítám…' : 'Načíst znovu ze služeb'}
          </button>
          <button type="button" className="finance-button finance-button--primary" onClick={() => setEditing('new')}>
            Přidat náklad
          </button>
        </div>
      </div>

      {error && <div className="finance-callout finance-callout--error">{error}</div>}

      {overview && model && (
        <>
          {model.domainAlerts.map((alert) => (
            <div key={alert.domain} className={`finance-callout ${alert.days < 0 ? 'finance-callout--error' : 'finance-callout--warning'}`}>
              {alert.days < 0 ? (
                <>
                  <strong>
                    Doména {alert.domain} vypršela {formatDate(alert.expiresAt)}.
                  </strong>{' '}
                  Obnovte ji u registrátora {alert.registrar ?? ''} co nejdřív — přibližně od{' '}
                  {formatDate(addDays(alert.expiresAt, DOMAIN_GRACE_DAYS))} přestane fungovat aplikace, API i formulář a kolem{' '}
                  {formatDate(addDays(alert.expiresAt, DOMAIN_DELETE_DAYS))} ji registr zruší.
                </>
              ) : (
                <>
                  <strong>
                    Doména {alert.domain} vyprší {formatDate(alert.expiresAt)} (za {alert.days} d).
                  </strong>{' '}
                  Obnovte ji u registrátora {alert.registrar ?? ''}.
                </>
              )}
            </div>
          ))}
          {overview.catalogMissing.length > 0 && (
            <div className="finance-callout finance-callout--info">
              <strong>
                Aplikace používá {overview.catalogMissing.length}{' '}
                {overview.catalogMissing.length === 1 ? 'službu' : overview.catalogMissing.length < 5 ? 'služby' : 'služeb'}, které v
                přehledu zatím nejsou:
              </strong>{' '}
              {overview.catalogMissing.map((entry) => entry.name).join(', ')}.
              <p>Přidají se s popisem, klíči a odkazy; napojené služby si částky načtou samy, ostatní doplňte z faktur.</p>
              <button type="button" className="finance-button finance-button--primary finance-button--small" onClick={() => void importCatalog()} disabled={importing}>
                {importing ? 'Přidávám…' : 'Přidat do přehledu'}
              </button>
            </div>
          )}
          {model.unconfirmedCount > 0 && (
            <div className="finance-callout finance-callout--warning">
              {model.unconfirmedCount} {pluralCosts(model.unconfirmedCount)} nepotvrzených ({formatCzk(model.unconfirmedTotal)} měsíčně).
              Napojte je v záložce Napojení, nebo u nich doplňte cenu z faktury a odškrtněte „Částka je jen odhad“.
            </div>
          )}
          {overview.rates.source === 'fallback' && (
            <div className="finance-callout finance-callout--warning">
              Kurzy ČNB se nepodařilo načíst, přepočet používá pevné kurzy (1 USD = {overview.rates.rates.USD} Kč, 1 EUR = {overview.rates.rates.EUR} Kč).
            </div>
          )}

          <div className="finance-metrics">
            <div className="finance-metric">
              <span className="finance-metric-label">Měsíčně</span>
              <span className="finance-metric-value">{formatCzk(model.monthlyTotal)}</span>
              <span className="finance-metric-note">
                {!model.rows.length
                  ? 'zatím žádné náklady'
                  : model.unconfirmedTotal > 0
                    ? `potvrzeno ${formatCzk(model.monthlyTotal - model.unconfirmedTotal)} · nepotvrzeno ${formatCzk(model.unconfirmedTotal)}`
                    : 'vše potvrzené'}
              </span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Ročně</span>
              <span className="finance-metric-value">{formatCzk(model.monthlyTotal * 12)}</span>
              <span className="finance-metric-note">
                {model.oneTimeThisYear > 0 ? `+ jednorázově letos ${formatCzk(model.oneTimeThisYear)}` : 'při současných nákladech'}
              </span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Napojené služby</span>
              <span className="finance-metric-value">
                {model.connectedSources} z {model.knownSources}
              </span>
              <span className="finance-metric-note">{model.connectedNames || 'zatím žádná — záložka Napojení'}</span>
            </div>
            <div className={`finance-metric${model.upcoming[0] && daysUntil(model.upcoming[0].date) <= 14 ? ' finance-metric--warning' : ''}`}>
              <span className="finance-metric-label">Nejbližší platba</span>
              {model.upcoming[0] ? (
                <>
                  <span className="finance-metric-value">{formatDate(model.upcoming[0].date)}</span>
                  <span className="finance-metric-note">
                    {model.upcoming[0].expense.name} · {formatMoney(model.upcoming[0].expense.amount, model.upcoming[0].expense.currency)}
                    {daysUntil(model.upcoming[0].date) < 0 && ` · prošlo před ${-daysUntil(model.upcoming[0].date)} d`}
                  </span>
                </>
              ) : (
                <>
                  <span className="finance-metric-value">—</span>
                  <span className="finance-metric-note">Doplňte u nákladů datum další platby</span>
                </>
              )}
            </div>
          </div>

          <div className="finance-tabs" role="tablist" aria-label="Části">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`finance-tab${tab === item.id ? ' finance-tab--active' : ''}`}
                onClick={() => selectTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="finance-card" role="tabpanel">
            {tab === 'overview' && <OverviewTab overview={overview} model={model} onOpen={setEditing} />}
            {tab === 'history' && <HistoryTab />}
            {tab === 'costs' && (
              <CostsTab overview={overview} model={model} showInactive={showInactive} onToggleInactive={setShowInactive} onOpen={setEditing} />
            )}
            {tab === 'connections' && <ConnectionsTab overview={overview} measured={model.measured} />}
            {tab === 'ai' && <AiTab overview={overview} model={model} />}
            {tab === 'jarvis' && <JarvisUsageTab overview={overview} />}
            {tab === 'keys' && <KeysTab overview={overview} />}
          </div>

          <p className="finance-muted finance-footnote">
            Kurz ČNB {overview.rates.date ? `ze dne ${formatDate(overview.rates.date)}` : '(pevný)'}: 1 USD = {overview.rates.rates.USD?.toFixed(2)} Kč,
            1 EUR = {overview.rates.rates.EUR?.toFixed(2)} Kč. Hodnoty klíčů se nikde nezobrazují ani neukládají.
          </p>
        </>
      )}

      {editing && overview && (
        <ExpenseModal
          expense={editing === 'new' ? null : editing}
          categories={overview.categories}
          onClose={() => setEditing(null)}
          onSave={saveExpense}
          onDelete={editing === 'new' ? undefined : deleteExpense}
        />
      )}
    </div>
  );
}

// ---------- derived numbers ----------

type Model = ReturnType<typeof buildModel>;

function buildModel(overview: FinanceOverview) {
  const rates = overview.rates.rates;
  const measured: MeasuredMonths = measuredByMonth(overview);
  const rows = costRows(overview, measured);
  const counted = rows.filter((row) => isCounted(row.expense));
  const monthlyTotal = counted.reduce((sum, row) => sum + row.monthly.czk, 0);
  const unconfirmed = counted.filter((row) => row.monthly.status === 'unconfirmed' || row.monthly.status === 'error');
  const year = currentMonth().slice(0, 4);
  const oneTimeThisYear = overview.expenses
    .filter((expense) => expense.billingCycle === 'one_time' && expense.status !== 'cancelled' && expense.startedOn?.startsWith(year))
    .reduce((sum, expense) => sum + toCzk(expense.amount, expense.currency, rates), 0);

  const byCategory = new Map<string, number>();
  for (const row of counted) byCategory.set(row.expense.category, (byCategory.get(row.expense.category) ?? 0) + row.monthly.czk);
  const categoryBars = [...byCategory.entries()]
    .filter(([, czk]) => czk > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, czk]) => ({ key, label: overview.categories[key] ?? key, czk }));

  const chartMonths: AiMonth[] = overviewMonths(overview.since).map((month) => {
    const values: AiMonth['values'] = {};
    const entry = measured.get(month) ?? {};
    for (const provider of CHART_PROVIDERS) if (entry[provider]) values[provider] = entry[provider];
    return { month, values };
  });

  const sources = Object.values(overview.providers);
  const connected = sources.filter((provider) => provider.configured && provider.fetchedAt && !provider.error);
  const extraChecks = [
    overview.checks.brave.quota ? 'Brave' : null,
    overview.checks.brevo.plans ? 'Brevo' : null,
    overview.checks.domains.some((domain) => domain.expiresAt) ? 'doména' : null,
  ].filter(Boolean) as string[];

  // Payments due soon, and a domain that already expired (still recoverable).
  const upcoming = overview.expenses
    .filter((expense) => expense.status === 'active')
    .map((expense) => ({ expense, date: nextPayment(expense, overview) }))
    .filter((item): item is { expense: Expense; date: string } => Boolean(item.date) && daysUntil(item.date!) >= -DOMAIN_DELETE_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date));

  const domainAlerts = overview.checks.domains
    .filter((domain) => domain.expiresAt && daysUntil(domain.expiresAt) <= 30 && daysUntil(domain.expiresAt) >= -DOMAIN_DELETE_DAYS)
    .map((domain) => ({ domain: domain.domain, registrar: domain.registrar, expiresAt: domain.expiresAt!, days: daysUntil(domain.expiresAt!) }));

  return {
    measured,
    rows,
    monthlyTotal,
    unconfirmedTotal: unconfirmed.reduce((sum, row) => sum + row.monthly.czk, 0),
    unconfirmedCount: unconfirmed.length,
    oneTimeThisYear,
    categoryBars,
    chartMonths,
    connectedSources: connected.length + extraChecks.length,
    knownSources: sources.length + 3,
    connectedNames: [...connected.map((provider) => provider.label), ...extraChecks].join(', '),
    upcoming,
    domainAlerts,
  };
}

// ---------- tabs ----------

function OverviewTab({ overview, model, onOpen }: { overview: FinanceOverview; model: Model; onOpen: (expense: Expense) => void }) {
  const soon = model.upcoming.filter((item) => daysUntil(item.date) <= UPCOMING_DAYS);
  const aiConnected = overview.providers.anthropic.fetchedAt && overview.providers.openai.fetchedAt;
  return (
    <div className="finance-panel">
      <div className="finance-split">
        <section>
          <h2 className="finance-section-title">Měsíční náklady podle kategorie</h2>
          <CategoryBars bars={model.categoryBars} />
        </section>
        <section>
          <h2 className="finance-section-title">Blížící se platby</h2>
          {soon.length ? (
            <ul className="finance-list">
              {soon.map(({ expense, date }) => {
                const days = daysUntil(date);
                return (
                  <li key={expense.id}>
                    <button type="button" className="finance-list-button" onClick={() => onOpen(expense)}>
                      <span>
                        <strong>{expense.name}</strong>
                        <span className="finance-muted"> · {BILLING_LABELS[expense.billingCycle].toLowerCase()}</span>
                      </span>
                      <span className="finance-list-meta">
                        {formatMoney(expense.amount, expense.currency)}
                        <span className={days < 0 ? 'finance-error-text' : 'finance-muted'}>
                          {formatDate(date)} · {days < 0 ? `prošlo před ${-days} d` : days === 0 ? 'dnes' : `za ${days} d`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="finance-empty">Žádná platba v příštích {UPCOMING_DAYS} dnech.</div>
          )}
        </section>
      </div>
      <section>
        <h2 className="finance-section-title">AI náklady po měsících</h2>
        <AiCostChart months={model.chartMonths} />
        {!aiConnected && (
          <p className="finance-muted">
            Sloupce bez vyúčtování jsou jen odhad podle tokenů, které aplikace spotřebovala. Přesné částky se doplní po napojení
            Anthropic a OpenAI (záložka Napojení).
          </p>
        )}
      </section>
    </div>
  );
}

function CostsTab({
  overview,
  model,
  showInactive,
  onToggleInactive,
  onOpen,
}: {
  overview: FinanceOverview;
  model: Model;
  showInactive: boolean;
  onToggleInactive: (value: boolean) => void;
  onOpen: (expense: Expense) => void;
}) {
  const visible = model.rows.filter((row) => showInactive || (row.expense.status !== 'cancelled' && row.expense.status !== 'paused'));
  const categories = Object.keys(overview.categories).filter((key) => visible.some((row) => row.expense.category === key));
  const hidden = model.rows.length - visible.length;

  if (!model.rows.length) {
    return <div className="finance-empty">Zatím žádné náklady. Přidejte služby, které aplikace používá, nebo vlastní náklad.</div>;
  }

  return (
    <div className="finance-panel">
      <div className="finance-toolbar">
        <span className="finance-muted">Klikněte na řádek pro detail a úpravu.</span>
        <label className="finance-check">
          <input type="checkbox" checked={showInactive} onChange={(event) => onToggleInactive(event.target.checked)} />
          Zobrazit i pozastavené a zrušené{hidden > 0 && !showInactive ? ` (${hidden})` : ''}
        </label>
      </div>
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Služba</th>
              <th>Účtování</th>
              <th className="finance-num">Zadaná částka</th>
              <th className="finance-num">Měsíčně v Kč</th>
              <th>Zdroj částky</th>
              <th>Další platba</th>
              <th>Stav</th>
            </tr>
          </thead>
          {categories.map((category) => {
            const rows = visible.filter((row) => row.expense.category === category);
            const subtotal = rows.filter((row) => isCounted(row.expense)).reduce((sum, row) => sum + row.monthly.czk, 0);
            return (
              <tbody key={category}>
                <tr className="finance-group-row">
                  <th colSpan={3}>{overview.categories[category]}</th>
                  <th className="finance-num">{formatCzk(subtotal)}</th>
                  <th colSpan={3} />
                </tr>
                {rows.map(({ expense, monthly }) => {
                  const next = nextPayment(expense, overview);
                  const nextDays = next ? daysUntil(next) : null;
                  const status = COST_STATUS_INFO[monthly.status];
                  const domain = domainCheckFor(expense, overview);
                  return (
                    <tr key={expense.id} className="finance-row" onClick={() => onOpen(expense)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen(expense)}>
                      <td>
                        <div className="finance-row-name">{expense.name}</div>
                        {expense.usedFor && <div className="finance-row-sub">{expense.usedFor}</div>}
                      </td>
                      <td>{BILLING_LABELS[expense.billingCycle]}</td>
                      <td className="finance-num">
                        {monthly.fromBill ? <span className="finance-muted">podle faktur</span> : formatMoney(expense.amount, expense.currency)}
                      </td>
                      <td className="finance-num">
                        {isCounted(expense) ? formatCzk(monthly.czk) : '—'}
                        <div className="finance-row-sub">{isCounted(expense) ? monthly.basis : 'nepočítá se'}</div>
                      </td>
                      <td>
                        <span className={`finance-chip finance-chip--${status.tone}`}>{status.label}</span>
                      </td>
                      <td>
                        {next ? <span className={nextDays !== null && nextDays < 0 ? 'finance-error-text' : undefined}>{formatDate(next)}</span> : <span className="finance-muted">—</span>}
                        {domain?.expiresAt && <div className="finance-row-sub">podle registru domén</div>}
                      </td>
                      <td>
                        <span className={`finance-chip finance-chip--${expense.status}`}>{STATUS_LABELS[expense.status]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
          <tfoot>
            <tr>
              <th colSpan={3}>Celkem za měsíc (aktivní náklady)</th>
              <th className="finance-num">{formatCzk(model.monthlyTotal)}</th>
              <th colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function AiTab({ overview, model }: { overview: FinanceOverview; model: Model }) {
  const month = currentMonth();
  const rates = overview.rates.rates;
  const thisMonthRows = overview.usage.rows.filter((row) => row.month === month).sort((a, b) => b.costUsd - a.costUsd);
  const billedThisMonth = overview.providerCosts
    .filter((row) => row.month === month && (row.provider === 'anthropic' || row.provider === 'openai'))
    .sort((a, b) => toCzk(b.amount, b.currency, rates) - toCzk(a.amount, a.currency, rates));
  const monthsWithData = model.chartMonths.filter((item) => Object.keys(item.values).length > 0).reverse();
  const unconnected = (['anthropic', 'openai'] as const).filter((provider) => !overview.providers[provider].fetchedAt);

  return (
    <div className="finance-panel">
      {unconnected.length > 0 && (
        <div className="finance-callout finance-callout--warning">
          {unconnected.map((provider) => SOURCE_LABELS[provider]).join(' a ')} {unconnected.length > 1 ? 'nejsou napojené' : 'není napojený'}:
          jejich částky jsou jen odhad podle tokenů z provozu aplikace. Napojení nastavíte v záložce Napojení.
        </div>
      )}

      {billedThisMonth.length > 0 && (
        <section>
          <h2 className="finance-section-title">{monthLabel(month, 'long')} podle vyúčtování</h2>
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Poskytovatel</th>
                  <th>Položka</th>
                  <th className="finance-num">Částka</th>
                </tr>
              </thead>
              <tbody>
                {billedThisMonth.map((row) => (
                  <tr key={`${row.provider}-${row.lineItem}`}>
                    <td>{SOURCE_LABELS[row.provider]}</td>
                    <td>{row.lineItem}</td>
                    <td className="finance-num">
                      {formatMoney(row.amount, row.currency)}
                      <div className="finance-row-sub">{formatCzk(toCzk(row.amount, row.currency, rates))}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="finance-section-title">{monthLabel(month, 'long')} podle funkce (z provozu aplikace)</h2>
        {thisMonthRows.length ? (
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Funkce</th>
                  <th>Poskytovatel a model</th>
                  <th className="finance-num">Volání</th>
                  <th className="finance-num">Tokeny vstup / výstup</th>
                  <th className="finance-num">Z cache</th>
                  <th className="finance-num">Podle ceníku</th>
                </tr>
              </thead>
              <tbody>
                {thisMonthRows.map((row) => (
                  <tr key={`${row.provider}-${row.model}-${row.feature}`}>
                    <td>{FEATURE_LABELS[row.feature] ?? row.feature}</td>
                    <td>
                      {PROVIDER_LABELS[row.provider]}
                      {row.model && <div className="finance-row-sub">{row.model}</div>}
                    </td>
                    <td className="finance-num">{formatCount(row.calls)}</td>
                    <td className="finance-num">
                      {row.feature === 'voice_tts'
                        ? `${formatCount(row.units)} znaků`
                        : row.feature === 'web_search'
                          ? '—'
                          : `${formatCount(row.input + row.cacheWrite)} / ${formatCount(row.output)}`}
                    </td>
                    <td className="finance-num">{row.cacheRead ? formatCount(row.cacheRead) : '—'}</td>
                    <td className="finance-num">
                      {formatUsd(row.costUsd)}
                      <div className="finance-row-sub">{formatCzk(toCzk(row.costUsd, 'USD', rates))}</div>
                      {row.unpriced > 0 && <div className="finance-row-sub">{row.unpriced}× bez ceny v ceníku</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="finance-empty">Tento měsíc zatím žádné AI volání.</div>
        )}
        <p className="finance-muted">
          {overview.usage.firstLoggedAt
            ? `Provoz se zaznamenává od ${formatDate(overview.usage.firstLoggedAt)}.`
            : 'Provoz se začne zaznamenávat s prvním AI voláním po nasazení.'}{' '}
          Rozpis podle funkcí ukazuje, co kolik spotřebovalo; skutečná částka je ve vyúčtování výše.
        </p>
      </section>

      <section>
        <h2 className="finance-section-title">Po měsících</h2>
        {monthsWithData.length ? (
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Měsíc</th>
                  {CHART_PROVIDERS.map((provider) => (
                    <th key={provider} className="finance-num">{PROVIDER_LABELS[provider]}</th>
                  ))}
                  <th className="finance-num">Celkem</th>
                </tr>
              </thead>
              <tbody>
                {monthsWithData.map((item) => (
                  <tr key={item.month}>
                    <td>{monthLabel(item.month, 'long')}</td>
                    {CHART_PROVIDERS.map((provider) => {
                      const value = item.values[provider];
                      return (
                        <td key={provider} className="finance-num">
                          {value ? formatCzk(value.czk) : '—'}
                          {value && <div className="finance-row-sub">{value.billed ? 'vyúčtování' : 'odhad'}</div>}
                        </td>
                      );
                    })}
                    <td className="finance-num">
                      <strong>{formatCzk(CHART_PROVIDERS.reduce((sum, provider) => sum + (item.values[provider]?.czk ?? 0), 0))}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="finance-empty">Zatím žádná data.</div>
        )}
      </section>
    </div>
  );
}

function KeysTab({ overview }: { overview: FinanceOverview }) {
  const status = (key: FinanceOverview['keys'][number]) => {
    if (key.configured === null) return { label: 'V buildu aplikace', tone: 'planned', hint: 'Nastavuje se u služby aplikace (VITE_…); server ji nevidí.' };
    if (key.configured) return { label: 'Nastaveno', tone: 'active', hint: '' };
    if (key.optional) return { label: 'Nenastaveno (volitelné)', tone: 'paused', hint: '' };
    return { label: 'Chybí', tone: 'cancelled', hint: '' };
  };
  return (
    <div className="finance-panel">
      <p className="finance-muted">
        Proměnné prostředí, které služby potřebují, a jestli jsou nastavené na serveru, kde aplikace právě běží. Ukazují se jen
        názvy — hodnoty klíčů nikdy neopustí server.
      </p>
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Proměnná</th>
              <th>Služba</th>
              <th>Stav</th>
            </tr>
          </thead>
          <tbody>
            {overview.keys.map((key) => {
              const info = status(key);
              return (
                <tr key={key.name}>
                  <td><code>{key.name}</code></td>
                  <td>{key.services.join(', ')}</td>
                  <td>
                    <span className={`finance-chip finance-chip--${info.tone}`}>{info.label}</span>
                    {info.hint && <div className="finance-row-sub">{info.hint}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { financeApi } from '../finance/financeApi';
import type { CostSource, Expense, ExpenseInput, FinanceOverview, Provider } from '../finance/financeApi';
import ExpenseModal from '../finance/ExpenseModal';
import { AiCostChart, CategoryBars } from '../finance/FinanceCharts';
import type { AiMonth } from '../finance/FinanceCharts';
import {
  BILLING_LABELS,
  CHART_PROVIDERS,
  FEATURE_LABELS,
  PROVIDER_LABELS,
  STATUS_LABELS,
  aiCostByMonth,
  currentMonth,
  daysUntil,
  formatCount,
  formatCzk,
  formatDate,
  formatMoney,
  formatUsd,
  isCounted,
  monthLabel,
  monthlyFigure,
  nextPayment,
  overviewMonths,
  toCzk,
} from '../finance/financeMath';
import { formatRelative } from '../safety/format';
import './FinanceView.css';

type FinanceTab = 'overview' | 'costs' | 'ai' | 'keys';

const TABS: Array<{ id: FinanceTab; label: string }> = [
  { id: 'overview', label: 'Přehled' },
  { id: 'costs', label: 'Náklady' },
  { id: 'ai', label: 'AI spotřeba' },
  { id: 'keys', label: 'Klíče a služby' },
];

const TAB_STORAGE_KEY = 'walterFinanceTab';
const UPCOMING_DAYS = 60;

const readStoredTab = (): FinanceTab => {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    return TABS.some((tab) => tab.id === stored) ? (stored as FinanceTab) : 'overview';
  } catch {
    return 'overview';
  }
};

const ADMIN_KEY_HELP: Record<CostSource, { variable: string; steps: string }> = {
  anthropic: {
    variable: 'ANTHROPIC_ADMIN_KEY',
    steps:
      'Claude Console › Settings › Admin keys › Create admin key. Admin klíče mají jen organizace — u individuálního účtu ji nejdřív založte v Settings › Organization.',
  },
  openai: {
    variable: 'OPENAI_ADMIN_KEY',
    steps: 'platform.openai.com › Settings › Organization › Admin keys › Create new admin key (stačí právo číst Usage).',
  },
};

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
        <div className="finance-empty">Načítám finanční přehled…</div>
      </div>
    );
  }

  const anyProviderConfigured = overview ? Object.values(overview.providers).some((provider) => provider.configured) : false;

  return (
    <div className="finance-view">
      <div className="finance-header">
        <div>
          <span className="finance-eyebrow">Analýza</span>
          <h1>Finance</h1>
          <p>
            Všechno, co aplikace stojí, na jednom místě: hosting, doména, AI, e-maily, mapy, zálohy a další služby. Částky v USD
            a EUR se přepočítávají denním kurzem ČNB.
          </p>
        </div>
        <div className="finance-header-actions">
          <button
            type="button"
            className="finance-button finance-button--ghost"
            onClick={() => void sync()}
            disabled={syncing || !anyProviderConfigured}
            title={anyProviderConfigured ? 'Načte vyúčtování od Anthropicu a OpenAI' : 'Nejdřív nastavte admin klíče (záložka AI spotřeba)'}
          >
            {syncing ? 'Načítám…' : 'Načíst skutečné náklady'}
          </button>
          <button type="button" className="finance-button finance-button--primary" onClick={() => setEditing('new')}>
            Přidat náklad
          </button>
        </div>
      </div>

      {error && <div className="finance-callout finance-callout--error">{error}</div>}

      {overview && model && (
        <>
          {overview.catalogMissing.length > 0 && (
            <div className="finance-callout finance-callout--info">
              <strong>
                Aplikace používá {overview.catalogMissing.length} {overview.catalogMissing.length === 1 ? 'službu' : overview.catalogMissing.length < 5 ? 'služby' : 'služeb'}, které v přehledu zatím nejsou:
              </strong>{' '}
              {overview.catalogMissing.map((entry) => entry.name).join(', ')}.
              <p>Přidají se s popisem, klíči, odkazy a odhadem ceny podle aktuálních ceníků; odhady pak potvrďte nebo opravte.</p>
              <button type="button" className="finance-button finance-button--primary finance-button--small" onClick={() => void importCatalog()} disabled={importing}>
                {importing ? 'Přidávám…' : 'Přidat do přehledu'}
              </button>
            </div>
          )}
          {model.estimateCount > 0 && (
            <div className="finance-callout finance-callout--warning">
              {model.estimateCount} {model.estimateCount === 1 ? 'částka je' : model.estimateCount < 5 ? 'částky jsou' : 'částek je'} jen odhad podle ceníku.
              Otevřete je v záložce Náklady, opravte podle skutečné faktury a odškrtněte „Částka je jen odhad“.
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
                {model.monthlyEstimate > 0 ? `z toho odhad ${formatCzk(model.monthlyEstimate)}` : 'všechny částky potvrzené'}
              </span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Ročně</span>
              <span className="finance-metric-value">{formatCzk(model.monthlyTotal * 12)}</span>
              <span className="finance-metric-note">
                {model.oneTimeThisYear > 0 ? `+ jednorázově letos ${formatCzk(model.oneTimeThisYear)}` : 'při současné spotřebě'}
              </span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">AI tento měsíc</span>
              <span className="finance-metric-value">{formatCzk(model.aiThisMonth)}</span>
              <span className="finance-metric-note">{model.aiThisMonthBasis}</span>
            </div>
            <div className={`finance-metric${model.upcoming[0] && daysUntil(model.upcoming[0].date) <= 14 ? ' finance-metric--warning' : ''}`}>
              <span className="finance-metric-label">Nejbližší platba</span>
              {model.upcoming[0] ? (
                <>
                  <span className="finance-metric-value">{formatDate(model.upcoming[0].date)}</span>
                  <span className="finance-metric-note">
                    {model.upcoming[0].expense.name} · {formatMoney(model.upcoming[0].expense.amount, model.upcoming[0].expense.currency)}
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
            {tab === 'costs' && (
              <CostsTab
                overview={overview}
                model={model}
                showInactive={showInactive}
                onToggleInactive={setShowInactive}
                onOpen={setEditing}
              />
            )}
            {tab === 'ai' && <AiTab overview={overview} model={model} />}
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
  const aiMonths = aiCostByMonth(overview);
  const rows = overview.expenses.map((expense) => ({ expense, monthly: monthlyFigure(expense, overview, aiMonths) }));
  const counted = rows.filter((row) => isCounted(row.expense));
  const monthlyTotal = counted.reduce((sum, row) => sum + row.monthly.czk, 0);
  const monthlyEstimate = counted.filter((row) => row.monthly.estimate).reduce((sum, row) => sum + row.monthly.czk, 0);
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
    const entry = aiMonths.get(month) ?? {};
    for (const provider of CHART_PROVIDERS) {
      const value = entry[provider];
      if (value) values[provider] = { ...value, czk: toCzk(value.usd, 'USD', rates) };
    }
    return { month, values };
  });

  const thisMonth = aiMonths.get(currentMonth()) ?? {};
  const thisMonthProviders = Object.entries(thisMonth) as Array<[Provider, { usd: number; billed: boolean }]>;
  const aiThisMonth = thisMonthProviders.reduce((sum, [, value]) => sum + toCzk(value.usd, 'USD', rates), 0);
  const billedCount = thisMonthProviders.filter(([provider, value]) => provider !== 'brave' && value.billed).length;
  const aiThisMonthBasis = !thisMonthProviders.length
    ? 'zatím žádné AI volání'
    : billedCount === 0
      ? 'odhad z provozu aplikace'
      : billedCount === thisMonthProviders.filter(([provider]) => provider !== 'brave').length
        ? 'podle vyúčtování poskytovatelů'
        : 'vyúčtování + odhad z provozu';

  const upcoming = overview.expenses
    .filter((expense) => expense.status === 'active')
    .map((expense) => ({ expense, date: nextPayment(expense) }))
    .filter((item): item is { expense: Expense; date: string } => Boolean(item.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    rows,
    monthlyTotal,
    monthlyEstimate,
    oneTimeThisYear,
    categoryBars,
    chartMonths,
    aiThisMonth,
    aiThisMonthBasis,
    upcoming,
    estimateCount: overview.expenses.filter((expense) => expense.isEstimate && expense.status !== 'cancelled').length,
  };
}

// ---------- tabs ----------

function OverviewTab({ overview, model, onOpen }: { overview: FinanceOverview; model: Model; onOpen: (expense: Expense) => void }) {
  const soon = model.upcoming.filter((item) => daysUntil(item.date) <= UPCOMING_DAYS);
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
              {soon.map(({ expense, date }) => (
                <li key={expense.id}>
                  <button type="button" className="finance-list-button" onClick={() => onOpen(expense)}>
                    <span>
                      <strong>{expense.name}</strong>
                      <span className="finance-muted"> · {BILLING_LABELS[expense.billingCycle].toLowerCase()}</span>
                    </span>
                    <span className="finance-list-meta">
                      {formatMoney(expense.amount, expense.currency)}
                      <span className="finance-muted">
                        {formatDate(date)} · {daysUntil(date) === 0 ? 'dnes' : `za ${daysUntil(date)} d`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="finance-empty">
              Žádná platba v příštích {UPCOMING_DAYS} dnech. U ročních poplatků (doména) doplňte datum obnovy, ať tu včas naskočí.
            </div>
          )}
        </section>
      </div>
      <section>
        <h2 className="finance-section-title">AI náklady po měsících</h2>
        <AiCostChart months={model.chartMonths} />
        {!Object.values(overview.providers).some((provider) => provider.configured) && (
          <p className="finance-muted">
            Ukazuje odhad podle tokenů, které aplikace spotřebovala. Přesné částky z vyúčtování se doplní po nastavení admin klíčů
            (záložka AI spotřeba).
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
              <th className="finance-num">Částka</th>
              <th className="finance-num">Měsíčně v Kč</th>
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
                  <th colSpan={2} />
                </tr>
                {rows.map(({ expense, monthly }) => {
                  const next = nextPayment(expense);
                  return (
                    <tr key={expense.id} className="finance-row" onClick={() => onOpen(expense)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen(expense)}>
                      <td>
                        <div className="finance-row-name">{expense.name}</div>
                        {expense.usedFor && <div className="finance-row-sub">{expense.usedFor}</div>}
                      </td>
                      <td>{BILLING_LABELS[expense.billingCycle]}</td>
                      <td className="finance-num">
                        {formatMoney(expense.amount, expense.currency)}
                        {expense.isEstimate && <span className="finance-chip finance-chip--estimate">odhad</span>}
                      </td>
                      <td className="finance-num">
                        {isCounted(expense) ? formatCzk(monthly.czk) : '—'}
                        <div className="finance-row-sub">{isCounted(expense) ? monthly.basis : 'nepočítá se'}</div>
                      </td>
                      <td>{next ? formatDate(next) : <span className="finance-muted">—</span>}</td>
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
              <th colSpan={2} />
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
  const thisMonthRows = overview.usage.rows
    .filter((row) => row.month === month)
    .sort((a, b) => b.costUsd - a.costUsd);
  const billedThisMonth = overview.providerCosts
    .filter((row) => row.month === month)
    .sort((a, b) => b.amountUsd - a.amountUsd);
  const monthsWithData = model.chartMonths.filter((item) => Object.keys(item.values).length > 0).reverse();

  return (
    <div className="finance-panel">
      <div className="finance-provider-grid">
        {(Object.keys(overview.providers) as CostSource[]).map((provider) => {
          const status = overview.providers[provider];
          const help = ADMIN_KEY_HELP[provider];
          return (
            <div key={provider} className={`finance-provider${status.error ? ' finance-provider--error' : ''}`}>
              <div className="finance-provider-head">
                <strong>{status.label} – skutečné vyúčtování</strong>
                <span className={`finance-chip ${status.configured && !status.error ? 'finance-chip--active' : 'finance-chip--paused'}`}>
                  {status.configured ? (status.error ? 'Chyba' : 'Napojeno') : 'Nenapojeno'}
                </span>
              </div>
              {status.configured ? (
                <>
                  <span className="finance-muted">
                    {status.fetchedAt ? `Naposledy načteno ${formatRelative(status.fetchedAt)}.` : 'Zatím nenačteno.'} Obnovuje se samo
                    po otevření této stránky, nejvýš jednou za 3 hodiny.
                  </span>
                  {status.error && <span className="finance-error-text">{status.error}</span>}
                </>
              ) : (
                <span className="finance-muted">
                  Bez admin klíče se ukazuje jen odhad z provozu aplikace. {help.steps} Klíč uložte na Railway u služby API do proměnné{' '}
                  <code>{help.variable}</code> a službu restartujte.
                </span>
              )}
            </div>
          );
        })}
      </div>

      <section>
        <h2 className="finance-section-title">{monthLabel(month, 'long')} podle funkce (odhad z provozu)</h2>
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
                  <th className="finance-num">Odhad</th>
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
            ? `Provoz se zaznamenává od ${formatDate(overview.usage.firstLoggedAt.slice(0, 10))}.`
            : 'Provoz se začne zaznamenávat s prvním AI voláním po nasazení.'}{' '}
          Odhad počítá s veřejnými ceníky; Brave má navíc $5 kreditu měsíčně zdarma.
        </p>
      </section>

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
                    <td>{PROVIDER_LABELS[row.provider]}</td>
                    <td>{row.lineItem}</td>
                    <td className="finance-num">
                      {formatUsd(row.amountUsd)}
                      <div className="finance-row-sub">{formatCzk(toCzk(row.amountUsd, 'USD', rates))}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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

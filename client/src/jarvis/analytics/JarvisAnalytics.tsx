// What Jarvis costs, question by question: Jarvis › Analýza nákladů and
// Finance › Jarvis (admins). Where the money goes (the parts of a call, the
// models, tools, screens, conversation length), when (days, hours), why (plain
// findings with a suggestion) and every question with its own breakdown down
// to each API call. The figures are estimates from the token counts and the
// price list; the provider's bill is in Finance › AI spotřeba.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronDown, ChevronRight, Clock, Coins, Info, Lightbulb, MessagesSquare, RefreshCw, Search, TriangleAlert, Wrench, Zap,
} from 'lucide-react';
import { apiGet } from '../../utils/api';
import { formatCount, formatCzk } from '../../finance/financeMath';
import { modelLabel } from '../models';
import { analyticsApi } from './analyticsApi';
import type { CostPart, Insight, ModelFamily, Question, QuestionPage, QuestionQuery, QuestionSort, TurnStatus, UsageSummary } from './analyticsApi';
import './JarvisAnalytics.css';

const RANGES = [7, 30, 90];
const RANGE_KEY = 'walterJarvisAnalytics.days';
const PAGE_SIZE = 40;
const SMALL = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;

const PARTS: Array<{ key: CostPart; label: string; hint: string }> = [
  { key: 'cacheWrite', label: 'Zápis do cache', hint: 'Kontext uložený pro další otázky (1,25–2× cena vstupu).' },
  { key: 'cacheRead', label: 'Čtení z cache', hint: 'Kontext poslaný znovu (zlomek ceny vstupu).' },
  { key: 'input', label: 'Vstup', hint: 'Nový text: otázka, výsledky nástrojů, přílohy.' },
  { key: 'output', label: 'Výstup a přemýšlení', hint: 'Odpověď i přemýšlení (5× cena vstupu).' },
  { key: 'webSearch', label: 'Hledání na webu', hint: '0,01 $ za hledání; výsledky jsou ve vstupu.' },
  { key: 'ocr', label: 'Přepis skenů', hint: 'Naskenované dokumenty a fotky.' },
];

const STATUS: Record<TurnStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  ok: { label: 'Odpověděl', tone: 'ok' },
  stopped: { label: 'Zastaveno', tone: 'muted' },
  empty: { label: 'Bez odpovědi', tone: 'bad' },
  truncated: { label: 'Zkráceno', tone: 'warn' },
  error: { label: 'Chyba', tone: 'bad' },
  refusal: { label: 'Odmítnuto', tone: 'warn' },
  tool_limit: { label: 'Moc kroků', tone: 'bad' },
};

const FAMILY_LABEL: Record<ModelFamily, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  fable: 'Fable',
  other: 'Jiný',
  unknown: 'Neznámý',
};

// The tools in Czech; the code name stays in the tooltip.
const TOOL_LABELS: Record<string, string> = {
  search: 'Hledání v datech',
  list_records: 'Seznam záznamů',
  get_subject: 'Profil subjektu',
  get_commission: 'Detail zakázky',
  list_team: 'Tým',
  recent_changes: 'Poslední změny',
  calendar: 'Kalendář',
  read_document: 'Čtení dokumentu',
  company_registry: 'ARES',
  propose_update: 'Návrh změny',
  propose_task: 'Návrh úkolu',
  propose_assign: 'Návrh přiřazení',
  propose_obor: 'Návrh oboru',
  propose_note: 'Návrh poznámky',
  propose_create_subject: 'Nový subjekt',
  propose_create_commission: 'Nová zakázka',
  calendar_add_event: 'Přidání události',
  calendar_update_event: 'Úprava události',
  calendar_delete_event: 'Smazání události',
  tasks: 'Úkoly',
  reminders: 'Připomínky',
  draft_email: 'Koncept e-mailu',
  create_document: 'Tvorba dokumentu',
  export_records: 'Export do Excelu',
  open_record: 'Tlačítko Otevřít',
  web_search: 'Hledání na webu',
  web_fetch: 'Čtení stránky',
};
const toolLabel = (name: string) => TOOL_LABELS[name] ?? name;

const readRange = () => {
  try {
    const stored = Number(localStorage.getItem(RANGE_KEY));
    return RANGES.includes(stored) ? stored : 30;
  } catch {
    return 30;
  }
};

const seconds = (ms: number | null | undefined) =>
  ms === null || ms === undefined ? '—' : `${(ms / 1000).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const percent = (share: number) => `${Math.round(share * 100)} %`;
const tokens = (value: number) =>
  value >= 1000 ? `${(value / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: value >= 100000 ? 0 : 1 })} tis.` : formatCount(value);
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
const plural = (count: number, one: string, few: string, many: string) => (count === 1 ? one : count >= 2 && count <= 4 ? few : many);

// ---------------------------------------------------------------------------
// Charts: one series each, in the palette's primary colour.
// ---------------------------------------------------------------------------

function Bar({ share }: { share: number }) {
  return (
    <span className="jxa-bar" aria-hidden="true">
      <span style={{ width: `${Math.max(share > 0 ? 1.5 : 0, Math.min(100, share * 100))}%` }} />
    </span>
  );
}

interface Column {
  key: string;
  label: string;
  value: number;
  tip: ReactNode;
}

// Columns with a tooltip per column (hover or keyboard focus).
function Columns({ data, labelEvery = 1, format }: { data: Column[]; labelEvery?: number; format: (value: number) => string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((column) => column.value), 0);
  return (
    <div className="jxa-columns" onMouseLeave={() => setActive(null)}>
      <div className="jxa-columns-max">{max > 0 ? format(max) : ''}</div>
      <div className="jxa-columns-plot" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((column, index) => (
          <div
            key={column.key}
            className={`jxa-column${active === index ? ' is-active' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            aria-label={`${column.label}: ${format(column.value)}`}
          >
            <span className="jxa-column-fill" style={{ height: `${max > 0 ? (column.value / max) * 100 : 0}%` }} />
            {active === index && (
              <span className={`jxa-tip${index > data.length * 0.66 ? ' jxa-tip--left' : ''}`} role="tooltip">
                {column.tip}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="jxa-columns-axis" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((column, index) => (
          <span key={column.key}>{index % labelEvery === 0 ? column.label : ''}</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

function InsightCard({ insight, czk }: { insight: Insight; czk: (usd: number) => string }) {
  let title: string;
  let text: string;
  let tone: 'tip' | 'warn' | 'info' = 'tip';
  switch (insight.kind) {
    case 'cache_write':
      title = `Zápis do cache: ${percent(insight.share)} nákladů (${czk(insight.costUsd)})`;
      text =
        'Instrukce a nástroje (~23 tis. tokenů) drží Jarvis v mezipaměti hodinu, konverzaci 5 minut. Otázka po delší pauze je zapisuje znovu a zápis je dražší než běžný vstup. ' +
        'Šetří se navazováním v téže konverzaci a otázkami v dávkách, ne roztroušeně přes den.';
      tone = 'info';
      break;
    case 'output':
      title = `Výstup a přemýšlení: ${percent(insight.share)} nákladů (${czk(insight.costUsd)})`;
      text = 'Dlouhé odpovědi, tabulky a dokumenty. Výstupní token stojí 5× víc než vstupní; kratší odpovědi a Sonnet nebo Haiku na běžné dotazy ušetří nejvíc.';
      break;
    case 'depth':
      title = `Dlouhé konverzace stojí ${insight.ratio.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}× víc`;
      text =
        `Každá otázka posílá celou dosavadní konverzaci. Otázky od 6. dál stály průměrně ${czk(insight.deepAvgUsd)}, první otázka ${czk(insight.firstAvgUsd)} ` +
        `(${insight.deepCount} ${plural(insight.deepCount, 'otázka', 'otázky', 'otázek')}). Pro nové téma je levnější nová konverzace (Alt+N).`;
      tone = 'warn';
      break;
    case 'opus_simple':
      title = `Opus odpověděl na ${insight.count} ${plural(insight.count, 'otázku', 'otázky', 'otázek')} bez jediného nástroje`;
      text =
        `Stály ${czk(insight.costUsd)}; na takové dotazy stačí Sonnet (stejné tokeny za polovinu, úspora asi ${czk(insight.savingsUsd)}).` +
        (insight.manual ? ` ${insight.manual} z nich mělo Opus vybraný ručně – režim Auto by je poslal levněji.` : ' Zvažte, zda Auto neposílá na Opus i jednoduché otázky.');
      break;
    case 'web_search':
      title = `Hledání na webu: ${percent(insight.share)} nákladů`;
      text = `${insight.searches} ${plural(insight.searches, 'hledání', 'hledání', 'hledání')} za ${czk(insight.costUsd)} poplatků; texty výsledků (~20 tis. tokenů na hledání) se platí navíc jako vstup.`;
      tone = 'info';
      break;
    case 'tool':
      title = `Otázky s nástrojem „${toolLabel(insight.name)}“ stojí ${insight.ratio.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}× průměr`;
      text = `Průměrně ${czk(insight.averageCostUsd)} za otázku (${insight.questions} ${plural(insight.questions, 'otázka', 'otázky', 'otázek')}). Velké výsledky nástroje se čtou znovu v každém dalším kroku.`;
      tone = 'info';
      break;
    case 'failures':
      title = `Nepovedené odpovědi stály ${czk(insight.costUsd)} (${percent(insight.share)})`;
      text = `${insight.count} ${plural(insight.count, 'otázka', 'otázky', 'otázek')} skončilo chybou, prázdnou odpovědí nebo příliš mnoha kroky. Detail je v seznamu níže (filtr Stav › Nepovedené).`;
      tone = 'warn';
      break;
    case 'single':
      title = `Jediná otázka stála ${czk(insight.costUsd)} (${percent(insight.share)} období)`;
      text = `„${insight.question.slice(0, 140)}“ – ${dateTime(insight.at)}.`;
      tone = 'info';
      break;
  }
  const Icon = tone === 'warn' ? TriangleAlert : tone === 'info' ? Info : Lightbulb;
  return (
    <div className={`jxa-insight jxa-insight--${tone}`}>
      <Icon size={16} strokeWidth={2} aria-hidden />
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One question in detail
// ---------------------------------------------------------------------------

function QuestionDetail({ item, czk }: { item: Question; czk: (usd: number) => string }) {
  const total = item.costUsd || 1;
  const meta: Array<[string, ReactNode]> = [
    ['Model', item.model ? modelLabel(item.model) : '—'],
    [
      'Výběr modelu',
      item.routing ? `${item.routing.mode === 'manual' ? 'ručně' : 'automaticky'}${item.routing.reason ? ` – ${item.routing.reason}` : ''}` : '—',
    ],
    ['Obrazovka', item.view ?? '—'],
    ['Pořadí v konverzaci', item.depth === null ? '—' : `${item.depth + 1}. otázka`],
    ['Největší kontext', `${tokens(item.contextMax)} tokenů`],
    ['První slovo', seconds(item.firstTextMs)],
    ['Přílohy', item.attachments ? String(item.attachments) : '—'],
    ['Cache na hodinu', item.tokens.cacheWrite1h ? `${tokens(item.tokens.cacheWrite1h)} tokenů` : '—'],
  ];
  return (
    <div className="jxa-detail">
      {item.error && <div className="jxa-detail-error">{item.error}</div>}
      <div className="jxa-detail-grid">
        <div>
          <h4>Za co se platilo</h4>
          <div className="jxa-bars">
            {PARTS.filter((part) => item.parts[part.key] > 0).map((part) => (
              <div key={part.key} className="jxa-bars-row" title={part.hint}>
                <span className="jxa-bars-label">{part.label}</span>
                <Bar share={item.parts[part.key] / total} />
                <span className="jxa-bars-value">{czk(item.parts[part.key])}</span>
              </div>
            ))}
          </div>
          {item.estimated && <p className="jxa-note">Starší záznam: rozpis odhadnutý z celkových tokenů.</p>}
        </div>
        <div>
          <h4>Souvislosti</h4>
          <dl className="jxa-meta">
            {meta.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {item.rounds.length > 0 && (
        <>
          <h4>Kroky (volání modelu)</h4>
          <div className="jxa-table-wrap">
            <table className="jxa-table jxa-table--compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Model</th>
                  <th className="jxa-num">Doba</th>
                  <th className="jxa-num">Vstup</th>
                  <th className="jxa-num">Z cache</th>
                  <th className="jxa-num">Do cache</th>
                  <th className="jxa-num">Výstup</th>
                  <th>Nástroje / konec</th>
                  <th className="jxa-num">Cena</th>
                </tr>
              </thead>
              <tbody>
                {item.rounds.map((round, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{round.model ? modelLabel(round.model) : '—'}</td>
                    <td className="jxa-num">{seconds(round.ms)}</td>
                    <td className="jxa-num">{tokens(round.input)}</td>
                    <td className="jxa-num">{tokens(round.cacheRead)}</td>
                    <td className="jxa-num">{tokens(round.cacheWrite)}</td>
                    <td className="jxa-num">{tokens(round.output)}</td>
                    <td>
                      {round.tools.length ? round.tools.map(toolLabel).join(', ') : round.stop === 'end_turn' ? 'odpověď' : round.stop ?? '—'}
                      {round.webSearches > 0 && ` · web ${round.webSearches}×`}
                      {round.compaction && ' · zkrácení konverzace'}
                    </td>
                    <td className="jxa-num">{czk(round.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {item.toolRuns.length > 0 && (
        <div className="jxa-chips">
          {item.toolRuns.map((run, index) => (
            <span key={index} className={`jxa-chip${run.ok ? '' : ' jxa-chip--bad'}`} title={run.name}>
              <Wrench size={11} strokeWidth={2.2} aria-hidden /> {toolLabel(run.name)} · {seconds(run.ms)}
              {!run.ok && ' · selhal'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

const EMPTY_QUERY: Omit<QuestionQuery, 'days'> = {
  sort: 'at',
  dir: 'desc',
  offset: 0,
  limit: PAGE_SIZE,
  user: null,
  model: '',
  status: '',
  tool: '',
  q: '',
};

const SORTS: Array<{ value: QuestionSort; label: string }> = [
  { value: 'at', label: 'Nejnovější' },
  { value: 'cost', label: 'Nejdražší' },
  { value: 'duration', label: 'Nejpomalejší' },
  { value: 'tokens', label: 'Nejvíc tokenů' },
  { value: 'context', label: 'Největší kontext' },
];

export default function JarvisAnalytics() {
  const [days, setDays] = useState(readRange);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [query, setQuery] = useState(EMPTY_QUERY);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState<QuestionPage | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [reload, setReload] = useState(0);
  const requestRef = useRef(0);

  const usdCzk = summary?.usdCzk ?? 23;
  const czk = useCallback((usd: number) => formatCzk(usd * usdCzk), [usdCzk]);
  const person = (userId: number | null) => (userId === null ? 'Bez uživatele' : names.get(userId) ?? `Uživatel ${userId}`);

  useEffect(() => {
    apiGet<Array<{ id: number; username: string }>>('/api/team-users')
      .then((users) => setNames(new Map(users.map((user) => [user.id, user.username]))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    analyticsApi
      .summary(days)
      .then((data) => !cancelled && setSummary(data))
      .catch((reason: unknown) => !cancelled && setError(reason instanceof Error ? reason.message : 'Analýzu se nepodařilo načíst.'));
    return () => {
      cancelled = true;
    };
  }, [days, reload]);

  // The search box waits for a pause in typing.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery((current) => (current.q === search ? current : { ...current, q: search, offset: 0 })), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const request = ++requestRef.current;
    setLoadingQuestions(true);
    analyticsApi
      .questions({ ...query, days })
      .then((data) => {
        if (request !== requestRef.current) return;
        setPage((current) => (query.offset > 0 && current ? { ...data, items: [...current.items, ...data.items] } : data));
      })
      .catch((reason: unknown) => request === requestRef.current && setError(reason instanceof Error ? reason.message : 'Otázky se nepodařilo načíst.'))
      .finally(() => request === requestRef.current && setLoadingQuestions(false));
  }, [query, days, reload]);

  const selectRange = (next: number) => {
    setDays(next);
    setQuery((current) => ({ ...current, offset: 0 }));
    try {
      localStorage.setItem(RANGE_KEY, String(next));
    } catch {
      // Remembering the range is a convenience only.
    }
  };
  const filter = (patch: Partial<QuestionQuery>) => setQuery((current) => ({ ...current, ...patch, offset: 0 }));
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const breakdown = summary?.breakdown;
  const partsTotal = useMemo(() => (breakdown ? Object.values(breakdown.parts).reduce((sum, value) => sum + value, 0) : 0), [breakdown]);
  const maxModel = Math.max(...(breakdown?.byModel.map((row) => row.costUsd) ?? [0]), 0);
  const maxTool = Math.max(...(breakdown?.byTool.map((row) => row.costUsd) ?? [0]), 0);
  const maxView = Math.max(...(breakdown?.byView.map((row) => row.costUsd) ?? [0]), 0);
  const maxDepth = Math.max(...(breakdown?.byDepth.map((row) => row.averageCostUsd) ?? [0]), 0);
  const failedShare = summary?.totals.questions ? Math.round((summary.totals.failed / summary.totals.questions) * 100) : null;
  const filtersOn = query.user !== null || query.model || query.status || query.tool || query.q;

  return (
    <div className="jxa">
      <header className="jxa-head">
        <div>
          <h2>Analýza nákladů Jarvise</h2>
          <p>Každá otázka: model, čas, tokeny a cena po částech. Odhad podle ceníku; skutečný účet je ve Finance › AI spotřeba.</p>
        </div>
        <div className="jxa-head-actions">
          <div className="jxa-segmented" role="group" aria-label="Období">
            {RANGES.map((value) => (
              <button key={value} type="button" className={days === value ? 'is-on' : undefined} aria-pressed={days === value} onClick={() => selectRange(value)}>
                {value} dní
              </button>
            ))}
          </div>
          <button type="button" className="jxa-btn" onClick={() => setReload((value) => value + 1)} title="Načíst znovu">
            <RefreshCw {...SMALL} />
          </button>
        </div>
      </header>

      {error && <div className="jxa-callout">{error}</div>}
      {!summary && !error && <p className="jxa-muted">Načítám…</p>}

      {summary && breakdown && (
        <>
          <div className="jxa-tiles">
            <div className="jxa-tile">
              <span className="jxa-tile-label">
                <MessagesSquare {...SMALL} /> Otázky
              </span>
              <strong>{formatCount(summary.totals.questions)}</strong>
              <small>{summary.totals.voiceQuestions ? `hlasem ${formatCount(summary.totals.voiceQuestions)}` : 'žádná hlasem'}</small>
            </div>
            <div className="jxa-tile">
              <span className="jxa-tile-label">
                <Coins {...SMALL} /> Celkem
              </span>
              <strong>{czk(summary.totals.jarvisCostUsd)}</strong>
              <small>všechna AI {czk(summary.totals.aiCostUsd)}</small>
            </div>
            <div className="jxa-tile">
              <span className="jxa-tile-label">
                <Zap {...SMALL} /> Na otázku
              </span>
              <strong>{czk(summary.totals.averageCostUsd)}</strong>
              <small>
                {breakdown.routing.auto} auto · {breakdown.routing.manual} ručně
              </small>
            </div>
            <div className="jxa-tile">
              <span className="jxa-tile-label">
                <Clock {...SMALL} /> Doba odpovědi
              </span>
              <strong>{seconds(summary.totals.medianMs)}</strong>
              <small>
                medián · 9 z 10 do {seconds(summary.totals.p90Ms)} · první slovo {seconds(summary.totals.medianFirstTextMs)}
              </small>
            </div>
            <div className={`jxa-tile${summary.totals.failed ? ' jxa-tile--warn' : ''}`}>
              <span className="jxa-tile-label">
                <TriangleAlert {...SMALL} /> Nepovedené
              </span>
              <strong>{formatCount(summary.totals.failed)}</strong>
              <small>
                {failedShare === null ? 'žádné otázky' : `${failedShare} % otázek`}
                {summary.totals.stopped ? ` · zastaveno ${summary.totals.stopped}` : ''}
              </small>
            </div>
          </div>

          {breakdown.insights.length > 0 && (
            <section className="jxa-section">
              <h3>Proč to stojí, co by pomohlo</h3>
              <div className="jxa-insights">
                {breakdown.insights.map((insight, index) => (
                  <InsightCard key={`${insight.kind}-${index}`} insight={insight} czk={czk} />
                ))}
              </div>
            </section>
          )}

          <section className="jxa-section jxa-two">
            <div className="jxa-card">
              <h3>Za co se platí</h3>
              <div className="jxa-bars">
                {PARTS.map((part) => (
                  <div key={part.key} className="jxa-bars-row" title={part.hint}>
                    <span className="jxa-bars-label">
                      {part.label}
                      <small>{part.hint}</small>
                    </span>
                    <Bar share={partsTotal ? breakdown.parts[part.key] / partsTotal : 0} />
                    <span className="jxa-bars-value">
                      {czk(breakdown.parts[part.key])}
                      <small>{partsTotal ? percent(breakdown.parts[part.key] / partsTotal) : '—'}</small>
                    </span>
                  </div>
                ))}
              </div>
              <p className="jxa-note">
                Tokeny celkem: vstup {tokens(breakdown.tokens.input)}, z cache {tokens(breakdown.tokens.cacheRead)}, do cache{' '}
                {tokens(breakdown.tokens.cacheWrite)}, výstup {tokens(breakdown.tokens.output)}.
                {breakdown.estimatedQuestions > 0 && ` ${breakdown.estimatedQuestions} starších otázek má rozpis odhadnutý.`}
              </p>
            </div>
            <div className="jxa-card">
              <h3>Podle modelu</h3>
              {breakdown.byModel.length === 0 && <p className="jxa-muted">Žádné otázky.</p>}
              <div className="jxa-bars">
                {breakdown.byModel.map((row) => (
                  <div key={row.model ?? 'none'} className="jxa-bars-row">
                    <span className="jxa-bars-label">
                      {row.model ? modelLabel(row.model) : 'Neuvedený (starší záznamy)'}
                      <small>
                        {row.questions} {plural(row.questions, 'otázka', 'otázky', 'otázek')} · průměr {czk(row.averageCostUsd)} · medián {seconds(row.medianMs)}
                      </small>
                    </span>
                    <Bar share={maxModel ? row.costUsd / maxModel : 0} />
                    <span className="jxa-bars-value">{czk(row.costUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="jxa-section jxa-two">
            <div className="jxa-card">
              <h3>Po dnech</h3>
              <Columns
                data={breakdown.byDay.map((row) => ({
                  key: row.day,
                  label: dayLabel(row.day),
                  value: row.costUsd,
                  tip: (
                    <>
                      <strong>{new Date(`${row.day}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}</strong>
                      <span>{czk(row.costUsd)}</span>
                      <span>
                        {row.questions} {plural(row.questions, 'otázka', 'otázky', 'otázek')}
                      </span>
                    </>
                  ),
                }))}
                labelEvery={days <= 7 ? 1 : days <= 30 ? 5 : 15}
                format={czk}
              />
            </div>
            <div className="jxa-card">
              <h3>Podle hodiny (pražský čas)</h3>
              <Columns
                data={breakdown.byHour.map((row) => ({
                  key: String(row.hour),
                  label: String(row.hour),
                  value: row.costUsd,
                  tip: (
                    <>
                      <strong>
                        {row.hour}:00–{row.hour}:59
                      </strong>
                      <span>{czk(row.costUsd)}</span>
                      <span>
                        {row.questions} {plural(row.questions, 'otázka', 'otázky', 'otázek')}
                      </span>
                    </>
                  ),
                }))}
                labelEvery={3}
                format={czk}
              />
            </div>
          </section>

          <section className="jxa-section jxa-three">
            <div className="jxa-card">
              <h3>Nástroje</h3>
              <p className="jxa-note">Cena otázek, ve kterých nástroj běžel, a jak dlouho trval.</p>
              {breakdown.byTool.length === 0 && <p className="jxa-muted">Žádné nástroje.</p>}
              <div className="jxa-bars">
                {breakdown.byTool.slice(0, 12).map((row) => (
                  <button key={row.name} type="button" className="jxa-bars-row jxa-bars-row--button" title={`${row.name} – zobrazit otázky`} onClick={() => filter({ tool: row.name })}>
                    <span className="jxa-bars-label">
                      {toolLabel(row.name)}
                      <small>
                        {row.uses}× · průměr {czk(row.averageCostUsd)}
                        {row.averageMs !== null && ` · ${seconds(row.averageMs)}`}
                        {row.failed > 0 && ` · ${row.failed}× selhal`}
                      </small>
                    </span>
                    <Bar share={maxTool ? row.costUsd / maxTool : 0} />
                    <span className="jxa-bars-value">{czk(row.costUsd)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="jxa-card">
              <h3>Odkud se ptají</h3>
              <p className="jxa-note">Obrazovka, na které byla otázka položena.</p>
              {breakdown.byView.length === 0 && <p className="jxa-muted">Zatím bez údajů (zaznamenává se od 14. 11. 2026).</p>}
              <div className="jxa-bars">
                {breakdown.byView.slice(0, 10).map((row) => (
                  <div key={row.view} className="jxa-bars-row">
                    <span className="jxa-bars-label">
                      {row.view}
                      <small>
                        {row.questions} {plural(row.questions, 'otázka', 'otázky', 'otázek')} · průměr {czk(row.averageCostUsd)}
                      </small>
                    </span>
                    <Bar share={maxView ? row.costUsd / maxView : 0} />
                    <span className="jxa-bars-value">{czk(row.costUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="jxa-card">
              <h3>Délka konverzace</h3>
              <p className="jxa-note">Průměrná cena otázky podle jejího pořadí v konverzaci.</p>
              <div className="jxa-bars">
                {breakdown.byDepth.map((row) => (
                  <div key={row.key} className="jxa-bars-row">
                    <span className="jxa-bars-label">
                      {row.label}
                      <small>
                        {row.questions} {plural(row.questions, 'otázka', 'otázky', 'otázek')}
                        {row.questions > 0 && ` · kontext ${tokens(row.averageContext)}`}
                      </small>
                    </span>
                    <Bar share={maxDepth ? row.averageCostUsd / maxDepth : 0} />
                    <span className="jxa-bars-value">{row.questions ? czk(row.averageCostUsd) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      <section className="jxa-section">
        <div className="jxa-list-head">
          <h3>
            Všechny otázky
            {page && (
              <small>
                {' '}
                · {formatCount(page.total)} za {czk(page.costUsd)}
              </small>
            )}
          </h3>
          {filtersOn && (
            <button
              type="button"
              className="jxa-btn jxa-btn--ghost"
              onClick={() => {
                setSearch('');
                setQuery(EMPTY_QUERY);
              }}
            >
              Zrušit filtry
            </button>
          )}
        </div>
        <div className="jxa-filters">
          <label className="jxa-search">
            <Search {...SMALL} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hledat v otázkách…" aria-label="Hledat v otázkách" />
          </label>
          <select value={query.user ?? ''} onChange={(event) => filter({ user: event.target.value === '' ? null : Number(event.target.value) })} aria-label="Kdo">
            <option value="">Všichni</option>
            {(summary?.byUser ?? []).map((row) => (
              <option key={row.userId ?? 'none'} value={row.userId ?? ''}>
                {person(row.userId)}
              </option>
            ))}
          </select>
          <select value={query.model} onChange={(event) => filter({ model: event.target.value as ModelFamily | '' })} aria-label="Model">
            <option value="">Všechny modely</option>
            {(['opus', 'sonnet', 'haiku', 'unknown'] as ModelFamily[]).map((family) => (
              <option key={family} value={family}>
                {FAMILY_LABEL[family]}
              </option>
            ))}
          </select>
          <select value={query.status} onChange={(event) => filter({ status: event.target.value as QuestionQuery['status'] })} aria-label="Stav">
            <option value="">Všechny stavy</option>
            <option value="ok">Odpověděl</option>
            <option value="failed">Nepovedené</option>
            <option value="stopped">Zastavené</option>
          </select>
          <select value={query.tool} onChange={(event) => filter({ tool: event.target.value })} aria-label="Nástroj">
            <option value="">Všechny nástroje</option>
            {(breakdown?.byTool ?? []).map((row) => (
              <option key={row.name} value={row.name}>
                {toolLabel(row.name)}
              </option>
            ))}
          </select>
          <select value={query.sort} onChange={(event) => filter({ sort: event.target.value as QuestionSort, dir: 'desc' })} aria-label="Řadit">
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </div>

        <div className="jxa-table-wrap">
          <table className="jxa-table">
            <thead>
              <tr>
                <th aria-label="Rozbalit" />
                <th>Kdy a kdo</th>
                <th>Otázka</th>
                <th>Model</th>
                <th className="jxa-num">Doba</th>
                <th className="jxa-num">Tokeny</th>
                <th className="jxa-num">Kroky</th>
                <th className="jxa-num">Cena</th>
              </tr>
            </thead>
            <tbody>
              {page?.items.map((item, index) => {
                const key = `${item.at}-${item.conversationId ?? ''}-${index}`;
                const expanded = open.has(key);
                const status = STATUS[item.status] ?? { label: item.status, tone: 'muted' as const };
                const allTokens = item.tokens.input + item.tokens.output + item.tokens.cacheRead + item.tokens.cacheWrite;
                return (
                  <Fragment key={key}>
                    <tr className={`jxa-row${expanded ? ' is-open' : ''}`} onClick={() => toggle(key)}>
                      <td className="jxa-toggle">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Sbalit detail' : 'Rozbalit detail'}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggle(key);
                          }}
                        >
                          {expanded ? <ChevronDown {...SMALL} /> : <ChevronRight {...SMALL} />}
                        </button>
                      </td>
                      <td className="jxa-nowrap">
                        {dateTime(item.at)}
                        <div className="jxa-sub">{person(item.userId)}</div>
                      </td>
                      <td className="jxa-question">
                        <span className="jxa-question-text">
                          {item.voice && <span title="Položeno hlasem">🎤 </span>}
                          {item.question || '—'}
                        </span>
                        <span className="jxa-tags">
                          {item.status !== 'ok' && <span className={`jxa-tag jxa-tag--${status.tone}`}>{status.label}</span>}
                          {item.view && <span className="jxa-tag">{item.view}</span>}
                          {item.depth !== null && item.depth > 0 && <span className="jxa-tag">{item.depth + 1}. v konverzaci</span>}
                          {item.tools.slice(0, 4).map((tool) => (
                            <span key={tool.name} className="jxa-tag jxa-tag--tool" title={tool.name}>
                              {toolLabel(tool.name)}
                              {tool.count > 1 ? ` ${tool.count}×` : ''}
                            </span>
                          ))}
                          {item.tools.length > 4 && <span className="jxa-tag">+{item.tools.length - 4}</span>}
                        </span>
                      </td>
                      <td className="jxa-nowrap">
                        <span className={`jxa-model jxa-model--${item.family}`}>{item.model ? modelLabel(item.model) : '—'}</span>
                        {item.routing && <div className="jxa-sub">{item.routing.mode === 'manual' ? 'ručně' : 'auto'}</div>}
                      </td>
                      <td className="jxa-num jxa-nowrap">
                        {seconds(item.durationMs)}
                        {item.firstTextMs !== null && <div className="jxa-sub">1. slovo {seconds(item.firstTextMs)}</div>}
                      </td>
                      <td className="jxa-num jxa-nowrap">
                        {tokens(allTokens)}
                        <div className="jxa-sub">výstup {tokens(item.tokens.output)}</div>
                      </td>
                      <td className="jxa-num">{item.rounds.length || '—'}</td>
                      <td className="jxa-num jxa-nowrap">
                        <strong>{czk(item.costUsd)}</strong>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="jxa-detail-row">
                        <td colSpan={8}>
                          <QuestionDetail item={item} czk={czk} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {page && page.items.length === 0 && !loadingQuestions && <p className="jxa-muted jxa-pad">Žádná otázka neodpovídá.</p>}
        </div>
        {page && page.items.length < page.total && (
          <button
            type="button"
            className="jxa-btn jxa-more"
            disabled={loadingQuestions}
            onClick={() => setQuery((current) => ({ ...current, offset: page.items.length }))}
          >
            {loadingQuestions ? 'Načítám…' : `Načíst dalších ${Math.min(PAGE_SIZE, page.total - page.items.length)} (zbývá ${page.total - page.items.length})`}
          </button>
        )}
      </section>

      {summary && (
        <section className="jxa-section jxa-two">
          <div className="jxa-card">
            <h3>Podle lidí</h3>
            {summary.byUser.length === 0 && <p className="jxa-muted">Za {summary.days} dní nikdo AI nepoužil.</p>}
            <div className="jxa-table-wrap">
              <table className="jxa-table jxa-table--compact">
                <thead>
                  <tr>
                    <th>Kdo</th>
                    <th className="jxa-num">Otázky</th>
                    <th className="jxa-num">Průměrná doba</th>
                    <th className="jxa-num">Jarvis</th>
                    <th className="jxa-num">Hlas</th>
                    <th className="jxa-num">Celkem AI</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byUser.map((row) => {
                    const jarvis = (row.features.jarvis ?? 0) + (row.features.jarvis_ocr ?? 0) + (row.features.web_search ?? 0);
                    const voice = (row.features.voice_stt ?? 0) + (row.features.voice_tts ?? 0);
                    return (
                      <tr key={row.userId ?? 'none'} className="jxa-row" onClick={() => filter({ user: row.userId })} title="Zobrazit otázky">
                        <td>{person(row.userId)}</td>
                        <td className="jxa-num">
                          {formatCount(row.questions)}
                          {row.failed > 0 && <div className="jxa-sub jxa-bad">{row.failed}× nepovedeno</div>}
                        </td>
                        <td className="jxa-num">{seconds(row.averageMs)}</td>
                        <td className="jxa-num">{jarvis ? czk(jarvis) : '—'}</td>
                        <td className="jxa-num">{voice ? czk(voice) : '—'}</td>
                        <td className="jxa-num">
                          <strong>{czk(row.costUsd)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="jxa-card">
            <h3>Hodnocení odpovědí</h3>
            {summary.feedback.up + summary.feedback.down === 0 ? (
              <p className="jxa-muted">Za {summary.days} dní nikdo odpověď neohodnotil (👍/👎 pod odpovědí).</p>
            ) : (
              <>
                <div className="jxa-bars">
                  {summary.feedback.byModel.map((row) => (
                    <div key={row.model ?? 'unknown'} className="jxa-bars-row">
                      <span className="jxa-bars-label">
                        {row.model ? modelLabel(row.model) : 'Neznámý model'}
                        <small>
                          👍 {row.up} · 👎 {row.down}
                        </small>
                      </span>
                      <Bar share={row.up / Math.max(1, row.up + row.down)} />
                      <span className="jxa-bars-value">{percent(row.up / Math.max(1, row.up + row.down))}</span>
                    </div>
                  ))}
                </div>
                {summary.feedback.recentDown.slice(0, 6).map((row, index) => (
                  <div key={`${row.at}-${index}`} className="jxa-feedback">
                    <div className="jxa-sub">
                      {dateTime(row.at)} · {person(row.userId)}
                      {row.model && ` · ${modelLabel(row.model)}`}
                    </div>
                    <div>{row.question}</div>
                    {row.comment && <div className="jxa-feedback-comment">👎 {row.comment}</div>}
                  </div>
                ))}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

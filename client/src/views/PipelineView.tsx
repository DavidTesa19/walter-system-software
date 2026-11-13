// Analýza › Pipeline: where the business stands. Headline numbers, zakázky by
// state (count or commission), new and won zakázky by month, and the biggest
// open ones with a button to each. Numbers from pipeline/pipeline.ts.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { canAccessGrowthSystem, canAccessProjectsSystem, canAccessStandardSystem, useAuth } from '../auth/AuthContext';
import { ROLE_LABELS, SECTION_LABELS, type Role, type Section, type SectionData } from '../dataQuality/dataQuality';
import type { JarvisOpenAction } from '../jarvis/jarvisApi';
import { formatMoney, summarise, type PipelineSummary, type StateRow } from '../pipeline/pipeline';
import { TAB_ICON } from '../ui/icons';
import { apiGet } from '../utils/api';
import './PipelineView.css';

const ROLES: Role[] = ['client', 'partner', 'tiper'];
const prefix = (section: Section) => (section === 'public' ? '/api' : `/api/${section}`);

async function loadCommissions(sections: Section[]): Promise<{ data: SectionData[]; failed: string[] }> {
  const failed: string[] = [];
  const blocks = await Promise.all(
    sections.flatMap((section) =>
      ROLES.map(async (role) => {
        const commissions = await apiGet<Record<string, unknown>[]>(`${prefix(section)}/${role}-commissions`).catch(() => null);
        if (!commissions) failed.push(`${SECTION_LABELS[section]} · ${ROLE_LABELS[role]}`);
        return { section, role, subjects: [], commissions: commissions ?? [] };
      })
    )
  );
  return { data: blocks, failed };
}

type Metric = 'count' | 'value';
type MonthMetric = 'created' | 'won';

const percent = (value: number) => `${Math.round(value * 100)} %`;
const zakazky = (count: number) => `${count} ${count === 1 ? 'zakázka' : count >= 2 && count <= 4 ? 'zakázky' : 'zakázek'}`;

function StateBars({ rows, metric, max, muted }: { rows: StateRow[]; metric: Metric; max: number; muted?: boolean }) {
  return (
    <div className={`pl-bars${muted ? ' pl-bars--muted' : ''}`}>
      {rows.map((row) => {
        const amount = metric === 'count' ? row.count : row.value;
        const label = metric === 'count' ? String(row.count) : row.value ? formatMoney(row.value) : '—';
        const width = max > 0 ? Math.max((amount / max) * 100, amount > 0 ? 1.5 : 0) : 0;
        return (
          <div key={row.state} className="pl-bar-row" title={`${row.state}: ${zakazky(row.count)}${row.value ? `, provize ${formatMoney(row.value)}` : ''}`}>
            <span className="pl-bar-label">{row.state}</span>
            <span className="pl-bar-track">
              <span className="pl-bar-fill" style={{ width: `${width}%` }} />
            </span>
            <span className="pl-bar-value">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function PipelineView({ onOpenRecord }: { onOpenRecord: (action: JarvisOpenAction) => void }) {
  const { user } = useAuth();
  const accessScope = user?.accessScope;
  const sections = useMemo(() => {
    const allowed: Section[] = [];
    if (canAccessStandardSystem(accessScope)) allowed.push('public');
    if (canAccessProjectsSystem(accessScope)) allowed.push('projects');
    if (canAccessGrowthSystem(accessScope)) allowed.push('growth');
    return allowed;
  }, [accessScope]);

  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>('count');
  const [monthMetric, setMonthMetric] = useState<MonthMetric>('created');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await loadCommissions(sections);
    setSummary(summarise(result.data));
    setFailed(result.failed);
    setLoading(false);
  }, [sections]);

  useEffect(() => {
    void load();
  }, [load]);

  const stateMax = summary
    ? Math.max(...[...summary.byState, ...summary.side].map((row) => (metric === 'count' ? row.count : row.value)), 0)
    : 0;
  const monthMax = summary ? Math.max(...summary.months.map((month) => month[monthMetric]), 0) : 0;

  return (
    <div className="pl-view">
      <header className="pl-header">
        <div>
          <span className="pl-eyebrow">Analýza</span>
          <h1>Pipeline zakázek</h1>
          <p className="pl-muted">
            Zakázky ze sekcí, které máte otevřené ({sections.map((section) => SECTION_LABELS[section]).join(', ') || 'žádné'}), bez archivu.
            Zakázka propojená s klientem, partnerem i tipařem se počítá jednou. Částka je provize, jinak rozpočet.
          </p>
        </div>
        <button type="button" className="pl-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw {...TAB_ICON} /> {loading ? 'Načítám…' : 'Obnovit'}
        </button>
      </header>

      {failed.length > 0 && <div className="pl-warning">Nepodařilo se načíst: {failed.join(', ')}.</div>}
      {!summary && loading && <div className="pl-muted">Načítám zakázky…</div>}

      {summary && (
        <>
          <section className="pl-tiles" aria-label="Souhrn">
            <div className="pl-tile">
              <span className="pl-tile-label">Otevřené zakázky</span>
              <strong className="pl-tile-value">{summary.open.count}</strong>
              <span className="pl-tile-note">{summary.open.overdue ? `${summary.open.overdue} po termínu` : 'žádná po termínu'}</span>
            </div>
            <div className="pl-tile">
              <span className="pl-tile-label">Provize v jednání</span>
              <strong className="pl-tile-value">{formatMoney(summary.open.value)}</strong>
              <span className="pl-tile-note">{summary.open.withoutValue ? `${zakazky(summary.open.withoutValue)} bez částky` : 'u všech je částka'}</span>
            </div>
            <div className="pl-tile">
              <span className="pl-tile-label">Úspěšnost (12 měsíců)</span>
              <strong className="pl-tile-value">{summary.winRate === null ? '—' : percent(summary.winRate)}</strong>
              <span className="pl-tile-note">podepsané a uzavřené proti zrušeným</span>
            </div>
            <div className="pl-tile">
              <span className="pl-tile-label">Získáno (12 měsíců)</span>
              <strong className="pl-tile-value">{formatMoney(summary.wonValue12)}</strong>
              <span className="pl-tile-note">provize podepsaných a uzavřených</span>
            </div>
          </section>

          <div className="pl-grid">
            <section className="pl-card">
              <div className="pl-card-head">
                <h2>Zakázky podle stavu</h2>
                <div className="pl-switch" role="tablist" aria-label="Co ukázat">
                  <button type="button" role="tab" aria-selected={metric === 'count'} className={metric === 'count' ? 'is-active' : ''} onClick={() => setMetric('count')}>
                    Počet
                  </button>
                  <button type="button" role="tab" aria-selected={metric === 'value'} className={metric === 'value' ? 'is-active' : ''} onClick={() => setMetric('value')}>
                    Provize
                  </button>
                </div>
              </div>
              <StateBars rows={summary.byState} metric={metric} max={stateMax} />
              <div className="pl-subhead">Mimo pipeline</div>
              <StateBars rows={summary.side} metric={metric} max={stateMax} muted />
            </section>

            <section className="pl-card">
              <div className="pl-card-head">
                <h2>Po měsících</h2>
                <div className="pl-switch" role="tablist" aria-label="Co ukázat">
                  <button type="button" role="tab" aria-selected={monthMetric === 'created'} className={monthMetric === 'created' ? 'is-active' : ''} onClick={() => setMonthMetric('created')}>
                    Nové
                  </button>
                  <button type="button" role="tab" aria-selected={monthMetric === 'won'} className={monthMetric === 'won' ? 'is-active' : ''} onClick={() => setMonthMetric('won')}>
                    Získané
                  </button>
                </div>
              </div>
              <div className="pl-columns" role="img" aria-label={`${monthMetric === 'created' ? 'Nové' : 'Získané'} zakázky za posledních 12 měsíců`}>
                {summary.months.map((month) => {
                  const amount = month[monthMetric];
                  return (
                    <div key={month.key} className="pl-column" title={`${month.label}: ${zakazky(amount)}`}>
                      <span className="pl-column-value">{amount || ''}</span>
                      <span className="pl-column-track">
                        <span className="pl-column-fill" style={{ height: `${monthMax ? (amount / monthMax) * 100 : 0}%` }} />
                      </span>
                      <span className="pl-column-label">{month.label}</span>
                    </div>
                  );
                })}
              </div>
              <p className="pl-muted pl-small">
                {monthMetric === 'created' ? 'Podle data přidání zakázky.' : 'Podle poslední změny podepsané nebo uzavřené zakázky.'}
              </p>
            </section>
          </div>

          <section className="pl-card">
            <div className="pl-card-head">
              <h2>Největší otevřené zakázky</h2>
            </div>
            {summary.biggestOpen.length === 0 ? (
              <p className="pl-muted">Otevřené zakázky zatím nemají vyplněnou provizi ani rozpočet.</p>
            ) : (
              <table className="pl-table">
                <thead>
                  <tr>
                    <th>Zakázka</th>
                    <th>Sekce</th>
                    <th>Stav</th>
                    <th className="pl-num">Provize</th>
                    <th aria-label="Otevřít" />
                  </tr>
                </thead>
                <tbody>
                  {summary.biggestOpen.map((item) => (
                    <tr key={`${item.ref.section}-${item.ref.role}-${item.ref.id}`}>
                      <td className="pl-name">{item.ref.label}</td>
                      <td>{SECTION_LABELS[item.ref.section]} · {ROLE_LABELS[item.ref.role]}</td>
                      <td>{item.state}</td>
                      <td className="pl-num">{item.value !== null ? formatMoney(item.value) : '—'}</td>
                      <td>
                        <button type="button" className="pl-open" onClick={() => onOpenRecord({ type: 'open_record', ...item.ref })} title="Otevřít zakázku" aria-label={`Otevřít ${item.ref.label}`}>
                          <ExternalLink {...TAB_ICON} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

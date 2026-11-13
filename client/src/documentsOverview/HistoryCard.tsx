import { useMemo, useState } from 'react';
import { filesLabel, formatBytes, formatCzk, monthLong, monthShort } from './documentsOverview';
import type { DocumentsHistory, HistoryMonth } from './documentsOverview';

// Analýza › Dokumenty › Vývoj v čase. One series per chart in the palette's
// primary colour (a decrease in the danger colour, so growth and shrinking
// read apart), recessive grid, a tooltip per column, and the same numbers as
// a table.

type Metric = 'total' | 'net' | 'cost';

const METRICS: Array<{ id: Metric; label: string; title: string }> = [
  { id: 'total', label: 'Úložiště', title: 'Kolik soubory zabírají na konci měsíce' },
  { id: 'net', label: 'Přírůstek', title: 'O kolik úložiště za měsíc vzrostlo (nahráno minus smazáno)' },
  { id: 'cost', label: 'Náklady', title: 'Odhad měsíční ceny za uložení souborů (disk Railway)' },
];

const valueOf = (row: HistoryMonth, metric: Metric) =>
  metric === 'total' ? row.totalBytes : metric === 'net' ? row.netBytes : row.costCzk;

const format = (value: number, metric: Metric) => {
  if (metric === 'cost') return formatCzk(value);
  if (metric === 'net') return value === 0 ? '0 B' : `${value < 0 ? '−' : '+'}${formatBytes(Math.abs(value))}`;
  return formatBytes(value);
};

export default function HistoryCard({ history }: { history: DocumentsHistory }) {
  const [metric, setMetric] = useState<Metric>('total');
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const { months, summary } = history;

  const values = useMemo(() => months.map((row) => valueOf(row, metric)), [months, metric]);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  // Where zero sits, from the top, as a share of the plot height.
  const zeroAt = max / span;
  // Every label when they fit, otherwise every 2nd / 3rd.
  const labelStep = months.length <= 12 ? 1 : months.length <= 24 ? 2 : 3;
  const hovered = hover != null ? months[hover] : null;

  if (months.length === 0) {
    return (
      <section className="dov-card">
        <div className="dov-card-head"><h2>Vývoj v čase</h2></div>
        <p className="dov-muted">Zatím tu nejsou žádné soubory.</p>
      </section>
    );
  }

  return (
    <section className="dov-card dov-history">
      <div className="dov-card-head">
        <h2>Vývoj v čase</h2>
        <div className="dov-switch" role="tablist" aria-label="Co graf ukazuje">
          {METRICS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={metric === item.id}
              className={metric === item.id ? 'is-active' : undefined}
              onClick={() => setMetric(item.id)}
              title={item.title}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dov-figures">
        <div>
          <span className="dov-figure-label">Uložení stojí</span>
          <span className="dov-figure-value">{formatCzk(summary.costPerGbCzk)} / GB</span>
          <span className="dov-figure-note">měsíčně na disku · {formatCzk(summary.costPerGbCzk / 10)} za 100 MB</span>
        </div>
        <div>
          <span className="dov-figure-label">Průměrný přírůstek</span>
          <span className="dov-figure-value">{format(summary.avgMonthlyBytes, 'net')} / měs.</span>
          <span className="dov-figure-note">za posledních {summary.averagedMonths} měs.</span>
        </div>
        <div>
          <span className="dov-figure-label">Za rok při tomto tempu</span>
          <span className="dov-figure-value">{formatBytes(summary.in12Bytes)}</span>
          <span className="dov-figure-note">uložení {formatCzk(summary.in12CostCzk)} měsíčně</span>
        </div>
        {summary.busiestMonth && (
          <div>
            <span className="dov-figure-label">Nejvíc nahráno</span>
            <span className="dov-figure-value">{monthLong(summary.busiestMonth.month)}</span>
            <span className="dov-figure-note">
              {formatBytes(summary.busiestMonth.addedBytes)} · {filesLabel(summary.busiestMonth.addedCount)}
            </span>
          </div>
        )}
      </div>

      <div className="dov-chart" onMouseLeave={() => setHover(null)}>
        <div className="dov-chart-axis" aria-hidden="true">
          <span>{format(max, metric === 'net' && max > 0 ? 'net' : metric)}</span>
          {min < 0 ? <span>{format(min, 'net')}</span> : <span>{metric === 'cost' ? '0 Kč' : '0 B'}</span>}
        </div>
        <div className="dov-chart-plot">
          <div className="dov-chart-zero" style={{ top: `${zeroAt * 100}%` }} aria-hidden="true" />
          <div className="dov-chart-grid" aria-hidden="true" />
          <div className="dov-chart-columns" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
            {months.map((row, index) => {
              const value = values[index];
              const height = (Math.abs(value) / span) * 100;
              const negative = value < 0;
              return (
                <button
                  key={row.month}
                  type="button"
                  className={`dov-col${hover === index ? ' is-hover' : ''}`}
                  onMouseEnter={() => setHover(index)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  aria-label={`${monthLong(row.month)}: ${format(value, metric)}`}
                >
                  <span
                    className={`dov-col-fill${negative ? ' is-negative' : ''}`}
                    style={negative
                      ? { top: `${zeroAt * 100}%`, height: `${height}%` }
                      : { bottom: `${(1 - zeroAt) * 100}%`, height: `${Math.max(value > 0 ? 1 : 0, height)}%` }}
                  />
                </button>
              );
            })}
          </div>
          {hovered && hover != null && (
            <div
              className="dov-tooltip"
              style={{ left: `${((hover + 0.5) / months.length) * 100}%` }}
              data-edge={hover < months.length / 4 ? 'start' : hover > (months.length * 3) / 4 ? 'end' : 'middle'}
              role="status"
            >
              <strong>{monthLong(hovered.month)}</strong>
              <span className="dov-tooltip-main">{format(values[hover], metric)}</span>
              <span>Nahráno: {hovered.addedCount} · {formatBytes(hovered.addedBytes)}</span>
              {hovered.removedCount > 0 && <span>Smazáno: {hovered.removedCount} · {formatBytes(hovered.removedBytes)}</span>}
              <span>Celkem: {filesLabel(hovered.totalCount)} · {formatBytes(hovered.totalBytes)}</span>
              <span>Uložení: {formatCzk(hovered.costCzk)} / měs.</span>
            </div>
          )}
        </div>
        <div className="dov-chart-labels" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }} aria-hidden="true">
          {/* The month on every (2nd, 3rd) column; the year under the first one and under each January. */}
          {months.map((row, index) => (
            <span key={row.month}>
              {index % labelStep === 0 ? monthShort(row.month).split(' ')[0] : ''}
              {(index === 0 || row.month.endsWith('-01')) && <small>{row.month.slice(0, 4)}</small>}
            </span>
          ))}
        </div>
      </div>

      <p className="dov-muted dov-note">
        Podle data nahrání souborů, které v aplikaci jsou. Smazání se zaznamenávají od {monthLong(summary.deletionsTrackedSince)}; soubor
        smazaný dřív v historii chybí. Náklady jsou za disk Railway; kdyby soubory držela paměť databáze, stál by každý GB{' '}
        {formatCzk(summary.ramCostPerGbCzk)} měsíčně.
      </p>

      <button type="button" className="dov-button dov-button--ghost dov-table-toggle" onClick={() => setShowTable((value) => !value)} aria-expanded={showTable}>
        {showTable ? 'Skrýt tabulku' : 'Zobrazit jako tabulku'}
      </button>
      {showTable && (
        <div className="dov-table-wrap">
          <table className="dov-table dov-table--compact">
            <thead>
              <tr>
                <th>Měsíc</th>
                <th className="dov-num">Nahráno</th>
                <th className="dov-num">Smazáno</th>
                <th className="dov-num">Přírůstek</th>
                <th className="dov-num">Celkem</th>
                <th className="dov-num">Uložení / měs.</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((row) => (
                <tr key={row.month}>
                  <td>{monthLong(row.month)}</td>
                  <td className="dov-num">{row.addedCount ? `${row.addedCount} · ${formatBytes(row.addedBytes)}` : '—'}</td>
                  <td className="dov-num">{row.removedCount ? `${row.removedCount} · ${formatBytes(row.removedBytes)}` : '—'}</td>
                  <td className="dov-num">{row.netBytes ? format(row.netBytes, 'net') : '—'}</td>
                  <td className="dov-num">{formatBytes(row.totalBytes)}</td>
                  <td className="dov-num">{formatCzk(row.costCzk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

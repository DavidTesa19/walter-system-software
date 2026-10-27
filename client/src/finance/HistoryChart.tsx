import { useState } from 'react';
import { formatCzk, monthLabel } from './financeMath';

// Month-by-month spending, one stacked column per month. Each series keeps
// its colour slot whatever the filter (colour follows the category or
// service, never its rank); "Ostatní" is grey.

export interface HistorySeries {
  key: string;
  label: string;
  /** 1–8 for the palette, 0 for the grey "everything else". */
  slot: number;
}

export interface HistoryMonth {
  month: string;
  values: Record<string, number>;
}

const WIDTH = 760;
const HEIGHT = 260;
const PAD = { top: 14, right: 8, bottom: 30, left: 70 };
const GAP = 2;

const niceMax = (value: number) => {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
};

const topRoundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
};

const shortMonth = (month: string, withYear: boolean) => {
  const date = new Date(`${month}-15T12:00:00`);
  const name = date.toLocaleDateString('cs-CZ', { month: 'short' });
  return withYear ? `${name} ${String(date.getFullYear()).slice(2)}` : name;
};

export function HistoryChart({
  months,
  series,
  selected,
  onSelect,
}: {
  months: HistoryMonth[];
  series: HistorySeries[];
  selected: string | null;
  onSelect: (month: string) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const totals = months.map((month) => series.reduce((sum, item) => sum + (month.values[item.key] ?? 0), 0));
  const yMax = niceMax(Math.max(...totals, 0));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotWidth / Math.max(months.length, 1);
  const barWidth = Math.min(30, slot * 0.6);
  const y = (value: number) => PAD.top + plotHeight - (value / yMax) * plotHeight;
  const labelEvery = months.length > 24 ? 3 : months.length > 14 ? 2 : 1;
  const hoveredMonth = hovered === null ? null : months[hovered];

  if (!totals.some((total) => total > 0)) {
    return <div className="finance-empty">Ve vybraném filtru zatím nejsou žádné platby.</div>;
  }

  return (
    <div className="finance-chart">
      <div className="finance-legend">
        {series.map((item) => (
          <span key={item.key} className="finance-legend-item">
            <span className={`finance-swatch finance-slot-${item.slot}`} aria-hidden="true" />
            {item.label}
          </span>
        ))}
      </div>
      <div className="finance-chart-frame">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Výdaje po měsících v korunách" className="finance-chart-svg">
          {[0, 0.5, 1].map((share) => share * yMax).map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'finance-axis' : 'finance-grid'} />
              <text x={PAD.left - 8} y={y(tick)} className="finance-tick" textAnchor="end" dominantBaseline="middle">
                {formatCzk(tick)}
              </text>
            </g>
          ))}
          {months.map((month, index) => {
            const x = PAD.left + slot * index + (slot - barWidth) / 2;
            const segments = series.filter((item) => (month.values[item.key] ?? 0) > 0);
            let base = 0;
            const isSelected = selected === month.month;
            return (
              <g key={month.month}>
                {isSelected && (
                  <rect x={PAD.left + slot * index} y={PAD.top} width={slot} height={plotHeight} className="finance-hit--selected" />
                )}
                {segments.map((item, segmentIndex) => {
                  const value = month.values[item.key];
                  const top = y(base + value);
                  const bottom = y(base) - (segmentIndex > 0 ? GAP : 0);
                  base += value;
                  const height = Math.max(bottom - top, 1);
                  const className = `finance-mark finance-slot-${item.slot}`;
                  return segmentIndex === segments.length - 1 ? (
                    <path key={item.key} d={topRoundedRect(x, top, barWidth, height, 4)} className={className} />
                  ) : (
                    <rect key={item.key} x={x} y={top} width={barWidth} height={height} className={className} />
                  );
                })}
                {index % labelEvery === 0 && (
                  <text x={x + barWidth / 2} y={HEIGHT - 10} className="finance-tick" textAnchor="middle">
                    {shortMonth(month.month, index === 0 || month.month.endsWith('-01'))}
                  </text>
                )}
                <rect
                  x={PAD.left + slot * index}
                  y={PAD.top}
                  width={slot}
                  height={plotHeight}
                  className={`finance-hit finance-hit--clickable${hovered === index ? ' finance-hit--active' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${monthLabel(month.month, 'long')}: ${formatCzk(totals[index])}, otevřít podrobnosti`}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  onClick={() => onSelect(month.month)}
                  onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onSelect(month.month)}
                />
              </g>
            );
          })}
        </svg>
        {hoveredMonth && hovered !== null && (
          <div
            className={`finance-tooltip${hovered < 2 ? ' finance-tooltip--start' : hovered >= months.length - 2 ? ' finance-tooltip--end' : ''}`}
            style={{
              left: `${((PAD.left + slot * hovered + slot / 2) / WIDTH) * 100}%`,
              top: `${(y(totals[hovered]) / HEIGHT) * 100}%`,
            }}
          >
            <strong>{monthLabel(hoveredMonth.month, 'long')}</strong>
            {series
              .filter((item) => (hoveredMonth.values[item.key] ?? 0) > 0)
              .sort((a, b) => (hoveredMonth.values[b.key] ?? 0) - (hoveredMonth.values[a.key] ?? 0))
              .map((item) => (
                <span key={item.key} className="finance-tooltip-row">
                  <span className={`finance-swatch finance-slot-${item.slot}`} aria-hidden="true" />
                  {item.label}
                  <span className="finance-tooltip-value">{formatCzk(hoveredMonth.values[item.key])}</span>
                </span>
              ))}
            <span className="finance-tooltip-row finance-tooltip-total">
              Celkem <span className="finance-tooltip-value">{formatCzk(totals[hovered])}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

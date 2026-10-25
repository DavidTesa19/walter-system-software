import { useState } from 'react';
import type { Provider } from './financeApi';
import { CHART_PROVIDERS, PROVIDER_LABELS, formatCzk, monthLabel } from './financeMath';
import type { ProviderMonth } from './financeMath';

// ---------- monthly cost by category ----------

export interface CategoryBar {
  key: string;
  label: string;
  czk: number;
}

/** One measure per category, so one hue; the value and share are written beside each bar. */
export function CategoryBars({ bars }: { bars: CategoryBar[] }) {
  const total = bars.reduce((sum, bar) => sum + bar.czk, 0);
  const max = Math.max(...bars.map((bar) => bar.czk), 0);
  if (!bars.length || max <= 0) {
    return <div className="finance-empty">Zatím žádné aktivní náklady s částkou.</div>;
  }
  return (
    <ul className="finance-bars" aria-label="Měsíční náklady podle kategorie">
      {bars.map((bar) => (
        <li key={bar.key} className="finance-bar-row">
          <span className="finance-bar-label">{bar.label}</span>
          <span className="finance-bar-track" aria-hidden="true">
            <span className="finance-bar-fill" style={{ width: `${Math.max((bar.czk / max) * 100, bar.czk > 0 ? 1 : 0)}%` }} />
          </span>
          <span className="finance-bar-value">
            {formatCzk(bar.czk)}
            <span className="finance-muted"> · {total > 0 ? Math.round((bar.czk / total) * 100) : 0} %</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ---------- AI cost per month, stacked by provider ----------

export interface AiMonth {
  month: string;
  values: Partial<Record<Provider, ProviderMonth & { czk: number }>>;
}

const WIDTH = 720;
const HEIGHT = 230;
const PAD = { top: 14, right: 8, bottom: 26, left: 64 };
const GAP = 2;

const niceMax = (value: number) => {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
};

// A rectangle with only its top corners rounded: the data end, not the baseline.
const topRoundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
};

export function AiCostChart({ months }: { months: AiMonth[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const totals = months.map((month) => CHART_PROVIDERS.reduce((sum, provider) => sum + (month.values[provider]?.czk ?? 0), 0));
  const yMax = niceMax(Math.max(...totals, 0));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotWidth / Math.max(months.length, 1);
  const barWidth = Math.min(28, slot * 0.56);
  const y = (value: number) => PAD.top + plotHeight - (value / yMax) * plotHeight;
  const ticks = [0, 0.5, 1].map((share) => share * yMax);
  const present = CHART_PROVIDERS.filter((provider) => months.some((month) => (month.values[provider]?.czk ?? 0) > 0));
  const billed = (provider: Provider) => months.some((month) => month.values[provider]?.billed);
  const hoveredMonth = hovered === null ? null : months[hovered];

  if (!totals.some((total) => total > 0)) {
    return (
      <div className="finance-empty">
        Zatím žádné AI náklady. Začnou se počítat s prvním dotazem na Jarvise nebo AI Asistenta; s admin klíči se načte i
        historie z vyúčtování.
      </div>
    );
  }

  return (
    <div className="finance-chart">
      <div className="finance-legend">
        {present.map((provider) => (
          <span key={provider} className="finance-legend-item">
            <span className={`finance-swatch finance-swatch--${provider}`} aria-hidden="true" />
            {PROVIDER_LABELS[provider]}
            <span className="finance-muted">{billed(provider) ? ' · vyúčtování' : ' · odhad'}</span>
          </span>
        ))}
      </div>
      <div className="finance-chart-frame">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="AI náklady po měsících v korunách" className="finance-chart-svg">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'finance-axis' : 'finance-grid'} />
              <text x={PAD.left - 8} y={y(tick)} className="finance-tick" textAnchor="end" dominantBaseline="middle">
                {formatCzk(tick)}
              </text>
            </g>
          ))}
          {months.map((month, index) => {
            const x = PAD.left + slot * index + (slot - barWidth) / 2;
            let base = 0;
            const segments = CHART_PROVIDERS.filter((provider) => (month.values[provider]?.czk ?? 0) > 0);
            return (
              <g key={month.month}>
                {segments.map((provider, segmentIndex) => {
                  const value = month.values[provider]!.czk;
                  const top = y(base + value);
                  const bottom = y(base) - (segmentIndex > 0 ? GAP : 0);
                  base += value;
                  const height = Math.max(bottom - top, 1);
                  const isTop = segmentIndex === segments.length - 1;
                  return isTop ? (
                    <path key={provider} d={topRoundedRect(x, top, barWidth, height, 4)} className={`finance-mark finance-mark--${provider}`} />
                  ) : (
                    <rect key={provider} x={x} y={top} width={barWidth} height={height} className={`finance-mark finance-mark--${provider}`} />
                  );
                })}
                <text x={x + barWidth / 2} y={HEIGHT - 8} className="finance-tick" textAnchor="middle">
                  {new Date(`${month.month}-15T12:00:00`).toLocaleDateString('cs-CZ', { month: 'short' })}
                </text>
                <rect
                  x={PAD.left + slot * index}
                  y={PAD.top}
                  width={slot}
                  height={plotHeight}
                  className={`finance-hit${hovered === index ? ' finance-hit--active' : ''}`}
                  tabIndex={0}
                  aria-label={`${monthLabel(month.month, 'long')}: ${formatCzk(totals[index])}`}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
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
            {CHART_PROVIDERS.filter((provider) => hoveredMonth.values[provider]).map((provider) => (
              <span key={provider} className="finance-tooltip-row">
                <span className={`finance-swatch finance-swatch--${provider}`} aria-hidden="true" />
                {PROVIDER_LABELS[provider]}
                <span className="finance-tooltip-value">
                  {formatCzk(hoveredMonth.values[provider]!.czk)}
                  {hoveredMonth.values[provider]!.billed ? '' : ' (odhad)'}
                </span>
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

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../utils/api';
import { financeApi } from './financeApi';
import type { FinanceOverview, JarvisTurn, JarvisTurnStatus, JarvisUsage } from './financeApi';
import { formatCount, formatCzk, toCzk } from './financeMath';

const RANGES = [7, 30, 90];
const RANGE_STORAGE_KEY = 'walterFinanceJarvisDays';

const STATUS_INFO: Record<JarvisTurnStatus, { label: string; tone: string }> = {
  ok: { label: 'Odpověděl', tone: 'active' },
  stopped: { label: 'Zastaveno', tone: 'paused' },
  empty: { label: 'Bez odpovědi', tone: 'cancelled' },
  truncated: { label: 'Zkrácená odpověď', tone: 'estimate' },
  error: { label: 'Chyba', tone: 'cancelled' },
  refusal: { label: 'Odmítnuto', tone: 'paused' },
  tool_limit: { label: 'Příliš mnoho kroků', tone: 'cancelled' },
};

// The per-person columns; each sums these features from the AI call log.
const FEATURE_COLUMNS: Array<{ label: string; features: string[] }> = [
  { label: 'Jarvis', features: ['jarvis', 'jarvis_ocr'] },
  { label: 'Web', features: ['web_search'] },
  { label: 'Hlas', features: ['voice_stt', 'voice_tts'] },
  { label: 'AI Asistent', features: ['chat'] },
];

interface TeamUser {
  id: number;
  username: string;
}

const readStoredRange = () => {
  try {
    const stored = Number(localStorage.getItem(RANGE_STORAGE_KEY));
    return RANGES.includes(stored) ? stored : 30;
  } catch {
    return 30;
  }
};

const seconds = (ms: number | null) =>
  ms === null ? '—' : `${(ms / 1000).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

const questions = (count: number) => `${formatCount(count)} ${count === 1 ? 'otázka' : count >= 2 && count <= 4 ? 'otázky' : 'otázek'}`;

export default function JarvisUsageTab({ overview }: { overview: FinanceOverview }) {
  const [days, setDays] = useState(readStoredRange);
  const [usage, setUsage] = useState<JarvisUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const rates = overview.rates.rates;
  const czk = (usd: number) => formatCzk(toCzk(usd, 'USD', rates));

  useEffect(() => {
    let cancelled = false;
    financeApi
      .jarvisUsage(days)
      .then((data) => {
        if (cancelled) return;
        setUsage(data);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Využití Jarvise se nepodařilo načíst.');
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  useEffect(() => {
    apiGet<TeamUser[]>('/api/team-users')
      .then((users) => setNames(new Map(users.map((user) => [user.id, user.username]))))
      .catch(() => undefined);
  }, []);

  const personName = (userId: number | null) => (userId === null ? 'Bez uživatele' : names.get(userId) ?? `Uživatel ${userId}`);

  const selectRange = (next: number) => {
    setDays(next);
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, String(next));
    } catch {
      // Remembering the range is a convenience only.
    }
  };

  const failureShare = useMemo(() => {
    if (!usage?.totals.questions) return null;
    return Math.round((usage.totals.failed / usage.totals.questions) * 100);
  }, [usage]);

  const turnTable = (turns: JarvisTurn[], emptyText: string, showError = false) =>
    turns.length ? (
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th>Kdy a kdo</th>
              <th>Otázka</th>
              <th>Nástroje</th>
              <th className="finance-num">Doba</th>
              <th className="finance-num">Cena</th>
            </tr>
          </thead>
          <tbody>
            {turns.map((turn, index) => (
              <tr key={`${turn.at}-${index}`}>
                <td>
                  {dateTime(turn.at)}
                  <div className="finance-row-sub">{personName(turn.userId)}</div>
                </td>
                <td>
                  {turn.voice && <span title="Položeno hlasem">🎤 </span>}
                  {turn.question || '—'}
                  {turn.status !== 'ok' && (
                    <div className="finance-row-sub">
                      <span className={`finance-chip finance-chip--${STATUS_INFO[turn.status]?.tone ?? 'paused'}`}>
                        {STATUS_INFO[turn.status]?.label ?? turn.status}
                      </span>
                      {showError && turn.error && <span className="finance-error-text"> {turn.error}</span>}
                    </div>
                  )}
                </td>
                <td>
                  {turn.tools.length ? turn.tools.map((name) => <code key={name}>{name} </code>) : '—'}
                  {turn.failedTools > 0 && <div className="finance-row-sub finance-error-text">{turn.failedTools}× selhal</div>}
                </td>
                <td className="finance-num">
                  {seconds(turn.durationMs)}
                  {turn.firstTextMs !== null && <div className="finance-row-sub">první slovo {seconds(turn.firstTextMs)}</div>}
                </td>
                <td className="finance-num">{czk(turn.costUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="finance-empty">{emptyText}</div>
    );

  return (
    <div className="finance-panel">
      <div className="finance-toolbar">
        <div className="finance-filters">
          <div className="finance-segmented" role="group" aria-label="Období">
            {RANGES.map((value) => (
              <button
                key={value}
                type="button"
                className={days === value ? 'is-active' : undefined}
                aria-pressed={days === value}
                onClick={() => selectRange(value)}
              >
                {value} dní
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="finance-callout finance-callout--error">{error}</div>}
      {!usage && !error && <div className="finance-empty">Načítám…</div>}

      {usage && (
        <>
          <div className="finance-metrics finance-metrics--compact">
            <div className="finance-metric">
              <span className="finance-metric-label">Otázky</span>
              <span className="finance-metric-value">{formatCount(usage.totals.questions)}</span>
              <span className="finance-metric-note">
                {usage.totals.voiceQuestions ? `z toho hlasem ${formatCount(usage.totals.voiceQuestions)}` : 'žádná hlasem'}
              </span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Cena Jarvise</span>
              <span className="finance-metric-value">{czk(usage.totals.jarvisCostUsd)}</span>
              <span className="finance-metric-note">průměrně {czk(usage.totals.averageCostUsd)} za otázku</span>
            </div>
            <div className="finance-metric">
              <span className="finance-metric-label">Doba odpovědi</span>
              <span className="finance-metric-value">{seconds(usage.totals.medianMs)}</span>
              <span className="finance-metric-note">
                medián · 9 z 10 do {seconds(usage.totals.p90Ms)} · první slovo {seconds(usage.totals.medianFirstTextMs)}
              </span>
            </div>
            <div className={`finance-metric${usage.totals.failed ? ' finance-metric--warning' : ''}`}>
              <span className="finance-metric-label">Nepovedené</span>
              <span className="finance-metric-value">{formatCount(usage.totals.failed)}</span>
              <span className="finance-metric-note">
                {failureShare === null ? 'žádné otázky' : `${failureShare} % otázek`}
                {usage.totals.stopped ? ` · zastaveno uživatelem ${formatCount(usage.totals.stopped)}` : ''}
              </span>
            </div>
          </div>

          <section>
            <h2 className="finance-section-title">Podle lidí</h2>
            {usage.byUser.length ? (
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Kdo</th>
                      <th className="finance-num">Otázky</th>
                      <th className="finance-num">Průměrná doba</th>
                      {FEATURE_COLUMNS.map((column) => (
                        <th key={column.label} className="finance-num">{column.label}</th>
                      ))}
                      <th className="finance-num">Celkem AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.byUser.map((row) => (
                      <tr key={row.userId ?? 'none'}>
                        <td>{personName(row.userId)}</td>
                        <td className="finance-num">
                          {formatCount(row.questions)}
                          {row.failed > 0 && <div className="finance-row-sub finance-error-text">{row.failed}× nepovedeno</div>}
                        </td>
                        <td className="finance-num">{seconds(row.averageMs)}</td>
                        {FEATURE_COLUMNS.map((column) => {
                          const cost = column.features.reduce((sum, feature) => sum + (row.features[feature] ?? 0), 0);
                          return (
                            <td key={column.label} className="finance-num">{cost ? czk(cost) : '—'}</td>
                          );
                        })}
                        <td className="finance-num"><strong>{czk(row.costUsd)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="finance-empty">Za {usage.days} dní nikdo AI nepoužil.</div>
            )}
            <p className="finance-muted">
              Ceny jsou odhad podle tokenů a ceníku; skutečnou částku za měsíc ukazuje vyúčtování v záložce AI spotřeba. Celkem
              AI za {usage.days} dní: {czk(usage.totals.aiCostUsd)}.
            </p>
          </section>

          <section>
            <h2 className="finance-section-title">Nejdražší otázky</h2>
            {turnTable(usage.expensive, 'Zatím žádné otázky.')}
          </section>

          <section>
            <h2 className="finance-section-title">Nejpomalejší odpovědi</h2>
            {turnTable(usage.slowest, 'Zatím žádné otázky.')}
          </section>

          <section>
            <h2 className="finance-section-title">Nepovedené odpovědi</h2>
            {turnTable(usage.failures, `Za ${usage.days} dní žádná — všechny otázky dostaly odpověď.`, true)}
          </section>

          {usage.tools.length > 0 && (
            <section>
              <h2 className="finance-section-title">Nejpoužívanější nástroje</h2>
              <p className="finance-muted">
                {usage.tools.slice(0, 12).map((tool, index) => (
                  <span key={tool.name}>
                    {index > 0 && ' · '}
                    <code>{tool.name}</code> {formatCount(tool.uses)}×
                  </span>
                ))}
              </p>
            </section>
          )}

          <p className="finance-muted">
            Za {usage.days} dní {questions(usage.totals.questions)}. Otázky se zaznamenávají od nasazení tohoto přehledu; vidí je jen
            administrátoři.
          </p>
        </>
      )}
    </div>
  );
}

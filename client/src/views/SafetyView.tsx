import { useCallback, useEffect, useState } from 'react';
import ChangeLogPanel from '../safety/ChangeLogPanel';
import TrashPanel from '../safety/TrashPanel';
import BackupsPanel from '../safety/BackupsPanel';
import AgentPanel from '../safety/AgentPanel';
import { safetyApi } from '../safety/safetyApi';
import type { SafetyStatus } from '../safety/safetyApi';
import { formatRelative } from '../safety/format';
import './SafetyView.css';

type SafetyTab = 'changes' | 'trash' | 'backups' | 'agent';

const TABS: Array<{ id: SafetyTab; label: string }> = [
  { id: 'changes', label: 'Historie změn' },
  { id: 'trash', label: 'Koš' },
  { id: 'backups', label: 'Zálohy' },
  { id: 'agent', label: 'AI agent' },
];

const TAB_STORAGE_KEY = 'walterSafetyTab';

const readStoredTab = (): SafetyTab => {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    return TABS.some((tab) => tab.id === stored) ? (stored as SafetyTab) : 'changes';
  } catch {
    return 'changes';
  }
};

export default function SafetyView() {
  const [tab, setTab] = useState<SafetyTab>(readStoredTab);
  const [status, setStatus] = useState<SafetyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await safetyApi.status());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stav se nepodařilo načíst.');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const selectTab = (next: SafetyTab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // Remembering the tab is a convenience only.
    }
  };

  const summary = status?.summary;
  const lastBackup = status?.backups?.lastSuccessful;
  const lastFailed = status?.backups?.lastFailed;
  const backupFailedLast = Boolean(
    lastFailed && (!lastBackup || new Date(lastFailed.createdAt) > new Date(lastBackup.createdAt))
  );

  return (
    <div className="safety-view">
      <div className="safety-header">
        <div>
          <span className="safety-eyebrow">Administrace</span>
          <h1>Bezpečnost a zálohy</h1>
          <p>
            Každá změna v aplikaci se zapisuje — kdo, kdy a co přesně změnil. Odsud ji jde vrátit, obnovit smazané záznamy
            nebo celou databázi ze zálohy.
          </p>
        </div>
        <button type="button" className="safety-button safety-button--ghost" onClick={() => void loadStatus()}>
          Obnovit přehled
        </button>
      </div>

      {error && <div className="safety-callout safety-callout--error">{error}</div>}

      {status && !status.available && (
        <div className="safety-callout safety-callout--warning">{status.reason}</div>
      )}

      {status?.available && (
        <>
          {(status.install?.errors.length ?? 0) > 0 && (
            <div className="safety-callout safety-callout--error">
              <strong>Ochrana databáze se nenainstalovala celá:</strong>
              <ul>
                {status.install!.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {backupFailedLast && (
            <div className="safety-callout safety-callout--error">
              Poslední záloha (#{lastFailed!.id}) selhala: {lastFailed!.error ?? 'neznámá chyba'}
            </div>
          )}

          <div className="safety-metrics">
            <div className="safety-metric">
              <span className="safety-metric-value">{summary?.lastDay ?? '—'}</span>
              <span className="safety-metric-label">Změn za 24 hodin</span>
            </div>
            <div className="safety-metric">
              <span className="safety-metric-value">{summary?.lastWeek ?? '—'}</span>
              <span className="safety-metric-label">Změn za 7 dní</span>
            </div>
            <div className="safety-metric">
              <span className="safety-metric-value">{summary?.deletesWeek ?? '—'}</span>
              <span className="safety-metric-label">Smazání za 7 dní</span>
            </div>
            <div className={`safety-metric${lastBackup ? '' : ' safety-metric--warning'}`}>
              <span className="safety-metric-value">{lastBackup ? formatRelative(lastBackup.createdAt) : 'Žádná'}</span>
              <span className="safety-metric-label">Poslední záloha</span>
            </div>
          </div>

          <div className="safety-tabs" role="tablist" aria-label="Části">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`safety-tab${tab === item.id ? ' safety-tab--active' : ''}`}
                onClick={() => selectTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="safety-card safety-card--panel" role="tabpanel">
            {tab === 'changes' && <ChangeLogPanel onChanged={loadStatus} />}
            {tab === 'trash' && <TrashPanel onChanged={loadStatus} />}
            {tab === 'backups' && <BackupsPanel onChanged={loadStatus} />}
            {tab === 'agent' && <AgentPanel status={status} onChanged={loadStatus} />}
          </div>

          {status.summary?.oldest && (
            <p className="safety-muted safety-footnote">
              Historie změn sahá do {new Date(status.summary.oldest).toLocaleDateString('cs-CZ')} a drží se{' '}
              {status.auditRetentionDays} dní. Ochrana běží na {status.install?.auditedTables ?? 0} tabulkách.
            </p>
          )}
        </>
      )}
    </div>
  );
}

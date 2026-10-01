import { useEffect, useState } from 'react';
import ChangeLogPanel from './ChangeLogPanel';
import { safetyApi } from './safetyApi';
import type { ChangeFilters, SafetySettings, SafetyStatus } from './safetyApi';

const AGENT_FILTER: Partial<ChangeFilters> = { actorType: 'ai_agent' };

export default function AgentPanel({ status, onChanged }: { status: SafetyStatus; onChanged?: () => void }) {
  const [settings, setSettings] = useState<SafetySettings | null>(status.settings ?? null);
  const [maxRows, setMaxRows] = useState(String(status.settings?.ai_max_rows_per_run ?? 200));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status.settings) {
      setSettings(status.settings);
      setMaxRows(String(status.settings.ai_max_rows_per_run));
    }
  }, [status.settings]);

  const save = async (patch: Partial<SafetySettings>) => {
    setSaving(true);
    setError(null);
    try {
      setSettings(await safetyApi.updateSettings(patch));
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nastavení se nepodařilo uložit.');
    } finally {
      setSaving(false);
    }
  };

  const readonlyRole = status.install?.agentReadonlyRole;

  return (
    <div className="safety-panel">
      <div className="safety-agent-grid">
        <div className={`safety-card safety-switch-card${settings?.ai_writes_enabled ? '' : ' safety-card--danger'}`}>
          <span className="safety-card-label">Zápisy AI agenta</span>
          <span className="safety-card-value">{settings?.ai_writes_enabled ? 'Povoleny' : 'Zastaveny'}</span>
          <p className="safety-muted">
            Hlavní vypínač. Když je vypnutý, databáze odmítne jakoukoli změnu od AI agenta — okamžitě, bez ohledu na to,
            co agent právě dělá.
          </p>
          <button
            type="button"
            className={`safety-button ${settings?.ai_writes_enabled ? 'safety-button--danger' : 'safety-button--primary'}`}
            disabled={saving || !settings}
            onClick={() => save({ ai_writes_enabled: !settings?.ai_writes_enabled })}
          >
            {settings?.ai_writes_enabled ? 'Zastavit zápisy agenta' : 'Znovu povolit zápisy'}
          </button>
        </div>

        <div className="safety-card">
          <span className="safety-card-label">Pravidla pro agenta</span>
          <label className="safety-check">
            <input
              type="checkbox"
              checked={Boolean(settings?.ai_allow_hard_delete)}
              disabled={saving || !settings}
              onChange={(event) => save({ ai_allow_hard_delete: event.target.checked })}
            />
            <span>
              <b>Smí mazat záznamy</b>
              <small>Vypnuto = agent může záznamy jen archivovat, smazání databáze odmítne.</small>
            </span>
          </label>
          <label className="safety-field">
            <span>Nejvýš změněných záznamů za jeden běh</span>
            <span className="safety-inline">
              <input
                type="number"
                min={1}
                max={10000}
                value={maxRows}
                onChange={(event) => setMaxRows(event.target.value)}
              />
              <button
                type="button"
                className="safety-button safety-button--small"
                disabled={saving || Number(maxRows) === settings?.ai_max_rows_per_run || !(Number(maxRows) >= 1)}
                onClick={() => save({ ai_max_rows_per_run: Math.round(Number(maxRows)) })}
              >
                Uložit
              </button>
            </span>
          </label>
        </div>

        <div className="safety-card">
          <span className="safety-card-label">Co agent nikdy nesmí</span>
          <ul className="safety-list">
            <li>Měnit uživatele, hesla, nastavení zabezpečení a zálohy</li>
            <li>Upravit nebo smazat historii změn</li>
            <li>Smazat tabulku, sloupec nebo hromadně vymazat data</li>
            <li>Překročit limit změn za jeden běh</li>
          </ul>
          <p className="safety-muted">
            Pro vyhledávání má agent vlastní přihlášení do databáze jen pro čtení:{' '}
            <b>{readonlyRole === 'installed' ? 'nastaveno' : readonlyRole === 'failed' ? 'chyba' : 'zatím nenastaveno'}</b>
            {readonlyRole !== 'installed' && ' (proměnná AI_READONLY_DB_PASSWORD)'}.
          </p>
        </div>
      </div>

      {error && <div className="safety-callout safety-callout--error">{error}</div>}

      <h3 className="safety-section-title">Běhy AI agenta</h3>
      <p className="safety-muted">Každý běh agenta je jedna akce — jedním kliknutím jde vrátit všechno, co v něm udělal.</p>
      <ChangeLogPanel
        fixedFilters={AGENT_FILTER}
        showFilters={false}
        emptyText="AI agent zatím nic nezměnil."
        onChanged={onChanged}
      />
    </div>
  );
}

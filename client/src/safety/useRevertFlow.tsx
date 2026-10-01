import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import SafetyModal from './SafetyModal';
import type { RevertResult } from './safetyApi';
import { fieldLabel, formatValue } from './format';

interface PendingRevert {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  run: (force: boolean) => Promise<RevertResult>;
}

// Confirm → run → on conflicts, show exactly which fields someone changed
// since, and let the admin overwrite them or back off.
export function useRevertFlow(onDone: (result: RevertResult) => void) {
  const [pending, setPending] = useState<PendingRevert | null>(null);
  const [result, setResult] = useState<RevertResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (busy) return;
    setPending(null);
    setResult(null);
    setError(null);
  }, [busy]);

  const start = useCallback((next: PendingRevert) => {
    setPending(next);
    setResult(null);
    setError(null);
  }, []);

  const execute = async (force: boolean) => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await pending.run(force);
      if (outcome.ok) {
        setPending(null);
        setResult(null);
        onDone(outcome);
      } else {
        setResult(outcome);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Akce se nezdařila.');
    } finally {
      setBusy(false);
    }
  };

  const hasErrors = (result?.errors.length ?? 0) > 0;
  const hasConflicts = (result?.conflicts.length ?? 0) > 0;

  const modal = pending ? (
    <SafetyModal
      title={pending.title}
      onClose={close}
      wide={hasConflicts}
      footer={
        <>
          <button type="button" className="safety-button safety-button--ghost" onClick={close} disabled={busy}>
            Zrušit
          </button>
          {!result && (
            <button type="button" className="safety-button safety-button--primary" onClick={() => execute(false)} disabled={busy}>
              {busy ? 'Probíhá…' : pending.confirmLabel}
            </button>
          )}
          {result && hasConflicts && !hasErrors && (
            <button type="button" className="safety-button safety-button--danger" onClick={() => execute(true)} disabled={busy}>
              {busy ? 'Probíhá…' : 'Přepsat i tak'}
            </button>
          )}
        </>
      }
    >
      {!result && (
        <>
          <div className="safety-modal-text">{pending.description}</div>
          <p className="safety-muted">Vrácení se samo zapíše do historie, takže ho půjde znovu vrátit.</p>
        </>
      )}

      {hasErrors && (
        <div className="safety-callout safety-callout--error">
          <strong>Tuto akci nelze provést:</strong>
          <ul>
            {result!.errors.map((item) => (
              <li key={`${item.auditId}-${item.table}`}>
                <b>{item.tableLabel}</b> {item.label ?? `#${item.rowId}`}: {item.reason}
              </li>
            ))}
          </ul>
          <p>Nic nebylo změněno.</p>
        </div>
      )}

      {hasConflicts && (
        <div className="safety-callout safety-callout--warning">
          <strong>Někdo tyto hodnoty mezitím znovu změnil.</strong>
          <p>Vrácením by se jeho úpravy přepsaly. Zatím nic nebylo změněno.</p>
          {result!.conflicts.map((item) => (
            <div key={`${item.auditId}-${item.table}`} className="safety-conflict">
              <div className="safety-conflict-title">
                {item.tableLabel} · {item.label ?? `#${item.rowId}`}
              </div>
              <table className="safety-diff">
                <thead>
                  <tr>
                    <th>Pole</th>
                    <th>Teď</th>
                    <th>Změna nastavila</th>
                    <th>Vrátí se na</th>
                  </tr>
                </thead>
                <tbody>
                  {(item.fields ?? []).map((field) => (
                    <tr key={field.field}>
                      <td className="safety-diff-field">{fieldLabel(field.field)}</td>
                      <td>{formatValue(field.current)}</td>
                      <td>{formatValue(field.expected)}</td>
                      <td className="safety-diff-new">{item.op === 'I' ? '(záznam se smaže)' : formatValue(field.target)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {error && <div className="safety-callout safety-callout--error">{error}</div>}
    </SafetyModal>
  ) : null;

  return { start, modal };
}

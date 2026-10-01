import { useCallback, useEffect, useState } from 'react';
import SafetyModal from './SafetyModal';
import ChangeDiff from './ChangeDiff';
import { safetyApi } from './safetyApi';
import type { RecordHistory } from './safetyApi';
import { OP_LABELS, actorLabel, formatDateTime } from './format';
import { useRevertFlow } from './useRevertFlow';

interface RecordHistoryModalProps {
  table: string;
  rowId: string;
  onClose: () => void;
  onChanged?: () => void;
}

// Every version of one record, newest first, each restorable.
export default function RecordHistoryModal({ table, rowId, onClose, onChanged }: RecordHistoryModalProps) {
  const [history, setHistory] = useState<RecordHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHistory(await safetyApi.recordHistory(table, rowId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Historii se nepodařilo načíst.');
    }
  }, [table, rowId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { start, modal } = useRevertFlow(() => {
    setNotice('Záznam byl obnoven.');
    void load();
    onChanged?.();
  });

  return (
    <SafetyModal title="Historie záznamu" onClose={onClose} wide>
      {error && <div className="safety-callout safety-callout--error">{error}</div>}
      {notice && <div className="safety-callout safety-callout--success">{notice}</div>}
      {!history && !error && <p className="safety-muted">Načítám…</p>}
      {history && (
        <>
          <div className="safety-record-heading">
            <span className="safety-chip">{history.tableLabel}</span>
            <strong>{history.label ?? `#${history.rowId}`}</strong>
            {!history.exists && <span className="safety-chip safety-chip--danger">Smazáno</span>}
          </div>
          {history.entries.length === 0 && <p className="safety-muted">Pro tento záznam zatím není žádná zaznamenaná změna.</p>}
          <ol className="safety-timeline">
            {history.entries.map((entry, index) => {
              const isCurrent = index === 0 && history.exists && entry.op !== 'D';
              const versionLabel = entry.op === 'D' ? 'Obnovit stav před smazáním' : 'Obnovit tuto verzi';
              return (
                <li key={entry.id} className={`safety-timeline-item safety-timeline-item--${entry.op}`}>
                  <div className="safety-timeline-head">
                    <span className={`safety-op safety-op--${entry.op}`}>{OP_LABELS[entry.op]}</span>
                    <span>{formatDateTime(entry.at)}</span>
                    <span className="safety-muted">{actorLabel(entry.actor)}</span>
                    {entry.reverted && <span className="safety-chip">Vráceno</span>}
                    {isCurrent ? (
                      <span className="safety-chip safety-chip--accent">Aktuální verze</span>
                    ) : (
                      <button
                        type="button"
                        className="safety-button safety-button--small"
                        onClick={() =>
                          start({
                            title: versionLabel,
                            confirmLabel: 'Obnovit',
                            description: (
                              <p>
                                Záznam <b>{history.label ?? `#${history.rowId}`}</b> se vrátí do stavu{' '}
                                {entry.op === 'D' ? 'těsně před smazáním' : 'po této změně'} ({formatDateTime(entry.at)}).
                              </p>
                            ),
                            run: () => safetyApi.restoreVersion(table, rowId, entry.id),
                          })
                        }
                      >
                        {versionLabel}
                      </button>
                    )}
                  </div>
                  {entry.note && <p className="safety-note">„{entry.note}“</p>}
                  <ChangeDiff entry={entry} />
                </li>
              );
            })}
          </ol>
        </>
      )}
      {modal}
    </SafetyModal>
  );
}

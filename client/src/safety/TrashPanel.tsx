import { useCallback, useEffect, useState } from 'react';
import { safetyApi } from './safetyApi';
import type { TrashGroup } from './safetyApi';
import { actorLabel, formatDateTime, formatRelative, pluralRecords } from './format';
import { useRevertFlow } from './useRevertFlow';
import RecordHistoryModal from './RecordHistoryModal';

// Everything deleted that has not come back yet. One row per action, so a
// subject deleted together with its commissions and files is one item.
export default function TrashPanel({ onChanged }: { onChanged?: () => void }) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [groups, setGroups] = useState<TrashGroup[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ table: string; rowId: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (before: number | null = null) => {
    setLoading(true);
    setError(null);
    try {
      const page = await safetyApi.trash(debouncedSearch, before);
      setGroups((current) => (before ? [...current, ...page.groups] : page.groups));
      setNextBefore(page.nextBefore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Koš se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void load(null);
  }, [load]);

  const { start, modal } = useRevertFlow((result) => {
    setNotice(`Obnoveno ${pluralRecords(result.applied)}.`);
    void load(null);
    onChanged?.();
  });

  const restore = (group: TrashGroup) =>
    start({
      title: 'Obnovit z koše',
      confirmLabel: 'Obnovit',
      description: (
        <>
          <p>
            <b>{group.headline.tableLabel} — {group.headline.label ?? `#${group.headline.rowId}`}</b>
          </p>
          <p>
            Obnoví se {pluralRecords(group.items.length)}:{' '}
            {Object.entries(group.counts).map(([label, count]) => `${label} ${count}×`).join(', ')}.
          </p>
          <p className="safety-muted">
            Smazal(a) {actorLabel(group.actor)}, {formatDateTime(group.at)}.
          </p>
        </>
      ),
      run: (force) => safetyApi.revert({ auditIds: group.auditIds, force }),
    });

  return (
    <div className="safety-panel">
      <div className="safety-filters">
        <label className="safety-field safety-field--grow">
          <span>Hledat v koši</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Název firmy, kód, název souboru…"
          />
        </label>
      </div>
      <p className="safety-muted">
        Smazané záznamy, soubory a zakázky zůstávají obnovitelné tak dlouho, jak dlouho se drží historie změn.
      </p>

      {error && <div className="safety-callout safety-callout--error">{error}</div>}
      {notice && (
        <div className="safety-callout safety-callout--success" role="status">
          {notice}
          <button type="button" className="safety-link-button" onClick={() => setNotice(null)}>
            Zavřít
          </button>
        </div>
      )}
      {!loading && groups.length === 0 && !error && <div className="safety-empty">Koš je prázdný.</div>}

      <ul className="safety-trash">
        {groups.map((group) => (
          <li key={group.changesetId} className="safety-trash-item">
            <div className="safety-trash-main">
              <span className="safety-chip">{group.headline.tableLabel}</span>
              <strong>{group.headline.label ?? `#${group.headline.rowId}`}</strong>
              {group.items.length > 1 && (
                <span className="safety-muted">
                  + {Object.entries(group.counts)
                    .map(([label, count]) => (label === group.headline.tableLabel ? count - 1 : count) > 0
                      ? `${label} ${label === group.headline.tableLabel ? count - 1 : count}×`
                      : null)
                    .filter(Boolean)
                    .join(', ')}
                </span>
              )}
            </div>
            <div className="safety-trash-meta">
              <span>{actorLabel(group.actor)}</span>
              <span title={formatDateTime(group.at)}>{formatRelative(group.at)}</span>
            </div>
            <div className="safety-trash-actions">
              <button
                type="button"
                className="safety-link-button"
                onClick={() => setHistoryTarget({ table: group.headline.table, rowId: group.headline.rowId })}
              >
                Historie
              </button>
              <button type="button" className="safety-button safety-button--small" onClick={() => restore(group)}>
                Obnovit
              </button>
            </div>
          </li>
        ))}
      </ul>

      {loading && <p className="safety-muted">Načítám…</p>}
      {!loading && nextBefore && (
        <button type="button" className="safety-button safety-button--ghost safety-load-more" onClick={() => load(nextBefore)}>
          Načíst starší
        </button>
      )}
      {historyTarget && (
        <RecordHistoryModal
          table={historyTarget.table}
          rowId={historyTarget.rowId}
          onClose={() => setHistoryTarget(null)}
          onChanged={() => {
            void load(null);
            onChanged?.();
          }}
        />
      )}
      {modal}
    </div>
  );
}

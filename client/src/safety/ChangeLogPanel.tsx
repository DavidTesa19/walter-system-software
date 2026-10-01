import { useCallback, useEffect, useMemo, useState } from 'react';
import ChangeDiff from './ChangeDiff';
import RecordHistoryModal from './RecordHistoryModal';
import { safetyApi } from './safetyApi';
import type { ActorType, ChangeEntry, ChangeFilters, ChangeGroup, ChangeOp } from './safetyApi';
import { OP_LABELS, actorLabel, formatDateTime, formatRelative, pluralRecords } from './format';
import { useRevertFlow } from './useRevertFlow';

const primaryEntry = (entries: ChangeEntry[]) =>
  entries.find((entry) => /_entities$/.test(entry.table))
  ?? entries.find((entry) => /_commissions$/.test(entry.table))
  ?? entries[0];

function summarize(group: ChangeGroup) {
  const ops = new Set(group.entries.map((entry) => entry.op));
  const main = primaryEntry(group.entries);
  const name = main ? `${main.tableLabel} — ${main.label ?? `#${main.rowId}`}` : '';
  if (group.size === 1 && main) return `${OP_LABELS[main.op]}: ${name}`;
  const verb = ops.size === 1 ? OP_LABELS[group.entries[0].op] : 'Změněno';
  const others = group.size - 1;
  return `${verb} ${pluralRecords(group.size)}: ${name}${others > 0 ? ` a ${others} další` : ''}`;
}

const actorBadge = (type: ActorType) => {
  if (type === 'ai_agent') return <span className="safety-chip safety-chip--ai">AI agent</span>;
  if (type === 'system') return <span className="safety-chip">Systém</span>;
  if (type === 'public') return <span className="safety-chip">Veřejný formulář</span>;
  return null;
};

const startOfDay = (value: string) => (value ? new Date(`${value}T00:00:00`).toISOString() : undefined);
const endOfDay = (value: string) => (value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined);

interface ChangeLogPanelProps {
  fixedFilters?: Partial<ChangeFilters>;
  emptyText?: string;
  onChanged?: () => void;
  showFilters?: boolean;
}

export default function ChangeLogPanel({ fixedFilters, emptyText, onChanged, showFilters = true }: ChangeLogPanelProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actor, setActor] = useState('');
  const [op, setOp] = useState<ChangeOp | ''>('');
  const [kind, setKind] = useState<'subject' | 'commission' | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actors, setActors] = useState<Array<{ id: number | null; name: string | null; type: ActorType; changes: number }>>([]);
  const [groups, setGroups] = useState<ChangeGroup[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [historyTarget, setHistoryTarget] = useState<{ table: string; rowId: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!showFilters) return;
    safetyApi.actors().then(setActors).catch(() => setActors([]));
  }, [showFilters]);

  const filters = useMemo<ChangeFilters>(() => {
    const [actorKind, actorValue] = actor.split(':');
    return {
      q: debouncedSearch || undefined,
      op,
      kind,
      from: startOfDay(from),
      to: endOfDay(to),
      ...(actorKind === 'user' ? { userId: actorValue } : {}),
      ...(actorKind === 'type' ? { actorType: actorValue as ActorType } : {}),
      ...fixedFilters,
    };
  }, [actor, debouncedSearch, op, kind, from, to, fixedFilters]);

  const load = useCallback(async (before: number | null = null) => {
    setLoading(true);
    setError(null);
    try {
      const page = await safetyApi.changes(filters, before);
      setGroups((current) => (before ? [...current, ...page.groups] : page.groups));
      setNextBefore(page.nextBefore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Historii se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load(null);
  }, [load]);

  const refresh = useCallback(() => {
    void load(null);
    onChanged?.();
  }, [load, onChanged]);

  const { start, modal } = useRevertFlow((result) => {
    setNotice(`Hotovo — vráceno ${pluralRecords(result.applied)}.`);
    refresh();
  });

  const toggle = (changesetId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(changesetId)) next.delete(changesetId);
      else next.add(changesetId);
      return next;
    });

  const revertGroup = (group: ChangeGroup) =>
    start({
      title: group.size > 1 ? 'Vrátit celou akci' : 'Vrátit změnu',
      confirmLabel: 'Vrátit',
      description: (
        <>
          <p>
            {summarize(group)}
            <br />
            <span className="safety-muted">
              {actorLabel(group.actor)}, {formatDateTime(group.at)}
            </span>
          </p>
          {group.size > group.entries.length && (
            <p>
              Akce obsahuje {pluralRecords(group.size)}, filtr jich ukazuje {group.entries.length}. Vrátí se všechny.
            </p>
          )}
        </>
      ),
      run: (force) => safetyApi.revert({ changesetId: group.changesetId, force }),
    });

  const revertEntry = (entry: ChangeEntry) =>
    start({
      title: 'Vrátit jednu změnu',
      confirmLabel: 'Vrátit',
      description: (
        <p>
          {OP_LABELS[entry.op]}: {entry.tableLabel} — {entry.label ?? `#${entry.rowId}`}
          <br />
          <span className="safety-muted">
            {actorLabel(entry.actor)}, {formatDateTime(entry.at)}
          </span>
        </p>
      ),
      run: (force) => safetyApi.revert({ auditIds: [entry.id], force }),
    });

  const clearFilters = () => {
    setSearch('');
    setActor('');
    setOp('');
    setKind('');
    setFrom('');
    setTo('');
  };

  return (
    <div className="safety-panel">
      {showFilters && (
        <div className="safety-filters">
          <label className="safety-field safety-field--grow">
            <span>Hledat</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Název firmy, telefon, kód, uživatel…"
            />
          </label>
          <label className="safety-field">
            <span>Kdo</span>
            <select value={actor} onChange={(event) => setActor(event.target.value)}>
              <option value="">Všichni</option>
              <option value="type:ai_agent">AI agent</option>
              <option value="type:system">Systém</option>
              <option value="type:public">Veřejný formulář</option>
              {actors
                .filter((item) => item.type === 'user' && item.id != null)
                .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
                .map((item) => (
                  <option key={item.id} value={`user:${item.id}`}>
                    {item.name ?? `Uživatel #${item.id}`}
                  </option>
                ))}
            </select>
          </label>
          <label className="safety-field">
            <span>Změna</span>
            <select value={op} onChange={(event) => setOp(event.target.value as ChangeOp | '')}>
              <option value="">Vše</option>
              <option value="I">Vytvoření</option>
              <option value="U">Úpravy</option>
              <option value="D">Smazání</option>
            </select>
          </label>
          <label className="safety-field">
            <span>Oblast</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as 'subject' | 'commission' | '')}>
              <option value="">Vše</option>
              <option value="subject">Subjekty</option>
              <option value="commission">Zakázky</option>
            </select>
          </label>
          <label className="safety-field">
            <span>Od</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="safety-field">
            <span>Do</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button type="button" className="safety-button safety-button--ghost" onClick={clearFilters}>
            Zrušit filtry
          </button>
        </div>
      )}

      {error && <div className="safety-callout safety-callout--error">{error}</div>}
      {notice && (
        <div className="safety-callout safety-callout--success" role="status">
          {notice}
          <button type="button" className="safety-link-button" onClick={() => setNotice(null)}>
            Zavřít
          </button>
        </div>
      )}

      {!loading && groups.length === 0 && !error && (
        <div className="safety-empty">{emptyText ?? 'Žádné změny neodpovídají filtru.'}</div>
      )}

      <ul className="safety-groups">
        {groups.map((group) => {
          const isOpen = expanded.has(group.changesetId);
          const fullyReverted = group.revertedCount > 0 && group.revertedCount === group.entries.length && group.entries.length === group.size;
          return (
            <li key={group.changesetId} className={`safety-group${group.actor.type === 'ai_agent' ? ' safety-group--ai' : ''}`}>
              <div className="safety-group-head">
                <button type="button" className="safety-group-toggle" onClick={() => toggle(group.changesetId)} aria-expanded={isOpen}>
                  <span className={`safety-caret${isOpen ? ' safety-caret--open' : ''}`} aria-hidden="true">›</span>
                  <span className="safety-group-summary">
                    <span className="safety-group-title">{summarize(group)}</span>
                    <span className="safety-group-meta">
                      <strong>{actorLabel(group.actor)}</strong>
                      {actorBadge(group.actor.type)}
                      <span title={formatDateTime(group.at)}>{formatRelative(group.at)}</span>
                      {group.reverts && <span className="safety-chip">Vrácení / obnova</span>}
                      {fullyReverted && <span className="safety-chip safety-chip--accent">Vráceno</span>}
                      {!fullyReverted && group.revertedCount > 0 && <span className="safety-chip">Částečně vráceno</span>}
                    </span>
                    {group.note && <span className="safety-note">„{group.note}“</span>}
                  </span>
                </button>
                {!fullyReverted && (
                  <button type="button" className="safety-button safety-button--small" onClick={() => revertGroup(group)}>
                    {group.size > 1 ? `Vrátit akci (${group.size})` : 'Vrátit'}
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="safety-group-body">
                  <p className="safety-muted safety-group-route">
                    {formatDateTime(group.at)}
                    {group.route ? ` · ${group.route}` : ''}
                  </p>
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="safety-entry">
                      <div className="safety-entry-head">
                        <span className={`safety-op safety-op--${entry.op}`}>{OP_LABELS[entry.op]}</span>
                        <span className="safety-entry-title">
                          {entry.tableLabel} · <b>{entry.label ?? `#${entry.rowId}`}</b>
                        </span>
                        {entry.reverted && (
                          <span className="safety-chip" title={`${entry.reverted.by ?? 'Systém'}, ${formatDateTime(entry.reverted.at)}`}>
                            Vráceno
                          </span>
                        )}
                        <span className="safety-entry-actions">
                          <button
                            type="button"
                            className="safety-link-button"
                            onClick={() => setHistoryTarget({ table: entry.table, rowId: entry.rowId })}
                          >
                            Historie záznamu
                          </button>
                          {group.size > 1 && !entry.reverted && (
                            <button type="button" className="safety-link-button" onClick={() => revertEntry(entry)}>
                              Vrátit jen tuto změnu
                            </button>
                          )}
                        </span>
                      </div>
                      <ChangeDiff entry={entry} />
                    </div>
                  ))}
                  {group.size > group.entries.length && (
                    <p className="safety-muted">
                      Filtr skrývá {group.size - group.entries.length} dalších změn této akce.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
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
          onChanged={refresh}
        />
      )}
      {modal}
    </div>
  );
}

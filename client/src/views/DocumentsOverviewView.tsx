import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, ExternalLink, RefreshCw, Trash2, X } from 'lucide-react';
import {
  EMPTY_FILTERS,
  KIND_LABELS,
  ROLE_LABELS,
  SECTION_LABELS,
  diskCostCzk,
  filesLabel,
  foldersLabel,
  fileKind,
  filterDocuments,
  findDuplicates,
  formatBytes,
  formatCzk,
  groupBy,
  memoryCostCzk,
  ownerKey,
  sortDocuments,
} from '../documentsOverview/documentsOverview';
import type {
  DocumentFilters,
  DocumentSection,
  DocumentsOverview,
  FileKind,
  OverviewDocument,
  SizeFilter,
  SortDirection,
  SortKey,
  StateFilter,
} from '../documentsOverview/documentsOverview';
import type { JarvisOpenAction } from '../jarvis/jarvisApi';
import type { AppView } from '../types/appView';
import { BUTTON_ICON, TAB_ICON } from '../ui/icons';
import { apiDelete, apiDownload, apiGet } from '../utils/api';
import './DocumentsOverviewView.css';

// The table shows this many rows until "Zobrazit další".
const PAGE = 60;

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—';

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: 'filename', label: 'Soubor' },
  { key: 'kind', label: 'Typ' },
  { key: 'size', label: 'Velikost', numeric: true },
  { key: 'owner', label: 'Patří k' },
  { key: 'section', label: 'Sekce' },
  { key: 'createdAt', label: 'Nahráno' },
];

interface Props {
  onOpenRecord: (action: JarvisOpenAction) => void;
  onOpenView: (view: AppView) => void;
}

export default function DocumentsOverviewView({ onOpenRecord, onOpenView }: Props) {
  const [data, setData] = useState<DocumentsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DocumentFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'size', direction: 'desc' });
  const [shown, setShown] = useState(PAGE);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<DocumentsOverview>('/api/documents/overview'));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Přehled dokumentů se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const documents = useMemo(() => data?.documents ?? [], [data]);
  const duplicates = useMemo(() => findDuplicates(documents), [documents]);
  const filtered = useMemo(() => filterDocuments(documents, filters, duplicates.byId), [documents, filters, duplicates]);
  const sorted = useMemo(() => sortDocuments(filtered, sort.key, sort.direction), [filtered, sort]);
  const totalBytes = useMemo(() => documents.reduce((sum, doc) => sum + doc.sizeBytes, 0), [documents]);
  const filteredBytes = useMemo(() => filtered.reduce((sum, doc) => sum + doc.sizeBytes, 0), [filtered]);
  const byKind = useMemo(() => groupBy(documents, (doc) => fileKind(doc.mimeType, doc.filename), (doc) => KIND_LABELS[fileKind(doc.mimeType, doc.filename)]), [documents]);
  const bySection = useMemo(() => groupBy(documents, (doc) => doc.section, (doc) => SECTION_LABELS[doc.section]), [documents]);
  const byOwner = useMemo(() => groupBy(documents, ownerKey, (doc) => doc.owner.label).slice(0, 8), [documents]);
  const archivedCount = useMemo(() => documents.filter((doc) => doc.archivedAt).length, [documents]);
  const deletedBytes = useMemo(() => (data?.deleted ?? []).reduce((sum, doc) => sum + doc.sizeBytes, 0), [data]);

  const setFilter = <K extends keyof DocumentFilters>(key: K, value: DocumentFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setShown(PAGE);
  };
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'size' || key === 'createdAt' ? 'desc' : 'asc' },
    );

  const openOwner = (doc: OverviewDocument) => {
    if (doc.section === 'future') {
      onOpenView('future');
      return;
    }
    if (!doc.role || doc.section === 'unknown' || !doc.owner.exists) return;
    onOpenRecord({
      type: 'open_record',
      section: doc.section,
      role: doc.role,
      kind: 'subject',
      id: doc.entityId,
      entityId: doc.entityId,
      status: doc.owner.status ?? 'accepted',
      label: doc.owner.label,
    });
  };

  const download = async (doc: OverviewDocument) => {
    setBusyId(doc.id);
    try {
      await apiDownload(`/documents/${doc.id}/download`, doc.filename);
    } catch {
      window.alert(`Soubor ${doc.filename} se nepodařilo stáhnout.`);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (doc: OverviewDocument) => {
    const ok = window.confirm(
      `Smazat „${doc.filename}“ (${formatBytes(doc.sizeBytes)}) u ${doc.owner.label}?\n\n` +
        'Soubor zmizí z profilu. Kvůli obnově se ještě rok drží v historii změn (Bezpečnost a zálohy), ' +
        'takže místo se uvolní až potom.',
    );
    if (!ok) return;
    setBusyId(doc.id);
    try {
      await apiDelete(`/documents/${doc.id}`);
      await load();
    } catch {
      window.alert(`Soubor ${doc.filename} se nepodařilo smazat.`);
    } finally {
      setBusyId(null);
    }
  };

  const costs = data
    ? {
        disk: diskCostCzk(data.storage.documentsBytes + data.storage.deletedBytes, data),
        offsite: data.cost.offsite * data.cost.usdCzk,
        memory: memoryCostCzk(data.storage.documentsBytes, data),
      }
    : null;

  return (
    <div className="dov-view">
      <header className="dov-header">
        <div>
          <span className="dov-eyebrow">Analýza</span>
          <h1>Dokumenty</h1>
          <p className="dov-muted">
            Všechny nahrané soubory: komu patří, kolik zabírají a co jejich uložení stojí. Kliknutím na subjekt otevřete jeho profil.
          </p>
        </div>
        <button type="button" className="dov-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw {...BUTTON_ICON} />
          {loading ? 'Načítám…' : 'Obnovit'}
        </button>
      </header>

      {error && <div className="dov-warning">{error}</div>}
      {!data && loading && <p className="dov-muted">Načítám dokumenty…</p>}

      {data && costs && (
        <>
          <section className="dov-tiles" aria-label="Souhrn">
            <div className="dov-tile">
              <span className="dov-tile-label">Soubory</span>
              <span className="dov-tile-value">{documents.length.toLocaleString('cs-CZ')}</span>
              <span className="dov-tile-note">
                {foldersLabel(data.folderCount)}{archivedCount > 0 ? ` · ${archivedCount} v archivu` : ''}
              </span>
            </div>
            <div className="dov-tile">
              <span className="dov-tile-label">Zabírají</span>
              <span className="dov-tile-value">{formatBytes(totalBytes)}</span>
              <span className="dov-tile-note">
                {data.storage.source === 'postgres'
                  ? `${Math.round((data.storage.documentsBytes / Math.max(1, data.storage.databaseBytes)) * 100)} % databáze (${formatBytes(data.storage.databaseBytes)})`
                  : 'vývojová data (db.json)'}
              </span>
            </div>
            <div className="dov-tile">
              <span className="dov-tile-label">Uložení stojí</span>
              <span className="dov-tile-value">{formatCzk(costs.disk + costs.offsite)}</span>
              <span className="dov-tile-note">měsíčně: disk Railway{costs.offsite > 0 ? ' + kopie v R2' : ', kopie v R2 zdarma'}</span>
            </div>
            <button
              type="button"
              className={`dov-tile dov-tile--button${filters.duplicatesOnly ? ' is-active' : ''}`}
              onClick={() => setFilter('duplicatesOnly', !filters.duplicatesOnly)}
              disabled={duplicates.groups.length === 0}
              title={duplicates.groups.length ? 'Zobrazit jen duplicity' : undefined}
            >
              <span className="dov-tile-label">Duplicity</span>
              <span className="dov-tile-value">{duplicates.groups.length}</span>
              <span className="dov-tile-note">
                {duplicates.groups.length ? `zbytečně ${formatBytes(duplicates.wastedBytes)}` : 'žádný soubor není dvakrát'}
              </span>
            </button>
            <button
              type="button"
              className={`dov-tile dov-tile--button${showDeleted ? ' is-active' : ''}`}
              onClick={() => setShowDeleted((value) => !value)}
              disabled={data.deleted.length === 0}
            >
              <span className="dov-tile-label">Smazané, drží se pro obnovu</span>
              <span className="dov-tile-value">{data.deleted.length}</span>
              <span className="dov-tile-note">{formatBytes(deletedBytes)} · rok v historii změn</span>
            </button>
          </section>

          <p className="dov-muted dov-note">
            Disk na Railway stojí {data.prices.railwayDiskUsdPerGbMonth.toLocaleString('cs-CZ')} $ za GB měsíčně, záložní kopie v
            Cloudflare R2 jsou zdarma do {data.prices.r2FreeGb} GB ({formatBytes(data.storage.offsiteFileBytes)} souborů
            a {formatBytes(data.storage.offsiteArchiveBytes)} záloh databáze). Dražší je paměť: kdyby Postgres držel všechny soubory
            v paměti, stálo by to {formatCzk(costs.memory)} měsíčně, proto je noční záloha už nečte. Kurz ČNB{' '}
            {data.cost.usdCzk.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} Kč/$.
          </p>

          {showDeleted && data.deleted.length > 0 && (
            <section className="dov-card">
              <div className="dov-card-head">
                <h2>Smazané soubory, které se drží pro obnovu</h2>
                <button type="button" className="dov-icon-button" onClick={() => setShowDeleted(false)} aria-label="Zavřít">
                  <X {...TAB_ICON} />
                </button>
              </div>
              <p className="dov-muted">
                Smazaný soubor jde vrátit v Bezpečnost a zálohy › Historie změn. Po roce ho historie změn sama odstraní.
              </p>
              <table className="dov-table dov-table--compact">
                <thead>
                  <tr>
                    <th>Soubor</th>
                    <th className="dov-num">Velikost</th>
                    <th>Smazáno</th>
                    <th>Kdo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.deleted.map((doc) => (
                    <tr key={doc.auditId}>
                      <td className="dov-filename">{doc.filename ?? '—'}</td>
                      <td className="dov-num">{formatBytes(doc.sizeBytes)}</td>
                      <td>{formatDate(doc.deletedAt)}</td>
                      <td>{doc.deletedBy ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <div className="dov-grid">
            <BarCard
              title="Podle typu"
              groups={byKind}
              total={totalBytes}
              activeKey={filters.kind === 'all' ? null : filters.kind}
              onPick={(key) => setFilter('kind', filters.kind === key ? 'all' : (key as FileKind))}
            />
            <BarCard
              title="Podle sekce"
              groups={bySection}
              total={totalBytes}
              activeKey={filters.section === 'all' ? null : filters.section}
              onPick={(key) => setFilter('section', filters.section === key ? 'all' : (key as DocumentSection))}
            />
            <BarCard
              title="Největší podle subjektu"
              groups={byOwner}
              total={totalBytes}
              activeKey={filters.owner}
              onPick={(key) => setFilter('owner', filters.owner === key ? null : key)}
            />
          </div>

          <section className="dov-card">
            <div className="dov-toolbar">
              <input
                type="search"
                className="dov-input dov-search"
                placeholder="Hledat soubor, složku, subjekt…"
                value={filters.query}
                onChange={(event) => setFilter('query', event.target.value)}
                aria-label="Hledat"
              />
              <select className="dov-input" value={filters.kind} onChange={(event) => setFilter('kind', event.target.value as FileKind | 'all')} aria-label="Typ">
                <option value="all">Všechny typy</option>
                {(Object.keys(KIND_LABELS) as FileKind[]).map((kind) => (
                  <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>
                ))}
              </select>
              <select className="dov-input" value={filters.section} onChange={(event) => setFilter('section', event.target.value as DocumentSection | 'all')} aria-label="Sekce">
                <option value="all">Všechny sekce</option>
                {(['public', 'projects', 'growth', 'future'] as DocumentSection[]).map((section) => (
                  <option key={section} value={section}>{SECTION_LABELS[section]}</option>
                ))}
              </select>
              <select className="dov-input" value={filters.state} onChange={(event) => setFilter('state', event.target.value as StateFilter)} aria-label="Stav">
                <option value="all">Aktivní i archiv</option>
                <option value="active">Jen aktivní</option>
                <option value="archived">Jen archiv</option>
              </select>
              <select className="dov-input" value={filters.minMb} onChange={(event) => setFilter('minMb', Number(event.target.value) as SizeFilter)} aria-label="Velikost">
                <option value={0}>Jakákoli velikost</option>
                <option value={1}>Od 1 MB</option>
                <option value={5}>Od 5 MB</option>
                <option value={20}>Od 20 MB</option>
              </select>
              {filtersActive && (
                <button type="button" className="dov-button dov-button--ghost" onClick={() => { setFilters(EMPTY_FILTERS); setShown(PAGE); }}>
                  <X {...TAB_ICON} />
                  Zrušit filtry
                </button>
              )}
            </div>
            <p className="dov-muted dov-count">
              {filesLabel(filtered.length)} · {formatBytes(filteredBytes)}
              {filtersActive && documents.length > 0 ? ` z ${formatBytes(totalBytes)}` : ''}
            </p>

            <div className="dov-table-wrap">
              <table className="dov-table">
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column.key} className={column.numeric ? 'dov-num' : undefined} aria-sort={sort.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className="dov-sort" onClick={() => toggleSort(column.key)}>
                          {column.label}
                          {sort.key === column.key && (sort.direction === 'asc' ? <ArrowUp {...TAB_ICON} size={12} /> : <ArrowDown {...TAB_ICON} size={12} />)}
                        </button>
                      </th>
                    ))}
                    <th className="dov-actions-head"><span className="dov-sr">Akce</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, shown).map((doc) => {
                    const duplicate = duplicates.byId.get(doc.id);
                    const share = totalBytes > 0 ? (doc.sizeBytes / totalBytes) * 100 : 0;
                    return (
                      <tr key={doc.id}>
                        <td data-label="Soubor">
                          <div className="dov-filename" title={doc.filename}>{doc.filename}</div>
                          <div className="dov-sub">
                            {doc.folder && <span>{doc.folder}</span>}
                            {doc.archivedAt && <span className="dov-badge">Archiv</span>}
                            {duplicate && <span className="dov-badge dov-badge--warn">{duplicate.ids.length}× stejný soubor</span>}
                            {doc.noteId != null && <span className="dov-badge">V poznámce</span>}
                          </div>
                        </td>
                        <td data-label="Typ">{KIND_LABELS[fileKind(doc.mimeType, doc.filename)]}</td>
                        <td data-label="Velikost" className="dov-num">
                          {formatBytes(doc.sizeBytes)}
                          <div className="dov-sub dov-num">{share >= 0.1 ? `${share.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %` : '< 0,1 %'}</div>
                        </td>
                        <td data-label="Patří k">
                          {doc.owner.exists ? (
                            <button type="button" className="dov-owner" onClick={() => openOwner(doc)} title="Otevřít profil">
                              {doc.owner.label}
                              <ExternalLink {...TAB_ICON} size={12} />
                            </button>
                          ) : (
                            <span className="dov-muted" title="Subjekt už neexistuje">{doc.owner.label} (smazán)</span>
                          )}
                          {doc.role && <div className="dov-sub">{ROLE_LABELS[doc.role]}</div>}
                        </td>
                        <td data-label="Sekce">{SECTION_LABELS[doc.section]}</td>
                        <td data-label="Nahráno">
                          {formatDate(doc.createdAt)}
                          {doc.uploadedBy && <div className="dov-sub">{doc.uploadedBy}</div>}
                        </td>
                        <td className="dov-actions">
                          <button type="button" className="dov-icon-button" onClick={() => void download(doc)} disabled={busyId === doc.id} aria-label={`Stáhnout ${doc.filename}`} title="Stáhnout">
                            <Download {...TAB_ICON} />
                          </button>
                          <button type="button" className="dov-icon-button dov-icon-button--danger" onClick={() => void remove(doc)} disabled={busyId === doc.id} aria-label={`Smazat ${doc.filename}`} title="Smazat">
                            <Trash2 {...TAB_ICON} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {sorted.length === 0 && <p className="dov-muted dov-empty">{documents.length ? 'Filtrům neodpovídá žádný soubor.' : 'Zatím tu nejsou žádné soubory.'}</p>}
            </div>
            {sorted.length > shown && (
              <button type="button" className="dov-button dov-more" onClick={() => setShown((value) => value + PAGE)}>
                Zobrazit další ({Math.min(PAGE, sorted.length - shown)} z {sorted.length - shown})
              </button>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function BarCard({ title, groups, total, activeKey, onPick }: {
  title: string;
  groups: Array<{ key: string; label: string; count: number; bytes: number }>;
  total: number;
  activeKey: string | null;
  onPick: (key: string) => void;
}) {
  const max = Math.max(1, ...groups.map((group) => group.bytes));
  return (
    <section className="dov-card">
      <div className="dov-card-head">
        <h2>{title}</h2>
      </div>
      {groups.length === 0 && <p className="dov-muted">Žádné soubory.</p>}
      <div className="dov-bars">
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            className={`dov-bar-row${activeKey === group.key ? ' is-active' : ''}`}
            onClick={() => onPick(group.key)}
            title={`${group.label}: ${filesLabel(group.count)}, ${formatBytes(group.bytes)}${total ? ` (${Math.round((group.bytes / total) * 100)} %)` : ''}. Kliknutím filtrujete.`}
          >
            <span className="dov-bar-label">{group.label}</span>
            <span className="dov-bar-track">
              <span className="dov-bar-fill" style={{ width: `${Math.max(2, (group.bytes / max) * 100)}%` }} />
            </span>
            <span className="dov-bar-value">{formatBytes(group.bytes)}</span>
            <span className="dov-bar-count">{group.count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

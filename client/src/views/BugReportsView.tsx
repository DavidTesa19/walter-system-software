import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext';
import BugReportDialog from '../bugs/BugReportDialog';
import type { BugReport, BugSeverity, BugStatus } from '../bugs/bugsApi';
import { SEVERITIES, SEVERITY_LABELS, STATUS_LABELS, bugsApi, formatDateTime, onBugsChanged } from '../bugs/bugsApi';
import '../bugs/Bugs.css';
import './BugReportsView.css';

type StatusFilter = 'open' | BugStatus | 'all';

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'open', label: 'Otevřené' },
  { id: 'new', label: 'Nové' },
  { id: 'in_progress', label: 'Řeší se' },
  { id: 'resolved', label: 'Vyřešené' },
  { id: 'wont_fix', label: 'Nebude se řešit' },
  { id: 'all', label: 'Vše' },
];

const SEVERITY_RANK: Record<BugSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const isOpen = (report: BugReport) => report.status === 'new' || report.status === 'in_progress';

const matchesStatus = (report: BugReport, filter: StatusFilter) =>
  filter === 'all' ? true : filter === 'open' ? isOpen(report) : report.status === filter;

const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const BugReportsView: React.FC = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [canTriage, setCanTriage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [severityFilter, setSeverityFilter] = useState<BugSeverity | ''>('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'severity'>('newest');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await bugsApi.list();
      setReports(result.reports);
      setCanTriage(result.canTriage);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hlášení se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return onBugsChanged(() => void load());
  }, [load]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(STATUS_FILTERS.map((item) => [item.id, 0])) as Record<StatusFilter, number>;
    reports.forEach((report) => STATUS_FILTERS.forEach((item) => matchesStatus(report, item.id) && (result[item.id] += 1)));
    return result;
  }, [reports]);

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    return reports
      .filter((report) => matchesStatus(report, statusFilter))
      .filter((report) => !severityFilter || report.severity === severityFilter)
      .filter((report) =>
        !needle ||
        normalize([report.title, report.description, report.reporterName, report.viewLabel, `#${report.id}`].filter(Boolean).join(' ')).includes(needle)
      )
      .sort((a, b) =>
        sort === 'severity'
          ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.localeCompare(a.createdAt)
          : b.createdAt.localeCompare(a.createdAt)
      );
  }, [query, reports, severityFilter, sort, statusFilter]);

  const save = async (report: BugReport, input: Parameters<typeof bugsApi.update>[1]) => {
    try {
      const saved = await bugsApi.update(report.id, input);
      setReports((list) => list.map((item) => (item.id === saved.id ? saved : item)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Změnu se nepodařilo uložit.');
    }
  };

  const remove = async (report: BugReport) => {
    if (!window.confirm(`Smazat hlášení #${report.id} „${report.title}“ i se snímky?`)) return;
    try {
      await bugsApi.remove(report.id);
      setReports((list) => list.filter((item) => item.id !== report.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hlášení se nepodařilo smazat.');
    }
  };

  return (
    <div className="bugs-view">
      <header className="bugs-header">
        <div>
          <span className="bugs-eyebrow">Ostatní</span>
          <h1>Hlášení chyb</h1>
          <p>Chyby nahlášené tlačítkem s broukem vpravo nahoře, se snímky, závažností a časem nahlášení.</p>
        </div>
        <button type="button" className="bug-btn bug-btn--primary" onClick={() => setReporting(true)}>
          Nahlásit chybu
        </button>
      </header>

      <div className="bugs-toolbar">
        <div className="bugs-filter-tabs" role="tablist" aria-label="Stav">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === item.id}
              className={statusFilter === item.id ? 'is-active' : ''}
              onClick={() => setStatusFilter(item.id)}
            >
              {item.label}
              <span className="bugs-filter-count">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <div className="bugs-toolbar-right">
          <input className="bug-input bugs-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hledat…" aria-label="Hledat" />
          <select className="bug-input bugs-select" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as BugSeverity | '')} aria-label="Závažnost">
            <option value="">Každá závažnost</option>
            {SEVERITIES.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          <select className="bug-input bugs-select" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Řazení">
            <option value="newest">Nejnovější</option>
            <option value="severity">Nejzávažnější</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bug-error" role="alert">
          {error}
        </div>
      )}

      <div className="bugs-list">
        {loading ? (
          <div className="bugs-empty">Načítám…</div>
        ) : visible.length === 0 ? (
          <div className="bugs-empty">{reports.length === 0 ? 'Zatím žádná nahlášená chyba.' : 'Žádné hlášení neodpovídá filtru.'}</div>
        ) : (
          visible.map((report) => (
            <BugReportCard
              key={report.id}
              report={report}
              expanded={expandedId === report.id}
              onToggle={() => setExpandedId((id) => (id === report.id ? null : report.id))}
              canTriage={canTriage}
              canDelete={user?.role === 'admin' || (report.reporterUserId === user?.id && report.status === 'new')}
              onSave={(input) => save(report, input)}
              onDelete={() => remove(report)}
            />
          ))
        )}
      </div>

      {reporting && <BugReportDialog viewId="bugs" viewLabel="Hlášení chyb" onClose={() => setReporting(false)} />}
    </div>
  );
};

interface BugReportCardProps {
  report: BugReport;
  expanded: boolean;
  onToggle: () => void;
  canTriage: boolean;
  canDelete: boolean;
  onSave: (input: Parameters<typeof bugsApi.update>[1]) => Promise<void>;
  onDelete: () => void;
}

const BugReportCard: React.FC<BugReportCardProps> = ({ report, expanded, onToggle, canTriage, canDelete, onSave, onDelete }) => {
  const [note, setNote] = useState(report.resolutionNote ?? '');
  useEffect(() => setNote(report.resolutionNote ?? ''), [report.resolutionNote]);

  return (
    <article className={`bugs-card${expanded ? ' is-expanded' : ''}${isOpen(report) ? '' : ' is-closed'}`}>
      <button type="button" className="bugs-card-summary" onClick={onToggle} aria-expanded={expanded}>
        <span className={`bug-severity-badge bug-severity--${report.severity}`}>
          <span className="bug-severity-dot" aria-hidden="true" />
          {SEVERITY_LABELS[report.severity]}
        </span>
        <span className="bugs-card-title">
          <span className="bugs-card-id">#{report.id}</span> {report.title}
        </span>
        <span className="bugs-card-meta">
          {report.screenshots.length > 0 && <span title="Snímky obrazovky">📷 {report.screenshots.length}</span>}
          <span>{report.reporterName ?? '—'}</span>
          <span>{formatDateTime(report.createdAt)}</span>
        </span>
        <span className={`bug-status-pill bug-status--${report.status}`}>{STATUS_LABELS[report.status]}</span>
      </button>

      {expanded && (
        <div className="bugs-card-detail">
          <div className="bugs-detail-main">
            {report.description ? <p className="bugs-description">{report.description}</p> : <p className="bug-hint">Bez popisu.</p>}
            {report.screenshots.length > 0 && <BugScreenshots report={report} />}
            <dl className="bugs-facts">
              <dt>Nahlášeno</dt>
              <dd>{formatDateTime(report.createdAt)} · {report.reporterName ?? '—'}</dd>
              <dt>Sekce</dt>
              <dd>{report.viewLabel ?? '—'}</dd>
              {report.viewport && (<><dt>Okno</dt><dd>{report.viewport}</dd></>)}
              {report.userAgent && (<><dt>Prohlížeč</dt><dd className="bugs-ua">{report.userAgent}</dd></>)}
              {report.resolvedAt && (<><dt>Uzavřeno</dt><dd>{formatDateTime(report.resolvedAt)}</dd></>)}
            </dl>
          </div>

          <aside className="bugs-detail-side">
            {canTriage ? (
              <>
                <label className="bug-field">
                  <span>Stav</span>
                  <select className="bug-input" value={report.status} onChange={(event) => void onSave({ status: event.target.value as BugStatus })}>
                    {(Object.keys(STATUS_LABELS) as BugStatus[]).map((status) => (
                      <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                    ))}
                  </select>
                </label>
                <label className="bug-field">
                  <span>Závažnost</span>
                  <select className="bug-input" value={report.severity} onChange={(event) => void onSave({ severity: event.target.value as BugSeverity })}>
                    {SEVERITIES.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="bug-field">
                  <span>Poznámka k řešení</span>
                  <textarea
                    className="bug-input bug-textarea"
                    rows={3}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    onBlur={() => note.trim() !== (report.resolutionNote ?? '') && void onSave({ resolutionNote: note.trim() || null })}
                    placeholder="Co se s tím udělalo (uloží se po kliknutí mimo)"
                  />
                </label>
              </>
            ) : (
              report.resolutionNote && (
                <div className="bug-field">
                  <span>Poznámka k řešení</span>
                  <p className="bugs-description">{report.resolutionNote}</p>
                </div>
              )
            )}
            {canDelete && (
              <button type="button" className="bug-btn bug-btn--danger" onClick={onDelete}>
                Smazat hlášení
              </button>
            )}
          </aside>
        </div>
      )}
    </article>
  );
};

/** Thumbnails, fetched with the user's token; a click shows the full picture. */
const BugScreenshots: React.FC<{ report: BugReport }> = ({ report }) => {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);

  // By id, not by array: saving a status change hands back a new report
  // object, which must not refetch every picture.
  const shotIds = report.screenshots.map((shot) => shot.id).join(',');

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    shotIds.split(',').filter(Boolean).map(Number).forEach((shotId) => {
      bugsApi
        .screenshot(report.id, shotId)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          created.push(url);
          if (!cancelled) setUrls((current) => ({ ...current, [shotId]: url }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [report.id, shotIds]);

  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <div className="bug-shots bug-shots--large">
        {report.screenshots.map((shot) => (
          <button key={shot.id} type="button" className="bug-shot bug-shot--button" onClick={() => setOpen(shot.id)} title={shot.filename}>
            {urls[shot.id] ? <img src={urls[shot.id]} alt={shot.filename} /> : <span className="bug-hint">Načítám…</span>}
          </button>
        ))}
      </div>
      {open !== null && urls[open] &&
        createPortal(
          <div className="bug-lightbox" onClick={() => setOpen(null)} role="dialog" aria-label="Snímek obrazovky">
            <img src={urls[open]} alt="" />
          </div>,
          document.body
        )}
    </>
  );
};

export default BugReportsView;

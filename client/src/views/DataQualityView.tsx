import { useCallback, useEffect, useMemo, useState } from 'react';
import { canAccessGrowthSystem, canAccessProjectsSystem, canAccessStandardSystem, useAuth } from '../auth/AuthContext';
import { analyse, ROLE_LABELS, SECTION_LABELS } from '../dataQuality/dataQuality';
import type { Check, RecordRef, Role, Section, SectionData, Severity } from '../dataQuality/dataQuality';
import type { JarvisOpenAction } from '../jarvis/jarvisApi';
import { apiGet } from '../utils/api';
import './DataQualityView.css';

const ROLES: Role[] = ['client', 'partner', 'tiper'];
// A long list shows this many findings until "Zobrazit vše".
const COLLAPSED = 12;

const SEVERITY_LABELS: Record<Severity, string> = { error: 'Chyba', warning: 'Ke kontrole', info: 'Upozornění' };

const prefix = (section: Section) => (section === 'public' ? '/api' : `/api/${section}`);

type Row = Record<string, unknown>;

// Every subject and zakázka of the sections this user can open; a section
// that fails to load is reported and left out rather than sinking the report.
async function loadSections(sections: Section[]): Promise<{ data: SectionData[]; failed: string[] }> {
  const failed: string[] = [];
  const blocks = await Promise.all(
    sections.flatMap((section) =>
      ROLES.map(async (role) => {
        const [subjects, commissions] = await Promise.all([
          apiGet<Row[]>(`${prefix(section)}/${role}-entities`).catch(() => null),
          apiGet<Row[]>(`${prefix(section)}/${role}-commissions`).catch(() => null),
        ]);
        if (!subjects || !commissions) failed.push(`${SECTION_LABELS[section]} · ${ROLE_LABELS[role]}`);
        return { section, role, subjects: subjects ?? [], commissions: commissions ?? [] };
      })
    )
  );
  return { data: blocks, failed };
}

export default function DataQualityView({ onOpenRecord }: { onOpenRecord: (action: JarvisOpenAction) => void }) {
  const { user } = useAuth();
  const accessScope = user?.accessScope;
  const sections = useMemo(() => {
    const allowed: Section[] = [];
    if (canAccessStandardSystem(accessScope)) allowed.push('public');
    if (canAccessProjectsSystem(accessScope)) allowed.push('projects');
    if (canAccessGrowthSystem(accessScope)) allowed.push('growth');
    return allowed;
  }, [accessScope]);

  const [checks, setChecks] = useState<Check[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await loadSections(sections);
    setChecks(analyse(result.data));
    setFailed(result.failed);
    setCheckedAt(new Date());
    setLoading(false);
  }, [sections]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (record: RecordRef) =>
    onOpenRecord({ type: 'open_record', ...record });

  const total = checks?.reduce((sum, check) => sum + check.findings.length, 0) ?? 0;

  return (
    <div className="dq-view">
      <header className="dq-header">
        <div>
          <span className="dq-eyebrow">Analýza</span>
          <h1>Kvalita dat</h1>
          <p className="dq-muted">
            Kontrola subjektů a zakázek v sekcích, které máte otevřené ({sections.map((section) => SECTION_LABELS[section]).join(', ') || 'žádné'}).
            Archiv se nekontroluje. Kliknutím záznam otevřete a opravíte v jeho profilu.
          </p>
        </div>
        <button type="button" className="dq-button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Kontroluji…' : 'Zkontrolovat znovu'}
        </button>
      </header>

      {failed.length > 0 && (
        <div className="dq-callout">Nepodařilo se načíst: {failed.join(', ')}. Tyto části v přehledu chybí.</div>
      )}

      {checks && (
        <>
          <div className="dq-summary">
            {checks.map((check) => (
              <a key={check.id} href={`#dq-${check.id}`} className={`dq-chip dq-chip--${check.findings.length ? check.severity : 'ok'}`}>
                <strong>{check.findings.length}</strong> {check.title}
              </a>
            ))}
          </div>
          <p className="dq-muted">
            {total === 0 ? 'Vše v pořádku: žádný nález.' : `Celkem ${total} nálezů.`}
            {checkedAt && ` Zkontrolováno ${checkedAt.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}.`}
          </p>

          {checks
            .filter((check) => check.findings.length > 0)
            .map((check) => {
              const showAll = expanded.has(check.id);
              const shown = showAll ? check.findings : check.findings.slice(0, COLLAPSED);
              return (
                <section key={check.id} id={`dq-${check.id}`} className="dq-section">
                  <div className="dq-section-head">
                    <h2>{check.title}</h2>
                    <span className={`dq-badge dq-badge--${check.severity}`}>
                      {SEVERITY_LABELS[check.severity]} · {check.findings.length}
                    </span>
                  </div>
                  <p className="dq-muted">{check.description}</p>
                  <ul className="dq-list">
                    {shown.map((finding) => (
                      <li key={finding.key} className="dq-item">
                        <div className="dq-records">
                          {finding.records.map((record) => (
                            <button
                              key={`${record.kind}-${record.id}`}
                              type="button"
                              className="dq-record"
                              onClick={() => open(record)}
                              title="Otevřít v profilu"
                            >
                              {record.label}
                            </button>
                          ))}
                        </div>
                        <span className="dq-muted">{finding.detail}</span>
                      </li>
                    ))}
                  </ul>
                  {check.findings.length > COLLAPSED && (
                    <button
                      type="button"
                      className="dq-link"
                      onClick={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(check.id)) next.delete(check.id);
                          else next.add(check.id);
                          return next;
                        })
                      }
                    >
                      {showAll ? 'Zobrazit méně' : `Zobrazit vše (${check.findings.length})`}
                    </button>
                  )}
                </section>
              );
            })}
        </>
      )}

      {!checks && loading && <div className="dq-muted">Kontroluji data…</div>}
    </div>
  );
}

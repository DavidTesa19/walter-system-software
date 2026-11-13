import { useEffect, useMemo, useState } from 'react';
import { Trash2, FolderInput, X } from 'lucide-react';
import { apiGet, apiPost } from '../utils/api';
import { BUTTON_ICON, TAB_ICON } from '../ui/icons';
import { filesLabel, formatBytes, isOrphan, ownerKey, SECTION_LABELS } from './documentsOverview';
import type { OverviewDocument } from './documentsOverview';

// Analýza › Dokumenty › Soubory bez subjektu: the files of a deleted subject
// (or one only in a pre-2026 table), a former subject per row. They can be
// moved to a subject (an existing one, or a new one filed in its archive) or
// deleted. The server (documents/overview.js, /api/documents/orphans/*) refuses
// any key that has a subject again; every change goes into the change log.

type TargetSection = 'public' | 'projects' | 'growth';
type TargetRole = 'client' | 'partner' | 'tiper';

const ROLE_NAMES: Record<TargetRole, string> = { client: 'Klient', partner: 'Partner', tiper: 'Tipař' };
const listPath = (section: TargetSection, role: TargetRole) =>
  `${section === 'public' ? '/api' : `/api/${section}`}/${role}-entities`;
const documentType = (section: TargetSection, role: TargetRole) =>
  `${section === 'public' ? '' : section === 'projects' ? 'project-' : 'growth-'}${role}s`;

interface SubjectRow {
  id: number;
  entity_id?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  status?: string;
}
const subjectLabel = (row: SubjectRow) => {
  const person = [row.first_name, row.last_name].filter((part) => part && part.trim()).join(' ');
  return [row.entity_id, person || row.company_name].filter(Boolean).join(' · ') || `#${row.id}`;
};

interface Group {
  key: string;
  label: string;
  section: OverviewDocument['section'];
  legacy: boolean;
  files: OverviewDocument[];
  bytes: number;
  folders: string[];
  copies: number; // files whose kept copy (see keeperOfSha) belongs to another owner
}

const formerLabel = (count: number) =>
  `${count} ${count === 1 ? 'bývalý subjekt' : count >= 2 && count <= 4 ? 'bývalé subjekty' : 'bývalých subjektů'}`;

const sortKey = (key: string) => {
  const [type, id] = key.split(':');
  return `${type}:${id.padStart(6, '0')}`;
};

export default function OrphansCard({ documents, onChanged }: { documents: OverviewDocument[]; onChanged: () => Promise<void> }) {
  const groups = useMemo<Group[]>(() => {
    // One keeper per file content: a copy under a live subject first, then one
    // sorted into a folder, then the newest. A file is a spare copy only when
    // its keeper belongs to another owner, so two former subjects holding the
    // same files never both count as copies.
    const rank = (doc: OverviewDocument) => [isOrphan(doc) ? 0 : 1, doc.folder ? 1 : 0, doc.id] as const;
    const better = (a: OverviewDocument, b: OverviewDocument) => {
      const [x, y] = [rank(a), rank(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    };
    const keeperOfSha = new Map<string, OverviewDocument>();
    for (const doc of documents) {
      if (!doc.sha256 || doc.sizeBytes === 0) continue;
      const current = keeperOfSha.get(doc.sha256);
      if (!current || better(doc, current) > 0) keeperOfSha.set(doc.sha256, doc);
    }
    const map = new Map<string, Group>();
    for (const doc of documents.filter(isOrphan)) {
      const key = ownerKey(doc);
      const group = map.get(key) ?? { key, label: doc.owner.label, section: doc.section, legacy: doc.owner.state === 'legacy', files: [], bytes: 0, folders: [], copies: 0 };
      group.files.push(doc);
      group.bytes += doc.sizeBytes;
      const top = doc.folder.split(' / ')[0];
      if (top && !group.folders.includes(top)) group.folders.push(top);
      const keeper = doc.sha256 ? keeperOfSha.get(doc.sha256) : undefined;
      if (keeper && ownerKey(keeper) !== key) group.copies += 1;
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => sortKey(a.key).localeCompare(sortKey(b.key)));
  }, [documents]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'none' | 'move' | 'delete'>('none');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Move target.
  const [targetKind, setTargetKind] = useState<'new' | 'existing'>('new');
  const [section, setSection] = useState<TargetSection>('projects');
  const [role, setRole] = useState<TargetRole>('client');
  const [newName, setNewName] = useState('Archiv podkladů 2026');
  const [subjects, setSubjects] = useState<SubjectRow[] | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [repairNames, setRepairNames] = useState(true);

  // Keys that disappeared (moved or deleted) leave the selection.
  useEffect(() => {
    setSelected((current) => new Set([...current].filter((key) => groups.some((group) => group.key === key))));
  }, [groups]);

  useEffect(() => {
    if (mode !== 'move' || targetKind !== 'existing') return;
    let cancelled = false;
    setSubjects(null);
    setSubjectId(null);
    apiGet<SubjectRow[]>(listPath(section, role))
      .then((rows) => { if (!cancelled) setSubjects(rows ?? []); })
      .catch(() => { if (!cancelled) setSubjects([]); });
    return () => { cancelled = true; };
  }, [mode, targetKind, section, role]);

  // After the last move or delete the list is empty, but the result stays shown.
  if (groups.length === 0) {
    return message ? (
      <section className="dov-card dov-orphans" aria-label="Soubory bez subjektu">
        <div className="dov-success" role="status">{message} Žádné další soubory bez subjektu.</div>
      </section>
    ) : null;
  }

  const chosen = groups.filter((group) => selected.has(group.key));
  const chosenFiles = chosen.reduce((sum, group) => sum + group.files.length, 0);
  const chosenBytes = chosen.reduce((sum, group) => sum + group.bytes, 0);
  const toggle = (key: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const done = await work();
      setMessage(done);
      setMode('none');
      setSelected(new Set());
      await onChanged();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Akce se nepodařila.');
    } finally {
      setBusy(false);
    }
  };

  const move = () =>
    run(async () => {
      let target: { entityType: string; entityId: number; label: string };
      if (targetKind === 'new') {
        const name = newName.trim();
        if (!name) throw new Error('Zadejte název nového subjektu.');
        // Filed straight into the section's archive (status "archived").
        const created = await apiPost<SubjectRow>(listPath(section, role), { company_name: name, status: 'archived' });
        target = { entityType: documentType(section, role), entityId: Number(created.id), label: subjectLabel(created) };
      } else {
        const subject = subjects?.find((row) => row.id === subjectId);
        if (!subject) throw new Error('Vyberte cílový subjekt.');
        target = { entityType: documentType(section, role), entityId: subject.id, label: subjectLabel(subject) };
      }
      const result = await apiPost<{ moved: number; renamed: number; wrappers: number }>('/api/documents/orphans/move', {
        owners: chosen.map((group) => group.key),
        target: { entityType: target.entityType, entityId: target.entityId },
        repairNames,
      });
      return `Přesunuto ${filesLabel(result.moved)} k ${target.label}${result.renamed ? `, opraveno ${result.renamed} názvů` : ''}.`;
    });

  const remove = () =>
    run(async () => {
      const result = await apiPost<{ deleted: number }>('/api/documents/orphans/delete', { owners: chosen.map((group) => group.key) });
      return `Smazáno ${filesLabel(result.deleted)}. Rok se drží v historii změn, odkud jdou vrátit.`;
    });

  const allCopies = groups.filter((group) => group.files.length > 0 && group.copies === group.files.length);

  return (
    <section className="dov-card dov-orphans" aria-label="Soubory bez subjektu">
      <div className="dov-card-head">
        <h2>Soubory bez subjektu</h2>
        <span className="dov-muted">{formerLabel(groups.length)}</span>
      </div>
      <p className="dov-muted">
        Soubory smazaných subjektů (nebo záznamů ze staré tabulky), které žádný profil neukazuje. Vyberte je a přesuňte k
        subjektu, nebo smažte. Složky zůstanou, jak jsou; vše jde vrátit v Bezpečnost a zálohy › Historie změn.
      </p>

      <div className="dov-orphan-tools">
        <button type="button" className="dov-button dov-button--ghost" onClick={() => setSelected(new Set(groups.map((group) => group.key)))}>Vybrat vše</button>
        {allCopies.length > 0 && (
          <button
            type="button"
            className="dov-button dov-button--ghost"
            onClick={() => setSelected(new Set(allCopies.map((group) => group.key)))}
            title="Bývalé subjekty, jejichž soubory jsou všechny uložené ještě jinde"
          >
            Vybrat jen kopie ({allCopies.length})
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" className="dov-button dov-button--ghost" onClick={() => setSelected(new Set())}>
            <X {...TAB_ICON} />
            Zrušit výběr
          </button>
        )}
        <span className="dov-orphan-spacer" />
        <button type="button" className="dov-button" disabled={chosen.length === 0 || busy} onClick={() => setMode(mode === 'move' ? 'none' : 'move')}>
          <FolderInput {...BUTTON_ICON} />
          Přesunout…
        </button>
        <button type="button" className="dov-button dov-button--danger" disabled={chosen.length === 0 || busy} onClick={() => setMode(mode === 'delete' ? 'none' : 'delete')}>
          <Trash2 {...BUTTON_ICON} />
          Smazat…
        </button>
      </div>

      {message && <div className="dov-success" role="status">{message}</div>}
      {error && <div className="dov-warning" role="alert">{error}</div>}

      {mode === 'move' && chosen.length > 0 && (
        <div className="dov-orphan-form">
          <strong>Přesunout {filesLabel(chosenFiles)} ({formatBytes(chosenBytes)}) · {formerLabel(chosen.length)}</strong>
          <div className="dov-orphan-row">
            <label><input type="radio" checked={targetKind === 'new'} onChange={() => setTargetKind('new')} /> Nový subjekt, uložený v archivu</label>
            <label><input type="radio" checked={targetKind === 'existing'} onChange={() => setTargetKind('existing')} /> Existující subjekt</label>
          </div>
          <div className="dov-orphan-row">
            <select className="dov-input" value={section} onChange={(event) => setSection(event.target.value as TargetSection)} aria-label="Sekce">
              {(['projects', 'public', 'growth'] as TargetSection[]).map((value) => <option key={value} value={value}>{SECTION_LABELS[value]}</option>)}
            </select>
            <select className="dov-input" value={role} onChange={(event) => setRole(event.target.value as TargetRole)} aria-label="Role">
              {(Object.keys(ROLE_NAMES) as TargetRole[]).map((value) => <option key={value} value={value}>{ROLE_NAMES[value]}</option>)}
            </select>
            {targetKind === 'new' ? (
              <input className="dov-input dov-search" value={newName} onChange={(event) => setNewName(event.target.value)} aria-label="Název nového subjektu" maxLength={200} />
            ) : (
              <select className="dov-input dov-search" value={subjectId ?? ''} onChange={(event) => setSubjectId(Number(event.target.value) || null)} aria-label="Cílový subjekt" disabled={!subjects}>
                <option value="">{subjects ? (subjects.length ? 'Vyberte subjekt…' : 'V této sekci žádné subjekty nejsou') : 'Načítám…'}</option>
                {(subjects ?? []).map((row) => <option key={row.id} value={row.id}>{subjectLabel(row)}{row.status === 'archived' ? ' (archiv)' : ''}</option>)}
              </select>
            )}
          </div>
          <label className="dov-orphan-check">
            <input type="checkbox" checked={repairNames} onChange={(event) => setRepairNames(event.target.checked)} />
            Opravit poškozená jména souborů („RuskaÌ LOI“ → „Ruská LOI“)
          </label>
          <p className="dov-muted">
            Každý bývalý subjekt dostane u cíle svou složku (jeho vlastní, nebo novou se jménem jeho složek), takže se soubory nepomíchají.
          </p>
          <div className="dov-orphan-row">
            <button type="button" className="dov-button dov-button--primary" disabled={busy} onClick={() => void move()}>
              {busy ? 'Přesouvám…' : 'Přesunout'}
            </button>
            <button type="button" className="dov-button dov-button--ghost" onClick={() => setMode('none')}>Zrušit</button>
          </div>
        </div>
      )}

      {mode === 'delete' && chosen.length > 0 && (
        <div className="dov-orphan-form dov-orphan-form--danger">
          <strong>Smazat {filesLabel(chosenFiles)} ({formatBytes(chosenBytes)}) · {formerLabel(chosen.length)}?</strong>
          <p className="dov-muted">
            Zmizí i jejich složky. Soubory se rok drží v historii změn a jdou vrátit; místo na disku se uvolní až potom.
          </p>
          <div className="dov-orphan-row">
            <button type="button" className="dov-button dov-button--danger-solid" disabled={busy} onClick={() => void remove()}>
              {busy ? 'Mažu…' : 'Smazat'}
            </button>
            <button type="button" className="dov-button dov-button--ghost" onClick={() => setMode('none')}>Zrušit</button>
          </div>
        </div>
      )}

      <div className="dov-table-wrap">
        <table className="dov-table dov-table--compact dov-orphan-table">
          <thead>
            <tr>
              <th aria-label="Vybrat" />
              <th>Bývalý subjekt</th>
              <th>Složky</th>
              <th className="dov-num">Soubory</th>
              <th className="dov-num">Velikost</th>
              <th className="dov-num">Kopie</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.key} className={selected.has(group.key) ? 'is-selected' : undefined} onClick={() => toggle(group.key)}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(group.key)}
                    onChange={() => toggle(group.key)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Vybrat ${group.label}`}
                  />
                </td>
                <td>
                  <span className="dov-orphan">{group.label.replace(/^Smazaný subjekt · /, '')}</span>
                  {group.legacy && <span className="dov-badge"> stará tabulka</span>}
                </td>
                <td className="dov-orphan-folders" title={group.folders.join(', ')}>
                  {group.folders.length ? group.folders.slice(0, 3).join(', ') + (group.folders.length > 3 ? ` +${group.folders.length - 3}` : '') : '—'}
                </td>
                <td className="dov-num">{group.files.length}</td>
                <td className="dov-num">{formatBytes(group.bytes)}</td>
                <td className="dov-num" title="Soubory, jejichž ponechaná kopie je u jiného subjektu (přednost má subjekt, který existuje, pak kopie ve složce)">
                  {group.copies ? `${group.copies}/${group.files.length}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

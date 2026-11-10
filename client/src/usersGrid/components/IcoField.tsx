import { useEffect, useMemo, useRef, useState } from 'react';
import { aresUrl, checkIco, isValidIco, lookupAresCompany } from '../ico';
import type { AresCompany } from '../ico';
import { applyAresFill, planAresFill, type AresFillChange, type AresFillSource } from '../aresFill';
import './IcoField.css';

/** "Doplnit z ARES" in the profile: the subject's current values and the save. */
export interface AresFillConfig {
  source: AresFillSource | null | undefined;
  onApply: (updates: Record<string, string | null>) => void;
}

// The changes ARES would make, each with a tick box: filling an empty field is
// ticked, anything that replaces or adds to what is there is not.
function AresFillPanel({ company, fill, onDone }: { company: AresCompany; fill: AresFillConfig; onDone: () => void }) {
  const plan = useMemo(() => planAresFill(company, fill.source), [company, fill.source]);
  const [selected, setSelected] = useState<Set<AresFillChange['id']>>(
    () => new Set(plan.changes.filter((change) => change.preselected).map((change) => change.id)),
  );

  const toggle = (id: AresFillChange['id']) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = () => {
    if (!fill.source) return;
    const updates = applyAresFill(plan, selected, fill.source);
    if (updates) fill.onApply(updates);
    onDone();
  };

  if (plan.changes.length === 0) {
    return <div className="ico-fill ico-fill--done">Společnost i sídlo už odpovídají ARES.</div>;
  }

  return (
    <div className="ico-fill" role="group" aria-label="Doplnit z ARES">
      {plan.changes.map((change) => (
        <label key={change.id} className="ico-fill-row">
          <input type="checkbox" checked={selected.has(change.id)} onChange={() => toggle(change.id)} />
          <span className="ico-fill-text">
            <span className="ico-fill-label">
              {change.label} <span className="ico-fill-action">({change.action})</span>
            </span>
            {change.from && <span className="ico-fill-from">{change.from}</span>}
            <span className="ico-fill-to">{change.to}</span>
          </span>
        </label>
      ))}
      <div className="ico-fill-actions">
        <button type="button" className="ico-fill-button ico-fill-button--primary" disabled={selected.size === 0} onClick={apply}>
          Uložit vybrané
        </button>
        <button type="button" className="ico-fill-button" onClick={onDone}>
          Zrušit
        </button>
      </div>
    </div>
  );
}

// The IČO field of a subject's profile (and of the create form): edited like
// the panel's other text fields, but only a valid IČO is saved, and under the
// number a card shows what the ARES business register says about it.

const STATUS_CLASS: Record<AresCompany['stav'], string> = {
  'aktivní': 'ico-ares-status--active',
  'v likvidaci': 'ico-ares-status--warning',
  'zaniklý': 'ico-ares-status--gone',
  'neaktivní': 'ico-ares-status--gone',
};

type Lookup =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'found'; company: AresCompany }
  | { state: 'error'; message: string };

function AresCard({ ico, fill }: { ico: string; fill?: AresFillConfig }) {
  const [lookup, setLookup] = useState<Lookup>({ state: 'loading' });
  const [filling, setFilling] = useState(false);
  const hasChanges = useMemo(
    () => Boolean(fill && lookup.state === 'found' && planAresFill(lookup.company, fill.source).changes.length > 0),
    [fill, lookup],
  );

  useEffect(() => {
    let current = true;
    setLookup({ state: 'loading' });
    lookupAresCompany(ico)
      .then((company) => current && setLookup({ state: 'found', company }))
      .catch((error: unknown) => current && setLookup({ state: 'error', message: error instanceof Error ? error.message : 'ARES teď neodpovídá.' }));
    return () => {
      current = false;
    };
  }, [ico]);

  if (lookup.state === 'loading') {
    return <div className="ico-ares ico-ares--muted">Ověřuji v ARES…</div>;
  }
  if (lookup.state === 'error' || lookup.state === 'idle') {
    return (
      <div className="ico-ares ico-ares--warning">
        {lookup.state === 'error' ? lookup.message : ''}{' '}
        <a href={aresUrl(ico)} target="_blank" rel="noreferrer">Otevřít ARES ↗</a>
      </div>
    );
  }

  const { company } = lookup;
  return (
    <div className="ico-ares">
      <div className="ico-ares-head">
        <strong className="ico-ares-name">{company.nazev}</strong>
        <span className={`ico-ares-status ${STATUS_CLASS[company.stav] ?? ''}`}>{company.stav}</span>
      </div>
      {company.sidlo && <div className="ico-ares-line">{company.sidlo}</div>}
      <div className="ico-ares-line ico-ares-meta">
        {[company.pravni_forma, company.dic ? `DIČ ${company.dic}` : null, company.platce_dph ? 'plátce DPH' : null, company.zanik ? `zanikl ${new Date(company.zanik).toLocaleDateString('cs-CZ')}` : null]
          .filter(Boolean)
          .join(' · ')}
      </div>
      <div className="ico-ares-foot">
        <a className="ico-ares-link" href={company.odkaz || aresUrl(ico)} target="_blank" rel="noreferrer">
          Podle ARES ↗
        </a>
        {fill && hasChanges && !filling && (
          <button type="button" className="ico-fill-open" onClick={() => setFilling(true)}>
            Doplnit z ARES
          </button>
        )}
      </div>
      {fill && filling && <AresFillPanel company={company} fill={fill} onDone={() => setFilling(false)} />}
    </div>
  );
}

// The create form's IČO input: the draft keeps whatever is typed (it is
// checked again on submit); a wrong number is pointed out once the user leaves
// the field, and a valid one shows its ARES card straight away.
export function DraftIcoInput({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [touched, setTouched] = useState(false);
  const check = checkIco(value);
  const showError = !check.ok && (touched || value.replace(/\s+/g, '').length >= 8);
  return (
    <div className={`ico-field${showError ? ' ico-field--invalid' : ''}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="editable-input"
        value={value}
        maxLength={12}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setTouched(true)}
        placeholder="8 číslic"
        aria-invalid={showError}
      />
      {showError && !check.ok && <div className="ico-field-error" role="alert">{check.error}</div>}
      {check.ok && check.value && <AresCard ico={check.value} />}
    </div>
  );
}

interface IcoFieldProps {
  value: string | null;
  placeholder?: string;
  onSave: (value: string | null) => void;
  /** The profile's "Doplnit z ARES" (not in the create form). */
  fill?: AresFillConfig;
}

export default function IcoField({ value, placeholder, onSave, fill }: IcoFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setDraft(value ?? '');
    setError(null);
    setEditing(true);
  };

  const commit = () => {
    const check = checkIco(draft);
    if (!check.ok) {
      // Stay in the field: an invalid number is never saved.
      setError(check.error);
      return;
    }
    setEditing(false);
    setError(null);
    if (check.value !== (value || null)) onSave(check.value);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setDraft(value ?? '');
  };

  const stored = value && isValidIco(value) ? value : null;

  return (
    <div className="ico-field">
      {editing ? (
        <div className={`editable-field editing${error ? ' ico-field--invalid' : ''}`}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className="editable-input"
            value={draft}
            maxLength={12}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError(null);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
              }
            }}
            placeholder={placeholder ?? '8 číslic'}
            aria-invalid={Boolean(error)}
          />
        </div>
      ) : (
        <div className="editable-field readonly" onClick={startEdit} title="Kliknutím upravit">
          <span className="field-value">{value ? value : <span className="field-empty">—</span>}</span>
          <span className="edit-icon">✎</span>
        </div>
      )}
      {error && editing && <div className="ico-field-error" role="alert">{error}</div>}
      {!editing && stored && <AresCard ico={stored} fill={fill} />}
    </div>
  );
}

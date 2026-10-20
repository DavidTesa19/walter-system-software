import { useEffect, useRef, useState } from 'react';
import { aresUrl, checkIco, isValidIco, lookupAresCompany } from '../ico';
import type { AresCompany } from '../ico';
import './IcoField.css';

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

function AresCard({ ico }: { ico: string }) {
  const [lookup, setLookup] = useState<Lookup>({ state: 'loading' });

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
      <a className="ico-ares-link" href={company.odkaz || aresUrl(ico)} target="_blank" rel="noreferrer">
        Podle ARES ↗
      </a>
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
}

export default function IcoField({ value, placeholder, onSave }: IcoFieldProps) {
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
      {!editing && stored && <AresCard ico={stored} />}
    </div>
  );
}

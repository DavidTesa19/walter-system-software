import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Currency, HistoryEntry, HistoryService, PaymentInput } from './financeApi';

interface PaymentModalProps {
  /** null adds a new payment. */
  entry: HistoryEntry | null;
  start: string;
  categories: Record<string, string>;
  services: HistoryService[];
  onClose: () => void;
  onSave: (input: PaymentInput) => Promise<void>;
}

const todayIso = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());

const parseNumber = (text: string) => Number(text.replace(/\s/g, '').replace(',', '.'));
const formatNumber = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value).replace('.', ','));

export default function PaymentModal({ entry, start, categories, services, onClose, onSave }: PaymentModalProps) {
  const [paidOn, setPaidOn] = useState(entry?.date ?? todayIso());
  const [expenseId, setExpenseId] = useState<number | null>(entry?.expenseId ?? null);
  const [category, setCategory] = useState(entry?.category ?? 'other');
  const [description, setDescription] = useState(entry?.kind === 'manual' ? entry.description ?? '' : entry?.description ?? '');
  const [amountText, setAmountText] = useState(formatNumber(entry?.amount ?? null));
  const [currency, setCurrency] = useState<Currency>((entry?.currency as Currency) ?? 'CZK');
  const [czkText, setCzkText] = useState(entry?.exactCzk ? formatNumber(entry.czk) : '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const service = services.find((item) => item.id === expenseId) ?? null;

  // Picking a service brings its category, currency and usual amount along.
  const chooseService = (id: number | null) => {
    setExpenseId(id);
    const chosen = services.find((item) => item.id === id);
    if (!chosen) return;
    setCategory(chosen.category);
    if (!entry) {
      setCurrency(chosen.currency);
      if (!amountText && chosen.amount > 0) setAmountText(formatNumber(chosen.amount));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = parseNumber(amountText);
    const czk = czkText.trim() ? parseNumber(czkText) : null;
    if (!Number.isFinite(amount) || amount < 0) return setError('Částka musí být kladné číslo.');
    if (czk !== null && (!Number.isFinite(czk) || czk < 0)) return setError('Částka v Kč musí být kladné číslo.');
    if (!expenseId && !description.trim()) return setError('Vyberte službu, nebo vyplňte popis platby.');
    if (paidOn < `${start}-01`) return setError(`Historie začíná ${start.split('-').reverse().join('/')}.`);
    setSaving(true);
    setError(null);
    try {
      await onSave({
        paidOn,
        expenseId,
        category,
        description: description.trim() || null,
        amount,
        currency,
        amountCzk: currency === 'CZK' ? null : czk,
        note: note.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Platbu se nepodařilo uložit.');
      setSaving(false);
    }
  };

  return (
    <div className="finance-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="finance-modal" role="dialog" aria-modal="true" aria-label={entry ? 'Upravit platbu' : 'Nová platba'} onSubmit={submit}>
        <div className="finance-modal-header">
          <div>
            <h3>{entry ? 'Upravit platbu' : 'Přidat platbu'}</h3>
            {entry?.kind === 'recurring' && <span className="finance-muted">Měsíc doplněný z pevné ceny služby — úprava platí jen pro tento měsíc.</span>}
          </div>
          <button type="button" className="finance-icon-button" onClick={onClose} aria-label="Zavřít">×</button>
        </div>

        <div className="finance-modal-body">
          {error && <div className="finance-callout finance-callout--error">{error}</div>}
          {service?.billedByConnector && (
            <div className="finance-callout finance-callout--warning">
              Služba „{service.name}“ je napojená — její faktury se do historie doplňují samy. Ručně přidaná platba se započítá navíc.
            </div>
          )}

          <div className="finance-form-grid">
            <label className="finance-field">
              Datum platby
              <input type="date" value={paidOn} min={`${start}-01`} onChange={(event) => setPaidOn(event.target.value)} required />
            </label>
            <label className="finance-field">
              Služba
              <select value={expenseId ?? ''} onChange={(event) => chooseService(event.target.value ? Number(event.target.value) : null)}>
                <option value="">— jiná, bez vazby na službu —</option>
                {services.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="finance-field">
              Kategorie
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {Object.entries(categories).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <label className="finance-field">
              Částka
              <span className="finance-inline">
                <input inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} required autoFocus={!entry} />
                <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)} aria-label="Měna">
                  <option value="CZK">Kč</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </span>
            </label>
            {currency !== 'CZK' && (
              <label className="finance-field finance-field--wide">
                Skutečně strženo v Kč (nepovinné)
                <input inputMode="decimal" value={czkText} onChange={(event) => setCzkText(event.target.value)} placeholder="z výpisu z účtu — jinak se přepočte kurzem ČNB ke dni platby" />
              </label>
            )}
            <label className="finance-field finance-field--wide">
              Popis
              <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={service ? service.name : 'např. Claude Max – předplatné'} />
            </label>
            <label className="finance-field finance-field--wide">
              Poznámka
              <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="číslo faktury, karta, kdo platil…" />
            </label>
          </div>
        </div>

        <div className="finance-modal-footer">
          <span className="finance-spacer" />
          <button type="button" className="finance-button finance-button--ghost" onClick={onClose} disabled={saving}>Zrušit</button>
          <button type="submit" className="finance-button finance-button--primary" disabled={saving}>
            {saving ? 'Ukládám…' : 'Uložit'}
          </button>
        </div>
      </form>
    </div>
  );
}

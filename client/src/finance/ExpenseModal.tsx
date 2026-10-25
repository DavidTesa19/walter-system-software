import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { BillingCycle, CostSource, Currency, Expense, ExpenseInput, ExpenseStatus } from './financeApi';
import { BILLING_LABELS, STATUS_LABELS } from './financeMath';

interface ExpenseModalProps {
  /** null creates a new cost. */
  expense: Expense | null;
  categories: Record<string, string>;
  onClose: () => void;
  onSave: (input: ExpenseInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const EMPTY: ExpenseInput = {
  name: '',
  vendor: '',
  category: 'other',
  billingCycle: 'monthly',
  amount: 0,
  currency: 'CZK',
  isEstimate: false,
  status: 'active',
  startedOn: null,
  renewsOn: null,
  description: '',
  usedFor: '',
  envKeys: [],
  dashboardUrl: '',
  costSource: null,
  notes: '',
};

const toForm = (expense: Expense | null): ExpenseInput => {
  if (!expense) return EMPTY;
  return {
    name: expense.name,
    vendor: expense.vendor ?? '',
    category: expense.category,
    billingCycle: expense.billingCycle,
    amount: expense.amount,
    currency: expense.currency,
    isEstimate: expense.isEstimate,
    status: expense.status,
    startedOn: expense.startedOn,
    renewsOn: expense.renewsOn,
    description: expense.description ?? '',
    usedFor: expense.usedFor ?? '',
    envKeys: expense.envKeys,
    dashboardUrl: expense.dashboardUrl ?? '',
    costSource: expense.costSource,
    notes: expense.notes ?? '',
  };
};

export default function ExpenseModal({ expense, categories, onClose, onSave, onDelete }: ExpenseModalProps) {
  const [form, setForm] = useState<ExpenseInput>(() => toForm(expense));
  const [amountText, setAmountText] = useState(() => String(expense?.amount ?? 0).replace('.', ','));
  const [keysText, setKeysText] = useState(() => (expense?.envKeys ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof ExpenseInput>(field: K, value: ExpenseInput[K]) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(amountText.replace(/\s/g, '').replace(',', '.'));
    if (!form.name.trim()) return setError('Vyplňte název.');
    if (!Number.isFinite(amount) || amount < 0) return setError('Částka musí být kladné číslo.');
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...form,
        amount,
        startedOn: form.startedOn || null,
        renewsOn: form.renewsOn || null,
        envKeys: keysText.split(/[,\s]+/).map((key) => key.trim()).filter(Boolean),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Náklad se nepodařilo uložit.');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!onDelete) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setSaving(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Náklad se nepodařilo smazat.');
      setSaving(false);
    }
  };

  const showRenewal = form.billingCycle === 'monthly' || form.billingCycle === 'yearly';

  return (
    <div className="finance-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="finance-modal" role="dialog" aria-modal="true" aria-label={expense ? expense.name : 'Nový náklad'} onSubmit={submit}>
        <div className="finance-modal-header">
          <div>
            <h3>{expense ? 'Upravit náklad' : 'Nový náklad'}</h3>
            {expense?.catalogKey && <span className="finance-muted">Služba nalezená v kódu aplikace</span>}
          </div>
          <button type="button" className="finance-icon-button" onClick={onClose} aria-label="Zavřít">×</button>
        </div>

        <div className="finance-modal-body">
          {error && <div className="finance-callout finance-callout--error">{error}</div>}

          <div className="finance-form-grid">
            <label className="finance-field finance-field--wide">
              Název
              <input value={form.name} onChange={(event) => set('name', event.target.value)} autoFocus={!expense} required />
            </label>
            <label className="finance-field">
              Dodavatel
              <input value={form.vendor ?? ''} onChange={(event) => set('vendor', event.target.value)} />
            </label>
            <label className="finance-field">
              Kategorie
              <select value={form.category} onChange={(event) => set('category', event.target.value)}>
                {Object.entries(categories).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <label className="finance-field">
              Účtování
              <select value={form.billingCycle} onChange={(event) => set('billingCycle', event.target.value as BillingCycle)}>
                {Object.entries(BILLING_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <label className="finance-field">
              Stav
              <select value={form.status} onChange={(event) => set('status', event.target.value as ExpenseStatus)}>
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <label className="finance-field">
              {form.billingCycle === 'usage' ? 'Odhad za měsíc' : form.billingCycle === 'yearly' ? 'Částka za rok' : form.billingCycle === 'one_time' ? 'Částka' : 'Částka za měsíc'}
              <span className="finance-inline">
                <input inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} />
                <select value={form.currency} onChange={(event) => set('currency', event.target.value as Currency)} aria-label="Měna">
                  <option value="CZK">Kč</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </span>
            </label>
            <label className="finance-check">
              <input type="checkbox" checked={form.isEstimate} onChange={(event) => set('isEstimate', event.target.checked)} />
              Částka je jen odhad
            </label>
            <label className="finance-field">
              {form.billingCycle === 'one_time' ? 'Zaplaceno dne' : 'Platí se od'}
              <input type="date" value={form.startedOn ?? ''} onChange={(event) => set('startedOn', event.target.value || null)} />
            </label>
            {showRenewal && (
              <label className="finance-field">
                Další platba / obnova
                <input type="date" value={form.renewsOn ?? ''} onChange={(event) => set('renewsOn', event.target.value || null)} />
              </label>
            )}
            {form.billingCycle === 'usage' && (
              <label className="finance-field">
                Skutečné náklady načítat z
                <select value={form.costSource ?? ''} onChange={(event) => set('costSource', (event.target.value || null) as CostSource | null)}>
                  <option value="">— nenačítat —</option>
                  <option value="anthropic">Anthropic (vyúčtování / provoz)</option>
                  <option value="openai">OpenAI (vyúčtování / provoz)</option>
                </select>
              </label>
            )}
            <label className="finance-field finance-field--wide">
              Co to je a za co se platí
              <textarea rows={3} value={form.description ?? ''} onChange={(event) => set('description', event.target.value)} />
            </label>
            <label className="finance-field finance-field--wide">
              Kde se v aplikaci používá
              <textarea rows={2} value={form.usedFor ?? ''} onChange={(event) => set('usedFor', event.target.value)} />
            </label>
            <label className="finance-field finance-field--wide">
              Klíče a proměnné prostředí (jen názvy, nikdy hodnoty)
              <input value={keysText} onChange={(event) => setKeysText(event.target.value)} placeholder="např. OPENAI_API_KEY" />
            </label>
            <label className="finance-field finance-field--wide">
              Odkaz na účet / vyúčtování
              <span className="finance-inline">
                <input type="url" value={form.dashboardUrl ?? ''} onChange={(event) => set('dashboardUrl', event.target.value)} placeholder="https://…" />
                {form.dashboardUrl && /^https?:\/\//i.test(form.dashboardUrl) && (
                  <a className="finance-button finance-button--ghost finance-button--small" href={form.dashboardUrl} target="_blank" rel="noopener noreferrer">
                    Otevřít
                  </a>
                )}
              </span>
            </label>
            <label className="finance-field finance-field--wide">
              Poznámky (účet, způsob platby, kdo spravuje…)
              <textarea rows={2} value={form.notes ?? ''} onChange={(event) => set('notes', event.target.value)} />
            </label>
          </div>
        </div>

        <div className="finance-modal-footer">
          {onDelete && (
            <button type="button" className={`finance-button ${confirmDelete ? 'finance-button--danger' : 'finance-button--ghost'}`} onClick={() => void remove()} disabled={saving}>
              {confirmDelete ? 'Opravdu smazat' : 'Smazat'}
            </button>
          )}
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

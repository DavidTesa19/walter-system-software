import type { CostSource, FinanceOverview } from './financeApi';
import { SOURCE_LABELS, currentMonth, daysUntil, formatCount, formatCzk, formatDate, formatMoney, monthLabel, shiftMonth } from './financeMath';
import type { MeasuredMonths } from './financeMath';
import { formatRelative } from '../safety/format';

// Order on the screen: what costs the most first.
const BILLING_ORDER: CostSource[] = ['railway', 'anthropic', 'openai', 'google', 'cloudflare'];

// How to connect each provider. Every credential only reads billing data and
// goes into the API service's variables on Railway, never into the browser.
const CONNECT_STEPS: Record<CostSource, { what: string; steps: string[] }> = {
  railway: {
    what: 'Skutečné faktury Railway (tarif + spotřeba, s DPH) a průběh aktuálního období.',
    steps: [
      'railway.com › Account Settings › Tokens › Create token, Workspace: „No workspace“.',
      'Na Railway u služby API přidejte proměnnou RAILWAY_API_TOKEN a službu restartujte.',
    ],
  },
  anthropic: {
    what: 'Vyúčtování Claude API po dnech a položkách.',
    steps: [
      'Admin klíče má jen organizace, ne „Individual Org“: v Claude Console otevřete organizaci, které patří klíč aplikace, a v Settings › Organization ji založte jako organizaci.',
      'Settings › Admin keys › Create admin key.',
      'Na Railway u služby API přidejte proměnnou ANTHROPIC_ADMIN_KEY a službu restartujte.',
    ],
  },
  openai: {
    what: 'Vyúčtování OpenAI API po dnech a položkách.',
    steps: [
      'platform.openai.com › Settings › Organization › Admin keys › Create new admin key (stačí čtení Usage).',
      'Na Railway u služby API přidejte proměnnou OPENAI_ADMIN_KEY a službu restartujte.',
    ],
  },
  google: {
    what: 'Náklady Google Cloud včetně Google Maps (po odečtení měsíčního limitu zdarma).',
    steps: [
      'Google Cloud console › Billing › Billing export › BigQuery export › „Standard usage cost“: zapněte export do nového datasetu. Data přibývají od zapnutí, zpětně nejsou.',
      'IAM › Service accounts › Create: role „BigQuery Data Viewer“ a „BigQuery Job User“, pak Keys › Add key › JSON.',
      'Na Railway u služby API: GOOGLE_BILLING_SERVICE_ACCOUNT = obsah JSON klíče, GOOGLE_BILLING_EXPORT_TABLE = projekt.dataset.gcp_billing_export_v1_… (název tabulky z BigQuery).',
    ],
  },
  cloudflare: {
    what: 'Vyúčtování Cloudflare (R2 pro zálohy mimo Railway).',
    steps: [
      'dash.cloudflare.com › My Profile › API Tokens › Create Token › Custom token s oprávněním Account › Billing › Read.',
      'Na Railway u služby API: CLOUDFLARE_API_TOKEN = token, CLOUDFLARE_ACCOUNT_ID = Account ID z přehledu účtu.',
    ],
  },
};

const statusChip = (connected: boolean, error: string | null) =>
  error ? (
    <span className="finance-chip finance-chip--cancelled">Chyba</span>
  ) : connected ? (
    <span className="finance-chip finance-chip--active">Napojeno</span>
  ) : (
    <span className="finance-chip finance-chip--paused">Nenapojeno</span>
  );

function Steps({ source }: { source: CostSource }) {
  return (
    <ol className="finance-steps">
      {CONNECT_STEPS[source].steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export default function ConnectionsTab({ overview, measured }: { overview: FinanceOverview; measured: MeasuredMonths }) {
  const month = currentMonth();
  const previous = shiftMonth(month, -1);
  const { brave, brevo, domains } = overview.checks;

  return (
    <div className="finance-panel">
      <p className="finance-muted">
        Odkud se berou skutečné částky. Napojená služba posílá vlastní vyúčtování; přístupové klíče jen čtou a zůstávají na
        serveru. Načítá se samo po otevření stránky (nejvýš jednou za 3 hodiny) nebo hned tlačítkem nahoře.
      </p>

      <div className="finance-provider-grid">
        {BILLING_ORDER.map((source) => {
          const status = overview.providers[source];
          const connected = Boolean(status.configured && status.fetchedAt);
          const thisMonth = measured.get(month)?.[source];
          const lastMonth = measured.get(previous)?.[source];
          return (
            <section key={source} className={`finance-provider${status.error ? ' finance-provider--error' : ''}`}>
              <div className="finance-provider-head">
                <strong>{SOURCE_LABELS[source]}</strong>
                {statusChip(connected, status.configured ? status.error : null)}
              </div>
              <span className="finance-muted">{CONNECT_STEPS[source].what}</span>

              {connected && (
                <dl className="finance-facts">
                  <dt>{monthLabel(previous, 'long')}</dt>
                  <dd>{formatCzk(lastMonth?.billed ? lastMonth.czk : 0)}</dd>
                  <dt>{monthLabel(month, 'long')} dosud</dt>
                  <dd>{formatCzk(thisMonth?.billed ? thisMonth.czk : 0)}</dd>
                  {(status.details?.workspaces ?? []).map((period) => (
                    <RailwayPeriodFacts key={period.workspace} period={period} rates={overview.rates.rates} />
                  ))}
                </dl>
              )}

              {status.configured && status.error && <span className="finance-error-text">{status.error}</span>}
              {status.configured && (
                <span className="finance-muted">
                  {status.fetchedAt ? `Naposledy načteno ${formatRelative(status.fetchedAt)}.` : 'Zatím se nepodařilo načíst.'}
                </span>
              )}
              {!status.configured && <Steps source={source} />}
            </section>
          );
        })}

        <section className="finance-provider">
          <div className="finance-provider-head">
            <strong>Brave Search</strong>
            {statusChip(Boolean(brave.quota), null)}
          </div>
          <span className="finance-muted">Počet vyhledávání podle Brave — Brave ho posílá s každým dotazem.</span>
          {brave.quota ? (
            <dl className="finance-facts">
              <dt>Tento měsíc</dt>
              <dd>
                {formatCount(brave.quota.used)} z {formatCount(brave.quota.limit)} dotazů
              </dd>
              <dt>Limit se obnoví</dt>
              <dd>{formatDate(brave.quota.resetsAt)}</dd>
            </dl>
          ) : (
            <span className="finance-muted">
              {brave.configured
                ? 'Načte se s prvním vyhledáváním na webu v AI Asistentovi.'
                : 'BRAVE_SEARCH_API_KEY není na serveru nastavený — vyhledávání na webu nefunguje.'}
            </span>
          )}
          <span className="finance-muted">Cenu tarifu doplňte u nákladu Brave Search (při limitu zdarma 0 Kč).</span>
        </section>

        <section className={`finance-provider${brevo.error ? ' finance-provider--error' : ''}`}>
          <div className="finance-provider-head">
            <strong>Brevo – e-maily</strong>
            {statusChip(Boolean(brevo.plans), brevo.error)}
          </div>
          <span className="finance-muted">Tarif podle Brevo (cenu placeného tarifu doplňte z faktury).</span>
          {brevo.plans ? (
            <dl className="finance-facts">
              {brevo.plans.map((plan, index) => (
                <BrevoPlanFacts key={`${plan.type}-${index}`} plan={plan} />
              ))}
            </dl>
          ) : (
            <span className="finance-muted">
              {brevo.configured ? 'Zatím nenačteno.' : 'BREVO_API_KEY není na serveru nastavený — e-mailová upozornění se neodesílají.'}
            </span>
          )}
          {brevo.error && <span className="finance-error-text">{brevo.error}</span>}
        </section>

        {domains.map((domain) => {
          const days = domain.expiresAt ? daysUntil(domain.expiresAt) : null;
          return (
            <section key={domain.domain} className={`finance-provider${days !== null && days < 0 ? ' finance-provider--error' : ''}`}>
              <div className="finance-provider-head">
                <strong>Doména {domain.domain}</strong>
                {statusChip(Boolean(domain.expiresAt), domain.error)}
              </div>
              <span className="finance-muted">Registrátor a expirace z veřejného registru domén (cenu doplňte z faktury).</span>
              {domain.expiresAt && (
                <dl className="finance-facts">
                  <dt>Registrátor</dt>
                  <dd>{domain.registrar ?? '—'}</dd>
                  <dt>Expirace</dt>
                  <dd className={days !== null && days < 30 ? 'finance-error-text' : undefined}>
                    {formatDate(domain.expiresAt)}
                    {days !== null && (days < 0 ? ` (prošlá před ${-days} d)` : ` (za ${days} d)`)}
                  </dd>
                </dl>
              )}
              {domain.error && <span className="finance-error-text">{domain.error}</span>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function RailwayPeriodFacts({ period, rates }: { period: NonNullable<NonNullable<FinanceOverview['providers']['railway']['details']>['workspaces']>[number]; rates: Record<string, number> }) {
  const czk = (usd: number) => formatCzk(usd * (rates[period.currency] ?? 1));
  return (
    <>
      <dt>Tarif</dt>
      <dd>{period.plan ?? '—'}</dd>
      <dt>Aktuální období</dt>
      <dd>
        {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
      </dd>
      <dt>Spotřeba dosud (bez DPH)</dt>
      <dd>
        {formatMoney(period.currentUsage, period.currency)} · {czk(period.currentUsage)}
      </dd>
      {period.nextInvoiceTotal !== null && (
        <>
          <dt>Příští faktura {formatDate(period.nextInvoiceDate)}</dt>
          <dd>
            {formatMoney(period.nextInvoiceTotal, period.currency)} · {czk(period.nextInvoiceTotal)} (zatím)
          </dd>
        </>
      )}
    </>
  );
}

function BrevoPlanFacts({ plan }: { plan: NonNullable<FinanceOverview['checks']['brevo']['plans']>[number] }) {
  return (
    <>
      <dt>Tarif</dt>
      <dd>
        {plan.type === 'free' ? 'Free (zdarma)' : plan.type ?? '—'}
        {plan.credits !== null && ` · zbývá ${formatCount(plan.credits)} ${plan.creditsType === 'sendLimit' ? 'e-mailů' : 'kreditů'}`}
      </dd>
      {plan.endDate && (
        <>
          <dt>Platí do</dt>
          <dd>{formatDate(plan.endDate)}</dd>
        </>
      )}
    </>
  );
}

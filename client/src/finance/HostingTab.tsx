import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiGet } from '../utils/api';
import { BUTTON_ICON } from '../ui/icons';
import { formatCzk } from './financeMath';

// Analýza › Finance › Hosting: what each Railway service costs this billing
// period, what the period will probably come to, what is inside the database
// and where the backups live. GET /api/finance/hosting (server/finance/hosting.js).

type ServiceKind = 'database' | 'api' | 'web' | 'form' | 'paused' | 'deleted' | 'other';

interface ServiceRow {
  id: string;
  name: string;
  kind: ServiceKind;
  what: string;
  deleted: boolean;
  avgMemoryGb: number;
  nowMemoryGb: number;
  avgDiskGb: number;
  previousAvgMemoryGb: number;
  costs: { memory: number; cpu: number; egress: number; disk: number; backup: number; total: number };
  soFarUsd: number;
  projectedUsd: number;
  previousUsd: number;
}

interface RailwayProject {
  workspace: string;
  plan: string | null;
  project: string;
  period: { start: string; end: string; elapsedShare: number };
  services: ServiceRow[];
  totals: {
    soFarUsd: number;
    projectedUsd: number;
    projectedBillUsd: number;
    railwayEstimateUsd: number | null;
    previousUsageUsd: number;
    previousBillUsd: number;
  };
  vatRate: number;
}

interface Hosting {
  configured: boolean;
  checkedAt: string | null;
  error: string | null;
  railway: { fetchedAt: string; projects: RailwayProject[] } | null;
  database: { databaseBytes: number; groups: Array<{ key: string; label: string; bytes: number; tables: number }> } | null;
  backups: {
    archives: number;
    archiveBytes: number;
    offsiteArchives: number;
    offsiteArchiveBytes: number;
    offsiteFiles: number;
    offsiteFileBytes: number;
    latest: string | null;
  } | null;
  prices: Record<'MEMORY_USAGE_GB' | 'CPU_USAGE' | 'NETWORK_TX_GB' | 'DISK_USAGE_GB' | 'BACKUP_USAGE_GB', number>;
  plan: { feeUsd: number; includedUsd: number };
  vatRate: number;
  r2: { freeGb: number; usdPerGbMonth: number };
  usdCzk: number;
}

const GB = 1024 ** 3;
const MINUTES_PER_MONTH = 30 * 24 * 60;

const bytes = (value: number) => {
  if (value >= GB) return `${(value / GB).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toLocaleString('cs-CZ', { maximumFractionDigits: value >= 100 * 1024 ** 2 ? 0 : 1 })} MB`;
  return `${Math.round(value / 1024).toLocaleString('cs-CZ')} kB`;
};
const gb = (value: number) => `${value.toLocaleString('cs-CZ', { maximumFractionDigits: value < 0.1 ? 3 : 2 })} GB`;
const usd = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
const percent = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value * 100))} %`;

const KIND_TONE: Record<ServiceKind, string> = {
  database: 'active',
  api: 'active',
  web: 'active',
  form: 'active',
  paused: 'paused',
  deleted: 'cancelled',
  other: 'planned',
};
const KIND_LABEL: Record<ServiceKind, string> = {
  database: 'Databáze',
  api: 'Server',
  web: 'Web',
  form: 'Formulář',
  paused: 'Pozastaveno',
  deleted: 'Smazáno',
  other: 'Služba',
};

export default function HostingTab() {
  const [data, setData] = useState<Hosting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<Hosting>(`/api/finance/hosting${fresh ? '?fresh=1' : ''}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Náklady hostingu se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return error ? <div className="finance-callout finance-callout--error">{error}</div> : <div className="finance-empty">Načítám náklady hostingu…</div>;
  }

  const czk = (value: number) => formatCzk(value * data.usdCzk);
  const vat = Math.round(data.vatRate * 100);
  const diskMonthUsd = (value: number) => (value / GB) * data.prices.DISK_USAGE_GB * MINUTES_PER_MONTH;
  const ramMonthUsd = (value: number) => (value / GB) * data.prices.MEMORY_USAGE_GB * MINUTES_PER_MONTH;

  return (
    <div className="finance-hosting">
      <div className="finance-toolbar">
        <p className="finance-muted">
          Co který díl aplikace na Railway stojí, podle Railway samotného
          {data.checkedAt ? ` (načteno ${new Date(data.checkedAt).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })})` : ''}.
        </p>
        <span className="finance-spacer" />
        <button type="button" className="finance-button finance-button--ghost finance-button--small" onClick={() => void load(true)} disabled={loading}>
          <RefreshCw {...BUTTON_ICON} />
          {loading ? 'Načítám…' : 'Načíst z Railway znovu'}
        </button>
      </div>

      {error && <div className="finance-callout finance-callout--error">{error}</div>}
      {!data.configured && (
        <div className="finance-callout finance-callout--info">
          Railway není napojený: nastavte RAILWAY_API_TOKEN (záložka Napojení). Níže je aspoň obsah databáze a záloh.
        </div>
      )}
      {data.configured && data.error && (
        <div className="finance-callout finance-callout--warning">Railway se teď nepodařilo načíst ({data.error}). Čísla jsou z posledního úspěšného načtení.</div>
      )}

      {data.railway?.projects.map((project) => {
        const t = project.totals;
        const change = t.previousBillUsd > 0 ? (t.projectedBillUsd - t.previousBillUsd) / t.previousBillUsd : 0;
        const max = Math.max(...project.services.map((service) => Math.max(service.projectedUsd, service.previousUsd)), 0.0001);
        return (
          <section key={project.project} className="finance-hosting-project">
            <div className="finance-metrics finance-metrics--compact">
              <div className="finance-metric">
                <span className="finance-metric-label">Odhad účtu za toto období</span>
                <span className="finance-metric-value">{czk(t.projectedBillUsd)}</span>
                <span className="finance-metric-note">
                  {usd(t.projectedBillUsd)} s DPH {vat} % · spotřeba ≈ {usd(t.projectedUsd)}
                </span>
              </div>
              <div className="finance-metric">
                <span className="finance-metric-label">Zatím spotřebováno</span>
                <span className="finance-metric-value">{czk(t.soFarUsd)}</span>
                <span className="finance-metric-note">
                  {usd(t.soFarUsd)} · {Math.round(project.period.elapsedShare * 100)} % období {day(project.period.start)}–{day(project.period.end)}
                </span>
              </div>
              <div className="finance-metric">
                <span className="finance-metric-label">Minulé období</span>
                <span className="finance-metric-value">{czk(t.previousBillUsd)}</span>
                <span className="finance-metric-note">spotřeba {usd(t.previousUsageUsd)}, s předplatným a DPH</span>
              </div>
              <div className={`finance-metric${change > 0.05 ? ' finance-metric--warning' : ''}`}>
                <span className="finance-metric-label">Změna proti minulému</span>
                <span className="finance-metric-value">{t.previousBillUsd > 0 ? percent(change) : '—'}</span>
                <span className="finance-metric-note">
                  {t.projectedBillUsd <= t.previousBillUsd
                    ? `o ${czk(t.previousBillUsd - t.projectedBillUsd)} méně za měsíc`
                    : `o ${czk(t.projectedBillUsd - t.previousBillUsd)} víc za měsíc`}
                </span>
              </div>
            </div>

            <h2 className="finance-section-title">Co kolik stojí</h2>
            <div className="finance-table-wrap">
              <table className="finance-table finance-hosting-table">
                <thead>
                  <tr>
                    <th>Služba</th>
                    <th className="finance-num">Paměť teď</th>
                    <th className="finance-num">Za paměť dosud</th>
                    <th className="finance-num">Disk, provoz, CPU dosud</th>
                    <th>Podíl</th>
                    <th className="finance-num">Odhad za období</th>
                    <th className="finance-num">Minulé období</th>
                  </tr>
                </thead>
                <tbody>
                  {project.services.map((service) => (
                    <tr key={service.id}>
                      <td>
                        <div className="finance-row-name">
                          {service.name} <span className={`finance-chip finance-chip--${KIND_TONE[service.kind]}`}>{KIND_LABEL[service.kind]}</span>
                        </div>
                        {service.what && <div className="finance-row-sub">{service.what}</div>}
                      </td>
                      <td className="finance-num">
                        {gb(service.nowMemoryGb)}
                        <div className="finance-row-sub">průměr {gb(service.avgMemoryGb)}</div>
                      </td>
                      <td className="finance-num">{usd(service.costs.memory)}</td>
                      <td className="finance-num">
                        {usd(service.costs.disk + service.costs.egress + service.costs.cpu + service.costs.backup)}
                        {service.avgDiskGb > 0 && <div className="finance-row-sub">disk {gb(service.avgDiskGb)}</div>}
                      </td>
                      <td className="finance-hosting-share">
                        <span className="finance-bar-track" aria-hidden="true">
                          <span className="finance-bar-fill" style={{ width: `${Math.max((service.projectedUsd / max) * 100, service.projectedUsd > 0 ? 1 : 0)}%` }} />
                        </span>
                        <span className="finance-muted">{t.projectedUsd > 0 ? Math.round((service.projectedUsd / t.projectedUsd) * 100) : 0} %</span>
                      </td>
                      <td className="finance-num">
                        <strong>{czk(service.projectedUsd)}</strong>
                        <div className="finance-row-sub">{usd(service.projectedUsd)}</div>
                      </td>
                      <td className="finance-num">
                        {czk(service.previousUsd)}
                        {service.previousAvgMemoryGb > 0 && <div className="finance-row-sub">paměť {gb(service.previousAvgMemoryGb)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Spotřeba celkem</th>
                    <th />
                    <th className="finance-num">{usd(project.services.reduce((sum, s) => sum + s.costs.memory, 0))}</th>
                    <th className="finance-num">
                      {usd(project.services.reduce((sum, s) => sum + s.costs.disk + s.costs.egress + s.costs.cpu + s.costs.backup, 0))}
                    </th>
                    <th />
                    <th className="finance-num">{czk(t.projectedUsd)}</th>
                    <th className="finance-num">{czk(t.previousUsageUsd)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="finance-muted">
              Sloupce Paměť a Disk… jsou spotřeba od začátku období ({day(project.period.start)}); odhad za období k ní přičítá
              zbytek měsíce v tempu poslední hodiny, takže pozastavená služba se už nepočítá. Účet = předplatné{' '}
              {usd(data.plan.feeUsd)}, které zahrnuje {usd(data.plan.includedUsd)} spotřeby, plus spotřeba nad ně, plus DPH {vat} %.
              {t.railwayEstimateUsd != null && ` Railway sám ukazuje odhad ${usd(t.railwayEstimateUsd)} spotřeby (vlastním výpočtem); tady je odhad z dnešního tempa služeb.`}
            </p>
          </section>
        );
      })}

      <div className="finance-grid finance-hosting-grid">
        {data.database && (
          <section className="finance-card">
            <h2 className="finance-section-title">Co je v databázi</h2>
            <ul className="finance-bars" aria-label="Obsah databáze">
              {data.database.groups.filter((group) => group.bytes > 0).map((group) => (
                <li key={group.key} className="finance-bar-row">
                  <span className="finance-bar-label" title={group.label}>{group.label}</span>
                  <span className="finance-bar-track" aria-hidden="true">
                    <span className="finance-bar-fill" style={{ width: `${Math.max((group.bytes / data.database!.groups[0].bytes) * 100, 1)}%` }} />
                  </span>
                  <span className="finance-bar-value">
                    {bytes(group.bytes)}
                    <span className="finance-muted"> · {Math.round((group.bytes / data.database!.databaseBytes) * 100)} %</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="finance-muted">
              Celkem {bytes(data.database.databaseBytes)}. Na disku to stojí jen {czk(diskMonthUsd(data.database.databaseBytes))} měsíčně;
              drahá je paměť ({czk(ramMonthUsd(GB))} za GB měsíčně), kterou databáze drží pro to, co čte. Nahrané soubory
              proto noční záloha nečte (sleduje jen jejich otisky).
            </p>
          </section>
        )}

        {data.backups && (
          <section className="finance-card">
            <h2 className="finance-section-title">Zálohy</h2>
            <ul className="finance-hosting-list">
              <li>
                <strong>{data.backups.archives}</strong> záloh databáze v databázi, {bytes(data.backups.archiveBytes)}
                {data.backups.latest ? `, poslední ${new Date(data.backups.latest).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
              </li>
              <li>
                Mimo Railway (Cloudflare R2): {data.backups.offsiteArchives} záloh ({bytes(data.backups.offsiteArchiveBytes)}) a{' '}
                {data.backups.offsiteFiles} souborů ({bytes(data.backups.offsiteFileBytes)})
              </li>
              <li>
                R2 je zdarma do {data.r2.freeGb} GB; zabráno{' '}
                {(((data.backups.offsiteArchiveBytes + data.backups.offsiteFileBytes) / GB / data.r2.freeGb) * 100).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %, takže{' '}
                <strong>
                  {data.backups.offsiteArchiveBytes + data.backups.offsiteFileBytes > data.r2.freeGb * GB
                    ? czk(((data.backups.offsiteArchiveBytes + data.backups.offsiteFileBytes) / GB - data.r2.freeGb) * data.r2.usdPerGbMonth) + ' měsíčně'
                    : '0 Kč'}
                </strong>
                .
              </li>
              <li>Railway vlastní zálohy disku nevytváří (tarif Hobby), takže za ně nic neúčtuje.</li>
            </ul>
          </section>
        )}

        <section className="finance-card">
          <h2 className="finance-section-title">Jak Railway účtuje</h2>
          <ul className="finance-hosting-list">
            <li>Paměť: {czk(data.prices.MEMORY_USAGE_GB * MINUTES_PER_MONTH)} za GB měsíčně ({usd(data.prices.MEMORY_USAGE_GB * MINUTES_PER_MONTH)}), za každou minutu, kdy ji služba drží.</li>
            <li>Procesor: {czk(data.prices.CPU_USAGE * MINUTES_PER_MONTH)} za vCPU měsíčně; aplikace skoro nic nepočítá.</li>
            <li>Disk: {czk(data.prices.DISK_USAGE_GB * MINUTES_PER_MONTH)} za GB měsíčně; odchozí provoz {czk(data.prices.NETWORK_TX_GB)} za GB.</li>
            <li>
              Tarif Hobby: {usd(data.plan.feeUsd)} měsíčně a v ceně {usd(data.plan.includedUsd)} spotřeby; méně než to zaplatit nejde
              ({czk(data.plan.feeUsd * (1 + data.vatRate))} s DPH).
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

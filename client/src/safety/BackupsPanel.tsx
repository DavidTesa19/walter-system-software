import { useCallback, useEffect, useRef, useState } from 'react';
import { apiDownload } from '../utils/api';
import SafetyModal from './SafetyModal';
import { safetyApi } from './safetyApi';
import type { Backup, BackupConfig, RestoreGroup, RestoreResult } from './safetyApi';
import { formatBytes, formatDateTime, formatRelative } from './format';

const CONFIRM_WORD = 'OBNOVIT';

const STATUS_LABELS: Record<Backup['status'], string> = {
  running: 'Probíhá',
  ok: 'Hotovo',
  failed: 'Selhalo',
};

const OFFSITE_LABELS: Record<string, string> = {
  ok: 'Ano',
  partial: 'Částečně',
  failed: 'Selhalo',
  disabled: 'Ne',
};

const retentionText = (days: number | null) => {
  if (days == null) return 'do smazání';
  if (days % 365 === 0) return `${days / 365 === 1 ? '12 měsíců' : `${days / 365} roky`}`;
  if (days % 7 === 0) return `${days / 7} ${days / 7 === 1 ? 'týden' : days / 7 <= 4 ? 'týdny' : 'týdnů'}`;
  return `${days} dní`;
};

function RestoreDialog({ backup, groups, onClose, onDone }: {
  backup: Backup;
  groups: RestoreGroup[];
  onClose: () => void;
  onDone: (result: RestoreResult) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(groups.filter((group) => group.defaultSelected).map((group) => group.id))
  );
  const [preview, setPreview] = useState<RestoreResult | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    setPreview(null);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await safetyApi.restoreBackup(backup.id, {
        groups: [...selected],
        dryRun,
        confirm: dryRun ? undefined : confirm.trim(),
      });
      if (dryRun) setPreview(result);
      else onDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Obnova selhala.');
    } finally {
      setBusy(false);
    }
  };

  const nothingToDo = preview && preview.totals.inserted + preview.totals.updated + preview.totals.deleted === 0;

  return (
    <SafetyModal
      title={`Obnova ze zálohy #${backup.id}`}
      onClose={() => !busy && onClose()}
      wide
      footer={
        <>
          <button type="button" className="safety-button safety-button--ghost" onClick={onClose} disabled={busy}>
            Zrušit
          </button>
          {!preview && (
            <button
              type="button"
              className="safety-button safety-button--primary"
              onClick={() => run(true)}
              disabled={busy || selected.size === 0}
            >
              {busy ? 'Porovnávám…' : 'Zobrazit, co se změní'}
            </button>
          )}
          {preview && !nothingToDo && (
            <button
              type="button"
              className="safety-button safety-button--danger"
              onClick={() => run(false)}
              disabled={busy || confirm.trim() !== CONFIRM_WORD}
            >
              {busy ? 'Obnovuji…' : 'Obnovit'}
            </button>
          )}
        </>
      }
    >
      <p>
        Záloha z <b>{formatDateTime(backup.createdAt)}</b> ({backup.kindLabel.toLowerCase()}). Obnova změní jen to, co se
        od té doby liší. Těsně před ní se automaticky udělá bezpečnostní záloha a celá obnova se zapíše do historie jako
        jedna akce, kterou půjde vrátit.
      </p>

      <fieldset className="safety-groups-picker" disabled={busy}>
        <legend>Co obnovit</legend>
        {groups.map((group) => (
          <label key={group.id} className="safety-check">
            <input type="checkbox" checked={selected.has(group.id)} onChange={() => toggle(group.id)} />
            <span>
              <b>{group.label}</b>
              <small>{group.description}</small>
            </span>
          </label>
        ))}
      </fieldset>

      {preview && (
        <div className="safety-preview">
          {nothingToDo ? (
            <div className="safety-callout safety-callout--success">Vybraná data jsou se zálohou shodná, není co obnovovat.</div>
          ) : (
            <>
              <table className="safety-diff">
                <thead>
                  <tr>
                    <th>Tabulka</th>
                    <th>Vrátí se</th>
                    <th>Upraví se</th>
                    <th>Odebere se</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.tables.map((table) => (
                    <tr key={table.table}>
                      <td className="safety-diff-field">{table.label}</td>
                      <td>{table.inserted || '—'}</td>
                      <td>{table.updated || '—'}</td>
                      <td className={table.deleted ? 'safety-diff-old' : undefined}>{table.deleted || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.totals.deleted > 0 && (
                <div className="safety-callout safety-callout--warning">
                  Záznamy vytvořené po této záloze se odeberou (zůstanou v koši a v historii).
                </div>
              )}
              {preview.missingFiles.length > 0 && (
                <div className="safety-callout safety-callout--warning">
                  {preview.missingFiles.length} souborů se nepodařilo dohledat a zůstanou neobnovené:{' '}
                  {preview.missingFiles.slice(0, 5).map((file) => file.filename).join(', ')}
                  {preview.missingFiles.length > 5 ? '…' : ''}
                </div>
              )}
              <label className="safety-field">
                <span>Pro potvrzení napište {CONFIRM_WORD}</span>
                <input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" />
              </label>
            </>
          )}
        </div>
      )}
      {error && <div className="safety-callout safety-callout--error">{error}</div>}
    </SafetyModal>
  );
}

export default function BackupsPanel({ onChanged }: { onChanged?: () => void }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [groups, setGroups] = useState<RestoreGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [starting, setStarting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await safetyApi.backups();
      setBackups(data.backups);
      setConfig(data.config);
      setGroups(data.groups);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zálohy se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep refreshing while a backup runs, so it flips to done on its own.
  const anyRunning = backups.some((backup) => backup.status === 'running');
  useEffect(() => {
    if (!anyRunning) return undefined;
    pollRef.current = window.setInterval(() => {
      void load();
    }, 3000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [anyRunning, load]);

  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !anyRunning) onChanged?.();
    wasRunning.current = anyRunning;
  }, [anyRunning, onChanged]);

  const startBackup = async () => {
    setStarting(true);
    setError(null);
    try {
      await safetyApi.createBackup(note.trim() || undefined);
      setNote('');
      setNotice('Záloha se vytváří. Dokončí se na pozadí, stránku můžete opustit.');
      window.setTimeout(() => void load(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zálohu se nepodařilo spustit.');
    } finally {
      setStarting(false);
    }
  };

  const testOffsite = async () => {
    setTesting(true);
    setError(null);
    try {
      const result = await safetyApi.testOffsite();
      setNotice(`Off-site úložiště funguje (${result.bucket} na ${result.endpointHost}${result.encryption ? ', šifrováno' : ''}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test se nezdařil.');
    } finally {
      setTesting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await safetyApi.deleteBackup(deleteTarget.id);
      setNotice(`Záloha #${deleteTarget.id} byla smazána.`);
      setDeleteTarget(null);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zálohu se nepodařilo smazat.');
      setDeleteTarget(null);
    }
  };

  const download = async (backup: Backup) => {
    try {
      await apiDownload(`/api/safety/backups/${backup.id}/download`, `walter-zaloha-${backup.id}.json.gz`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stažení se nezdařilo.');
    }
  };

  const lastOk = backups.find((backup) => backup.status === 'ok');

  return (
    <div className="safety-panel">
      <div className="safety-cards">
        <div className={`safety-card${lastOk ? '' : ' safety-card--warning'}`}>
          <span className="safety-card-label">Poslední úspěšná záloha</span>
          <span className="safety-card-value">{lastOk ? formatRelative(lastOk.createdAt) : 'Zatím žádná'}</span>
          {lastOk && <span className="safety-muted">{formatDateTime(lastOk.createdAt)}</span>}
        </div>
        <div className={`safety-card${config?.offsite.configured ? '' : ' safety-card--warning'}`}>
          <span className="safety-card-label">Kopie mimo Railway</span>
          <span className="safety-card-value">{config?.offsite.configured ? 'Zapnuto' : 'Nenastaveno'}</span>
          <span className="safety-muted">
            {config?.offsite.configured
              ? `${config.offsite.bucket} · ${config.encryption ? 'šifrováno' : 'bez šifrování'}`
              : 'Zálohy jsou zatím jen v databázi'}
          </span>
        </div>
        <div className="safety-card">
          <span className="safety-card-label">Plán</span>
          <span className="safety-card-value">
            {config?.schedule.enabled ? `Každou noc v ${config.schedule.hour}:00` : 'Vypnuto'}
          </span>
          <span className="safety-muted">Čas Praha</span>
        </div>
      </div>

      {config && !config.offsite.configured && (
        <div className="safety-callout safety-callout--warning">
          <strong>Zálohy zatím nepřežijí ztrátu databáze.</strong>
          <p>
            Bez off-site úložiště jsou zálohy uložené ve stejné databázi, kterou chrání — pomohou proti chybným úpravám a
            mazání, ne proti ztrátě celé databáze. Na Railway u serveru nastavte proměnné <code>BACKUP_S3_ENDPOINT</code>,{' '}
            <code>BACKUP_S3_BUCKET</code>, <code>BACKUP_S3_ACCESS_KEY_ID</code>, <code>BACKUP_S3_SECRET_ACCESS_KEY</code>{' '}
            (Cloudflare R2) a ideálně i <code>BACKUP_ENCRYPTION_KEY</code>.
          </p>
        </div>
      )}

      <div className="safety-toolbar">
        <label className="safety-field safety-field--grow">
          <span>Poznámka k ruční záloze (nepovinné)</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="např. před hromadnou úpravou oborů"
            maxLength={300}
          />
        </label>
        <button type="button" className="safety-button safety-button--primary" onClick={startBackup} disabled={starting || anyRunning}>
          {anyRunning ? 'Záloha probíhá…' : starting ? 'Spouštím…' : 'Zálohovat teď'}
        </button>
        {config?.offsite.configured && (
          <button type="button" className="safety-button safety-button--ghost" onClick={testOffsite} disabled={testing}>
            {testing ? 'Testuji…' : 'Otestovat off-site'}
          </button>
        )}
      </div>

      {config && (
        <p className="safety-muted">
          Uchovává se: denní {retentionText(config.retentionDays.daily)}, týdenní (neděle) {retentionText(config.retentionDays.weekly)},
          měsíční (1. den v měsíci) {retentionText(config.retentionDays.monthly)}, bezpečnostní (před každou obnovou){' '}
          {retentionText(config.retentionDays.safety)}, ruční {retentionText(config.retentionDays.manual)}. Nejnovější{' '}
          {config.alwaysKeepLatest} zálohy se nikdy nemažou.
        </p>
      )}

      {error && <div className="safety-callout safety-callout--error">{error}</div>}
      {notice && (
        <div className="safety-callout safety-callout--success" role="status">
          {notice}
          <button type="button" className="safety-link-button" onClick={() => setNotice(null)}>
            Zavřít
          </button>
        </div>
      )}

      {loading ? (
        <p className="safety-muted">Načítám…</p>
      ) : backups.length === 0 ? (
        <div className="safety-empty">Zatím žádné zálohy. První automatická proběhne dnes v noci.</div>
      ) : (
        <div className="safety-table-wrap">
          <table className="safety-table">
            <thead>
              <tr>
                <th>Vytvořeno</th>
                <th>Typ</th>
                <th>Stav</th>
                <th>Data</th>
                <th>Soubory</th>
                <th>Off-site</th>
                <th>Drží se do</th>
                <th aria-label="Akce" />
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr key={backup.id}>
                  <td>
                    <div>{formatDateTime(backup.createdAt)}</div>
                    {backup.note && <div className="safety-muted">{backup.note}</div>}
                  </td>
                  <td>
                    <span className={`safety-chip safety-chip--${backup.kind}`}>{backup.kindLabel}</span>
                  </td>
                  <td>
                    <span className={`safety-status safety-status--${backup.status}`}>{STATUS_LABELS[backup.status]}</span>
                    {backup.error && <div className="safety-muted safety-error-text">{backup.error}</div>}
                  </td>
                  <td>{formatBytes(backup.sizeBytes)}</td>
                  <td>{backup.fileCount != null ? `${backup.fileCount} · ${formatBytes(backup.fileBytes)}` : '—'}</td>
                  <td title={backup.offsiteError ?? undefined}>
                    {OFFSITE_LABELS[backup.offsiteStatus ?? 'disabled'] ?? '—'}
                    {backup.encrypted && backup.offsiteStatus === 'ok' ? ' · šifr.' : ''}
                  </td>
                  <td>{backup.expiresAt ? formatDateTime(backup.expiresAt) : 'Trvale'}</td>
                  <td className="safety-table-actions">
                    {backup.status === 'ok' && (
                      <>
                        <button type="button" className="safety-link-button" onClick={() => download(backup)}>
                          Stáhnout
                        </button>
                        <button type="button" className="safety-button safety-button--small" onClick={() => setRestoreTarget(backup)}>
                          Obnovit…
                        </button>
                      </>
                    )}
                    {backup.status !== 'running' && (
                      <button type="button" className="safety-link-button safety-link-button--danger" onClick={() => setDeleteTarget(backup)}>
                        Smazat
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {restoreTarget && (
        <RestoreDialog
          backup={restoreTarget}
          groups={groups}
          onClose={() => setRestoreTarget(null)}
          onDone={(result) => {
            setRestoreTarget(null);
            setNotice(
              `Obnoveno: vráceno ${result.totals.inserted}, upraveno ${result.totals.updated}, odebráno ${result.totals.deleted}. ` +
              `Bezpečnostní záloha před obnovou má číslo #${result.safetyBackupId}.`
            );
            void load();
            onChanged?.();
          }}
        />
      )}

      {deleteTarget && (
        <SafetyModal
          title={`Smazat zálohu #${deleteTarget.id}?`}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button type="button" className="safety-button safety-button--ghost" onClick={() => setDeleteTarget(null)}>
                Zrušit
              </button>
              <button type="button" className="safety-button safety-button--danger" onClick={confirmDelete}>
                Smazat zálohu
              </button>
            </>
          }
        >
          <p>
            {deleteTarget.kindLabel} záloha z {formatDateTime(deleteTarget.createdAt)} se smaže z databáze
            {deleteTarget.offsiteStatus === 'ok' ? ' i z off-site úložiště' : ''}. Tohle nejde vrátit.
          </p>
        </SafetyModal>
      )}
    </div>
  );
}

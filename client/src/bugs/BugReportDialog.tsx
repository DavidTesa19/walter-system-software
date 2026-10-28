// "Nahlásit chybu": what is wrong, how bad, and pictures of it. Screenshots
// come from Ctrl+V, a dropped or chosen file, or a capture of the screen. The
// date and time, the screen it was sent from and the author are filled in by
// themselves.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../auth/AuthContext';
import { formatSize, namePastedImage, shrinkImage } from '../jarvis/attachmentFiles';
import type { BugReport, BugSeverity } from './bugsApi';
import { MAX_SCREENSHOTS, SEVERITIES, bugsApi, captureScreen, formatDateTime } from './bugsApi';
import './Bugs.css';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

interface BugReportDialogProps {
  viewId: string;
  viewLabel: string;
  onClose: () => void;
  /** Shown after sending, to jump to Hlášení chyb. */
  onShowReports?: () => void;
}

type Shot = { key: string; file: File; url: string };

const BugReportDialog: React.FC<BugReportDialogProps> = ({ viewId, viewLabel, onClose, onShowReports }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('medium');
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sent, setSent] = useState<BugReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // The moment the dialog opened is when the problem was seen.
  const openedAt = useMemo(() => new Date().toISOString(), []);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  useEffect(() => {
    titleRef.current?.focus();
    return () => shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url));
  }, []);

  const addFiles = async (files: File[]) => {
    const images = files.filter((file) => IMAGE_TYPES.includes(file.type));
    if (images.length < files.length) setError('Přiložit jde jen obrázky (PNG, JPEG, WebP, GIF).');
    const room = MAX_SCREENSHOTS - shotsRef.current.length;
    if (images.length > room) setError(`Přiložit jde nejvýše ${MAX_SCREENSHOTS} snímků.`);
    const accepted = await Promise.all(images.slice(0, Math.max(0, room)).map((file) => shrinkImage(namePastedImage(file))));
    setShots((current) => [
      ...current,
      ...accepted.map((file) => ({ key: `${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file) })),
    ]);
  };

  // Ctrl+V anywhere in the dialog adds a pasted screenshot.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const removeShot = (key: string) =>
    setShots((current) => {
      const shot = current.find((item) => item.key === key);
      if (shot) URL.revokeObjectURL(shot.url);
      return current.filter((item) => item.key !== key);
    });

  const capture = async () => {
    setError(null);
    // The dialog steps aside, so the picture shows the app, not this form.
    setCapturing(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const file = await captureScreen();
      await addFiles([file]);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'NotAllowedError')) {
        setError(err instanceof Error ? err.message : 'Snímek se nepodařilo pořídit.');
      }
    } finally {
      setCapturing(false);
    }
  };

  const submit = async () => {
    if (!title.trim()) {
      setError('Napište stručně, co nefunguje.');
      titleRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const report = await bugsApi.create({
        title: title.trim(),
        description: description.trim(),
        severity,
        viewId,
        viewLabel,
        screenshots: shots.map((shot) => shot.file),
      });
      setSent(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hlášení se nepodařilo odeslat.');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className={`bug-dialog-backdrop${capturing ? ' is-capturing' : ''}`} onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="bug-dialog" role="dialog" aria-modal="true" aria-labelledby="bug-dialog-title">
        <header className="bug-dialog-header">
          <div>
            <h2 id="bug-dialog-title">{sent ? 'Děkujeme, chyba je nahlášená' : 'Nahlásit chybu'}</h2>
            <p className="bug-dialog-context">
              {formatDateTime(openedAt)} · {viewLabel} · {user?.username}
            </p>
          </div>
          <button type="button" className="bug-icon-btn" onClick={onClose} disabled={busy} aria-label="Zavřít">×</button>
        </header>

        {sent ? (
          <div className="bug-dialog-body bug-dialog-sent">
            <div className="bug-sent-mark" aria-hidden="true">✓</div>
            <p>
              Hlášení <strong>#{sent.id}</strong> „{sent.title}“ je uložené
              {sent.screenshots.length > 0 ? ` i se ${sent.screenshots.length === 1 ? 'snímkem' : `${sent.screenshots.length} snímky`}` : ''}.
            </p>
            <div className="bug-dialog-footer">
              {onShowReports && (
                <button type="button" className="bug-btn bug-btn--ghost" onClick={() => { onShowReports(); onClose(); }}>
                  Zobrazit hlášení
                </button>
              )}
              <button type="button" className="bug-btn bug-btn--primary" onClick={onClose}>Zavřít</button>
            </div>
          </div>
        ) : (
          <form
            className="bug-dialog-body"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="bug-field">
              <span>Co nefunguje? *</span>
              <input
                ref={titleRef}
                className="bug-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Např. Po uložení se v tabulce nezobrazí nový klient"
                maxLength={300}
              />
            </label>

            <label className="bug-field">
              <span>Popis</span>
              <textarea
                className="bug-input bug-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={'Co jste dělali, co se stalo a co jste čekali, že se stane.\nKroky, jak chybu zopakovat, hodně pomůžou.'}
                rows={4}
                maxLength={10000}
              />
            </label>

            <div className="bug-field">
              <span>Závažnost</span>
              <div className="bug-severity-picker" role="radiogroup" aria-label="Závažnost">
                {SEVERITIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={severity === item.id}
                    className={`bug-severity-option bug-severity--${item.id}${severity === item.id ? ' is-active' : ''}`}
                    onClick={() => setSeverity(item.id)}
                    title={item.hint}
                  >
                    <span className="bug-severity-dot" aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
              </div>
              <small className="bug-hint">{SEVERITIES.find((item) => item.id === severity)?.hint}</small>
            </div>

            <div className="bug-field">
              <span>Snímky obrazovky ({shots.length}/{MAX_SCREENSHOTS})</span>
              <div
                className={`bug-dropzone${dragging ? ' is-dragging' : ''}`}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes('Files')) return;
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void addFiles(Array.from(event.dataTransfer.files));
                }}
              >
                {shots.length > 0 && (
                  <div className="bug-shots">
                    {shots.map((shot) => (
                      <figure key={shot.key} className="bug-shot">
                        <img src={shot.url} alt={shot.file.name} />
                        <figcaption>{formatSize(shot.file.size)}</figcaption>
                        <button type="button" className="bug-shot-remove" onClick={() => removeShot(shot.key)} aria-label={`Odebrat ${shot.file.name}`}>×</button>
                      </figure>
                    ))}
                  </div>
                )}
                <div className="bug-dropzone-actions">
                  <button type="button" className="bug-btn bug-btn--ghost" onClick={() => void capture()} disabled={shots.length >= MAX_SCREENSHOTS}>
                    Vyfotit obrazovku
                  </button>
                  <button type="button" className="bug-btn bug-btn--ghost" onClick={() => fileInputRef.current?.click()} disabled={shots.length >= MAX_SCREENSHOTS}>
                    Vybrat soubor
                  </button>
                  <span className="bug-hint">nebo vložte Ctrl+V / přetáhněte sem</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMAGE_TYPES.join(',')}
                  multiple
                  hidden
                  onChange={(event) => {
                    void addFiles(Array.from(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
              </div>
            </div>

            {error && <div className="bug-error" role="alert">{error}</div>}

            <div className="bug-dialog-footer">
              <button type="button" className="bug-btn bug-btn--ghost" onClick={onClose} disabled={busy}>Zrušit</button>
              <button type="submit" className="bug-btn bug-btn--primary" disabled={busy}>
                {busy ? 'Odesílám…' : 'Odeslat hlášení'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default BugReportDialog;

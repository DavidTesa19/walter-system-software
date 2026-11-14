// Motivy › "Navrhnout motiv pomocí AI": a description, a logo and/or a web
// address go to POST /api/palettes/ai (server/palettes/aiPalette.js); the
// proposal comes back as a new palette draft the user edits and saves.
// "Upravit existující" sends a saved palette as `base` with the change in
// words ("tmavší", "teplejší akcent"); the result is a new draft too, so the
// original stays as it was until the user saves.

import { useCallback, useEffect, useRef, useState } from 'react';
import { colord } from 'colord';
import { apiUpload } from '../utils/api';
import type { ColorPalette, PaletteColors, PaletteTypography, Theme } from './ThemeContext';

export interface AiPaletteProposal {
  name: string;
  mode: Theme;
  colors: PaletteColors;
  typography: PaletteTypography;
  note: string;
  warnings: string[];
}

interface AiPaletteBoxProps {
  defaultMode: Theme;
  disabled?: boolean;
  /** The saved palettes "Upravit existující" offers. */
  palettes: ColorPalette[];
  onProposal: (proposal: AiPaletteProposal) => void;
}

type Task = 'new' | 'edit';

const MAX_SIDE = 800;

const isSvg = (file: File) => file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);

// Hand-made SVGs often lack xmlns or width/height, and a browser refuses to
// draw them as an <img>. Add what is missing (size from the viewBox).
const repairSvg = async (file: File) => {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('SVG soubor je poškozený.');
  }
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const hasSize = (name: string) => /^\s*[\d.]+(px)?\s*$/.test(root.getAttribute(name) ?? '');
  if (!hasSize('width') || !hasSize('height')) {
    const [, , w, h] = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? box : [0, 0, 512, 512];
    root.setAttribute('width', String(w));
    root.setAttribute('height', String(h));
  }
  return new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' });
};

// Any image the browser can show (SVG included) becomes a PNG of at most
// 800 px: small to send, and a format Claude reads. Done when the logo is
// picked, so a file that cannot be read is reported at once.
const toPng = async (file: File) => {
  const source: Blob = isSvg(file) ? await repairSvg(file) : file;
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth || MAX_SIDE, image.naturalHeight || MAX_SIDE));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((image.naturalWidth || MAX_SIDE) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || MAX_SIDE) * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Logo se nepodařilo zpracovat.'))), 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Soubor není obrázek, který prohlížeč umí otevřít (zkuste PNG, JPG, WebP nebo SVG).'));
    };
    image.src = url;
  });
};

export default function AiPaletteBox({ defaultMode, disabled, palettes, onProposal }: AiPaletteBoxProps) {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<Task>('new');
  // The palette in use for the current mode, unless the user picks another.
  const [baseId, setBaseId] = useState<number | null>(null);
  const base =
    palettes.find((palette) => palette.id === baseId) ??
    palettes.find((palette) => palette.mode === defaultMode && palette.is_active) ??
    palettes[0] ??
    null;
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [mode, setMode] = useState<Theme>(defaultMode);
  const [logo, setLogo] = useState<Blob | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!logo) {
      setLogoPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(logo);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const editing = task === 'edit';

  const pickLogo = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setLogo(await toPng(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo se nepodařilo zpracovat.');
    }
  }, []);

  // Ctrl+V of a copied image works anywhere in the box while a new theme is made.
  useEffect(() => {
    if (!open || task !== 'new') return undefined;
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      void pickLogo(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [open, task, pickLogo]);
  const canSubmit = (editing ? Boolean(base && description.trim()) : Boolean(description.trim() || website.trim() || logo)) && !busy && !disabled;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('description', description.trim());
      if (editing && base) {
        form.append('mode', base.mode);
        // Saved palettes keep colours as hsl(…); the AI works in #rrggbb.
        const colors = Object.fromEntries(Object.entries(base.colors).map(([key, value]) => [key, colord(value).toHex().slice(0, 7)]));
        form.append('base', JSON.stringify({ name: base.name, colors, typography: base.typography }));
      } else {
        form.append('website', website.trim());
        form.append('mode', mode);
        if (logo) form.append('logo', logo, 'logo.png');
      }
      const proposal = await apiUpload<AiPaletteProposal>('/api/palettes/ai', form);
      onProposal(proposal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Návrh se nepodařilo vytvořit.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="ai-palette__open" onClick={() => setOpen(true)} disabled={disabled}>
        ✨ Navrhnout motiv pomocí AI
      </button>
    );
  }

  return (
    <section className="ai-palette" aria-label="Navrhnout motiv pomocí AI">
      <div className="ai-palette__header">
        <h3>✨ Navrhnout motiv pomocí AI</h3>
        <button type="button" className="ai-palette__close" onClick={() => setOpen(false)} aria-label="Zavřít">
          ×
        </button>
      </div>
      <div className="ai-palette__tasks" role="tablist" aria-label="Co má AI udělat">
        <button type="button" role="tab" aria-selected={!editing} className={!editing ? 'is-active' : ''} onClick={() => setTask('new')} disabled={busy}>
          Nový motiv
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={editing}
          className={editing ? 'is-active' : ''}
          onClick={() => setTask('edit')}
          disabled={busy || palettes.length === 0}
          title={palettes.length === 0 ? 'Zatím není uložený žádný motiv.' : undefined}
        >
          Upravit existující
        </button>
      </div>

      {editing ? (
        <>
          <p className="ai-palette__hint">
            Vyberte motiv a napište, co změnit. Ostatní zůstane, jak je, a kontrast se ohlídá. Výsledek se otevře jako
            nová paleta; původní motiv se nezmění, dokud ji neuložíte.
          </p>
          <label className="ai-palette__field">
            <span>Motiv</span>
            <select value={base?.id ?? ''} onChange={(event) => setBaseId(Number(event.target.value))} disabled={busy}>
              {palettes.map((palette) => (
                <option key={palette.id} value={palette.id}>
                  {palette.name} ({palette.mode === 'dark' ? 'tmavý' : 'světlý'}
                  {palette.is_active ? ', používaný' : ''})
                </option>
              ))}
            </select>
          </label>
          {base && (
            <div className="ai-palette__swatches" aria-hidden="true">
              {Object.values(base.colors).map((color, index) => (
                <span key={index} style={{ background: color }} />
              ))}
            </div>
          )}
          <label className="ai-palette__field">
            <span>Co změnit</span>
            <textarea
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="např. tmavší, výraznější akcent, méně modré, víc kontrastu, jiné písmo nadpisů"
              disabled={busy}
            />
          </label>
        </>
      ) : (
        <>
      <p className="ai-palette__hint">
        Popište, jak má aplikace působit, nebo přidejte logo či web značky. Z webu se načtou jeho skutečné barvy
        a písma; nejpřesnější je logo. Návrh se otevře jako nová paleta, kterou před uložením upravíte.
      </p>

      <label className="ai-palette__field">
        <span>Popis</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="např. klidný, firemní, modrozelený, s teplým oranžovým akcentem"
          disabled={busy}
        />
      </label>

      <div className="ai-palette__row">
        <label className="ai-palette__field">
          <span>Web značky (nepovinné)</span>
          <input
            type="text"
            inputMode="url"
            value={website}
            maxLength={300}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="např. firma.cz"
            disabled={busy}
          />
        </label>
        <label className="ai-palette__field ai-palette__field--narrow">
          <span>Režim</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as Theme)} disabled={busy}>
            <option value="light">Světlý</option>
            <option value="dark">Tmavý</option>
          </select>
        </label>
      </div>

      <div
        className={`ai-palette__logo${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          if (busy) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) void pickLogo(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={fileInput}
          type="file"
          className="ai-palette__file-input"
          accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg"
          tabIndex={-1}
          onChange={(event) => {
            void pickLogo(event.target.files?.[0]);
            event.target.value = '';
          }}
          disabled={busy}
        />
        {logoPreview ? (
          <>
            <img src={logoPreview} alt="Vybrané logo" />
            <button type="button" className="ai-palette__link" onClick={() => setLogo(null)} disabled={busy}>
              Odebrat logo
            </button>
          </>
        ) : (
          <button type="button" className="ai-palette__file" onClick={() => fileInput.current?.click()} disabled={busy}>
            <span aria-hidden="true">🖼</span> Přidat logo{' '}
            <small>(nepovinné; vyberte, přetáhněte nebo vložte Ctrl+V)</small>
          </button>
        )}
      </div>
        </>
      )}

      {error && <div className="ai-palette__error" role="alert">{error}</div>}

      <div className="ai-palette__actions">
        <button type="button" className="ai-palette__submit" onClick={submit} disabled={!canSubmit}>
          {busy ? 'Navrhuji… (do půl minuty)' : editing ? 'Upravit motiv' : 'Navrhnout motiv'}
        </button>
      </div>
    </section>
  );
}

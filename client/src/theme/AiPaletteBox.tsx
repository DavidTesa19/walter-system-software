// Motivy › "Navrhnout motiv pomocí AI": a description, a logo and/or a web
// address go to POST /api/palettes/ai (server/palettes/aiPalette.js); the
// proposal comes back as a new palette draft the user edits and saves.
// "Upravit existující" sends a saved palette as `base` with the change in
// words ("tmavší", "teplejší akcent"); the result is a new draft too, so the
// original stays as it was until the user saves.

import { useEffect, useState } from 'react';
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

// Any image the browser can show (SVG included) becomes a PNG of at most
// 800 px: small to send, and a format Claude reads.
const toPng = (file: File) =>
  new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file);
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
      reject(new Error('Soubor není obrázek, který prohlížeč umí otevřít.'));
    };
    image.src = url;
  });

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
  const [logo, setLogo] = useState<File | null>(null);
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
        if (logo) form.append('logo', await toPng(logo), 'logo.png');
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
        Popište, jak má aplikace působit, nebo přidejte logo či web značky. Nejpřesnější barvy dá logo: z webu AI
        přečte hlavně text, ne styly. Návrh se otevře jako nová paleta, kterou před uložením upravíte.
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

      <div className="ai-palette__logo">
        {logoPreview ? (
          <>
            <img src={logoPreview} alt="Vybrané logo" />
            <button type="button" className="ai-palette__link" onClick={() => setLogo(null)} disabled={busy}>
              Odebrat logo
            </button>
          </>
        ) : (
          <label className="ai-palette__file">
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
              disabled={busy}
            />
            <span aria-hidden="true">🖼</span> Přidat logo <small>(nepovinné, PNG, JPG, SVG…)</small>
          </label>
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

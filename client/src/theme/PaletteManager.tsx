import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colord } from 'colord';
import { HslStringColorPicker } from 'react-colorful';
import {
  useTheme,
  type PaletteColors,
  type PaletteTypography,
  type ColorPalette,
  type PaletteInput,
  type SharedPalette,
  type Theme
} from './ThemeContext';
import { Check, Copy, Lock, LockOpen, Pencil, Plus, Trash2, Users } from 'lucide-react';
import AiPaletteBox, { type AiPaletteProposal } from './AiPaletteBox';
import { TAB_ICON } from '../ui/icons';
import { apiGet } from '../utils/api';
import { ensureFonts } from './fontLoader';
import './PaletteManager.css';

type PaletteDraft = {
  name: string;
  mode: Theme;
  colors: PaletteColors;
  typography: PaletteTypography;
  is_active: boolean;
};

const COLOR_FIELDS: Array<{ key: keyof PaletteColors; label: string; description: string }> = [
  { key: 'primary', label: 'Primární barva', description: 'Barva tlačítek, aktivních prvků a hlavních akcí.' },
  { key: 'accent', label: 'Akcent', description: 'Sekundární zvýraznění, odkazy a upozornění.' },
  { key: 'background', label: 'Pozadí', description: 'Globální pozadí aplikace.' },
  { key: 'surface', label: 'Povrch', description: 'Karty, panely a tabulky.' },
  { key: 'text', label: 'Text', description: 'Primární barva textu.' },
  { key: 'muted', label: 'Doplňkový text', description: 'Sekundární texty, popisky a metadata.' },
  { key: 'border', label: 'Rámečky', description: 'Čáry, orámování a oddělovače.' }
];

// The edit form shows the colours in two groups: the three that set the
// overall look first, larger and with what they are for; the details after.
const COLOR_GROUPS: Array<{ title: string; hint: string; main: boolean; keys: Array<keyof PaletteColors> }> = [
  { title: 'Hlavní barvy', hint: 'určují celkový vzhled', main: true, keys: ['primary', 'background', 'text'] },
  { title: 'Doplňkové', hint: 'detaily', main: false, keys: ['accent', 'surface', 'muted', 'border'] },
];
const SHORT_DESCRIPTIONS: Partial<Record<keyof PaletteColors, string>> = {
  primary: 'tlačítka a aktivní prvky',
  background: 'pozadí stránky',
  text: 'hlavní text',
};

const TEMPLATE_COLORS: Record<Theme, PaletteColors> = {
  light: {
    primary: 'hsl(221, 83%, 55%)',
    accent: 'hsl(172, 66%, 45%)',
    background: 'hsl(210, 33%, 98%)',
    surface: 'hsl(0, 0%, 100%)',
    text: 'hsl(224, 33%, 16%)',
    muted: 'hsl(220, 12%, 46%)',
    border: 'hsl(214, 32%, 89%)'
  },
  dark: {
    primary: 'hsl(217, 86%, 65%)',
    accent: 'hsl(162, 87%, 60%)',
    background: 'hsl(222, 47%, 11%)',
    surface: 'hsl(218, 39%, 14%)',
    text: 'hsl(210, 40%, 96%)',
    muted: 'hsl(215, 20%, 65%)',
    border: 'hsl(220, 23%, 28%)'
  }
};

const TEMPLATE_TYPOGRAPHY: Record<Theme, PaletteTypography> = {
  light: {
    heading: "'Inter', 'Segoe UI', system-ui, sans-serif",
    subheading: "'Poppins', 'Segoe UI', sans-serif",
    body: "'Inter', system-ui, sans-serif"
  },
  dark: {
    heading: "'Inter', 'Segoe UI', system-ui, sans-serif",
    subheading: "'Poppins', 'Segoe UI', sans-serif",
    body: "'Inter', system-ui, sans-serif"
  }
};

const FONT_FIELDS: Array<{ key: keyof PaletteTypography; label: string; sample: string }> = [
  { key: 'heading', label: 'Nadpisy', sample: 'Walter System – Nadpis' },
  { key: 'subheading', label: 'Podnadpisy', sample: 'Příprava na schválení' },
  { key: 'body', label: 'Tělo textu', sample: 'Tabulky, popisky a drobný text.' }
];

const FONT_SUGGESTIONS: string[] = [
  "'Inter', system-ui, sans-serif",
  "'Poppins', 'Segoe UI', sans-serif",
  "'Manrope', 'Segoe UI', system-ui, sans-serif",
  "'Nunito Sans', 'Segoe UI', sans-serif",
  "'Work Sans', 'Segoe UI', sans-serif",
  "'Source Sans Pro', 'Segoe UI', sans-serif",
  "'Montserrat', 'Segoe UI', sans-serif",
  "'Raleway', 'Segoe UI', sans-serif"
];

const COLOR_HISTORY_STORAGE_KEY = 'palette-manager-color-history';
const COLOR_HISTORY_LIMIT = 20;

const normalizeColorValue = (value: string) => {
  const normalized = colord(value);
  return normalized.isValid() ? normalized.toHslString() : value;
};

const createDraftFromPalette = (palette: ColorPalette): PaletteDraft => ({
  name: palette.name,
  mode: palette.mode,
  colors: { ...palette.colors },
  typography: { ...(palette.typography ?? TEMPLATE_TYPOGRAPHY[palette.mode]) },
  is_active: palette.is_active
});

const createTemplateDraft = (
  mode: Theme,
  base?: { colors: PaletteColors; typography: PaletteTypography }
): PaletteDraft => ({
  name: mode === 'light' ? 'Nová světlá paleta' : 'Nová tmavá paleta',
  mode,
  colors: { ...(base?.colors ?? TEMPLATE_COLORS[mode]) },
  typography: { ...(base?.typography ?? TEMPLATE_TYPOGRAPHY[mode]) },
  is_active: false
});

/** A palette in Týmové palety: one of the user's own, or a colleague's. */
type TeamPalette = { palette: ColorPalette | SharedPalette; own: boolean };

const plural = (count: number) => (count === 1 ? 'paleta' : count >= 2 && count <= 4 ? 'palety' : 'palet');

// Same look as one of the user's own palettes: a copy already made.
const sameLook = (a: { mode: Theme; colors: PaletteColors }, b: { mode: Theme; colors: PaletteColors }) =>
  a.mode === b.mode &&
  COLOR_FIELDS.every(({ key }) => colord(a.colors[key]).toHex() === colord(b.colors[key]).toHex());

const PaletteManager: React.FC = () => {
  const {
    theme,
    setTheme,
    palettes,
    isLoadingPalettes,
    error,
    createPalette,
    updatePalette,
    deletePalette,
    activatePalette
  } = useTheme();

  const [drafts, setDrafts] = useState<Record<Theme, PaletteDraft | null>>({ light: null, dark: null });
  const [editingDraft, setEditingDraft] = useState<{ id: number; value: PaletteDraft } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [colorHistory, setColorHistory] = useState<string[]>([]);
  const [aiNotes, setAiNotes] = useState<Record<Theme, { note: string; warnings: string[] } | null>>({ light: null, dark: null });
  const hasLoadedHistoryRef = useRef(false);
  const [shared, setShared] = useState<SharedPalette[] | null>(null);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Colleagues' public palettes, read when the screen opens.
  useEffect(() => {
    let cancelled = false;
    apiGet<SharedPalette[]>('/color-palettes/shared')
      .then(list => {
        if (!cancelled) {
          setShared(list);
          setSharedError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSharedError('Palety kolegů se nepodařilo načíst.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // One group per colleague with something to show (the server leaves out the
  // untouched starter palettes everyone has).
  const colleagues = useMemo(() => {
    const groups = new Map<number, { name: string; palettes: SharedPalette[] }>();
    for (const palette of shared ?? []) {
      const group = groups.get(palette.owner_id) ?? { name: palette.owner_name, palettes: [] };
      group.palettes.push(palette);
      groups.set(palette.owner_id, group);
    }
    return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
  }, [shared]);

  // The team's palettes: the user's own team ones first, then the colleagues'.
  const teamPalettes = useMemo<TeamPalette[]>(() => [
    ...palettes.filter(palette => palette.is_shared && !palette.is_private).map(palette => ({ palette, own: true })),
    ...(shared ?? []).filter(palette => palette.is_shared).map(palette => ({ palette, own: false })),
  ], [palettes, shared]);

  // An AI proposal opens as the new palette of its mode, ready to edit.
  const handleAiProposal = (proposal: AiPaletteProposal) => {
    const mode = proposal.mode;
    setFormError(null);
    setEditingDraft(null);
    setDrafts(prev => ({
      ...prev,
      [mode]: {
        name: proposal.name,
        mode,
        colors: Object.fromEntries(
          COLOR_FIELDS.map(field => [field.key, normalizeColorValue(proposal.colors[field.key])])
        ) as unknown as PaletteColors,
        typography: { ...proposal.typography },
        is_active: false
      }
    }));
    setAiNotes(prev => ({ ...prev, [mode]: { note: proposal.note, warnings: proposal.warnings ?? [] } }));
  };

  // The font picker shows each font in itself, so this screen loads them all.
  useEffect(() => {
    ensureFonts(FONT_SUGGESTIONS);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const stored = window.localStorage.getItem(COLOR_HISTORY_STORAGE_KEY);
      if (!stored) {
        return;
      }
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const sanitized = parsed.filter((item): item is string => typeof item === 'string');
        if (sanitized.length > 0) {
          const normalized = sanitized.map(normalizeColorValue);
          const deduplicated = normalized.filter((color, index) => normalized.indexOf(color) === index);
          setColorHistory(deduplicated.slice(0, COLOR_HISTORY_LIMIT));
        }
      }
    } catch {
      // Ignore storage parsing issues to avoid blocking the editor.
    } finally {
      hasLoadedHistoryRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedHistoryRef.current || typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(COLOR_HISTORY_STORAGE_KEY, JSON.stringify(colorHistory));
    } catch {
      // Silent failure keeps the UI responsive even when storage is unavailable.
    }
  }, [colorHistory]);

  const palettesByMode = useMemo(() => ({
    light: palettes.filter(palette => palette.mode === 'light'),
    dark: palettes.filter(palette => palette.mode === 'dark')
  }), [palettes]);

  const handleSaveColorToHistory = (color: string) => {
    const normalized = normalizeColorValue(color);
    setColorHistory(prev => {
      const deduplicated = prev.filter(existing => existing !== normalized);
      const next = [normalized, ...deduplicated];
      return next.slice(0, COLOR_HISTORY_LIMIT);
    });
  };

  const handleRemoveColorFromHistory = (color: string) => {
    setColorHistory(prev => prev.filter(existing => existing !== color));
  };

  const getBaseValues = (mode: Theme) => {
    const active = palettes.find(palette => palette.mode === mode && palette.is_active);
    return {
      colors: active ? { ...active.colors } : TEMPLATE_COLORS[mode],
      typography: active?.typography
        ? { ...active.typography }
        : TEMPLATE_TYPOGRAPHY[mode]
    };
  };

  const handleStartCreate = (mode: Theme) => {
    setFormError(null);
    setEditingDraft(null);
    setAiNotes(prev => ({ ...prev, [mode]: null }));
    setDrafts(prev => ({
      ...prev,
  [mode]: createTemplateDraft(mode, getBaseValues(mode))
    }));
  };

  const handleCancelCreate = (mode: Theme) => {
    setDrafts(prev => ({ ...prev, [mode]: null }));
    setAiNotes(prev => ({ ...prev, [mode]: null }));
  };

  const handleDraftChange = (mode: Theme, updater: (current: PaletteDraft) => PaletteDraft) => {
    setDrafts(prev => {
      const current = prev[mode];
      if (!current) return prev;
      return { ...prev, [mode]: updater(current) };
    });
  };

  const handleEditingChange = (updater: (current: PaletteDraft) => PaletteDraft) => {
    setEditingDraft(prev => {
      if (!prev) return prev;
      return { id: prev.id, value: updater(prev.value) };
    });
  };

  const validateDraft = (draft: PaletteDraft) => {
    if (!draft.name.trim()) {
      setFormError('Zadejte název palety.');
      return false;
    }
    return true;
  };

  const submitCreate = async (mode: Theme) => {
    const draft = drafts[mode];
    if (!draft) return;
    if (!validateDraft(draft)) return;

    setIsSaving(true);
    setFormError(null);
    try {
      const payload: PaletteInput = {
        name: draft.name.trim(),
        mode,
        colors: draft.colors,
        typography: draft.typography,
        is_active: draft.is_active
      };
      const created = await createPalette(payload);
      setDrafts(prev => ({ ...prev, [mode]: null }));
      setAiNotes(prev => ({ ...prev, [mode]: null }));
      if (created.mode === mode && created.is_active) {
        // active palette already applied in context
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nepodařilo se uložit paletu.';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (palette: ColorPalette) => {
    setFormError(null);
    setDrafts({ light: null, dark: null });
    setEditingDraft({ id: palette.id, value: createDraftFromPalette(palette) });
  };

  const submitEdit = async () => {
    if (!editingDraft) return;
    if (!validateDraft(editingDraft.value)) return;

    setIsSaving(true);
    setFormError(null);
    try {
      const payload: Partial<Omit<PaletteInput, 'mode'>> = {
        name: editingDraft.value.name.trim(),
        colors: editingDraft.value.colors,
        typography: editingDraft.value.typography,
        is_active: editingDraft.value.is_active
      };
      await updatePalette(editingDraft.id, payload);
      setEditingDraft(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nepodařilo se aktualizovat paletu.';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (palette: ColorPalette) => {
    const confirmed = window.confirm(`Opravdu odstranit paletu "${palette.name}"?`);
    if (!confirmed) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await deletePalette(palette.id);
      if (editingDraft?.id === palette.id) {
        setEditingDraft(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nepodařilo se odstranit paletu.';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivate = async (palette: ColorPalette) => {
    if (palette.is_active) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await activatePalette(palette.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nepodařilo se aktivovat paletu.';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Who sees a palette: colleagues by default, only its owner when private,
  // and everyone in Týmové palety when it is one of the team's.
  const changeVisibility = async (
    palette: ColorPalette,
    change: { is_shared?: boolean; is_private?: boolean },
    message: string
  ) => {
    setIsSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      await updatePalette(palette.id, change);
      setNotice(message);
    } catch {
      setFormError('Viditelnost palety se nepodařilo změnit.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTeam = (palette: ColorPalette) =>
    changeVisibility(
      palette,
      { is_shared: !palette.is_shared },
      palette.is_shared
        ? `Paleta „${palette.name}“ už není mezi týmovými.`
        : `Paleta „${palette.name}“ je mezi Týmovými paletami pro všechny.`
    );

  const handleTogglePrivate = (palette: ColorPalette) =>
    changeVisibility(
      palette,
      { is_private: !palette.is_private },
      palette.is_private
        ? `Paletu „${palette.name}“ teď vidí i kolegové.`
        : `Paleta „${palette.name}“ je soukromá: vidíte ji jen vy.`
    );

  // A colleague's palette always becomes the user's own copy, so the owner's
  // later edits or deletion never change anybody else's look. "Použít" also
  // switches to it (and to its mode, so the change is visible at once).
  const handleUseShared = async (palette: SharedPalette, activate: boolean) => {
    setIsSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const existing = palettes.find(own => sameLook(own, palette));
      if (existing) {
        if (activate && !existing.is_active) await activatePalette(existing.id);
      } else {
        await createPalette({
          name: palette.name,
          mode: palette.mode,
          colors: palette.colors,
          typography: palette.typography ?? TEMPLATE_TYPOGRAPHY[palette.mode],
          is_active: activate
        });
      }
      if (activate) {
        if (palette.mode !== theme) setTheme(palette.mode);
        setNotice(`Používáte paletu „${palette.name}“ od ${palette.owner_name}.`);
      } else {
        setNotice(`Paleta „${palette.name}“ je mezi vašimi paletami.`);
      }
    } catch {
      setFormError('Paletu se nepodařilo převzít.');
    } finally {
      setIsSaving(false);
    }
  };

  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Cards for Týmové palety (with who made each) and for one colleague.
  const renderCards = (list: TeamPalette[], showOwner: boolean) => (
    <div className="palette-shared__grid">
      {list.map(({ palette, own }) => {
        const copy = own ? (palette as ColorPalette) : palettes.find(mine => sameLook(mine, palette));
        return (
          <SharedPaletteCard
            key={`${own ? 'own' : (palette as SharedPalette).owner_id}-${palette.id}`}
            palette={palette}
            owner={showOwner ? (own ? 'Vy' : (palette as SharedPalette).owner_name) : undefined}
            team={!showOwner && Boolean(palette.is_shared)}
            own={own}
            inUse={Boolean(copy?.is_active)}
            saved={Boolean(copy)}
            disabled={isSaving}
            onUse={() => (own ? handleActivate(palette as ColorPalette) : handleUseShared(palette as SharedPalette, true))}
            onSave={() => handleUseShared(palette as SharedPalette, false)}
          />
        );
      })}
    </div>
  );

  return (
    <div className="palette-manager">
      <div className="palette-manager__header">
        <div>
          <h2>Správa barevných palet</h2>
          <p>Upravujte barevné schéma pro světlý i tmavý režim. Aktivní palety se použijí v aplikaci i ve veřejném formuláři.</p>
        </div>
        <div className="palette-manager__status">
          {isLoadingPalettes ? <span className="badge badge--info">Načítání…</span> : null}
          {isSaving ? <span className="badge badge--info">Ukládání…</span> : null}
        </div>
      </div>

      {(error || formError) && (
        <div className="palette-manager__alert">
          {formError ?? error}
        </div>
      )}

      {notice && !formError ? (
        <div className="palette-manager__notice" role="status">
          <span>{notice}</span>
          <button type="button" className="palette-manager__notice-close" onClick={() => setNotice(null)} aria-label="Zavřít">
            ×
          </button>
        </div>
      ) : null}

      <nav className="palette-jump" aria-label="Části stránky">
        <button type="button" className="palette-jump__link" onClick={() => jumpTo('palettes-mine')}>
          Moje palety <span className="palette-jump__count">{palettes.length}</span>
        </button>
        <button type="button" className="palette-jump__link" onClick={() => jumpTo('palettes-team')}>
          <Users {...TAB_ICON} aria-hidden="true" />
          Týmové <span className="palette-jump__count">{teamPalettes.length}</span>
        </button>
        <button type="button" className="palette-jump__link" onClick={() => jumpTo('palettes-colleagues')}>
          Kolegové <span className="palette-jump__count">{colleagues.length}</span>
        </button>
      </nav>

      <AiPaletteBox defaultMode={theme} disabled={isSaving} palettes={palettes} onProposal={handleAiProposal} />

      <section id="palettes-mine" className="palette-section" aria-labelledby="palettes-mine-title">
      <div className="palette-section__header">
        <h3 id="palettes-mine-title" className="palette-manager__section-title">Moje palety</h3>
        <p>
          Kolegové je vidí v části Palety kolegů; zámkem <Lock size={12} aria-label="zámek" /> paletu skryjete.
          Ikonou týmu <Users size={12} aria-label="tým" /> ji dáte mezi Týmové palety.
        </p>
      </div>

      <div className="palette-manager__columns">
        {(['light', 'dark'] as Theme[]).map(mode => {
          const modePalettes = palettesByMode[mode];
          const draft = drafts[mode];
          return (
            <section key={mode} className="palette-column">
              <div className="palette-column__header">
                <div>
                  <h3>{mode === 'light' ? 'Světlé' : 'Tmavé'}</h3>
                  <p>
                    {modePalettes.length} {modePalettes.length === 1 ? 'paleta' : modePalettes.length >= 2 && modePalettes.length <= 4 ? 'palety' : 'palet'}
                    {' · '}pro {mode === 'light' ? 'světlý' : 'tmavý'} režim
                  </p>
                </div>
                <button
                  type="button"
                  className="palette-column__add"
                  onClick={() => handleStartCreate(mode)}
                  disabled={Boolean(draft) || isSaving}
                >
                  <Plus {...TAB_ICON} />
                  Nová paleta
                </button>
              </div>

              {draft && aiNotes[mode] ? (
                <div className="ai-palette__note">
                  <strong>Návrh AI:</strong> {aiNotes[mode]!.note}
                  {aiNotes[mode]!.warnings.length > 0 && (
                    <ul className="ai-palette__warnings">
                      {aiNotes[mode]!.warnings.map(warning => <li key={warning}>{warning}</li>)}
                    </ul>
                  )}
                </div>
              ) : null}

              {draft ? (
                <PaletteForm
                  key={`new-${mode}`}
                  heading="Nová paleta"
                  draft={draft}
                  disabled={isSaving}
                  onCancel={() => handleCancelCreate(mode)}
                  onChange={updated => handleDraftChange(mode, () => updated)}
                  onSubmit={() => submitCreate(mode)}
                  colorHistory={colorHistory}
                  onAddHistory={handleSaveColorToHistory}
                  onRemoveHistory={handleRemoveColorFromHistory}
                />
              ) : null}

              {modePalettes.length === 0 ? (
                <div className="palette-column__empty">
                  <p>Zatím zde není žádná paleta.</p>
                </div>
              ) : (
                modePalettes.map(palette => {
                  const isEditing = editingDraft?.id === palette.id;
                  return (
                    <PaletteCard
                      key={palette.id}
                      palette={palette}
                      disabled={isSaving}
                      onActivate={() => handleActivate(palette)}
                      onDelete={() => handleDelete(palette)}
                      onEdit={() => handleStartEdit(palette)}
                      onToggleTeam={() => handleToggleTeam(palette)}
                      onTogglePrivate={() => handleTogglePrivate(palette)}
                    >
                      {isEditing ? (
                        <PaletteForm
                          heading="Upravit paletu"
                          draft={editingDraft!.value}
                          disabled={isSaving}
                          onCancel={() => setEditingDraft(null)}
                          onChange={updated => handleEditingChange(() => updated)}
                          onSubmit={submitEdit}
                          colorHistory={colorHistory}
                          onAddHistory={handleSaveColorToHistory}
                          onRemoveHistory={handleRemoveColorFromHistory}
                        />
                      ) : null}
                    </PaletteCard>
                  );
                })
              )}
            </section>
          );
        })}
      </div>
      </section>

      <section id="palettes-team" className="palette-section" aria-labelledby="palettes-team-title">
        <div className="palette-section__header">
          <h3 id="palettes-team-title" className="palette-manager__section-title">
            <Users {...TAB_ICON} aria-hidden="true" />
            Týmové palety
            <span className="palette-section__count">{teamPalettes.length}</span>
          </h3>
          <p>
            Výběr těch nejlepších pro celý tým. Paletu sem dáte ikonou týmu <Users size={12} aria-label="tým" /> u své
            palety; Použít vytvoří vaši vlastní kopii, pozdější změny autora se vás netýkají.
          </p>
        </div>
        {sharedError ? (
          <div className="palette-column__empty">{sharedError}</div>
        ) : shared === null ? (
          <div className="palette-column__empty">Načítání…</div>
        ) : teamPalettes.length === 0 ? (
          <div className="palette-column__empty">
            Zatím tu nic není. Svou paletu sem dáte ikonou týmu <Users size={12} aria-label="tým" /> u palety v části Moje palety.
          </div>
        ) : (
          renderCards(teamPalettes, true)
        )}
      </section>

      <section id="palettes-colleagues" className="palette-section" aria-labelledby="palettes-colleagues-title">
        <div className="palette-section__header">
          <h3 id="palettes-colleagues-title" className="palette-manager__section-title">Palety kolegů</h3>
          <p>Co si kolegové vytvořili. Použitím si vytvoříte vlastní kopii.</p>
        </div>
        {sharedError ? (
          <div className="palette-column__empty">{sharedError}</div>
        ) : shared === null ? (
          <div className="palette-column__empty">Načítání…</div>
        ) : colleagues.length === 0 ? (
          <div className="palette-column__empty">Kolegové zatím nemají žádnou vlastní paletu.</div>
        ) : (
          colleagues.map(owner => (
            <div key={owner.id} className="palette-shared__owner">
              <div className="palette-shared__owner-name">
                <span className="palette-shared__avatar" aria-hidden="true">{owner.name.slice(0, 1).toUpperCase()}</span>
                {owner.name}
                <span className="palette-section__count">
                  {owner.palettes.length} {plural(owner.palettes.length)}
                </span>
              </div>
              {renderCards(owner.palettes.map(palette => ({ palette, own: false })), false)}
            </div>
          ))
        )}
      </section>
    </div>
  );
};

// A small picture of the app in a palette's colours: the page, the menu, a
// card with two lines of text, a button and an accent dot.
// A miniature of the app: menu with an active item, a page title and button,
// and a table card with rows, a badge in the accent colour and muted text.
// Laid out in percentages, so the same picture works small and large.
const PalettePreview: React.FC<{ colors: PaletteColors; large?: boolean }> = ({ colors, large }) => (
  <div className={`palette-preview${large ? ' palette-preview--large' : ''}`} style={{ background: colors.background }} aria-hidden="true">
    <div className="pp-menu" style={{ background: colors.surface, borderRight: `1px solid ${colors.border}` }}>
      <span className="pp-logo" style={{ background: colors.primary }} />
      <span className="pp-item is-active" style={{ background: `color-mix(in srgb, ${colors.primary} 22%, transparent)` }} />
      <span className="pp-item" style={{ background: colors.muted }} />
      <span className="pp-item" style={{ background: colors.muted }} />
    </div>
    <span className="pp-title" style={{ background: colors.text }} />
    <span className="pp-button" style={{ background: colors.primary }} />
    <div className="pp-card" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
      {[0, 1, 2].map(row => (
        <div key={row} className="pp-row" style={{ borderBottom: row < 2 ? `1px solid ${colors.border}` : 'none' }}>
          <span className="pp-text" style={{ background: colors.text }} />
          <span className="pp-muted" style={{ background: colors.muted }} />
          {row === 0 ? <span className="pp-badge" style={{ background: colors.accent }} /> : null}
        </div>
      ))}
    </div>
  </div>
);

// "'Inter', system-ui, sans-serif" → "Inter"; the three fonts, each once.
const fontName = (stack?: string) => (stack ?? '').split(',')[0].replace(/['"]/g, '').trim();
const fontSummary = (typography: PaletteTypography) =>
  [...new Set([typography.heading, typography.subheading, typography.body].map(fontName).filter(Boolean))].join(' · ');

const PaletteStrip: React.FC<{ colors: PaletteColors }> = ({ colors }) => (
  <div className="palette-card__strip" role="img" aria-label="Barvy motivu">
    {COLOR_GROUPS.map(group => (
      <span key={group.title} className={`palette-card__strip-group${group.main ? ' is-main' : ''}`}>
        {group.keys.map(key => {
          const field = COLOR_FIELDS.find(item => item.key === key)!;
          return <span key={key} style={{ background: colors[key] }} title={`${field.label}: ${colors[key]}`} />;
        })}
      </span>
    ))}
  </div>
);

interface PaletteCardProps {
  palette: ColorPalette;
  onEdit: () => void;
  onActivate: () => void;
  onDelete: () => void;
  onToggleTeam: () => void;
  onTogglePrivate: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

const PaletteCard: React.FC<PaletteCardProps> = ({
  palette,
  onEdit,
  onActivate,
  onDelete,
  onToggleTeam,
  onTogglePrivate,
  disabled,
  children
}) => (
  <div className={`palette-card ${palette.is_active ? 'palette-card--active' : ''}`}>
    <div className="palette-card__row">
      <PalettePreview colors={palette.colors} />
      <div className="palette-card__info">
        <div className="palette-card__title">
          <h4 title={palette.name}>{palette.name}</h4>
          {palette.is_active ? (
            <span className="palette-card__badge">
              <Check size={12} strokeWidth={2.5} aria-hidden="true" />
              Používá se
            </span>
          ) : null}
          {palette.is_shared && !palette.is_private ? (
            <span className="palette-card__badge palette-card__badge--shared" title="Je mezi Týmovými paletami pro všechny">
              <Users size={12} strokeWidth={2.25} aria-hidden="true" />
              Týmová
            </span>
          ) : null}
          {palette.is_private ? (
            <span className="palette-card__mode" title="Kolegové ji nevidí">
              <Lock size={11} strokeWidth={2.25} aria-hidden="true" /> Soukromá
            </span>
          ) : null}
        </div>
        <PaletteStrip colors={palette.colors} />
        {palette.typography ? <div className="palette-card__fonts">{fontSummary(palette.typography)}</div> : null}
      </div>
      <div className="palette-card__actions">
        {!palette.is_active ? (
          <button type="button" className="palette-card__use" onClick={onActivate} disabled={disabled}>
            Použít
          </button>
        ) : null}
        <button
          type="button"
          className={`palette-card__icon${palette.is_shared && !palette.is_private ? ' is-on' : ''}`}
          onClick={onToggleTeam}
          disabled={disabled || palette.is_private}
          aria-pressed={Boolean(palette.is_shared && !palette.is_private)}
          title={
            palette.is_private
              ? 'Soukromou paletu nelze dát do týmových'
              : palette.is_shared
                ? 'Odebrat z týmových palet'
                : 'Dát mezi Týmové palety'
          }
          aria-label={palette.is_shared ? `Odebrat ${palette.name} z týmových palet` : `Dát ${palette.name} do týmových palet`}
        >
          <Users {...TAB_ICON} />
        </button>
        <button
          type="button"
          className={`palette-card__icon${palette.is_private ? ' is-on' : ''}`}
          onClick={onTogglePrivate}
          disabled={disabled}
          aria-pressed={Boolean(palette.is_private)}
          title={palette.is_private ? 'Soukromá: zpřístupnit kolegům' : 'Veřejná: skrýt před kolegy'}
          aria-label={palette.is_private ? `Zpřístupnit ${palette.name} kolegům` : `Skrýt ${palette.name} před kolegy`}
        >
          {palette.is_private ? <Lock {...TAB_ICON} /> : <LockOpen {...TAB_ICON} />}
        </button>
        <button type="button" className="palette-card__icon" onClick={onEdit} disabled={disabled} title="Upravit" aria-label={`Upravit ${palette.name}`}>
          <Pencil {...TAB_ICON} />
        </button>
        <button
          type="button"
          className="palette-card__icon palette-card__icon--danger"
          onClick={onDelete}
          disabled={disabled}
          title="Odstranit"
          aria-label={`Odstranit ${palette.name}`}
        >
          <Trash2 {...TAB_ICON} />
        </button>
      </div>
    </div>
    {children ? <div className="palette-card__editor">{children}</div> : null}
  </div>
);

interface SharedPaletteCardProps {
  palette: ColorPalette | SharedPalette;
  /** Who made it, shown in Týmové palety ("Vy" for the user's own). */
  owner?: string;
  /** Marked as one of the team's (under a colleague). */
  team?: boolean;
  /** The user's own palette (Týmové palety): "Použít" switches to it, no copy. */
  own?: boolean;
  /** The user's own copy of it is the one in use. */
  inUse: boolean;
  /** The user already has a copy. */
  saved: boolean;
  disabled?: boolean;
  onUse: () => void;
  onSave: () => void;
}

const SharedPaletteCard: React.FC<SharedPaletteCardProps> = ({ palette, owner, team, own, inUse, saved, disabled, onUse, onSave }) => (
  <div className={`palette-card ${inUse ? 'palette-card--active' : ''}`}>
    <div className="palette-card__row">
      <PalettePreview colors={palette.colors} />
      <div className="palette-card__info">
        <div className="palette-card__title">
          <h4 title={palette.name}>{palette.name}</h4>
          <span className="palette-card__mode">{palette.mode === 'dark' ? 'Tmavá' : 'Světlá'}</span>
          {team ? (
            <span className="palette-card__badge palette-card__badge--shared">
              <Users size={12} strokeWidth={2.25} aria-hidden="true" />
              Týmová
            </span>
          ) : null}
          {inUse ? (
            <span className="palette-card__badge">
              <Check size={12} strokeWidth={2.5} aria-hidden="true" />
              Používáte
            </span>
          ) : null}
        </div>
        <PaletteStrip colors={palette.colors} />
        <div className="palette-card__fonts">
          {owner ? <span className="palette-card__owner">{owner}</span> : null}
          {owner && palette.typography ? ' · ' : null}
          {palette.typography ? fontSummary(palette.typography) : null}
        </div>
      </div>
      <div className="palette-card__actions">
        {!inUse ? (
          <button type="button" className="palette-card__use" onClick={onUse} disabled={disabled}>
            Použít
          </button>
        ) : null}
        {own ? null : (
          <button
            type="button"
            className="palette-card__icon"
            onClick={onSave}
            disabled={disabled || saved}
            title={saved ? 'Už ji máte mezi svými paletami' : 'Uložit k mým paletám'}
            aria-label={saved ? `${palette.name} už máte mezi svými paletami` : `Uložit ${palette.name} k mým paletám`}
          >
            {saved ? <Check {...TAB_ICON} /> : <Copy {...TAB_ICON} />}
          </button>
        )}
      </div>
    </div>
  </div>
);

interface PaletteFormProps {
  heading: string;
  draft: PaletteDraft;
  onChange: (draft: PaletteDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  colorHistory: string[];
  onAddHistory: (color: string) => void;
  onRemoveHistory: (color: string) => void;
}

interface FontSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  disabled?: boolean;
  placeholder?: string;
}

const FontSelect: React.FC<FontSelectProps> = ({
  id,
  value,
  onChange,
  suggestions,
  disabled,
  placeholder
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedSuggestions = useMemo(() => {
    const base = Array.from(new Set([
      ...suggestions,
      value
    ].filter(Boolean)));
    if (!query.trim()) {
      return base;
    }
    const lowerQuery = query.toLowerCase();
    return base.filter(option => option.toLowerCase().includes(lowerQuery));
  }, [suggestions, value, query]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(prev => !prev);
  };

  const handleSelect = (option: string) => {
    onChange(option);
    setIsOpen(false);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    onChange(next);
    if (!isOpen) {
      setQuery(next);
    }
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  return (
    <div className="font-select" ref={containerRef}>
      <div className="font-select__field">
        <input
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="palette-form__input font-select__input"
          // The value is shown in the font it names: the sample, in place.
          style={{ fontFamily: value || undefined }}
          spellCheck={false}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        />
        <button
          type="button"
          className="font-select__trigger"
          onClick={handleToggle}
          disabled={disabled}
          aria-label="Vybrat font"
          aria-controls={`${id}-options`}
          aria-expanded={isOpen}
        >
          ▾
        </button>
      </div>
      {isOpen ? (
        <div className="font-select__panel" role="listbox" id={`${id}-options`}>
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={handleSearchChange}
            className="font-select__search"
            placeholder="Hledat font"
            spellCheck={false}
            aria-label="Hledat font"
          />
          <div className="font-select__options">
            {normalizedSuggestions.length > 0 ? (
              normalizedSuggestions.map(option => (
                <button
                  type="button"
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`font-select__option${option === value ? ' is-active' : ''}`}
                  style={{ fontFamily: option }}
                >
                  {option}
                </button>
              ))
            ) : (
              <div className="font-select__empty">Žádné fonty neodpovídají hledání.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const PaletteForm: React.FC<PaletteFormProps> = ({
  heading,
  draft,
  onChange,
  onCancel,
  onSubmit,
  disabled,
  colorHistory,
  onAddHistory,
  onRemoveHistory
}) => {
  const [activeKey, setActiveKey] = useState<keyof PaletteColors>('primary');

  const handleColorChange = (color: string) => {
    const formatted = colord(color).isValid() ? colord(color).toHslString() : color;
    onChange({
      ...draft,
      colors: {
        ...draft.colors,
        [activeKey]: formatted
      }
    });
  };

  const handleTypographyChange = (key: keyof PaletteTypography, value: string) => {
    onChange({
      ...draft,
      typography: {
        ...draft.typography,
        [key]: value
      }
    });
  };

  const activeColor = draft.colors[activeKey];
  const normalizedActiveColor = normalizeColorValue(activeColor);
  const isColorSaved = colorHistory.includes(normalizedActiveColor);

  const handleHistorySave = () => {
    if (disabled) return;
    onAddHistory(normalizedActiveColor);
  };

  const handleHistorySelect = (color: string) => {
    if (disabled) return;
    handleColorChange(color);
  };

  const handleHistoryRemove = (color: string) => {
    if (disabled) return;
    onRemoveHistory(color);
  };

  return (
    <div className="palette-form">
      <div className="palette-form__header">
        <h4>{heading}</h4>
        <button type="button" onClick={onCancel} className="palette-form__close" disabled={disabled}>
          Zavřít
        </button>
      </div>
      {/* Live: changes as the colours are picked. */}
      <PalettePreview colors={draft.colors} large />
      <label className="palette-form__label" htmlFor={`palette-name-${draft.mode}`}>
        Název palety
      </label>
      <input
        id={`palette-name-${draft.mode}`}
        type="text"
        className="palette-form__input"
        value={draft.name}
        onChange={event => onChange({ ...draft, name: event.target.value })}
        disabled={disabled}
        placeholder="Např. Firemní světlo"
      />

      <div className="palette-form__colors">
        <div className="palette-form__color-groups" role="tablist" aria-label="Barvy motivu">
          {COLOR_GROUPS.map(group => (
            <div key={group.title} className={`palette-form__color-group${group.main ? ' is-main' : ''}`}>
              <div className="palette-form__group-title">
                {group.title} <span>{group.hint}</span>
              </div>
              <div className="palette-form__color-tabs">
                {group.keys.map(key => {
                  const field = COLOR_FIELDS.find(item => item.key === key)!;
                  const isActive = activeKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`palette-form__color-tab ${isActive ? 'is-active' : ''}`}
                      title={field.description}
                      onClick={() => setActiveKey(key)}
                      disabled={disabled}
                    >
                      <span className="palette-form__color-dot" style={{ background: draft.colors[key] }} />
                      <span className="palette-form__color-text">
                        <strong>{field.label}</strong>
                        {group.main ? <small>{SHORT_DESCRIPTIONS[key]}</small> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="palette-form__picker" role="tabpanel">
          <div className="palette-form__picker-content">
            <HslStringColorPicker
              color={draft.colors[activeKey]}
              onChange={handleColorChange}
              className="palette-form__picker-widget"
            />
            <div className="palette-form__history">
              <div className="palette-form__history-header">
                <span>Uložené barvy</span>
                <button
                  type="button"
                  className="palette-form__history-add"
                  onClick={handleHistorySave}
                  disabled={disabled || isColorSaved}
                >
                  {isColorSaved ? 'Uloženo' : 'Uložit barvu'}
                </button>
              </div>
              {colorHistory.length > 0 ? (
                <div className="palette-form__history-grid">
                  {colorHistory.map(color => (
                    <div key={color} className="palette-form__history-item">
                      <button
                        type="button"
                        className={`palette-form__history-button${color === normalizedActiveColor ? ' is-active' : ''}`}
                        style={{ background: color }}
                        onClick={() => handleHistorySelect(color)}
                        disabled={disabled}
                        title={color}
                        aria-label={`Použít barvu ${color}`}
                      />
                      <button
                        type="button"
                        className="palette-form__history-remove"
                        onClick={() => handleHistoryRemove(color)}
                        disabled={disabled}
                        aria-label={`Odebrat barvu ${color}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="palette-form__history-empty">Zatím žádné uložené barvy.</div>
              )}
            </div>
          </div>
          <div className="palette-form__picker-value">
            <code>{draft.colors[activeKey]}</code>
          </div>
        </div>
      </div>

      <div className="palette-form__typography">
        <div className="palette-form__group-title">Písma</div>
        <div className="palette-form__typography-grid">
          {FONT_FIELDS.map(field => {
            const controlId = `font-suggestions-${field.key}-${draft.mode}`;
            return (
              <label key={field.key} className="palette-form__font-field">
                <span className="palette-form__font-label">{field.label}</span>
                <FontSelect
                  id={controlId}
                  value={draft.typography[field.key] ?? ''}
                  onChange={value => handleTypographyChange(field.key, value)}
                  suggestions={FONT_SUGGESTIONS}
                  disabled={disabled}
                  placeholder="např. 'Inter', system-ui, sans-serif"
                />
                <span
                  className="palette-form__font-preview"
                  style={{ fontFamily: draft.typography[field.key] }}
                >
                  {field.sample}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="palette-form__footer">
      <label className="palette-form__toggle">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={event => onChange({ ...draft, is_active: event.target.checked })}
          disabled={disabled}
        />
        <span>Používat pro {draft.mode === 'light' ? 'světlý' : 'tmavý'} režim</span>
      </label>

      <div className="palette-form__actions">
        <button type="button" onClick={onCancel} className="ghost" disabled={disabled}>
          Zrušit
        </button>
        <button type="button" onClick={onSubmit} disabled={disabled}>
          Uložit
        </button>
      </div>
      </div>
    </div>
  );
};

export default PaletteManager;

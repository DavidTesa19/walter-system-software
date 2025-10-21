import React, { useEffect, useMemo, useRef, useState } from 'react';
import { colord } from 'colord';
import { HslStringColorPicker } from 'react-colorful';
import {
  useTheme,
  type PaletteColors,
  type PaletteTypography,
  type ColorPalette,
  type PaletteInput,
  type Theme
} from './ThemeContext';
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
    heading: "'Playfair Display', 'Times New Roman', serif",
    subheading: "'Poppins', 'Segoe UI', sans-serif",
    body: "'Inter', system-ui, sans-serif"
  },
  dark: {
    heading: "'Playfair Display', 'Times New Roman', serif",
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
  "'Playfair Display', 'Times New Roman', serif",
  "'Roboto Slab', 'Times New Roman', serif",
  "'Merriweather', 'Georgia', serif",
  "'Source Sans Pro', 'Segoe UI', sans-serif",
  "'Montserrat', 'Segoe UI', sans-serif",
  "'Raleway', 'Segoe UI', sans-serif"
];

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

const PaletteManager: React.FC = () => {
  const {
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

  const palettesByMode = useMemo(() => ({
    light: palettes.filter(palette => palette.mode === 'light'),
    dark: palettes.filter(palette => palette.mode === 'dark')
  }), [palettes]);

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
    setDrafts(prev => ({
      ...prev,
  [mode]: createTemplateDraft(mode, getBaseValues(mode))
    }));
  };

  const handleCancelCreate = (mode: Theme) => {
    setDrafts(prev => ({ ...prev, [mode]: null }));
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

      <div className="palette-manager__columns">
        {(['light', 'dark'] as Theme[]).map(mode => {
          const modePalettes = palettesByMode[mode];
          const draft = drafts[mode];
          return (
            <section key={mode} className="palette-column">
              <div className="palette-column__header">
                <div>
                  <h3>{mode === 'light' ? 'Světlé palety' : 'Tmavé palety'}</h3>
                  <p>{mode === 'light' ? 'Použité pro světlý režim' : 'Použité pro tmavý režim'}.</p>
                </div>
                <button
                  type="button"
                  className="palette-column__add"
                  onClick={() => handleStartCreate(mode)}
                  disabled={Boolean(draft) || isSaving}
                >
                  + Přidat paletu
                </button>
              </div>

              {draft ? (
                <PaletteForm
                  key={`new-${mode}`}
                  heading="Nová paleta"
                  draft={draft}
                  disabled={isSaving}
                  onCancel={() => handleCancelCreate(mode)}
                  onChange={updated => handleDraftChange(mode, () => updated)}
                  onSubmit={() => submitCreate(mode)}
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
                    >
                      {isEditing ? (
                        <PaletteForm
                          heading="Upravit paletu"
                          draft={editingDraft!.value}
                          disabled={isSaving}
                          onCancel={() => setEditingDraft(null)}
                          onChange={updated => handleEditingChange(() => updated)}
                          onSubmit={submitEdit}
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
    </div>
  );
};

interface PaletteCardProps {
  palette: ColorPalette;
  onEdit: () => void;
  onActivate: () => void;
  onDelete: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

const PaletteCard: React.FC<PaletteCardProps> = ({
  palette,
  onEdit,
  onActivate,
  onDelete,
  disabled,
  children
}) => (
  <div className={`palette-card ${palette.is_active ? 'palette-card--active' : ''}`}>
    <div className="palette-card__header">
      <div>
        <h4>{palette.name}</h4>
        <span className="palette-card__mode">{palette.mode === 'light' ? 'Světlý režim' : 'Tmavý režim'}</span>
      </div>
      {palette.is_active ? <span className="palette-card__badge">Aktivní</span> : null}
    </div>
    <div className="palette-card__swatches">
      {COLOR_FIELDS.map(field => (
        <div key={field.key} className="palette-card__swatch">
          <span
            className="palette-card__swatch-color"
            style={{ background: palette.colors[field.key] }}
            aria-hidden
          />
          <div className="palette-card__swatch-meta">
            <span className="palette-card__swatch-label">{field.label}</span>
            <span className="palette-card__swatch-value">{palette.colors[field.key]}</span>
          </div>
        </div>
      ))}
    </div>
    {palette.typography ? (
      <div className="palette-card__typography">
        {FONT_FIELDS.map(field => (
          <div key={field.key} className="palette-card__font">
            <div className="palette-card__font-meta">
              <span className="palette-card__font-label">{field.label}</span>
              <code className="palette-card__font-value">{palette.typography?.[field.key]}</code>
            </div>
            <div
              className="palette-card__font-preview"
              style={{ fontFamily: palette.typography?.[field.key] }}
            >
              {field.sample}
            </div>
          </div>
        ))}
      </div>
    ) : null}
    <div className="palette-card__actions">
      <button
        type="button"
        onClick={onActivate}
        disabled={palette.is_active || disabled}
      >
        Použít jako výchozí
      </button>
      <button type="button" onClick={onEdit} disabled={disabled}>
        Upravit
      </button>
      <button type="button" onClick={onDelete} disabled={disabled} className="danger">
        Odstranit
      </button>
    </div>
    {children ? <div className="palette-card__editor">{children}</div> : null}
  </div>
);

interface PaletteFormProps {
  heading: string;
  draft: PaletteDraft;
  onChange: (draft: PaletteDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
  disabled?: boolean;
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
  disabled
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

  return (
    <div className="palette-form">
      <div className="palette-form__header">
        <h4>{heading}</h4>
        <button type="button" onClick={onCancel} className="palette-form__close" disabled={disabled}>
          Zavřít
        </button>
      </div>
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
        <div className="palette-form__color-tabs" role="tablist">
          {COLOR_FIELDS.map(field => {
            const isActive = activeKey === field.key;
            return (
              <button
                key={field.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`palette-form__color-tab ${isActive ? 'is-active' : ''}`}
                onClick={() => setActiveKey(field.key)}
                disabled={disabled}
              >
                <span className="palette-form__color-dot" style={{ background: draft.colors[field.key] }} />
                <span>
                  <strong>{field.label}</strong>
                  <small>{field.description}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="palette-form__picker" role="tabpanel">
          <HslStringColorPicker
            color={draft.colors[activeKey]}
            onChange={handleColorChange}
            className="palette-form__picker-widget"
          />
          <div className="palette-form__picker-value">
            <code>{draft.colors[activeKey]}</code>
          </div>
        </div>
      </div>

      <div className="palette-form__typography">
        <div className="palette-form__typography-header">
          <span className="palette-form__label">Typografie</span>
          <p>
            Zvolte fonty pro nadpisy, podnadpisy a tělo textu. Hodnota musí být platný CSS řetězec
            <code>font-family</code>.
          </p>
        </div>
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
                <code className="palette-form__font-value">{draft.typography[field.key]}</code>
              </label>
            );
          })}
        </div>
      </div>

      <label className="palette-form__toggle">
        <input
          type="checkbox"
          checked={draft.is_active}
          onChange={event => onChange({ ...draft, is_active: event.target.checked })}
          disabled={disabled}
        />
        <span>Nastavit jako výchozí paletu pro {draft.mode === 'light' ? 'světlý' : 'tmavý'} režim</span>
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
  );
};

export default PaletteManager;

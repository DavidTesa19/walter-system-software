import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { colord, extend, type Colord } from 'colord';
import mixPlugin from 'colord/plugins/mix';

extend([mixPlugin]);

export type Theme = 'light' | 'dark';

export interface PaletteColors {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
}

export interface ColorPalette {
  id: number;
  name: string;
  mode: Theme;
  colors: PaletteColors;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type PaletteInput = {
  name: string;
  mode: Theme;
  colors: PaletteColors;
  is_active?: boolean;
};

interface ThemeContextType {
  theme: Theme;
  setTheme: (mode: Theme) => void;
  toggleTheme: () => void;
  palettes: ColorPalette[];
  activePalette: ColorPalette | null;
  isLoadingPalettes: boolean;
  error: string | null;
  refreshPalettes: () => Promise<void>;
  createPalette: (input: PaletteInput) => Promise<ColorPalette>;
  updatePalette: (id: number, input: Partial<Omit<PaletteInput, 'mode'>>) => Promise<ColorPalette>;
  deletePalette: (id: number) => Promise<void>;
  activatePalette: (id: number) => Promise<ColorPalette>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const LOCAL_THEME_KEY = 'walter-theme';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004';

const FALLBACK_COLORS: Record<Theme, PaletteColors> = {
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

const SUCCESS_BASE = '#10b981';
const WARNING_BASE = '#f59e0b';
const DANGER_BASE = '#ef4444';

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const ensureColord = (value: string, fallback: string): Colord => {
  const parsed = colord(value);
  if (parsed.isValid()) {
    return parsed;
  }
  const fallbackParsed = colord(fallback);
  return fallbackParsed.isValid() ? fallbackParsed : colord('#000000');
};

const toHslString = (instance: Colord) => instance.toHslString();
const toRgbString = (instance: Colord) => instance.toRgbString();

const lighten = (color: string, amount: number, fallback: string) =>
  toHslString(ensureColord(color, fallback).lighten(clamp(amount)));

const darken = (color: string, amount: number, fallback: string) =>
  toHslString(ensureColord(color, fallback).darken(clamp(amount)));

const mixColors = (color: string, target: string, ratio: number, fallback: string) =>
  toHslString(ensureColord(color, fallback).mix(ensureColord(target, fallback), clamp(ratio)));

const alpha = (color: string, value: number, fallback: string) =>
  toRgbString(ensureColord(color, fallback).alpha(clamp(value)));

const computeCssVariables = (colors: PaletteColors, mode: Theme): Record<string, string> => {
  const fallback = FALLBACK_COLORS[mode];
  const primary = ensureColord(colors.primary, fallback.primary);
  const accent = ensureColord(colors.accent, fallback.accent);
  const background = ensureColord(colors.background, fallback.background);
  const surface = ensureColord(colors.surface, fallback.surface);
  const text = ensureColord(colors.text, fallback.text);
  const muted = ensureColord(colors.muted, fallback.muted);
  const border = ensureColord(colors.border, fallback.border);

  const primaryContrast = primary.isLight() ? '#0f172a' : '#f8fafc';
  const accentContrast = accent.isLight() ? '#0f172a' : '#f8fafc';
  const inverseText = background.isLight() ? '#0b1120' : '#f8fafc';

  const surfaceAlt = mode === 'dark'
    ? lighten(surface.toHslString(), 0.06, fallback.surface)
    : darken(surface.toHslString(), 0.04, fallback.surface);

  const surfaceHover = mode === 'dark'
    ? lighten(surface.toHslString(), 0.12, fallback.surface)
    : darken(surface.toHslString(), 0.08, fallback.surface);

  const surfaceMuted = mode === 'dark'
    ? lighten(surface.toHslString(), 0.18, fallback.surface)
    : darken(surface.toHslString(), 0.12, fallback.surface);

  const borderStrong = mode === 'dark'
    ? lighten(border.toHslString(), 0.18, fallback.border)
    : darken(border.toHslString(), 0.18, fallback.border);

  const primaryHover = mode === 'dark'
    ? lighten(primary.toHslString(), 0.12, fallback.primary)
    : darken(primary.toHslString(), 0.12, fallback.primary);

  const primaryActive = mode === 'dark'
    ? lighten(primary.toHslString(), 0.24, fallback.primary)
    : darken(primary.toHslString(), 0.2, fallback.primary);

  const primarySoft = mixColors(
    primary.toHslString(),
    background.toHslString(),
    mode === 'dark' ? 0.3 : 0.85,
    fallback.primary
  );

  const accentHover = mode === 'dark'
    ? lighten(accent.toHslString(), 0.1, fallback.accent)
    : darken(accent.toHslString(), 0.1, fallback.accent);

  const accentSoft = mixColors(
    accent.toHslString(),
    background.toHslString(),
    mode === 'dark' ? 0.28 : 0.82,
    fallback.accent
  );

  const success = ensureColord(SUCCESS_BASE, SUCCESS_BASE);
  const warning = ensureColord(WARNING_BASE, WARNING_BASE);
  const danger = ensureColord(DANGER_BASE, DANGER_BASE);

  const successTone = mode === 'dark' ? success.lighten(0.15) : success;
  const warningTone = mode === 'dark' ? warning.lighten(0.1) : warning;
  const dangerTone = mode === 'dark' ? danger.lighten(0.1) : danger;

  const successHover = mode === 'dark'
    ? success.lighten(0.25)
    : success.darken(0.05);
  const warningHover = mode === 'dark'
    ? warning.lighten(0.2)
    : warning.darken(0.05);
  const dangerHover = mode === 'dark'
    ? danger.lighten(0.2)
    : danger.darken(0.05);

  const successContrast = successTone.isLight() ? '#0f172a' : '#f8fafc';
  const warningContrast = warningTone.isLight() ? '#0f172a' : '#f8fafc';
  const dangerContrast = dangerTone.isLight() ? '#0f172a' : '#f8fafc';

  const shadowBase = mode === 'dark' ? '#000000' : '#0f172a';
  const shadowSm = `0 2px 6px ${alpha(shadowBase, mode === 'dark' ? 0.55 : 0.08, shadowBase)}`;
  const shadowMd = `0 12px 30px ${alpha(shadowBase, mode === 'dark' ? 0.46 : 0.12, shadowBase)}`;
  const shadowLg = `0 20px 55px ${alpha(shadowBase, mode === 'dark' ? 0.5 : 0.16, shadowBase)}`;

  const gradientStart = mixColors(
    primary.toHslString(),
    accent.toHslString(),
    mode === 'dark' ? 0.35 : 0.2,
    fallback.primary
  );
  const gradientHoverStart = mixColors(
    primaryHover,
    accentHover,
    mode === 'dark' ? 0.35 : 0.25,
    fallback.primary
  );

  const focusRing = `0 0 0 3px ${alpha(primary.toHslString(), 0.35, fallback.primary)}`;

  return {
    '--color-primary': primary.toHslString(),
    '--color-primary-contrast': primaryContrast,
    '--color-primary-hover': primaryHover,
    '--color-primary-active': primaryActive,
    '--color-primary-soft': primarySoft,
    '--color-accent': accent.toHslString(),
    '--color-accent-contrast': accentContrast,
    '--color-accent-hover': accentHover,
    '--color-accent-soft': accentSoft,
    '--color-background': background.toHslString(),
    '--color-surface': surface.toHslString(),
    '--color-surface-alt': surfaceAlt,
    '--color-surface-hover': surfaceHover,
    '--color-surface-muted': surfaceMuted,
    '--color-border': border.toHslString(),
    '--color-border-strong': borderStrong,
    '--color-text': text.toHslString(),
    '--color-text-muted': muted.toHslString(),
    '--color-text-inverse': inverseText,
    '--color-shadow-sm': shadowSm,
    '--color-shadow-md': shadowMd,
    '--color-shadow-lg': shadowLg,
    '--color-success': successTone.toHslString(),
    '--color-success-hover': successHover.toHslString(),
    '--color-success-contrast': successContrast,
    '--color-warning': warningTone.toHslString(),
    '--color-warning-hover': warningHover.toHslString(),
    '--color-warning-contrast': warningContrast,
    '--color-danger': dangerTone.toHslString(),
    '--color-danger-hover': dangerHover.toHslString(),
    '--color-danger-contrast': dangerContrast,
    '--gradient-primary': `linear-gradient(135deg, ${gradientStart} 0%, ${accent.toHslString()} 100%)`,
    '--gradient-primary-hover': `linear-gradient(135deg, ${gradientHoverStart} 0%, ${accentHover} 100%)`,
    '--gradient-surface': `linear-gradient(135deg, ${mixColors(
      surface.toHslString(),
      background.toHslString(),
      0.7,
      fallback.surface
    )} 0%, ${surface.toHslString()} 100%)`,
    '--focus-ring': focusRing,
    '--scrollbar-thumb': alpha(border.toHslString(), mode === 'dark' ? 0.6 : 0.9, fallback.border),
    '--scrollbar-track': alpha(background.toHslString(), mode === 'dark' ? 0.35 : 0.7, fallback.background)
  };
};

const applyPaletteToDocument = (mode: Theme, palette?: ColorPalette | null) => {
  const resolved = palette?.colors ?? FALLBACK_COLORS[mode];
  const variables = computeCssVariables(resolved, mode);
  const root = document.documentElement;

  root.setAttribute('data-theme', mode);
  root.style.setProperty('color-scheme', mode);

  Object.entries(variables).forEach(([token, value]) => {
    root.style.setProperty(token, value);
  });
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem(LOCAL_THEME_KEY) as Theme | null;
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [isLoadingPalettes, setIsLoadingPalettes] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPalettes = useCallback(async () => {
    setIsLoadingPalettes(true);
    try {
      setError(null);
      const response = await fetch(`${API_BASE}/color-palettes`);
      if (!response.ok) {
        throw new Error(`Failed to load palettes: ${response.status}`);
      }
      const data: ColorPalette[] = await response.json();
      setPalettes(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setIsLoadingPalettes(false);
    }
  }, []);

  useEffect(() => {
    fetchPalettes();
  }, [fetchPalettes]);

  useEffect(() => {
    applyPaletteToDocument(theme, null);
  }, []);

  const getActivePalette = useCallback(
    (mode: Theme, list: ColorPalette[] = palettes) => {
      const active = list.find(palette => palette.mode === mode && palette.is_active);
      if (active) return active;
      return list.find(palette => palette.mode === mode) ?? null;
    },
    [palettes]
  );

  useEffect(() => {
    if (isLoadingPalettes) {
      return;
    }
    const palette = getActivePalette(theme);
    applyPaletteToDocument(theme, palette);
  }, [theme, palettes, isLoadingPalettes, getActivePalette]);

  const setTheme = useCallback((mode: Theme) => {
    setThemeState(mode);
    localStorage.setItem(LOCAL_THEME_KEY, mode);
    const palette = getActivePalette(mode);
    applyPaletteToDocument(mode, palette);
  }, [getActivePalette]);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem(LOCAL_THEME_KEY, next);
      const palette = getActivePalette(next);
      applyPaletteToDocument(next, palette);
      return next;
    });
  }, [getActivePalette]);

  const createPalette = useCallback(
    async (input: PaletteInput) => {
      const response = await fetch(`${API_BASE}/color-palettes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error('Failed to create palette');
      }

      const created: ColorPalette = await response.json();
      await fetchPalettes();

      if (created.mode === theme && created.is_active) {
        applyPaletteToDocument(theme, created);
      }

      return created;
    },
    [fetchPalettes, theme]
  );

  const updatePalette = useCallback(
    async (id: number, input: Partial<Omit<PaletteInput, 'mode'>>) => {
      const response = await fetch(`${API_BASE}/color-palettes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error('Failed to update palette');
      }

      const updated: ColorPalette = await response.json();
      await fetchPalettes();

      if (updated.mode === theme && updated.is_active) {
        applyPaletteToDocument(theme, updated);
      }

      return updated;
    },
    [fetchPalettes, theme]
  );

  const deletePalette = useCallback(
    async (id: number) => {
      const response = await fetch(`${API_BASE}/color-palettes/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete palette');
      }

      await fetchPalettes();
      const palette = getActivePalette(theme);
      applyPaletteToDocument(theme, palette);
    },
    [fetchPalettes, getActivePalette, theme]
  );

  const activatePalette = useCallback(
    async (id: number) => {
      const response = await fetch(`${API_BASE}/color-palettes/${id}/activate`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to activate palette');
      }

      const activated: ColorPalette = await response.json();
      await fetchPalettes();

      if (activated.mode === theme) {
        applyPaletteToDocument(theme, activated);
      }

      return activated;
    },
    [fetchPalettes, theme]
  );

  const value = useMemo<ThemeContextType>(() => ({
    theme,
    setTheme,
    toggleTheme,
    palettes,
    activePalette: getActivePalette(theme),
    isLoadingPalettes,
    error,
    refreshPalettes: fetchPalettes,
    createPalette,
    updatePalette,
    deletePalette,
    activatePalette
  }), [
    theme,
    setTheme,
    toggleTheme,
    palettes,
    isLoadingPalettes,
    error,
    fetchPalettes,
    createPalette,
    updatePalette,
    deletePalette,
    activatePalette,
    getActivePalette
  ]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

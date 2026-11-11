// App zoom (Photoshop-style): the whole interface from 50 % to 200 %, set from
// the footer's control or the shortcuts, remembered on this device.
//
// It is CSS `zoom` on <html> plus `--app-zoom`: viewport units are zoomed
// too, so every height written as 100vh/100dvh is divided by it in the
// stylesheets (calc(100dvh / var(--app-zoom, 1))). coordinateShim.ts makes
// measurements and mouse positions agree with the zoomed layout.
//
// Shortcuts (they replace the browser's own zoom while the app is open):
// Ctrl/⌘ + = or +   zoom in      Ctrl/⌘ + −   zoom out
// Ctrl/⌘ + 0        100 %        Ctrl/⌘ + mouse wheel / trackpad pinch

import { installCoordinateShim, setShimZoom } from './coordinateShim';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
/** The steps of +/−, the keyboard and the dropdown. */
export const ZOOM_PRESETS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

const STORAGE_KEY = 'walterApp.zoom';

const clamp = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));

const read = (): number => {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : 1;
  } catch {
    return 1;
  }
};

let current = 1;
const listeners = new Set<() => void>();

const apply = (value: number) => {
  current = value;
  setShimZoom(value);
  const root = document.documentElement;
  if (value === 1) {
    root.style.removeProperty('zoom');
  } else {
    root.style.setProperty('zoom', String(value));
  }
  root.style.setProperty('--app-zoom', String(value));
  // Grids, the calendar and the footer re-measure on resize.
  window.dispatchEvent(new Event('resize'));
  listeners.forEach((listener) => listener());
};

export const getZoom = () => current;

export const subscribeZoom = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function setZoom(value: number) {
  const next = clamp(value);
  if (next === current) return;
  apply(next);
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Not remembered, still applied.
  }
}

/** The next preset above (or below) the current zoom. */
export const stepZoom = (direction: 1 | -1) => {
  const next = direction > 0
    ? ZOOM_PRESETS.find((preset) => preset > current + 0.001)
    : [...ZOOM_PRESETS].reverse().find((preset) => preset < current - 0.001);
  setZoom(next ?? (direction > 0 ? ZOOM_MAX : ZOOM_MIN));
};

export const resetZoom = () => setZoom(1);

export const formatZoom = (value: number) => `${Math.round(value * 100)} %`;

let started = false;

/** Apply the remembered zoom and listen for the shortcuts; called once from main.tsx. */
export function startAppZoom() {
  if (started || typeof window === 'undefined') return;
  started = true;
  installCoordinateShim();
  apply(read());

  window.addEventListener(
    'keydown',
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key;
      if (key === '+' || key === '=' || event.code === 'NumpadAdd') {
        event.preventDefault();
        stepZoom(1);
      } else if (key === '-' || key === '_' || event.code === 'NumpadSubtract') {
        event.preventDefault();
        stepZoom(-1);
      } else if (key === '0' || event.code === 'Numpad0') {
        event.preventDefault();
        resetZoom();
      }
    },
    { capture: true }
  );

  // Ctrl + wheel and a trackpad pinch (which arrives as Ctrl + wheel): smooth,
  // proportional to how far the wheel turned.
  window.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      setZoom(current * Math.exp(-delta * 0.0015));
    },
    { passive: false }
  );

  // Another tab of the app changed it.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) apply(read());
  });
}

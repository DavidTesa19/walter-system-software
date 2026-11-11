// The zoom control in the footer: − / slider / + and the percentage, which
// opens the presets (Photoshop-style). State lives in appZoom.ts.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_PRESETS,
  formatZoom,
  getZoom,
  resetZoom,
  setZoom,
  stepZoom,
  subscribeZoom,
} from './appZoom';
import './ZoomControl.css';

const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

export default function ZoomControl() {
  const zoom = useSyncExternalStore(subscribeZoom, getZoom);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const percent = Math.round(zoom * 100);

  return (
    <div className="zoom-control" ref={rootRef} role="group" aria-label="Přiblížení aplikace">
      <button
        type="button"
        className="zoom-control__step"
        onClick={() => stepZoom(-1)}
        disabled={zoom <= ZOOM_MIN}
        title={`Oddálit (${MOD} −)`}
        aria-label="Oddálit"
      >
        −
      </button>
      <input
        type="range"
        className="zoom-control__slider"
        min={ZOOM_MIN * 100}
        max={ZOOM_MAX * 100}
        step={5}
        value={percent}
        onChange={(event) => setZoom(Number(event.target.value) / 100)}
        onDoubleClick={resetZoom}
        aria-label="Přiblížení"
        aria-valuetext={formatZoom(zoom)}
        title="Přiblížení (dvojklik = 100 %)"
        style={{ '--zoom-fill': `${((percent - ZOOM_MIN * 100) / ((ZOOM_MAX - ZOOM_MIN) * 100)) * 100}%` } as React.CSSProperties}
      />
      <button
        type="button"
        className="zoom-control__step"
        onClick={() => stepZoom(1)}
        disabled={zoom >= ZOOM_MAX}
        title={`Přiblížit (${MOD} +)`}
        aria-label="Přiblížit"
      >
        +
      </button>
      <button
        type="button"
        className={`zoom-control__value${open ? ' is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Vybrat přiblížení"
      >
        {formatZoom(zoom)} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="zoom-control__menu" role="listbox" aria-label="Přiblížení">
          {[...ZOOM_PRESETS].reverse().map((preset) => (
            <button
              key={preset}
              type="button"
              role="option"
              aria-selected={Math.abs(preset - zoom) < 0.005}
              className={`zoom-control__option${Math.abs(preset - zoom) < 0.005 ? ' is-active' : ''}`}
              onClick={() => {
                setZoom(preset);
                setOpen(false);
              }}
            >
              {formatZoom(preset)}
            </button>
          ))}
          <div className="zoom-control__divider" />
          <button
            type="button"
            className="zoom-control__option"
            onClick={() => {
              resetZoom();
              setOpen(false);
            }}
          >
            Obnovit na 100 %
          </button>
          <div className="zoom-control__hint">
            <kbd>{MOD} +</kbd> <kbd>{MOD} −</kbd> <kbd>{MOD} 0</kbd>
            <br />
            {MOD} + kolečko myši
          </div>
        </div>
      )}
    </div>
  );
}

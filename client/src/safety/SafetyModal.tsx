import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface SafetyModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

// Open modals, innermost last, so Escape closes only the one on top (a revert
// confirmation opened from the record history, say).
const openModals: Array<() => void> = [];

export default function SafetyModal({ title, onClose, children, footer, wide = false }: SafetyModalProps) {
  useEffect(() => {
    const close = () => onClose();
    openModals.push(close);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openModals[openModals.length - 1] === close) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openModals.splice(openModals.indexOf(close), 1);
    };
  }, [onClose]);

  return (
    <div className="safety-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`safety-modal${wide ? ' safety-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="safety-modal-header">
          <h3>{title}</h3>
          <button type="button" className="safety-icon-button" onClick={onClose} aria-label="Zavřít">
            ×
          </button>
        </div>
        <div className="safety-modal-body">{children}</div>
        {footer && <div className="safety-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

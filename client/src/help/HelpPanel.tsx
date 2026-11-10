// The "?" panel: help for the screen the user is on, Jarvis in short, and
// every keyboard shortcut. Opened with ? or the ? button in the top-right
// corner; "Celá nápověda" goes to the Nápověda section.

import { useEffect, useRef } from 'react';
import type { AppView } from '../types/appView';
import { JARVIS_TOPIC, topicForView } from './helpContent';
import { ShortcutTable, TopicBlock } from './HelpParts';
import './Help.css';

interface HelpPanelProps {
  view: AppView;
  viewLabel: string;
  onClose: () => void;
  onOpenAll: () => void;
}

export default function HelpPanel({ view, viewLabel, onClose, onOpenAll }: HelpPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const topic = topicForView(view);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="help-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="help-panel" role="dialog" aria-modal="true" aria-labelledby="help-panel-title" tabIndex={-1} ref={dialogRef}>
        <header className="help-panel-header">
          <h2 id="help-panel-title">Nápověda – {viewLabel}</h2>
          <button type="button" className="help-close" onClick={onClose} aria-label="Zavřít nápovědu" title="Zavřít (Esc)">
            ×
          </button>
        </header>
        <div className="help-panel-body">
          {topic && view !== 'help' && <TopicBlock topic={topic} />}
          <TopicBlock topic={JARVIS_TOPIC} />
          <section className="help-topic">
            <h3 className="help-topic-title">Klávesové zkratky</h3>
            <ShortcutTable compact />
          </section>
        </div>
        <footer className="help-panel-footer">
          {view !== 'help' && (
            <button type="button" className="help-all" onClick={onOpenAll}>
              Celá nápověda
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

import React, { useEffect, useRef } from 'react';
import ThemeToggleButton from './ThemeToggleButton';
import { THEME_SHORTCUT_LABEL } from '../theme/ThemeContext';
import './Footer.css';

const Footer: React.FC = () => {
  const footerRef = useRef<HTMLElement | null>(null);

  // The footer is `position: fixed`, so .main-content reserves room for it with
  // `calc(100vh - var(--app-footer-height) ...)`. Its link row wraps on narrow
  // windows, so that height is not a constant — publish the measured one, and
  // the tables below get exactly the space that is actually free.
  useEffect(() => {
    const element = footerRef.current;
    if (!element) return;

    const publishHeight = () => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) {
        document.documentElement.style.setProperty('--app-footer-height', `${Math.round(height)}px`);
      }
    };

    publishHeight();

    // Both, deliberately. ResizeObserver catches height changes that are not
    // driven by the viewport (theme/font swap, a link row added), but its
    // callbacks are delivered with the browser's rendering steps and are
    // skipped while the tab is not being rendered — so a window resized in a
    // background tab would otherwise keep a stale height. The resize event
    // fires regardless and covers exactly the case that changes this element:
    // the footer's link row wrapping onto a second line.
    const observer = new ResizeObserver(publishHeight);
    observer.observe(element);
    window.addEventListener('resize', publishHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publishHeight);
      // Back to the stylesheet's fallback rather than a stale measurement.
      document.documentElement.style.removeProperty('--app-footer-height');
    };
  }, []);

  return (
    <footer className="app-footer" ref={footerRef}>
      <div className="footer-toolbar">
        <div className="footer-theme-area">
          <ThemeToggleButton variant="footer" className="footer-theme-toggle" />
          <span className="footer-theme-shortcut" aria-label={`Klávesová zkratka pro přepnutí motivu: ${THEME_SHORTCUT_LABEL}`}>
            Zkratka <kbd>{THEME_SHORTCUT_LABEL}</kbd>
          </span>
        </div>
        <div className="footer-links">
          <a href="https://zoom.us/join" target="_blank" rel="noopener noreferrer" className="footer-link">Zoom</a>
          <a href="https://teams.microsoft.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Teams</a>
          <a href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Calendar</a>
          <a href="https://meet.google.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Meet</a>
          <a href="https://www.office.com/launch/excel" target="_blank" rel="noopener noreferrer" className="footer-link">Excel</a>
          <a href="https://email.seznam.cz/" target="_blank" rel="noopener noreferrer" className="footer-link">Seznam</a>
          <a href="https://mail.google.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Gmail</a>
          <a href="https://trello.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Trello</a>
          <a href="https://slack.com/signin" target="_blank" rel="noopener noreferrer" className="footer-link">Slack</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;


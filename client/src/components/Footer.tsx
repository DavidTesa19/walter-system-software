import React from 'react';
import ThemeToggleButton from './ThemeToggleButton';
import { THEME_SHORTCUT_LABEL } from '../theme/ThemeContext';
import './Footer.css';

const Footer: React.FC = () => {
  return (
    <footer className="app-footer">
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

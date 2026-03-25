import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import './ThemeToggleButton.css';

interface ThemeToggleButtonProps {
  variant?: 'footer' | 'icon';
  className?: string;
}

const MoonIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SunIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  variant = 'footer',
  className = ''
}) => {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'light' ? 'dark' : 'light';
  const label = nextTheme === 'dark' ? 'Tmavý režim' : 'Světlý režim';
  const title = `Přepnout na ${label.toLowerCase()}`;

  return (
    <button
      type="button"
      className={`theme-toggle-button theme-toggle-button--${variant} ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={title}
      title={title}
    >
      <span className="theme-toggle-button__icon">
        {nextTheme === 'dark' ? <MoonIcon /> : <SunIcon />}
      </span>
      {variant === 'footer' ? <span className="theme-toggle-button__label">{label}</span> : null}
    </button>
  );
};

export default ThemeToggleButton;
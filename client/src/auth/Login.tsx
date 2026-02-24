import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { trackPublicEvent } from '../utils/analytics';
import './Login.css';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme(); // Add theme context

  // Track login page view on mount
  useEffect(() => {
    trackPublicEvent('login_page_view');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const success = await login(username, password);
    
    if (!success) {
      trackPublicEvent('login_failure');
      setError('Neplatné přihlašovací údaje. Zkuste to prosím znovu.');
      setPassword('');
    }
    
    setIsLoading(false);
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    if (error) setError('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError('');
  };

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">Walter System</h1>
          <p className="login-subtitle">Přihlášení do systému</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="username" className="input-label">
              Uživatelské jméno
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={handleUsernameChange}
              placeholder="Zadejte uživatelské jméno"
              className={`input-field ${error ? 'input-error' : ''}`}
              disabled={isLoading}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="input-group">
            <label htmlFor="password" className="input-label">
              Heslo
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={handlePasswordChange}
              placeholder="Zadejte heslo"
              className={`input-field ${error ? 'input-error' : ''}`}
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            className={`login-button ${isLoading ? 'loading' : ''}`}
            disabled={!username.trim() || !password.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Ověřuji...
              </>
            ) : (
              'Přihlásit se'
            )}
          </button>
        </form>
        
        <button
          className="theme-toggle-login"
          onClick={toggleTheme}
          title={theme === 'light' ? 'Přepínání na tmavý režim' : 'Přepínání na světlý režim'}
        >
          {theme === 'light' ? (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
              <span>Tmavý režim</span>
            </>
          ) : (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
              <span>Světlý režim</span>
            </>
          )}
        </button>
        
        <a 
          href="https://form.waltersystem.cz" 
          target="_blank" 
          rel="noopener noreferrer"
          className="public-form-link"
          onClick={() => trackPublicEvent('form_link_click', { source: 'login' })}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          <span>Odeslat veřejný formulář</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </a>
        
        <div className="login-footer">
          <p className="security-note">
            🔒 Zabezpečený přístup • Relace vyprší po 6 hodinách nečinnosti
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
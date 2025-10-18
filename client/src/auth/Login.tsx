import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import './Login.css';

const Login: React.FC = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simple delay to simulate authentication process
    await new Promise(resolve => setTimeout(resolve, 500));

    const success = login(code);
    
    if (!success) {
      setError('Invalid verification code. Please try again.');
      setCode('');
    }
    
    setIsLoading(false);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value);
    if (error) setError(''); // Clear error when user starts typing
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
          <p className="login-subtitle">Access Verification Required</p>
        </div>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <label htmlFor="verification-code" className="input-label">
              Verification Code
            </label>
            <input
              id="verification-code"
              type="password"
              value={code}
              onChange={handleCodeChange}
              placeholder="Enter verification code"
              className={`input-field ${error ? 'input-error' : ''}`}
              disabled={isLoading}
              autoComplete="current-password"
              autoFocus
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
            disabled={!code.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                Verifying...
              </>
            ) : (
              'Access System'
            )}
          </button>
        </form>
        
        <a 
          href="https://form.waltersystem.cz" 
          target="_blank" 
          rel="noopener noreferrer"
          className="public-form-link"
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
          <span>Submit Public Form</span>
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
            🔒 Secure access • Session expires after 30 minutes of inactivity
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
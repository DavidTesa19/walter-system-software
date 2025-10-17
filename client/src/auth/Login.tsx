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
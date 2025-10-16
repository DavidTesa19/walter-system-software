import React from 'react';
import { useAuth } from './AuthContext';
import './SessionTimer.css';

const SessionTimer: React.FC = () => {
  const { timeLeft, logout } = useAuth();

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerClass = () => {
    if (timeLeft <= 60) return 'timer-critical'; // Last minute
    if (timeLeft <= 300) return 'timer-warning'; // Last 5 minutes
    return 'timer-normal';
  };

  return (
    <div className={`session-timer ${getTimerClass()}`}>
      <div className="timer-content">
        <span className="timer-icon">⏱️</span>
        <span className="timer-text">Session: {formatTime(timeLeft)}</span>
        <button 
          onClick={logout} 
          className="logout-button"
          title="Logout"
        >
          🚪
        </button>
      </div>
    </div>
  );
};

export default SessionTimer;
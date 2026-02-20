import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../usersGrid/constants';
import { SECTION_LABELS } from '../utils/analytics';
import './AnalyticsView.css';

interface AnalyticsSummary {
  loginPageViews: number;
  successfulLogins: number;
  failedLogins: number;
  totalLoginAttempts: number;
  userSignIns: Record<string, number>;
  totalActiveSeconds: number;
  userActiveTime: Record<string, number>;
  sectionVisits: Record<string, number>;
  userSectionVisits: Record<string, Record<string, number>>;
  formClicks: {
    fromLogin: number;
    fromApp: number;
    total: number;
  };
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

const AnalyticsView: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const getToken = (): string | null => {
    try {
      const stored = localStorage.getItem('walterUser');
      if (stored) return JSON.parse(stored).token || null;
    } catch { /* ignore */ }
    return null;
  };

  const fetchSummary = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/analytics/summary`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const data = await response.json();
      setSummary(data);
      setError(null);
    } catch (err) {
      setError('Nepodařilo se načíst analytická data');
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchSummary, 60_000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  if (loading && !summary) {
    return (
      <div className="analytics-view">
        <div className="analytics-loading">
          <div className="analytics-spinner" />
          <p>Načítání analytiky...</p>
        </div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="analytics-view">
        <div className="analytics-error">
          <p>{error}</p>
          <button onClick={fetchSummary} className="analytics-retry-btn">Zkusit znovu</button>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const sectionKeys = Object.keys(summary.sectionVisits).sort(
    (a, b) => summary.sectionVisits[b] - summary.sectionVisits[a]
  );

  const allUsersWithActivity = Array.from(
    new Set([
      ...Object.keys(summary.userSignIns),
      ...Object.keys(summary.userActiveTime),
      ...Object.keys(summary.userSectionVisits),
    ])
  ).sort();

  return (
    <div className="analytics-view">
      <div className="analytics-header">
        <h2 className="analytics-title">Analytika</h2>
        <button onClick={fetchSummary} className="analytics-refresh-btn" title="Obnovit data">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="analytics-cards">
        <div className="analytics-card">
          <div className="card-icon login-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-value">{summary.loginPageViews}</span>
            <span className="card-label">Zobrazení přihlášení</span>
          </div>
        </div>

        <div className="analytics-card">
          <div className="card-icon success-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-value">{summary.successfulLogins}</span>
            <span className="card-label">Úspěšná přihlášení</span>
          </div>
        </div>

        <div className="analytics-card">
          <div className="card-icon failure-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-value">{summary.failedLogins}</span>
            <span className="card-label">Neúspěšné pokusy</span>
          </div>
        </div>

        <div className="analytics-card">
          <div className="card-icon time-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-value">{formatDuration(summary.totalActiveSeconds)}</span>
            <span className="card-label">Celkový aktivní čas</span>
          </div>
        </div>

        <div className="analytics-card">
          <div className="card-icon form-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-value">{summary.formClicks.total}</span>
            <span className="card-label">Kliknutí na formulář</span>
          </div>
        </div>

        <div className="analytics-card">
          <div className="card-icon attempts-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="card-content">
            <span className="card-value">{summary.totalLoginAttempts}</span>
            <span className="card-label">Celkem pokusů o přihlášení</span>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="analytics-grid">
        {/* Section Visits */}
        <div className="analytics-panel">
          <h3 className="panel-title">Návštěvy sekcí</h3>
          {sectionKeys.length === 0 ? (
            <p className="panel-empty">Zatím žádná data</p>
          ) : (
            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Sekce</th>
                    <th>Návštěvy</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionKeys.map(key => (
                    <tr key={key}>
                      <td>{SECTION_LABELS[key] || key}</td>
                      <td className="num-cell">{summary.sectionVisits[key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Form Link Clicks Breakdown */}
        <div className="analytics-panel">
          <h3 className="panel-title">Kliknutí na formulář</h3>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Zdroj</th>
                  <th>Kliknutí</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Z přihlašovací stránky</td>
                  <td className="num-cell">{summary.formClicks.fromLogin}</td>
                </tr>
                <tr>
                  <td>Z aplikace (sidebar)</td>
                  <td className="num-cell">{summary.formClicks.fromApp}</td>
                </tr>
                <tr className="total-row">
                  <td><strong>Celkem</strong></td>
                  <td className="num-cell"><strong>{summary.formClicks.total}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Login ratio */}
          <h3 className="panel-title" style={{ marginTop: '24px' }}>Poměr přihlášení</h3>
          <div className="login-ratio-bar">
            {summary.totalLoginAttempts > 0 && (
              <>
                <div
                  className="ratio-success"
                  style={{ width: `${(summary.successfulLogins / summary.totalLoginAttempts) * 100}%` }}
                  title={`Úspěšné: ${summary.successfulLogins}`}
                />
                <div
                  className="ratio-failure"
                  style={{ width: `${(summary.failedLogins / summary.totalLoginAttempts) * 100}%` }}
                  title={`Neúspěšné: ${summary.failedLogins}`}
                />
              </>
            )}
          </div>
          <div className="ratio-labels">
            <span className="ratio-label success">
              <span className="ratio-dot success" />
              Úspěšné: {summary.successfulLogins}
            </span>
            <span className="ratio-label failure">
              <span className="ratio-dot failure" />
              Neúspěšné: {summary.failedLogins}
            </span>
          </div>
        </div>
      </div>

      {/* Per-User Breakdown */}
      <div className="analytics-panel full-width">
        <h3 className="panel-title">Aktivita uživatelů</h3>
        {allUsersWithActivity.length === 0 ? (
          <p className="panel-empty">Zatím žádná data</p>
        ) : (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Uživatel</th>
                  <th>Přihlášení</th>
                  <th>Aktivní čas</th>
                  <th>Sekce</th>
                </tr>
              </thead>
              <tbody>
                {allUsersWithActivity.map(username => {
                  const userSections = summary.userSectionVisits[username] || {};
                  const sectionEntries = Object.entries(userSections).sort((a, b) => b[1] - a[1]);
                  const isExpanded = expandedUser === username;

                  return (
                    <React.Fragment key={username}>
                      <tr
                        className="user-row clickable"
                        onClick={() => setExpandedUser(isExpanded ? null : username)}
                      >
                        <td>
                          <span className="user-expand-icon">{isExpanded ? '▼' : '▶'}</span>
                          {username}
                        </td>
                        <td className="num-cell">{summary.userSignIns[username] || 0}</td>
                        <td className="num-cell">{formatDuration(summary.userActiveTime[username] || 0)}</td>
                        <td className="num-cell">{sectionEntries.reduce((s, [, v]) => s + v, 0)} návštěv</td>
                      </tr>
                      {isExpanded && sectionEntries.length > 0 && sectionEntries.map(([section, count]) => (
                        <tr key={`${username}-${section}`} className="user-section-row">
                          <td className="indent-cell">{SECTION_LABELS[section] || section}</td>
                          <td />
                          <td />
                          <td className="num-cell">{count}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsView;

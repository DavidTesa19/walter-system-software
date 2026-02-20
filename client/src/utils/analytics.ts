/**
 * Analytics tracking utility for Walter System
 * Sends events to the backend analytics API
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004';

/** Get auth token from localStorage */
const getToken = (): string | null => {
  try {
    const stored = localStorage.getItem('walterUser');
    if (stored) {
      const user = JSON.parse(stored);
      return user.token || null;
    }
  } catch { /* ignore */ }
  return null;
};

// ---- Event Types ----
// login_page_view    - Login page was loaded
// login_success      - Successful login
// login_failure      - Failed login attempt
// section_visit      - User navigated to a section (section field = section name)
// active_time        - Heartbeat for active time tracking (duration_seconds)
// form_link_click    - Public form link clicked (source = 'login' | 'app')

/**
 * Track an authenticated event (requires user to be logged in)
 */
export async function trackEvent(
  event_type: string,
  options: {
    section?: string;
    source?: string;
    duration_seconds?: number;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  const token = getToken();
  if (!token) return; // Can't track authenticated events without a token

  try {
    await fetch(`${API_BASE}/api/analytics/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        event_type,
        section: options.section,
        source: options.source,
        duration_seconds: options.duration_seconds,
        metadata: options.metadata,
      }),
    });
  } catch {
    // Silently fail - analytics should never break the app
  }
}

/**
 * Track a public event (no auth required - login page, form clicks)
 */
export async function trackPublicEvent(
  event_type: string,
  options: {
    section?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/analytics/public-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type,
        section: options.section,
        source: options.source,
        metadata: options.metadata,
      }),
    });
  } catch {
    // Silently fail
  }
}

// ---- Section name mapping ----
export const SECTION_LABELS: Record<string, string> = {
  active: 'Aktuální přehled',
  pending: 'Ke schválení',
  archived: 'Archiv',
  calendar: 'Kalendář',
  teamchat: 'Týmový chat',
  chatbot: 'AI Asistent',
  palettes: 'Motivy',
  future: 'Budoucí funkce',
  analytics: 'Analytika',
};

// ---- Active Time Tracking ----

let activeTimeInterval: ReturnType<typeof setInterval> | null = null;
let isPageVisible = true;
let lastHeartbeat = 0;
const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

function handleVisibilityChange() {
  isPageVisible = !document.hidden;
}

function sendHeartbeat() {
  if (!isPageVisible) return;
  const token = getToken();
  if (!token) return;

  const now = Date.now();
  const elapsed = lastHeartbeat ? Math.round((now - lastHeartbeat) / 1000) : 30;
  lastHeartbeat = now;

  trackEvent('active_time', { duration_seconds: Math.min(elapsed, 60) });
}

/**
 * Start active time tracking. Call once when user logs in.
 */
export function startActiveTimeTracking(): void {
  stopActiveTimeTracking(); // Clear any existing
  lastHeartbeat = Date.now();
  isPageVisible = !document.hidden;

  document.addEventListener('visibilitychange', handleVisibilityChange);
  activeTimeInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

/**
 * Stop active time tracking. Call when user logs out.
 */
export function stopActiveTimeTracking(): void {
  if (activeTimeInterval) {
    clearInterval(activeTimeInterval);
    activeTimeInterval = null;
  }
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

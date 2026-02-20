/**
 * Centralized API utility with automatic authentication
 * All API calls should use these functions to ensure tokens are included
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004';

/**
 * Get the current auth token from localStorage
 */
const getAuthToken = (): string | null => {
  try {
    const storedUser = localStorage.getItem('walterUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      return user.token || null;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
};

/**
 * Create headers with authentication
 */
const createHeaders = (additionalHeaders: Record<string, string> = {}): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

/**
 * Handle API response - check for auth errors and parse JSON
 */
const handleResponse = async <T>(response: Response): Promise<T> => {
  if (response.status === 401 || response.status === 403) {
    // Token expired or invalid - clear auth and redirect to login
    localStorage.removeItem('walterUser');
    localStorage.removeItem('walterSessionStart');
    window.location.reload();
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
};

/**
 * GET request with authentication
 */
export const apiGet = async <T = any>(endpoint: string): Promise<T> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: createHeaders(),
  });
  return handleResponse<T>(response);
};

/**
 * POST request with authentication
 */
export const apiPost = async <T = any>(endpoint: string, body?: any): Promise<T> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: createHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(response);
};

/**
 * PUT request with authentication
 */
export const apiPut = async <T = any>(endpoint: string, body: any): Promise<T> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: createHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
};

/**
 * PATCH request with authentication
 */
export const apiPatch = async <T = any>(endpoint: string, body: any): Promise<T> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: createHeaders(),
    body: JSON.stringify(body),
  });
  return handleResponse<T>(response);
};

/**
 * DELETE request with authentication
 */
export const apiDelete = async <T = any>(endpoint: string): Promise<T> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: createHeaders(),
  });
  return handleResponse<T>(response);
};

/**
 * Upload file with authentication (for documents)
 */
export const apiUpload = async <T = any>(endpoint: string, formData: FormData): Promise<T> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const token = getAuthToken();
  
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Don't set Content-Type for FormData - browser will set it with boundary
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });
  return handleResponse<T>(response);
};

/**
 * Download file with authentication - fetches as blob and triggers browser download
 */
export const apiDownload = async (endpoint: string, filename: string): Promise<void> => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('walterUser');
    localStorage.removeItem('walterSessionStart');
    window.location.reload();
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
};

export { API_BASE };

import type { ApiResponse } from '../types/auth';

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: Array<{ field?: string; message: string }>;

  constructor(message: string, code: string, status: number = 400, details?: any[]) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// In-flight refresh promise singleton to prevent multiple simultaneous refresh calls
let activeRefreshPromise: Promise<boolean> | null = null;

/**
 * Returns the configured base API URL from environment variables, stripped of trailing slashes.
 * In local development with Vite proxy, VITE_API_BASE_URL is unset, returning an empty string.
 */
export function getApiBaseUrl(): string {
  const base = import.meta.env?.VITE_API_BASE_URL;
  if (!base || typeof base !== 'string') {
    return '';
  }
  return base.replace(/\/+$/, '');
}

/**
 * Resolves an API endpoint against the configured base URL without double-prefixing.
 * Preserves absolute URLs (starting with http:// or https://).
 * Preserves relative paths when VITE_API_BASE_URL is unset.
 */
export function resolveApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const base = getApiBaseUrl();
  if (!base) {
    return endpoint;
  }
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}

interface RequestOptions extends RequestInit {
  skipAuthRefresh?: boolean;
}

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuthRefresh = false, headers = {}, ...customConfig } = options;

  const url = resolveApiUrl(endpoint);

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const config: RequestInit = {
    ...customConfig,
    headers: {
      ...defaultHeaders,
      ...(headers as Record<string, string>),
    },
    // Always include credentials to securely transmit HttpOnly cookies
    credentials: 'include',
  };

  let response: Response;
  try {
    response = await fetch(url, config);
  } catch (err: any) {
    throw new ApiClientError(
      err.message || 'Network error: Unable to communicate with the server.',
      'NETWORK_ERROR',
      0
    );
  }

  // Handle 401 Unauthorized with automatic session refresh
  if (response.status === 401 && !skipAuthRefresh && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
    const refreshSuccessful = await refreshSessionInternal();

    if (refreshSuccessful) {
      // Retry original request once
      try {
        response = await fetch(url, config);
      } catch (err: any) {
        throw new ApiClientError(err.message, 'NETWORK_ERROR', 0);
      }
    } else {
      // Refresh failed; clear and notify
      throw new ApiClientError(
        'Your session has expired. Please sign in again.',
        'AUTH_SESSION_EXPIRED',
        401
      );
    }
  }

  let result: ApiResponse<T>;
  try {
    result = await response.json();
  } catch {
    throw new ApiClientError('Invalid server response format.', 'INVALID_RESPONSE', response.status);
  }

  if (!result.success) {
    throw new ApiClientError(
      result.error.message || 'An unexpected error occurred.',
      result.error.code || 'UNKNOWN_ERROR',
      result.error.status || response.status,
      result.error.details
    );
  }

  return result.data;
}

/**
 * Internal single-flight refresh handler
 */
async function refreshSessionInternal(): Promise<boolean> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const res = await fetch(resolveApiUrl('/api/v1/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        return false;
      }

      const body: ApiResponse<any> = await res.json();
      return body.success === true;
    } catch {
      return false;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, { ...options, method: 'DELETE' }),
};

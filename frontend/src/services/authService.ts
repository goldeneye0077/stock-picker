import { API_BASE_URL } from '../config/api';

export type AuthUser = {
  id: number;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  permissions: string[];
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type AuthResponse = {
  success: boolean;
  data: {
    token: string;
    refreshToken: string;
    expiresAt: string;
    user: AuthUser;
  };
};

export type MeResponse = {
  success: boolean;
  data: {
    user: AuthUser;
  };
};

export type AdminUsersResponse = {
  success: boolean;
  data: {
    users: Array<AuthUser & { createdAt?: string }>;
  };
};

export type PagesResponse = {
  success: boolean;
  data: {
    pages: string[];
  };
};

export type ContactMessageStatus = 'new' | 'in_progress' | 'resolved' | 'archived';

export type ContactMessageItem = {
  id: number;
  user_id: number | null;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: ContactMessageStatus;
  source_page: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminContactMessagesResponse = {
  success: boolean;
  data: {
    items: ContactMessageItem[];
    total: number;
    limit: number;
    offset: number;
  };
};

const TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export function setStoredRefreshToken(token: string | null) {
  if (!token) localStorage.removeItem(REFRESH_TOKEN_KEY);
  else localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function getAuthHeader(): Record<string, string> | null {
  const token = getStoredToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

async function request<T>(endpoint: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const authToken = token || getStoredToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  // Handle 401 unauthorized - Try to refresh token
  if (response.status === 401 && !endpoint.includes('/login') && !endpoint.includes('/refresh-token')) {
    if (isRefreshing) {
      return new Promise(function (resolve, reject) {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        return request<T>(endpoint, options, token as string);
      });
    }

    const refreshToken = getStoredRefreshToken();
    if (refreshToken) {
      isRefreshing = true;

      try {
        const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        const refreshData = await refreshRes.json();

        if (refreshRes.ok && refreshData.success) {
          const { token: newToken, refreshToken: newRefreshToken } = refreshData.data;
          setStoredToken(newToken);
          if (newRefreshToken) setStoredRefreshToken(newRefreshToken);

          processQueue(null, newToken);
          isRefreshing = false;

          return request<T>(endpoint, options, newToken);
        } else {
          // Refresh failed
          processQueue(refreshData); // Fail all queued
          isRefreshing = false;
          // Clear tokens logic should be handled by caller or context, 
          // but here we can at least throw
        }
      } catch (err) {
        processQueue(err);
        isRefreshing = false;
      }
    }
  }

  if (!response.ok) {
    const message = data?.detail || data?.message || `HTTP ${response.status}`;
    throw new ApiError(response.status, message, data);
  }
  return data as T;
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

// 获取验证码
export async function getCaptcha(): Promise<{ captcha: string; message: string; expiresIn: number }> {
  return request<{ captcha: string; message: string; expiresIn: number }>('/api/auth/captcha', { method: 'GET' });
}

export async function login(username: string, password: string, captcha?: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, captcha }),
  });
}

export async function logout(token: string): Promise<{ success: boolean }> {
  const refreshToken = getStoredRefreshToken();
  setStoredRefreshToken(null); // Clear locally immediately
  return request<{ success: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken })
  }, token);
}

export async function me(token: string): Promise<MeResponse> {
  return request<MeResponse>('/api/auth/me', { method: 'GET' }, token);
}

export async function adminListUsers(token: string): Promise<AdminUsersResponse> {
  return request<AdminUsersResponse>('/api/admin/users', { method: 'GET' }, token);
}

export async function adminPages(token: string): Promise<PagesResponse> {
  return request<PagesResponse>('/api/admin/pages', { method: 'GET' }, token);
}

export async function adminListContactMessages(
  token: string,
  params: {
    status?: ContactMessageStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<AdminContactMessagesResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (typeof params.limit === 'number') query.set('limit', String(params.limit));
  if (typeof params.offset === 'number') query.set('offset', String(params.offset));
  const queryString = query.toString();
  const endpoint = `/api/contact/admin/messages${queryString ? `?${queryString}` : ''}`;
  return request<AdminContactMessagesResponse>(endpoint, { method: 'GET' }, token);
}

export async function adminUpdateContactMessageStatus(
  token: string,
  id: number,
  status: ContactMessageStatus
): Promise<{ success: boolean; data?: { id: number; status: ContactMessageStatus } }> {
  return request<{ success: boolean; data?: { id: number; status: ContactMessageStatus } }>(
    `/api/contact/admin/messages/${id}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    token
  );
}

export async function adminUpdateUser(
  token: string,
  userId: number,
  payload: Partial<{ username: string; isAdmin: boolean; isActive: boolean }>
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, token);
}

export async function adminUpdatePermissions(
  token: string,
  userId: number,
  paths: string[]
): Promise<{ success: boolean; data?: { permissions: string[] } }> {
  return request<{ success: boolean; data?: { permissions: string[] } }>(`/api/admin/users/${userId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ paths }),
  }, token);
}

export async function adminCreateUser(
  token: string,
  payload: { username: string; password: string; isAdmin: boolean; isActive: boolean }
): Promise<{ success: boolean; data?: { user: AuthUser } }> {
  return request<{ success: boolean; data?: { user: AuthUser } }>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export type WatchlistResponse = {
  success: boolean;
  data: {
    codes: string[];
  };
};

export async function getWatchlist(token: string): Promise<WatchlistResponse> {
  return request<WatchlistResponse>('/api/auth/watchlist', { method: 'GET' }, token);
}

export async function addToWatchlist(token: string, stockCode: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/auth/watchlist', {
    method: 'POST',
    body: JSON.stringify({ stockCode }),
  }, token);
}

export async function removeFromWatchlist(token: string, stockCode: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/auth/watchlist/${encodeURIComponent(stockCode)}`, {
    method: 'DELETE',
  }, token);
}

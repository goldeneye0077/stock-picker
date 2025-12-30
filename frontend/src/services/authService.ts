import { API_BASE_URL } from '../config/api';

export type AuthUser = {
  id: number;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  permissions: string[];
};

export type AuthResponse = {
  success: boolean;
  data: {
    token: string;
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

const TOKEN_KEY = 'authToken';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(endpoint: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.detail || data?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function register(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(token: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }, token);
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


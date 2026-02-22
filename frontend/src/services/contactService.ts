import { API_BASE_URL } from '../config/api';
import { getStoredToken } from './authService';

export type ContactMessagePayload = {
  name: string;
  email: string;
  subject?: string;
  message: string;
  source_page?: string;
};

export type ContactMessageSubmitResponse = {
  success: boolean;
  message?: string;
  data?: {
    id: number;
    status: 'new';
    submittedAt: string;
  };
};

function buildHeaders(): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function parseErrorMessage(payload: any, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  if (typeof payload.detail === 'string' && payload.detail.trim()) {
    return payload.detail;
  }
  return fallback;
}

export async function submitContactMessage(payload: ContactMessagePayload): Promise<ContactMessageSubmitResponse> {
  const response = await fetch(`${API_BASE_URL}/api/contact/messages`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(parseErrorMessage(body, `HTTP ${response.status}`));
  }

  return body as ContactMessageSubmitResponse;
}

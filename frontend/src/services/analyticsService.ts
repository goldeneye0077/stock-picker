import { API_BASE_URL } from '../config/api';
import { getStoredToken } from './authService';

const ANALYTICS_BASE = `${API_BASE_URL}/api/analytics`;

type QueryParams = Record<string, string | number | boolean | null | undefined>;

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  detail?: string;
};

export interface AnalyticsSummary {
  today_uv: number;
  today_pv: number;
  today_api_calls: number;
  avg_response_time_ms: number;
  week_uv: number;
  week_pv: number;
  month_uv: number;
  month_pv: number;
}

export interface AnalyticsTrendItem {
  date: string;
  pv: number;
  uv: number;
}

export interface AnalyticsPageRankingItem {
  page_path: string;
  view_count: number;
  unique_visitors: number;
}

export interface AnalyticsApiStatsItem {
  endpoint: string;
  call_count: number;
  avg_response_time_ms: number;
  error_rate: number;
}

export interface AnalyticsTimeDistributionItem {
  hour: number;
  count: number;
}

export interface AnalyticsUserActivityItem {
  user_id: number;
  username: string;
  page_views: number;
  api_calls: number;
  last_active: string;
}

export interface AnalyticsRealtimeItem {
  id: number;
  page_path: string;
  user_id: number | null;
  username: string | null;
  created_at: string;
}

export interface SiteAnalyticsDashboardData {
  summary: AnalyticsSummary;
  trend: AnalyticsTrendItem[];
  pageRanking: AnalyticsPageRankingItem[];
  apiStats: AnalyticsApiStatsItem[];
  timeDistribution: AnalyticsTimeDistributionItem[];
  userActivity: AnalyticsUserActivityItem[];
  realtime: AnalyticsRealtimeItem[];
}

function buildQueryString(params: QueryParams = {}): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

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

function pickErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const body = payload as ApiEnvelope<unknown>;
  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message;
  }
  if (typeof body.detail === 'string' && body.detail.trim()) {
    return body.detail;
  }

  return fallback;
}

function unwrapPayload<T>(payload: unknown): T {
  if (!payload || typeof payload !== 'object') {
    return payload as T;
  }

  const data = payload as ApiEnvelope<T>;
  if (typeof data.success === 'boolean') {
    if (!data.success) {
      throw new Error(data.message || 'Request failed');
    }
    return (data.data as T) ?? ({} as T);
  }

  return payload as T;
}

async function requestAnalytics<T>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST';
    params?: QueryParams;
    body?: unknown;
  } = {}
): Promise<T> {
  const method = options.method || 'GET';
  const queryString = buildQueryString(options.params || {});
  const response = await fetch(`${ANALYTICS_BASE}/${endpoint}${queryString}`, {
    method,
    headers: buildHeaders(),
    body: method === 'GET' ? undefined : JSON.stringify(options.body || {}),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(pickErrorMessage(payload, `HTTP ${response.status}`));
  }

  return unwrapPayload<T>(payload);
}

export async function fetchAnalyticsSummary(): Promise<AnalyticsSummary> {
  return requestAnalytics<AnalyticsSummary>('summary');
}

export async function fetchAnalyticsTrend(days: number): Promise<AnalyticsTrendItem[]> {
  return requestAnalytics<AnalyticsTrendItem[]>('trend', { params: { days } });
}

export async function fetchAnalyticsPageRanking(
  days: number,
  limit: number = 10
): Promise<AnalyticsPageRankingItem[]> {
  return requestAnalytics<AnalyticsPageRankingItem[]>('page-ranking', { params: { days, limit } });
}

export async function fetchAnalyticsApiStats(
  days: number,
  limit: number = 10
): Promise<AnalyticsApiStatsItem[]> {
  return requestAnalytics<AnalyticsApiStatsItem[]>('api-stats', { params: { days, limit } });
}

export async function fetchAnalyticsTimeDistribution(days: number): Promise<AnalyticsTimeDistributionItem[]> {
  return requestAnalytics<AnalyticsTimeDistributionItem[]>('time-distribution', { params: { days } });
}

export async function fetchAnalyticsUserActivity(
  days: number,
  limit: number = 10
): Promise<AnalyticsUserActivityItem[]> {
  return requestAnalytics<AnalyticsUserActivityItem[]>('user-activity', { params: { days, limit } });
}

export async function fetchAnalyticsRealtime(limit: number = 30): Promise<AnalyticsRealtimeItem[]> {
  return requestAnalytics<AnalyticsRealtimeItem[]>('realtime', { params: { limit } });
}

export async function fetchSiteAnalyticsDashboard(days: number): Promise<SiteAnalyticsDashboardData> {
  const [summary, trend, pageRanking, apiStats, timeDistribution, userActivity, realtime] = await Promise.all([
    fetchAnalyticsSummary(),
    fetchAnalyticsTrend(days),
    fetchAnalyticsPageRanking(days, 10),
    fetchAnalyticsApiStats(days, 10),
    fetchAnalyticsTimeDistribution(days),
    fetchAnalyticsUserActivity(days, 10),
    fetchAnalyticsRealtime(30),
  ]);

  return {
    summary,
    trend,
    pageRanking,
    apiStats,
    timeDistribution,
    userActivity,
    realtime,
  };
}

interface PageViewPayload {
  page_path: string;
  referrer?: string | null;
}

export async function trackPageView(pagePath: string, referrer?: string | null): Promise<void> {
  try {
    await requestAnalytics<{ success: boolean }>('page-view', {
      method: 'POST',
      body: {
        page_path: pagePath,
        referrer: referrer || null,
      } as PageViewPayload,
    });
  } catch (err) {
    // Keep tracking failures silent to avoid impacting page navigation.
    console.debug('Failed to track page view:', err);
  }
}

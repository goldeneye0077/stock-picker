import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAnalyticsSummary,
  fetchAnalyticsTrend,
  trackPageView,
} from './analyticsService';

describe('analyticsService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    localStorage.clear();
  });

  it('unwraps envelope response and carries auth header', async () => {
    localStorage.setItem('authToken', 'token-abc');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          today_uv: 10,
          today_pv: 20,
          today_api_calls: 30,
          avg_response_time_ms: 40,
          week_uv: 70,
          week_pv: 80,
          month_uv: 90,
          month_pv: 100,
        },
      }),
    });

    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const summary = await fetchAnalyticsSummary();

    expect(summary.today_uv).toBe(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? '')).toContain('/api/analytics/summary');

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = requestInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-abc');
  });

  it('supports raw array response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        { date: '2026-02-21', pv: 12, uv: 8 },
      ]),
    });

    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const trend = await fetchAnalyticsTrend(7);

    expect(trend).toEqual([{ date: '2026-02-21', pv: 12, uv: 8 }]);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? '')).toContain('/api/analytics/trend?days=7');
  });

  it('throws business error message when success is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, message: 'forbidden' }),
    });

    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchAnalyticsSummary()).rejects.toThrow('forbidden');
  });

  it('trackPageView does not throw when request fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    await expect(trackPageView('/home')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

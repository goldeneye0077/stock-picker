import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPreviousTradeDate } from './analysisService';

describe('analysisService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it('fetchPreviousTradeDate should call endpoint and return previousTradeDate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          previousTradeDate: '2026-01-20',
        },
      }),
    });
    (globalThis as any).fetch = fetchMock as any;

    const prev = await fetchPreviousTradeDate('2026-01-21');

    expect(prev).toBe('2026-01-20');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] || '')).toContain(
      '/data-service/api/analysis/trade-day/previous?date=2026-01-21'
    );
  });

  it('fetchPreviousTradeDate should throw when response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    (globalThis as any).fetch = fetchMock as any;

    await expect(fetchPreviousTradeDate('2026-01-21')).rejects.toThrow('获取上一交易日失败');
  });
});

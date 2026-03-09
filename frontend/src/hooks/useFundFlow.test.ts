import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { message } from 'antd';
import * as analysisService from '../services/analysisService';
import { useFundFlow } from './useFundFlow';

vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../services/analysisService', () => ({
  fetchMarketMoneyflowData: vi.fn(),
}));

const mockFundFlowData = {
  summary: {
    totalElgAmount: 500000000,
    totalLgAmount: -200000000,
    totalMdAmount: 300000000,
    totalSmAmount: 0,
  },
  list: [],
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useFundFlow', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('loads and transforms summary data on mount', async () => {
    vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

    const { result } = renderHook(() => useFundFlow());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toHaveLength(4);
    expect(result.current.data[0]).toEqual(expect.objectContaining({ percent: 50, color: '#f50' }));
    expect(result.current.data[0].amount).toContain('5.0');
    expect(result.current.data[1]).toEqual(expect.objectContaining({ color: '#ff7a45' }));
    expect(result.current.data[2]).toEqual(expect.objectContaining({ color: '#2db7f5' }));
    expect(result.current.data[3]).toEqual(expect.objectContaining({ color: '#87d068' }));
    expect(message.success).toHaveBeenCalled();
  });

  it('uses provided initial params', async () => {
    vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

    const initialParams = { days: 7 };
    const { result } = renderHook(() => useFundFlow(initialParams));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.params).toEqual(initialParams);
    expect(analysisService.fetchMarketMoneyflowData).toHaveBeenCalledWith(initialParams);
  });

  it('returns empty data when summary is missing', async () => {
    vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue({ list: [] } as any);

    const { result } = renderHook(() => useFundFlow());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
    expect(message.info).toHaveBeenCalled();
  });

  it('handles API failures by clearing data', async () => {
    vi.mocked(analysisService.fetchMarketMoneyflowData).mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useFundFlow());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
    expect(message.error).toHaveBeenCalled();
  });

  it('updates params and resets them to the initial value', async () => {
    vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

    const initialParams = { days: 7 };
    const { result } = renderHook(() => useFundFlow(initialParams));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateParams({ days: 30 });
    });

    await waitFor(() => {
      expect(result.current.params).toEqual({ days: 30 });
    });

    act(() => {
      result.current.resetParams();
    });

    await waitFor(() => {
      expect(result.current.params).toEqual(initialParams);
    });
  });

  it('supports manual refresh and exposes loading during refresh', async () => {
    vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValueOnce(mockFundFlowData as any);

    const { result } = renderHook(() => useFundFlow());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    vi.clearAllMocks();

    const deferred = createDeferred<typeof mockFundFlowData>();
    vi.mocked(analysisService.fetchMarketMoneyflowData).mockReturnValue(deferred.promise as never);

    act(() => {
      void result.current.fetchData();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(analysisService.fetchMarketMoneyflowData).toHaveBeenCalledTimes(1);

    deferred.resolve(mockFundFlowData);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('handles all-zero totals without division errors', async () => {
    vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue({
      summary: {
        totalElgAmount: 0,
        totalLgAmount: 0,
        totalMdAmount: 0,
        totalSmAmount: 0,
      },
      list: [],
    } as any);

    const { result } = renderHook(() => useFundFlow());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toHaveLength(4);
    expect(result.current.data.every((item) => item.percent === 0)).toBe(true);
  });
});

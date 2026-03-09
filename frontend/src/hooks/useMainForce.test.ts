import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { message } from 'antd';
import * as analysisService from '../services/analysisService';
import { useMainForce } from './useMainForce';

vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../services/analysisService', () => ({
  fetchMainForceData: vi.fn(),
}));

const mockMainForceData = {
  mainForce: [
    { stockCode: '000001', stockName: 'Ping An Bank', strength: 85, behavior: 'strong' },
    { stockCode: '600000', stockName: 'SPDB', strength: 60, behavior: 'moderate' },
  ],
  summary: {
    strongCount: 10,
    moderateCount: 15,
    weakCount: 5,
    avgStrength: 72.5,
  },
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useMainForce', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('loads data on mount with default params', async () => {
    vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

    const { result } = renderHook(() => useMainForce());

    expect(result.current.loading).toBe(true);
    expect(result.current.summary).toBeNull();

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.params).toEqual({ days: 7, limit: 20 });
    expect(result.current.data).toEqual(mockMainForceData.mainForce);
    expect(result.current.summary).toEqual(mockMainForceData.summary);
    expect(analysisService.fetchMainForceData).toHaveBeenCalledWith({ days: 7, limit: 20 });
    expect(message.success).toHaveBeenCalled();
  });

  it('keeps initial summary null while request is pending', () => {
    vi.mocked(analysisService.fetchMainForceData).mockReturnValue(new Promise(() => {}) as never);

    const { result } = renderHook(() => useMainForce());

    expect(result.current.loading).toBe(true);
    expect(result.current.summary).toBeNull();
  });

  it('handles empty and null summary payloads', async () => {
    vi.mocked(analysisService.fetchMainForceData).mockResolvedValue({ mainForce: [], summary: null } as any);

    const { result } = renderHook(() => useMainForce());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.summary).toBeNull();
  });

  it('handles API failures by resetting data and summary', async () => {
    vi.mocked(analysisService.fetchMainForceData).mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useMainForce());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.summary).toBeNull();
    expect(message.error).toHaveBeenCalled();
  });

  it('supports initial params and reset back to them', async () => {
    vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

    const initialParams = { days: 14, limit: 50 };
    const { result } = renderHook(() => useMainForce(initialParams));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.params).toEqual(initialParams);

    act(() => {
      result.current.updateParams({ days: 90, limit: 200 });
    });

    await waitFor(() => {
      expect(result.current.params).toEqual({ days: 90, limit: 200 });
    });

    act(() => {
      result.current.resetParams();
    });

    await waitFor(() => {
      expect(result.current.params).toEqual(initialParams);
    });
  });

  it('updates individual params and resets to defaults when no initial params are supplied', async () => {
    vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

    const { result } = renderHook(() => useMainForce());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateParams({ limit: 100 });
    });

    await waitFor(() => {
      expect(result.current.params).toEqual({ days: 7, limit: 100 });
    });

    act(() => {
      result.current.resetParams();
    });

    await waitFor(() => {
      expect(result.current.params).toEqual({ days: 7, limit: 20 });
    });
  });

  it('supports manual refresh and toggles loading during a pending refresh', async () => {
    vi.mocked(analysisService.fetchMainForceData).mockResolvedValueOnce(mockMainForceData);

    const { result } = renderHook(() => useMainForce());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    vi.clearAllMocks();

    const deferred = createDeferred<typeof mockMainForceData>();
    vi.mocked(analysisService.fetchMainForceData).mockReturnValue(deferred.promise as never);

    act(() => {
      void result.current.fetchData();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(analysisService.fetchMainForceData).toHaveBeenCalledTimes(1);

    deferred.resolve(mockMainForceData);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});

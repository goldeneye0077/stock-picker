import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { message } from 'antd';
import * as analysisService from '../services/analysisService';
import { useVolumeAnalysis } from './useVolumeAnalysis';

vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../services/analysisService', () => ({
  fetchVolumeAnalysisData: vi.fn(),
}));

const mockVolumeData = {
  volumeSurges: [
    { stockCode: '000001', stockName: 'Ping An Bank', surgeRatio: 2.5, date: '2025-10-22' },
    { stockCode: '600000', stockName: 'SPDB', surgeRatio: 1.8, date: '2025-10-22' },
  ],
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useVolumeAnalysis', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('loads data on mount with default params', async () => {
    vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData as any);

    const { result } = renderHook(() => useVolumeAnalysis());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.params).toEqual({ days: 10 });
    expect(result.current.data).toEqual(mockVolumeData.volumeSurges);
    expect(analysisService.fetchVolumeAnalysisData).toHaveBeenCalledWith({ days: 10 });
    expect(message.success).toHaveBeenCalled();
  });

  it('returns empty data when volumeSurges is missing', async () => {
    vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue({} as any);

    const { result } = renderHook(() => useVolumeAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
  });

  it('handles API failures by clearing data', async () => {
    vi.mocked(analysisService.fetchVolumeAnalysisData).mockRejectedValue(new Error('API error'));

    const { result } = renderHook(() => useVolumeAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
    expect(message.error).toHaveBeenCalled();
  });

  it('uses provided initial params and can reset back to them', async () => {
    vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData as any);

    const initialParams = { days: 20 };
    const { result } = renderHook(() => useVolumeAnalysis(initialParams));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.params).toEqual(initialParams);

    act(() => {
      result.current.updateParams({ days: 90 });
    });

    await waitFor(() => {
      expect(result.current.params).toEqual({ days: 90 });
    });

    act(() => {
      result.current.resetParams();
    });

    await waitFor(() => {
      expect(result.current.params).toEqual(initialParams);
    });
  });

  it('resets to default params when no initial params are supplied', async () => {
    vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData as any);

    const { result } = renderHook(() => useVolumeAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateParams({ days: 60 });
    });

    await waitFor(() => {
      expect(result.current.params).toEqual({ days: 60 });
    });

    act(() => {
      result.current.resetParams();
    });

    await waitFor(() => {
      expect(result.current.params).toEqual({ days: 10 });
    });
  });

  it('supports manual refresh and exposes loading during refresh', async () => {
    vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValueOnce(mockVolumeData as any);

    const { result } = renderHook(() => useVolumeAnalysis());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    vi.clearAllMocks();

    const deferred = createDeferred<typeof mockVolumeData>();
    vi.mocked(analysisService.fetchVolumeAnalysisData).mockReturnValue(deferred.promise as never);

    act(() => {
      void result.current.fetchData();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    expect(analysisService.fetchVolumeAnalysisData).toHaveBeenCalledTimes(1);

    deferred.resolve(mockVolumeData);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});

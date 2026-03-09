/**
 * useStockList / useStockDetail hooks 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { message } from 'antd';
import { useStockList, useStockDetail } from './useStockList';
import * as stockService from '../services/stockService';

vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../services/stockService', () => ({
  fetchStockList: vi.fn(),
  fetchStockDetail: vi.fn(),
  fetchStockAnalysis: vi.fn(),
  searchStocks: vi.fn()
}));

const mockStockItems = [
  {
    key: '0',
    code: '000001',
    name: '平安银行',
    preClose: 12.0,
    open: 12.1,
    high: 12.6,
    low: 11.9,
    price: 12.5,
    change: '+2.5%',
    changeAmount: 0.3,
    volume: '1.2亿',
    amount: '15亿',
    quoteTime: '2025-10-22 15:00:00',
    status: '观察',
    signal: '持有'
  }
];

const mockListResponse = {
  items: mockStockItems,
  total: 42,
  page: 1,
  pageSize: 20
};

const mockSearchResults = [
  { code: '000001', name: '平安银行' },
  { code: '000002', name: '万科A' }
];

const mockStockDetail = {
  code: '000001',
  name: '平安银行',
  price: 12.5
};

const mockStockAnalysis = {
  code: '000001',
  indicators: {
    ma5: 12.0
  }
};

describe('useStockList', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('loads paginated data on mount', async () => {
    vi.mocked(stockService.fetchStockList).mockResolvedValue(mockListResponse);

    const { result } = renderHook(() => useStockList());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(stockService.fetchStockList).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(result.current.data).toEqual(mockStockItems);
    expect(result.current.total).toBe(42);
    expect(result.current.params.page).toBe(1);
    expect(result.current.params.pageSize).toBe(20);
  });

  it('uses initial params and keeps pagination defaults', async () => {
    vi.mocked(stockService.fetchStockList).mockResolvedValue(mockListResponse);

    const { result } = renderHook(() => useStockList({ date: '2025-10-22' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(stockService.fetchStockList).toHaveBeenCalledWith({
      date: '2025-10-22',
      page: 1,
      pageSize: 20
    });
  });

  it('sets empty data and total on fetch failure', async () => {
    vi.mocked(stockService.fetchStockList).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useStockList());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(message.error).toHaveBeenCalledWith('获取股票列表失败');
  });

  it('updates page params directly for pagination events', async () => {
    vi.mocked(stockService.fetchStockList).mockResolvedValue(mockListResponse);

    const { result } = renderHook(() => useStockList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateParams({ page: 2, pageSize: 50 });
    });

    await waitFor(() => {
      expect(result.current.params.page).toBe(2);
      expect(result.current.params.pageSize).toBe(50);
    });
  });

  it('resets page to 1 when filters change', async () => {
    vi.mocked(stockService.fetchStockList).mockResolvedValue(mockListResponse);

    const { result } = renderHook(() => useStockList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateParams({ page: 3, pageSize: 20 });
    });
    await waitFor(() => expect(result.current.params.page).toBe(3));

    act(() => {
      result.current.updateParams({ search: '平安' });
    });

    await waitFor(() => {
      expect(result.current.params.search).toBe('平安');
      expect(result.current.params.page).toBe(1);
    });
  });

  it('searches and formats search options', async () => {
    vi.mocked(stockService.fetchStockList).mockResolvedValue(mockListResponse);
    vi.mocked(stockService.searchStocks).mockResolvedValue(mockSearchResults);

    const { result } = renderHook(() => useStockList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSearch('平安');
    });

    expect(stockService.searchStocks).toHaveBeenCalledWith('平安');
    expect(result.current.searchOptions).toEqual([
      { value: '000001', label: '000001 - 平安银行' },
      { value: '000002', label: '000002 - 万科A' }
    ]);
  });

  it('clears options for empty search input', async () => {
    vi.mocked(stockService.fetchStockList).mockResolvedValue(mockListResponse);
    vi.mocked(stockService.searchStocks).mockResolvedValue(mockSearchResults);

    const { result } = renderHook(() => useStockList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleSearch('平安');
      await result.current.handleSearch('');
    });

    expect(result.current.searchOptions).toEqual([]);
  });

  it('supports manual refresh', async () => {
    vi.mocked(stockService.fetchStockList).mockResolvedValue(mockListResponse);

    const { result } = renderHook(() => useStockList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.clearAllMocks();
    vi.mocked(stockService.fetchStockList).mockResolvedValue(mockListResponse);

    await act(async () => {
      await result.current.fetchData();
    });

    expect(stockService.fetchStockList).toHaveBeenCalledTimes(1);
  });

  it('resets params and search state', async () => {
    vi.mocked(stockService.fetchStockList).mockResolvedValue(mockListResponse);

    const { result } = renderHook(() => useStockList({ date: '2025-10-22' }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateParams({ search: 'test', page: 3 });
      result.current.setSearchQuery('test');
    });

    act(() => {
      result.current.resetParams();
    });

    await waitFor(() => {
      expect(result.current.params).toEqual({
        date: '2025-10-22',
        page: 1,
        pageSize: 20
      });
      expect(result.current.searchQuery).toBe('');
      expect(result.current.searchOptions).toEqual([]);
    });
  });
});

describe('useStockDetail', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useStockDetail());

    expect(result.current.detail).toBeNull();
    expect(result.current.analysis).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.currentCode).toBeNull();
  });

  it('fetches detail successfully', async () => {
    vi.mocked(stockService.fetchStockDetail).mockResolvedValue(mockStockDetail);

    const { result } = renderHook(() => useStockDetail());

    await act(async () => {
      await result.current.fetchDetail('000001');
    });

    expect(stockService.fetchStockDetail).toHaveBeenCalledWith('000001');
    expect(result.current.detail).toEqual(mockStockDetail);
    expect(result.current.currentCode).toBe('000001');
  });

  it('handles detail fetch error', async () => {
    vi.mocked(stockService.fetchStockDetail).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useStockDetail());

    await act(async () => {
      await result.current.fetchDetail('000001');
    });

    expect(result.current.detail).toBeNull();
    expect(message.error).toHaveBeenCalledWith('获取股票详情失败');
  });

  it('fetches analysis successfully', async () => {
    vi.mocked(stockService.fetchStockAnalysis).mockResolvedValue(mockStockAnalysis);

    const { result } = renderHook(() => useStockDetail());

    await act(async () => {
      await result.current.fetchAnalysisData('000001');
    });

    expect(stockService.fetchStockAnalysis).toHaveBeenCalledWith('000001', {});
    expect(result.current.analysis).toEqual(mockStockAnalysis);
  });

  it('handles analysis error', async () => {
    vi.mocked(stockService.fetchStockAnalysis).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useStockDetail());

    await act(async () => {
      await result.current.fetchAnalysisData('000001');
    });

    expect(result.current.analysis).toBeNull();
    expect(message.error).toHaveBeenCalledWith('获取技术分析失败');
  });

  it('resets all detail states', async () => {
    vi.mocked(stockService.fetchStockDetail).mockResolvedValue(mockStockDetail);
    vi.mocked(stockService.fetchStockAnalysis).mockResolvedValue(mockStockAnalysis);

    const { result } = renderHook(() => useStockDetail());

    await act(async () => {
      await result.current.fetchDetail('000001');
      await result.current.fetchAnalysisData('000001');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.detail).toBeNull();
    expect(result.current.analysis).toBeNull();
    expect(result.current.currentCode).toBeNull();
  });
});

/**
 * useStockList 和 useStockDetail Hooks 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useStockList, useStockDetail } from './useStockList';
import { message } from 'antd';
import * as stockService from '../services/stockService';

// Mock antd message
vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock stockService
vi.mock('../services/stockService', () => ({
  fetchStockList: vi.fn(),
  fetchStockDetail: vi.fn(),
  fetchStockAnalysis: vi.fn(),
  searchStocks: vi.fn(),
}));

const mockStockList = [
  { code: '000001', name: '平安银行', price: 12.50, change: 2.5 },
  { code: '600000', name: '浦发银行', price: 8.30, change: -1.2 },
];

const mockSearchResults = [
  { code: '000001', name: '平安银行' },
  { code: '000002', name: '万科A' },
];

const mockStockDetail = {
  code: '000001',
  name: '平安银行',
  price: 12.50,
  change: 2.5,
  volume: 1000000,
};

const mockStockAnalysis = {
  code: '000001',
  technicalIndicators: { ma5: 12.0, ma10: 11.8 },
  recommendation: 'buy',
};

describe('useStockList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态和加载', () => {
    it('应该自动加载数据', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);

      const { result } = renderHook(() => useStockList());

      // 初始状态
      expect(result.current.loading).toBe(true);

      // 等待数据加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(2);
      expect(stockService.fetchStockList).toHaveBeenCalledTimes(1);
    });

    it('应该正确设置数据', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStockList);
    });

    it('应该使用初始参数', async () => {
      const initialParams = { page: 1, pageSize: 20 };
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);

      const { result } = renderHook(() => useStockList(initialParams));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.params).toEqual(initialParams);
      expect(stockService.fetchStockList).toHaveBeenCalledWith(initialParams);
    });
  });

  describe('错误处理', () => {
    it('应该处理 API 错误', async () => {
      const error = new Error('API 错误');
      vi.mocked(stockService.fetchStockList).mockRejectedValue(error);

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(message.error).toHaveBeenCalledWith('获取股票列表失败');
    });

    it('错误后应该设置空数据', async () => {
      vi.mocked(stockService.fetchStockList).mockRejectedValue(new Error('错误'));

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe('参数管理', () => {
    it('应该能够更新参数', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ page: 2 });

      await waitFor(() => {
        expect(result.current.params).toEqual({ page: 2 });
      });
    });

    it('应该能够重置参数', async () => {
      const initialParams = { page: 1 };
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);

      const { result } = renderHook(() => useStockList(initialParams));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ page: 5 });

      // 重置参数
      result.current.resetParams();

      await waitFor(() => {
        expect(result.current.params).toEqual(initialParams);
        expect(result.current.searchQuery).toBe('');
        expect(result.current.searchOptions).toEqual([]);
      });
    });
  });

  describe('搜索功能', () => {
    it('应该能够搜索股票', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);
      vi.mocked(stockService.searchStocks).mockResolvedValue(mockSearchResults);

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 执行搜索
      result.current.handleSearch('平安');

      await waitFor(() => {
        expect(result.current.searchOptions).toHaveLength(2);
      });

      expect(stockService.searchStocks).toHaveBeenCalledWith('平安');
    });

    it('应该正确格式化搜索选项', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);
      vi.mocked(stockService.searchStocks).mockResolvedValue(mockSearchResults);

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 执行搜索
      result.current.handleSearch('平安');

      await waitFor(() => {
        expect(result.current.searchOptions).toHaveLength(2);
      });

      expect(result.current.searchOptions[0]).toEqual({
        value: '000001',
        label: '000001 - 平安银行',
      });
    });

    it('空查询应该清空搜索选项', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);
      vi.mocked(stockService.searchStocks).mockResolvedValue(mockSearchResults);

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 先执行搜索
      result.current.handleSearch('平安');

      await waitFor(() => {
        expect(result.current.searchOptions).toHaveLength(2);
      });

      // 清空查询
      result.current.handleSearch('');

      await waitFor(() => {
        expect(result.current.searchOptions).toEqual([]);
      });
    });

    it('应该处理搜索错误', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);
      vi.mocked(stockService.searchStocks).mockRejectedValue(new Error('搜索错误'));

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 执行搜索
      result.current.handleSearch('平安');

      await waitFor(() => {
        expect(result.current.searchOptions).toEqual([]);
      });
    });

    it('应该能够设置搜索查询', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 设置搜索查询
      result.current.setSearchQuery('test query');

      await waitFor(() => {
        expect(result.current.searchQuery).toBe('test query');
      });
    });
  });

  describe('手动刷新', () => {
    it('应该能够手动刷新数据', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 清除之前的调用记录
      vi.clearAllMocks();

      // 手动刷新
      result.current.fetchData();

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(stockService.fetchStockList).toHaveBeenCalledTimes(1);
    });
  });

  describe('返回值结构', () => {
    it('应该返回正确的结构', async () => {
      vi.mocked(stockService.fetchStockList).mockResolvedValue(mockStockList);

      const { result } = renderHook(() => useStockList());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('params');
      expect(result.current).toHaveProperty('searchQuery');
      expect(result.current).toHaveProperty('searchOptions');
      expect(result.current).toHaveProperty('fetchData');
      expect(result.current).toHaveProperty('updateParams');
      expect(result.current).toHaveProperty('resetParams');
      expect(result.current).toHaveProperty('handleSearch');
      expect(result.current).toHaveProperty('setSearchQuery');
    });
  });
});

describe('useStockDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('应该返回初始状态', () => {
      const { result } = renderHook(() => useStockDetail());

      expect(result.current.detail).toBeNull();
      expect(result.current.analysis).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.currentCode).toBeNull();
    });
  });

  describe('获取股票详情', () => {
    it('应该能够获取股票详情', async () => {
      vi.mocked(stockService.fetchStockDetail).mockResolvedValue(mockStockDetail);

      const { result } = renderHook(() => useStockDetail());

      // 执行获取详情
      await act(async () => {
        await result.current.fetchDetail('000001');
      });

      // 等待加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.detail).toEqual(mockStockDetail);
      expect(result.current.currentCode).toBe('000001');
      expect(stockService.fetchStockDetail).toHaveBeenCalledWith('000001');
    });

    it('应该处理获取详情错误', async () => {
      vi.mocked(stockService.fetchStockDetail).mockRejectedValue(new Error('错误'));

      const { result } = renderHook(() => useStockDetail());

      // 执行获取详情
      result.current.fetchDetail('000001');

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.detail).toBeNull();
      expect(message.error).toHaveBeenCalledWith('获取股票详情失败');
    });
  });

  describe('获取技术分析', () => {
    it('应该能够获取技术分析', async () => {
      vi.mocked(stockService.fetchStockAnalysis).mockResolvedValue(mockStockAnalysis);

      const { result } = renderHook(() => useStockDetail());

      // 执行获取分析
      await act(async () => {
        await result.current.fetchAnalysisData('000001');
      });

      // 等待加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.analysis).toEqual(mockStockAnalysis);
      expect(result.current.currentCode).toBe('000001');
      expect(stockService.fetchStockAnalysis).toHaveBeenCalledWith('000001');
    });

    it('应该处理获取分析错误', async () => {
      vi.mocked(stockService.fetchStockAnalysis).mockRejectedValue(new Error('错误'));

      const { result } = renderHook(() => useStockDetail());

      // 执行获取分析
      result.current.fetchAnalysisData('000001');

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.analysis).toBeNull();
      expect(message.error).toHaveBeenCalledWith('获取技术分析失败');
    });
  });

  describe('重置功能', () => {
    it('应该能够重置所有状态', async () => {
      vi.mocked(stockService.fetchStockDetail).mockResolvedValue(mockStockDetail);
      vi.mocked(stockService.fetchStockAnalysis).mockResolvedValue(mockStockAnalysis);

      const { result } = renderHook(() => useStockDetail());

      // 获取详情和分析
      await act(async () => {
        await result.current.fetchDetail('000001');
      });
      await waitFor(() => {
        expect(result.current.detail).not.toBeNull();
      });

      await act(async () => {
        await result.current.fetchAnalysisData('000001');
      });
      await waitFor(() => {
        expect(result.current.analysis).not.toBeNull();
      });

      // 重置
      act(() => {
        result.current.reset();
      });

      expect(result.current.detail).toBeNull();
      expect(result.current.analysis).toBeNull();
      expect(result.current.currentCode).toBeNull();
    });
  });

  describe('返回值结构', () => {
    it('应该返回正确的结构', () => {
      const { result } = renderHook(() => useStockDetail());

      expect(result.current).toHaveProperty('detail');
      expect(result.current).toHaveProperty('analysis');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('currentCode');
      expect(result.current).toHaveProperty('fetchDetail');
      expect(result.current).toHaveProperty('fetchAnalysisData');
      expect(result.current).toHaveProperty('reset');
    });
  });
});

/**
 * useVolumeAnalysis Hook 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVolumeAnalysis } from './useVolumeAnalysis';
import { message } from 'antd';
import * as analysisService from '../services/analysisService';

// Mock antd message
vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock analysisService
vi.mock('../services/analysisService', () => ({
  fetchVolumeAnalysisData: vi.fn(),
}));

const mockVolumeData = {
  volumeSurges: [
    { stockCode: '000001', stockName: '平安银行', surgeRatio: 2.5, date: '2025-10-22' },
    { stockCode: '600000', stockName: '浦发银行', surgeRatio: 1.8, date: '2025-10-22' },
  ],
};

describe('useVolumeAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态和加载', () => {
    it('应该自动加载数据', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis());

      // 初始状态
      expect(result.current.loading).toBe(true);

      // 等待数据加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(2);
      expect(analysisService.fetchVolumeAnalysisData).toHaveBeenCalledTimes(1);
    });

    it('应该使用默认参数 days: 10', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.params).toEqual({ days: 10 });
      expect(analysisService.fetchVolumeAnalysisData).toHaveBeenCalledWith({ days: 10 });
    });

    it('应该正确设置数据', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockVolumeData.volumeSurges);
    });

    it('成功加载后应该显示成功消息', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(message.success).toHaveBeenCalledWith('成交量数据已刷新');
      });
    });
  });

  describe('无数据情况', () => {
    it('应该处理无 volumeSurges 的情况', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue({});

      const { result } = renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });

    it('应该处理空数组', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue({
        volumeSurges: [],
      });

      const { result } = renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe('错误处理', () => {
    it('应该处理 API 错误', async () => {
      const error = new Error('API 错误');
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockRejectedValue(error);

      const { result } = renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(message.error).toHaveBeenCalledWith('获取成交量数据失败');
    });

    it('错误后应该设置空数据', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockRejectedValue(new Error('错误'));

      const { result } = renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe('参数管理', () => {
    it('应该使用初始参数', async () => {
      const initialParams = { days: 30 };
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis(initialParams));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.params).toEqual({ days: 30 });
      expect(analysisService.fetchVolumeAnalysisData).toHaveBeenCalledWith({ days: 30 });
    });

    it('应该能够更新参数', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ days: 60 });

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 60 });
      });
    });

    it('应该能够重置参数', async () => {
      const initialParams = { days: 20 };
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis(initialParams));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ days: 90 });

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 90 });
      });

      // 重置参数
      result.current.resetParams();

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 20 });
      });
    });

    it('重置时应该保留默认 days: 10', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ days: 90 });

      // 重置参数
      result.current.resetParams();

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 10 });
      });
    });
  });

  describe('手动刷新', () => {
    it('应该能够手动刷新数据', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis());

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

      expect(analysisService.fetchVolumeAnalysisData).toHaveBeenCalledTimes(1);
    });

    it('刷新时应该设置 loading 状态', async () => {
      // 第一次调用立即返回
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValueOnce(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis());

      // 等待第一次自动加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 设置延迟响应用于第二次调用
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockReturnValue(promise as any);

      // 手动刷新
      result.current.fetchData();

      // 应该正在加载
      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });

      // 完成加载
      resolvePromise!(mockVolumeData);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('返回值结构', () => {
    it('应该返回正确的结构', async () => {
      vi.mocked(analysisService.fetchVolumeAnalysisData).mockResolvedValue(mockVolumeData);

      const { result } = renderHook(() => useVolumeAnalysis());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('params');
      expect(result.current).toHaveProperty('fetchData');
      expect(result.current).toHaveProperty('updateParams');
      expect(result.current).toHaveProperty('resetParams');
    });
  });
});

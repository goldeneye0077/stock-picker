/**
 * useMainForce Hook 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMainForce } from './useMainForce';
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
  fetchMainForceData: vi.fn(),
}));

const mockMainForceData = {
  mainForce: [
    { stockCode: '000001', stockName: '平安银行', strength: 85, behavior: 'strong' },
    { stockCode: '600000', stockName: '浦发银行', strength: 60, behavior: 'moderate' },
  ],
  summary: {
    strongCount: 10,
    moderateCount: 15,
    weakCount: 5,
    avgStrength: 72.5,
  },
};

describe('useMainForce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态和加载', () => {
    it('应该自动加载数据', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

      // 初始状态
      expect(result.current.loading).toBe(true);

      // 等待数据加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.summary).not.toBeNull();
      expect(analysisService.fetchMainForceData).toHaveBeenCalledTimes(1);
    });

    it('应该使用默认参数 days: 7, limit: 20', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.params).toEqual({ days: 7, limit: 20 });
      expect(analysisService.fetchMainForceData).toHaveBeenCalledWith({ days: 7, limit: 20 });
    });

    it('应该正确设置数据和摘要', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockMainForceData.mainForce);
      expect(result.current.summary).toEqual(mockMainForceData.summary);
    });

    it('成功加载后应该显示成功消息', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      renderHook(() => useMainForce());

      await waitFor(() => {
        expect(message.success).toHaveBeenCalledWith('主力行为数据已刷新');
      });
    });
  });

  describe('无数据情况', () => {
    it('应该处理无 mainForce 的情况', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue({});

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.summary).toBeNull();
    });

    it('应该处理空数据和 null summary', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue({
        mainForce: [],
        summary: null,
      });

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.summary).toBeNull();
    });
  });

  describe('错误处理', () => {
    it('应该处理 API 错误', async () => {
      const error = new Error('API 错误');
      vi.mocked(analysisService.fetchMainForceData).mockRejectedValue(error);

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.summary).toBeNull();
      expect(message.error).toHaveBeenCalledWith('获取主力行为数据失败');
    });

    it('错误后应该设置空数据和 null summary', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockRejectedValue(new Error('错误'));

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(result.current.summary).toBeNull();
    });
  });

  describe('参数管理', () => {
    it('应该使用初始参数', async () => {
      const initialParams = { days: 14, limit: 50 };
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce(initialParams));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.params).toEqual({ days: 14, limit: 50 });
      expect(analysisService.fetchMainForceData).toHaveBeenCalledWith({ days: 14, limit: 50 });
    });

    it('应该能够更新参数', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ days: 30 });

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 30, limit: 20 });
      });
    });

    it('应该能够更新单个参数', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 只更新 limit
      result.current.updateParams({ limit: 100 });

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 7, limit: 100 });
      });
    });

    it('应该能够重置参数', async () => {
      const initialParams = { days: 14, limit: 30 };
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce(initialParams));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ days: 90, limit: 200 });

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 90, limit: 200 });
      });

      // 重置参数
      result.current.resetParams();

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 14, limit: 30 });
      });
    });

    it('重置时应该保留默认值', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ days: 90 });

      // 重置参数
      result.current.resetParams();

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 7, limit: 20 });
      });
    });
  });

  describe('手动刷新', () => {
    it('应该能够手动刷新数据', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

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

      expect(analysisService.fetchMainForceData).toHaveBeenCalledTimes(1);
    });

    it('刷新时应该设置 loading 状态', async () => {
      // 第一次调用立即返回
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValueOnce(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

      // 等待第一次自动加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 设置延迟响应用于第二次调用
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(analysisService.fetchMainForceData).mockReturnValue(promise as any);

      // 手动刷新
      result.current.fetchData();

      // 应该正在加载
      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });

      // 完成加载
      resolvePromise!(mockMainForceData);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('返回值结构', () => {
    it('应该返回正确的结构', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toHaveProperty('data');
      expect(result.current).toHaveProperty('summary');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('params');
      expect(result.current).toHaveProperty('fetchData');
      expect(result.current).toHaveProperty('updateParams');
      expect(result.current).toHaveProperty('resetParams');
    });

    it('初始状态 summary 应该为 null', () => {
      const { result } = renderHook(() => useMainForce());

      expect(result.current.summary).toBeNull();
    });
  });

  describe('summary 数据', () => {
    it('应该正确设置 summary 数据', async () => {
      vi.mocked(analysisService.fetchMainForceData).mockResolvedValue(mockMainForceData);

      const { result } = renderHook(() => useMainForce());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.summary?.strongCount).toBe(10);
      expect(result.current.summary?.moderateCount).toBe(15);
      expect(result.current.summary?.weakCount).toBe(5);
      expect(result.current.summary?.avgStrength).toBe(72.5);
    });
  });
});

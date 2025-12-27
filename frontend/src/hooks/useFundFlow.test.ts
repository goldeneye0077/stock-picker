/**
 * useFundFlow Hook 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFundFlow } from './useFundFlow';
import { message } from 'antd';
import * as analysisService from '../services/analysisService';

// Mock antd message
vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock analysisService
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

describe('useFundFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态和加载', () => {
    it('应该自动加载数据', async () => {
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

      const { result } = renderHook(() => useFundFlow());

      // 等待数据加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(4);
      expect(analysisService.fetchMarketMoneyflowData).toHaveBeenCalledTimes(1);
    });

    it('应该正确转换数据格式', async () => {
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

      const { result } = renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const extraLarge = result.current.data.find((d) => d.type === '超大单');
      expect(extraLarge).toBeDefined();
      expect(extraLarge?.amount).toBe('+5.0亿');
      expect(extraLarge?.color).toBe('#f50');

      const large = result.current.data.find((d) => d.type === '大单');
      expect(large).toBeDefined();
      expect(large?.amount).toBe('-2.0亿');
      expect(large?.color).toBe('#ff7a45');

      const medium = result.current.data.find((d) => d.type === '中单');
      expect(medium).toBeDefined();
      expect(medium?.amount).toBe('+3.0亿');
      expect(medium?.color).toBe('#2db7f5');

      const small = result.current.data.find((d) => d.type === '小单');
      expect(small).toBeDefined();
      expect(small?.amount).toBe('+0.0亿');
      expect(small?.color).toBe('#87d068');
    });

    it('应该正确计算百分比', async () => {
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

      const { result } = renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const extraLarge = result.current.data.find((d) => d.type === '超大单');
      expect(extraLarge?.percent).toBe(50);
    });

    it('成功加载后应该显示成功消息', async () => {
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

      renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(message.success).toHaveBeenCalledWith('大盘资金流向数据已刷新');
      });
    });
  });

  describe('无数据情况', () => {
    it('应该处理无 summary 的情况', async () => {
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue({ list: [] } as any);

      const { result } = renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(message.info).toHaveBeenCalledWith('暂无大盘资金流向数据');
    });

    it('应该处理 null/undefined summary', async () => {
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue({
        summary: null as any,
        list: [],
      } as any);

      const { result } = renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe('错误处理', () => {
    it('应该处理 API 错误', async () => {
      const error = new Error('API 错误');
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockRejectedValue(error);

      const { result } = renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
      expect(message.error).toHaveBeenCalledWith('刷新大盘资金流向数据失败');
    });

    it('错误后应该设置空数据', async () => {
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockRejectedValue(new Error('错误'));

      const { result } = renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });
  });

  describe('参数管理', () => {
    it('应该使用初始参数', async () => {
      const initialParams = { days: 7 };
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

      const { result } = renderHook(() => useFundFlow(initialParams));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.params).toEqual(initialParams);
      expect(analysisService.fetchMarketMoneyflowData).toHaveBeenCalledWith(initialParams);
    });

    it('应该能够更新参数', async () => {
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

      const { result } = renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ days: 30 });

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 30 });
      });
    });

    it('应该能够重置参数', async () => {
      const initialParams = { days: 7 };
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

      const { result } = renderHook(() => useFundFlow(initialParams));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 更新参数
      result.current.updateParams({ days: 30 });

      await waitFor(() => {
        expect(result.current.params).toEqual({ days: 30 });
      });

      // 重置参数
      result.current.resetParams();

      await waitFor(() => {
        expect(result.current.params).toEqual(initialParams);
      });
    });
  });

  describe('手动刷新', () => {
    it('应该能够手动刷新数据', async () => {
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(mockFundFlowData as any);

      const { result } = renderHook(() => useFundFlow());

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

      expect(analysisService.fetchMarketMoneyflowData).toHaveBeenCalledTimes(1);
    });

    it('刷新时应该设置 loading 状态', async () => {
      // 第一次调用立即返回
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValueOnce(mockFundFlowData as any);

      const { result } = renderHook(() => useFundFlow());

      // 等待第一次自动加载完成
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 设置延迟响应用于第二次调用
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(analysisService.fetchMarketMoneyflowData).mockReturnValue(promise as any);

      // 手动刷新
      result.current.fetchData();

      // 应该正在加载
      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });

      // 完成加载
      resolvePromise!(mockFundFlowData);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('边界情况', () => {
    it('应该处理零值数据', async () => {
      const zeroData = {
        summary: {
          totalElgAmount: 0,
          totalLgAmount: 0,
          totalMdAmount: 0,
          totalSmAmount: 0,
        },
        list: [],
      };

      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(zeroData as any);

      const { result } = renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(4);
      result.current.data.forEach((item) => {
        expect(item.percent).toBe(0);
      });
    });

    it('应该正确处理负值', async () => {
      const negativeData = {
        summary: {
          totalElgAmount: -500000000,
          totalLgAmount: -200000000,
          totalMdAmount: -300000000,
          totalSmAmount: 0,
        },
        list: [],
      };

      vi.mocked(analysisService.fetchMarketMoneyflowData).mockResolvedValue(negativeData as any);

      const { result } = renderHook(() => useFundFlow());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const extraLarge = result.current.data.find((d) => d.type === '超大单');
      expect(extraLarge?.amount).toBe('-5.0亿');
    });
  });
});

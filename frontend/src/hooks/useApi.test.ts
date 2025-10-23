/**
 * useApi Hook 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useApi } from './useApi';
import { message } from 'antd';

// Mock antd message
vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始状态', () => {
    it('应该返回初始状态', () => {
      const mockApi = vi.fn();
      const { result } = renderHook(() => useApi(mockApi));

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(typeof result.current.execute).toBe('function');
      expect(typeof result.current.reset).toBe('function');
    });
  });

  describe('成功请求', () => {
    it('应该正确处理成功的 API 调用', async () => {
      const mockData = { id: 1, name: '测试' };
      const mockApi = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useApi(mockApi));

      // 执行前状态
      expect(result.current.loading).toBe(false);

      // 执行 API 调用
      let returnedData: any;
      await act(async () => {
        returnedData = await result.current.execute();
      });

      // 执行后状态
      expect(result.current.data).toEqual(mockData);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(returnedData).toEqual(mockData);
      expect(mockApi).toHaveBeenCalledTimes(1);
    });

    it('应该处理带参数的 API 调用', async () => {
      const mockApi = vi.fn((id: number, name: string) =>
        Promise.resolve({ id, name })
      );

      const { result } = renderHook(() => useApi<{ id: number; name: string }, [number, string]>(mockApi));

      await act(async () => {
        await result.current.execute(123, '测试');
      });

      expect(mockApi).toHaveBeenCalledWith(123, '测试');
      expect(result.current.data).toEqual({ id: 123, name: '测试' });
    });

    it('应该调用 onSuccess 回调', async () => {
      const mockData = { test: 'data' };
      const mockApi = vi.fn().mockResolvedValue(mockData);
      const onSuccess = vi.fn();

      const { result } = renderHook(() =>
        useApi(mockApi, { onSuccess })
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(onSuccess).toHaveBeenCalledWith(mockData);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('应该显示成功消息', async () => {
      const mockApi = vi.fn().mockResolvedValue({});
      const successMessage = '操作成功';

      const { result } = renderHook(() =>
        useApi(mockApi, { successMessage })
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(message.success).toHaveBeenCalledWith(successMessage);
    });
  });

  describe('失败请求', () => {
    it('应该正确处理失败的 API 调用', async () => {
      const mockError = new Error('API 错误');
      const mockApi = vi.fn().mockRejectedValue(mockError);

      const { result } = renderHook(() => useApi(mockApi));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toEqual(mockError);
    });

    it('应该处理非 Error 对象的错误', async () => {
      const mockApi = vi.fn().mockRejectedValue('字符串错误');

      const { result } = renderHook(() => useApi(mockApi));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('字符串错误');
    });

    it('应该调用 onError 回调', async () => {
      const mockError = new Error('API 错误');
      const mockApi = vi.fn().mockRejectedValue(mockError);
      const onError = vi.fn();

      const { result } = renderHook(() =>
        useApi(mockApi, { onError })
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(onError).toHaveBeenCalledWith(mockError);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('应该显示自定义错误消息', async () => {
      const mockApi = vi.fn().mockRejectedValue(new Error('错误'));
      const errorMessage = '自定义错误消息';

      const { result } = renderHook(() =>
        useApi(mockApi, { errorMessage })
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(message.error).toHaveBeenCalledWith(errorMessage);
    });

    it('应该显示默认错误消息', async () => {
      const mockError = new Error('API 错误');
      const mockApi = vi.fn().mockRejectedValue(mockError);

      const { result } = renderHook(() => useApi(mockApi));

      await act(async () => {
        await result.current.execute();
      });

      expect(message.error).toHaveBeenCalledWith('API 错误');
    });

    it('失败时应该返回 null', async () => {
      const mockApi = vi.fn().mockRejectedValue(new Error('错误'));

      const { result } = renderHook(() => useApi(mockApi));

      let returnedData: any;
      await act(async () => {
        returnedData = await result.current.execute();
      });

      expect(returnedData).toBeNull();
    });
  });

  describe('加载状态', () => {
    it('应该在请求期间设置 loading 为 true', async () => {
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const mockApi = vi.fn().mockReturnValue(promise);

      const { result } = renderHook(() => useApi(mockApi));

      // 开始执行
      act(() => {
        result.current.execute();
      });

      // 此时应该在加载中
      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });

      // 完成请求
      await act(async () => {
        resolvePromise!({ data: 'test' });
        await promise;
      });

      // 加载完成
      expect(result.current.loading).toBe(false);
    });

    it('失败后应该将 loading 设置为 false', async () => {
      const mockApi = vi.fn().mockRejectedValue(new Error('错误'));

      const { result } = renderHook(() => useApi(mockApi));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('reset 函数', () => {
    it('应该重置所有状态', async () => {
      const mockData = { test: 'data' };
      const mockApi = vi.fn().mockResolvedValue(mockData);

      const { result } = renderHook(() => useApi(mockApi));

      // 执行 API 调用
      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.data).toEqual(mockData);

      // 重置状态
      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('应该清除错误状态', async () => {
      const mockApi = vi.fn().mockRejectedValue(new Error('错误'));

      const { result } = renderHook(() => useApi(mockApi));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('多次调用', () => {
    it('应该处理连续的 API 调用', async () => {
      let callCount = 0;
      const mockApi = vi.fn(() => {
        callCount++;
        return Promise.resolve({ count: callCount });
      });

      const { result } = renderHook(() => useApi(mockApi));

      // 第一次调用
      await act(async () => {
        await result.current.execute();
      });
      expect(result.current.data).toEqual({ count: 1 });

      // 第二次调用
      await act(async () => {
        await result.current.execute();
      });
      expect(result.current.data).toEqual({ count: 2 });

      expect(mockApi).toHaveBeenCalledTimes(2);
    });

    it('失败后可以重新调用', async () => {
      const mockApi = vi
        .fn()
        .mockRejectedValueOnce(new Error('错误'))
        .mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useApi(mockApi));

      // 第一次调用失败
      await act(async () => {
        await result.current.execute();
      });
      expect(result.current.error).not.toBeNull();

      // 第二次调用成功
      await act(async () => {
        await result.current.execute();
      });
      expect(result.current.error).toBeNull();
      expect(result.current.data).toEqual({ success: true });
    });
  });

  describe('边界情况', () => {
    it('应该处理 undefined 返回值', async () => {
      const mockApi = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() => useApi(mockApi));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeNull();
    });

    it('应该处理 null 返回值', async () => {
      const mockApi = vi.fn().mockResolvedValue(null);

      const { result } = renderHook(() => useApi(mockApi));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('应该处理空对象返回值', async () => {
      const mockApi = vi.fn().mockResolvedValue({});

      const { result } = renderHook(() => useApi(mockApi));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.data).toEqual({});
      expect(result.current.error).toBeNull();
    });
  });
});

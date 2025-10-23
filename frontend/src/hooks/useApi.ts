/**
 * 通用API调用Hook
 * 提供统一的数据获取、加载状态和错误处理
 */

import { useState, useCallback } from 'react';
import { message } from 'antd';

interface UseApiOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
  errorMessage?: string;
}

interface UseApiReturn<T, P extends any[]> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: (...args: P) => Promise<T | null>;
  reset: () => void;
}

export function useApi<T = any, P extends any[] = []>(
  apiFn: (...args: P) => Promise<T>,
  options: UseApiOptions<T> = {}
): UseApiReturn<T, P> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (...args: P): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiFn(...args);
        setData(result);

        if (options.onSuccess) {
          options.onSuccess(result);
        }

        if (options.successMessage) {
          message.success(options.successMessage);
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);

        if (options.onError) {
          options.onError(error);
        }

        if (options.errorMessage) {
          message.error(options.errorMessage);
        } else {
          message.error(error.message || '请求失败');
        }

        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiFn, options]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, execute, reset };
}

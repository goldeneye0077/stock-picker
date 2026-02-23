/**
 * 超强主力月度统计数据 Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

export interface SuperMainForceMedal {
  code: string;
  name: string;
  industry: string;
  heatScore: number;
  auctionChange?: number | null;
  profit?: number | null;
}

export interface SuperMainForceMonthlyStats {
  tradeDate: string | null;
  period: {
    start: string | null;
    end: string | null;
    days: number | null;
  };
  statistics: {
    selectedCount: number | null;
    limitUpCount: number | null;
    limitUpRate: number | null;
    marketLimitUpRate: number | null;
    comparison: {
      superMainForce: number | null;
      market: number | null;
      difference: number | null;
    };
  };
  medals: {
    gold: SuperMainForceMedal | null;
    silver: SuperMainForceMedal | null;
    bronze: SuperMainForceMedal | null;
  };
  weeklyComparison: Array<{
    date: string;
    selectedCount: number | null;
    limitUpCount: number | null;
    hitRate: number | null;
  }>;
}

interface UseSuperMainForceMonthlyStatsReturn {
  data: SuperMainForceMonthlyStats | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useSuperMainForceMonthlyStats(): UseSuperMainForceMonthlyStatsReturn {
  const [data, setData] = useState<SuperMainForceMonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/super-main-force/monthly`
      );

      if (!response.ok) {
        throw new Error('获取超强主力月度统计数据失败');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || '获取超强主力月度统计数据失败');
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData
  };
}

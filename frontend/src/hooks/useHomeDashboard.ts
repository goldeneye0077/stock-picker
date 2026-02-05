import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

// Types for dashboard data
export interface PlatformMetrics {
  totalStocks: number;
  dataAccuracy: number;
  responseTime: string;
}

export interface MarketData {
  totalStocks: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  sentiment: string;
  sentimentScore: number;
  totalTurnover: number;
  turnoverChange: number;
}

export interface TodayMetrics {
  selectedStocks: number;
  selectedChange: number;
  selectedChangePercent: number;
  winRate: number;
  volumeSurges: number;
}

export interface HotSector {
  sector: string;
  isHot?: boolean;
  changePct: string;
  netInflow: string;
  leaderName: string;
  leaderCode: string;
}

export interface StrategyPerformance {
  totalReturn: number;
  todayReturn: number;
  annualReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
}

export interface DashboardData {
  platform: PlatformMetrics;
  market: MarketData;
  today: TodayMetrics;
  hotSectors: HotSector[];
  strategy: StrategyPerformance;
  meta: {
    timestamp: string;
    dataSource: string;
  };
}

interface UseHomeDashboardReturn {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch home dashboard data
 * Auto-refreshes every 30 seconds
 */
export function useHomeDashboard(): UseHomeDashboardReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.DASHBOARD}/dashboard`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch dashboard data');
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchDashboardData();
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [fetchDashboardData]);

  return {
    data,
    loading,
    error,
    refetch: fetchDashboardData,
  };
}

export default useHomeDashboard;

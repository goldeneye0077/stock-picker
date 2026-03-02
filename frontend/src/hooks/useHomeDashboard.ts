import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

export interface PlatformMetrics {
  totalStocks: number;
  dataAccuracy: number | null;
  responseTime: string | null;
}

export interface MarketData {
  totalStocks: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  sentiment: string | null;
  sentimentScore: number | null;
  totalTurnover: number | null;
  turnoverChange: number | null;
}

export interface TodayMetrics {
  selectedStocks: number;
  selectedChange: number;
  selectedChangePercent: number | null;
  winRate: number | null;
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
  totalReturn: number | null;
  todayReturn: number | null;
  annualReturn: number | null;
  maxDrawdown: number | null;
  sharpeRatio: number | null;
  winRate: number | null;
}

export interface YieldCurve {
  dates: string[];
  values: number[];
  benchmarkValues?: number[];
  benchmarkLabel?: string;
}

export interface MarketInsightCard {
  key: string;
  category: string;
  title: string;
  desc: string;
  time: string;
}

export interface MarketInsightsPayload {
  tradeDate: string | null;
  generatedAt: string | null;
  source: string | null;
  featured: MarketInsightCard | null;
  cards: MarketInsightCard[];
}

export interface DashboardData {
  platform: PlatformMetrics;
  market: MarketData;
  today: TodayMetrics;
  hotSectors: HotSector[];
  strategy: StrategyPerformance;
  yieldCurve: YieldCurve;
  insights?: MarketInsightsPayload;
  meta: {
    timestamp: string;
    dataSource: string;
  };
}

interface UseHomeDashboardReturn {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  realtimeConnected: boolean;
  refetch: () => void;
}

const WS_RECONNECT_DELAY_MS = 3000;
const WS_EVENT_REFRESH_DEBOUNCE_MS = 1200;
const WS_REFRESH_EVENT_TYPES = new Set([
  'market_insight_updated',
  'quotes_updated',
  'turnover_update',
  'market_snapshot',
  'market_event',
]);

function toWebSocketUrl(): string | null {
  const explicitWsUrl = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (explicitWsUrl) {
    return explicitWsUrl;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  const trimmedApiBase = API_BASE_URL.trim();
  if (trimmedApiBase.startsWith('http://') || trimmedApiBase.startsWith('https://')) {
    const protocol = trimmedApiBase.startsWith('https://') ? 'wss://' : 'ws://';
    const host = trimmedApiBase.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `${protocol}${host}`;
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${wsProtocol}://${window.location.host}`;
}

function toEventType(raw: unknown): string {
  if (!raw || typeof raw !== 'object') {
    return '';
  }
  const event = raw as { type?: unknown };
  return typeof event.type === 'string' ? event.type : '';
}

/**
 * Hook to fetch home dashboard data.
 * Uses websocket event refresh when available and polling as fallback.
 */
export function useHomeDashboard(): UseHomeDashboardReturn {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

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

  const scheduleRefresh = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = window.setTimeout(() => {
      fetchDashboardData();
      refreshTimerRef.current = null;
    }, WS_EVENT_REFRESH_DEBOUNCE_MS);
  }, [fetchDashboardData]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const wsUrl = toWebSocketUrl();
    if (!wsUrl || typeof window === 'undefined') {
      return undefined;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) {
        return;
      }

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setRealtimeConnected(true);
        socket?.send(JSON.stringify({ type: 'subscribe', channels: ['market:events'] }));
      };

      socket.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch (_error) {
          payload = null;
        }
        const type = toEventType(payload);
        if (WS_REFRESH_EVENT_TYPES.has(type)) {
          scheduleRefresh();
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        setRealtimeConnected(false);
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, WS_RECONNECT_DELAY_MS);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      setRealtimeConnected(false);
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      socket?.close();
    };
  }, [scheduleRefresh]);

  // Poll only as fallback when websocket is disconnected.
  useEffect(() => {
    if (realtimeConnected) {
      return undefined;
    }
    const intervalId = setInterval(() => {
      fetchDashboardData();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [fetchDashboardData, realtimeConnected]);

  return {
    data,
    loading,
    error,
    realtimeConnected,
    refetch: fetchDashboardData,
  };
}

export default useHomeDashboard;

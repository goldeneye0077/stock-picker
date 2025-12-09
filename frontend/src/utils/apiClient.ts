/**
 * 基于 OpenAPI 规范生成的 API 客户端工具
 * 提供类型安全的 API 调用
 */

import type { paths, components } from '../types/api.generated';

type ApiResponse<T> = {
  success: boolean;
  message: string;
  data?: T;
  timestamp?: string;
};

type ApiError = {
  code: string;
  details?: Record<string, unknown>;
};

class ApiClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl: string = 'http://localhost:3000', apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 合并传入的 headers
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, options.headers);
      }
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          success: false,
          message: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw error;
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // 健康检查
  async getHealth(): Promise<components['schemas']['HealthResponse']> {
    return this.request<components['schemas']['HealthResponse']>('/health');
  }

  // 股票相关
  async getStocks(params?: {
    limit?: number;
    offset?: number;
  }): Promise<components['schemas']['StockListResponse']> {
    const query = new URLSearchParams();
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.offset) query.append('offset', params.offset.toString());

    const endpoint = `/api/stocks${query.toString() ? `?${query}` : ''}`;
    return this.request<components['schemas']['StockListResponse']>(endpoint);
  }

  async getStockDetail(code: string): Promise<components['schemas']['StockDetailResponse']> {
    return this.request<components['schemas']['StockDetailResponse']>(
      `/api/stocks/${code}`
    );
  }

  // 分析相关
  async getMarketOverview(): Promise<components['schemas']['MarketOverviewResponse']> {
    return this.request<components['schemas']['MarketOverviewResponse']>(
      '/api/analysis/market-overview'
    );
  }

  async getSignals(params?: {
    days?: number;
    signal_type?: 'strong_buy' | 'buy' | 'watch' | 'observe';
    stock_code?: string;
  }): Promise<components['schemas']['SignalsResponse']> {
    const query = new URLSearchParams();
    if (params?.days) query.append('days', params.days.toString());
    if (params?.signal_type) query.append('signal_type', params.signal_type);
    if (params?.stock_code) query.append('stock_code', params.stock_code);

    const endpoint = `/api/analysis/signals${query.toString() ? `?${query}` : ''}`;
    return this.request<components['schemas']['SignalsResponse']>(endpoint);
  }

  async getVolumeAnalysis(params?: {
    days?: number;
    stock_code?: string;
    board?: 'main' | 'gem' | 'star' | 'bse';
  }): Promise<components['schemas']['VolumeAnalysisResponse']> {
    const query = new URLSearchParams();
    if (params?.days) query.append('days', params.days.toString());
    if (params?.stock_code) query.append('stock_code', params.stock_code);
    if (params?.board) query.append('board', params.board);

    const endpoint = `/api/analysis/volume${query.toString() ? `?${query}` : ''}`;
    return this.request<components['schemas']['VolumeAnalysisResponse']>(endpoint);
  }

  // 资金流向相关
  async getFundFlow(params?: {
    stock_code?: string;
    days?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<components['schemas']['BaseResponse']> {
    const query = new URLSearchParams();
    if (params?.stock_code) query.append('stock_code', params.stock_code);
    if (params?.days) query.append('days', params.days.toString());
    if (params?.date_from) query.append('date_from', params.date_from);
    if (params?.date_to) query.append('date_to', params.date_to);

    const endpoint = `/api/analysis/fund-flow${query.toString() ? `?${query}` : ''}`;
    return this.request<components['schemas']['BaseResponse']>(endpoint);
  }

  async getMarketMoneyflow(params?: {
    days?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<ApiResponse<{
    marketFlow: unknown[];
    summary: {
      totalNetAmount: number;
      totalElgAmount: number;
      totalLgAmount: number;
      totalMdAmount: number;
      totalSmAmount: number;
      avgNetAmountRate: number;
      latestSHIndex: number;
      latestSZIndex: number;
      latestSHChange: number;
      latestSZChange: number;
    };
  }>> {
    const query = new URLSearchParams();
    if (params?.days) query.append('days', params.days.toString());
    if (params?.date_from) query.append('date_from', params.date_from);
    if (params?.date_to) query.append('date_to', params.date_to);

    const endpoint = `/api/analysis/market-moneyflow${query.toString() ? `?${query}` : ''}`;
    return this.request(endpoint);
  }

  // 主力行为分析
  async getMainForce(params?: {
    days?: number;
    limit?: number;
  }): Promise<ApiResponse<{
    mainForce: Array<{
      stock: string;
      name: string;
      behavior: string;
      strength: number;
      trend: string;
      date: string;
      latestPrice: number;
      latestChangePercent: number;
    }>;
    summary: {
      strongCount: number;
      moderateCount: number;
      weakCount: number;
      avgStrength: number;
      totalVolume: number;
    };
  }>> {
    const query = new URLSearchParams();
    if (params?.days) query.append('days', params.days.toString());
    if (params?.limit) query.append('limit', params.limit.toString());

    const endpoint = `/api/analysis/main-force${query.toString() ? `?${query}` : ''}`;
    return this.request(endpoint);
  }

  // 板块分析
  async getSectorMoneyflow(params?: {
    days?: number;
    date_from?: string;
    date_to?: string;
  }): Promise<ApiResponse<{
    sectorFlow: unknown[];
    summary: {
      totalNetAmount: number;
      totalElgAmount: number;
      totalLgAmount: number;
      totalMdAmount: number;
      totalSmAmount: number;
      avgNetAmountRate: number;
      inflowSectors: number;
      outflowSectors: number;
    };
  }>> {
    const query = new URLSearchParams();
    if (params?.days) query.append('days', params.days.toString());
    if (params?.date_from) query.append('date_from', params.date_from);
    if (params?.date_to) query.append('date_to', params.date_to);

    const endpoint = `/api/analysis/sector-moneyflow${query.toString() ? `?${query}` : ''}`;
    return this.request(endpoint);
  }

  async getSectorVolume(params?: {
    days?: number;
  }): Promise<ApiResponse<{
    sectors: unknown[];
    summary: {
      totalVolume: number;
      avgVolumeChange: number;
      activeSectors: number;
      weakSectors: number;
    };
  }>> {
    const query = new URLSearchParams();
    if (params?.days) query.append('days', params.days.toString());

    const endpoint = `/api/analysis/sector-volume${query.toString() ? `?${query}` : ''}`;
    return this.request(endpoint);
  }

  async getHotSectorStocks(params?: {
    days?: number;
    limit?: number;
  }): Promise<ApiResponse<{
    sectors: unknown[];
    summary: {
      totalSectors: number;
      totalStocks: number;
      avgSectorMoneyFlow: number;
    };
  }>> {
    const query = new URLSearchParams();
    if (params?.days) query.append('days', params.days.toString());
    if (params?.limit) query.append('limit', params.limit.toString());

    const endpoint = `/api/analysis/hot-sector-stocks${query.toString() ? `?${query}` : ''}`;
    return this.request(endpoint);
  }
}

// 创建默认实例
const apiClient = new ApiClient(
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
  import.meta.env.VITE_API_KEY
);

export { ApiClient, apiClient };
export type { ApiResponse, ApiError };
/**
 * 股票数据服务
 * 封装所有股票相关的API调用
 */

import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

export interface StockListParams {
  date?: string;
  search?: string;
  codes?: string[];
}

export interface StockItem {
  key: string;
  code: string;
  name: string;
  preClose: number;
  open: number;
  high: number;
  low: number;
  price: number;
  change: string;
  changeAmount: number;
  volume: string;
  amount: string;
  quoteTime: string;
  status: string;
  signal: string;
}

export interface StockAnalysisParams {
  date?: string;
}

/**
 * 获取股票列表
 */
export async function fetchStockList(params: StockListParams = {}) {
  if (Array.isArray(params.codes) && params.codes.length === 0) {
    return [];
  }

  const baseUrl = params.date
    ? `${API_BASE_URL}${API_ENDPOINTS.STOCKS}/history/date/${params.date}`
    : `${API_BASE_URL}${API_ENDPOINTS.STOCKS}`;

  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.codes) {
    for (const c of params.codes) {
      if (c) searchParams.append('codes', c);
    }
  }

  const qs = searchParams.toString();
  const url = qs ? `${baseUrl}?${qs}` : baseUrl;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('获取股票列表失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取股票列表失败');
  }

  // 格式化数据
  const formattedData: StockItem[] = result.data.map((stock: any, index: number) => ({
    key: index.toString(),
    code: stock.code,
    name: stock.name,
    preClose: stock.pre_close || 0,
    open: stock.open || 0,
    high: stock.high || 0,
    low: stock.low || 0,
    price: stock.current_price || 0,
    change: stock.change_percent
      ? `${stock.change_percent > 0 ? '+' : ''}${stock.change_percent.toFixed(2)}%`
      : '0.00%',
    changeAmount: stock.change_amount || 0,
    volume: stock.volume ? `${(stock.volume / 100000000).toFixed(2)}亿` : '0亿',
    amount: stock.amount ? `${(stock.amount / 100000000).toFixed(2)}亿` : '0亿',
    quoteTime: stock.quote_time || stock.quote_date,
    status: stock.is_volume_surge ? '成交量异动' : (stock.latest_signal || '观察'),
    signal: stock.latest_signal || '持有'
  }));

  return formattedData;
}

/**
 * 获取股票详情
 */
export async function fetchStockDetail(stockCode: string) {
  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.STOCKS}/${stockCode}`);

  if (!response.ok) {
    throw new Error('获取股票详情失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取K线数据失败');
  }

  return result.data;
}

/**
 * 获取股票历史数据（K线数据）
 */
export async function fetchStockHistory(stockCode: string, params: {
  startDate?: string;
  endDate?: string;
  period?: string;
} = {}) {
  const searchParams = new URLSearchParams();
  if (params.startDate) searchParams.append('start_date', params.startDate);
  if (params.endDate) searchParams.append('end_date', params.endDate);
  if (params.period) searchParams.append('period', params.period);

  const url = `${API_BASE_URL}${API_ENDPOINTS.STOCKS}/${stockCode}/history?${searchParams}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('获取K线数据失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取K线数据失败');
  }

  return result.data;
}

export async function fetchStockAnalysis(stockCode: string, params: StockAnalysisParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.date) {
    searchParams.append('date', params.date);
  }

  const query = searchParams.toString();
  const url = query
    ? `${API_BASE_URL}${API_ENDPOINTS.STOCKS}/${stockCode}/analysis?${query}`
    : `${API_BASE_URL}${API_ENDPOINTS.STOCKS}/${stockCode}/analysis`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('获取技术分析失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取K线数据失败');
  }

  return result.data;
}

/**
 * 搜索股票
 */
export async function searchStocks(query: string) {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const response = await fetch(
    `${API_BASE_URL}${API_ENDPOINTS.STOCKS}/search/${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error('搜索失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '搜索失败');
  }

  return result.data || [];
}

/**
 * 获取实时行情数据
 */
export async function fetchRealtimeQuote(stockCode: string) {
  const response = await fetch(
    `${API_BASE_URL}${API_ENDPOINTS.QUOTES}/realtime?ts_code=${encodeURIComponent(stockCode)}`
  );

  if (!response.ok) {
    throw new Error('获取实时行情失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取K线数据失败');
  }

  return result.data;
}

export async function fetchRealtimeQuotesBatch(
  tsCodes: string[],
  params: { maxAgeSeconds?: number; force?: boolean } = {}
) {
  const searchParams = new URLSearchParams();
  for (const c of tsCodes) {
    if (c) searchParams.append('ts_codes', c);
  }
  if (typeof params.maxAgeSeconds === 'number') {
    searchParams.set('max_age_seconds', String(params.maxAgeSeconds));
  }
  if (params.force !== undefined) {
    searchParams.set('force', params.force ? 'true' : 'false');
  }

  const response = await fetch(
    `${API_BASE_URL}${API_ENDPOINTS.QUOTES}/realtime-batch?${searchParams.toString()}`
  );

  if (!response.ok) {
    throw new Error('获取实时行情失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取实时行情失败');
  }

  return result.data;
}

/**
 * 获取股票历史K线数据（1年）
 */
export async function fetchStockHistoryForRealtime(stockCode: string) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const formatYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const startDateStr = formatYmd(startDate);
  const endDateStr = formatYmd(endDate);

  const url = `${API_BASE_URL}${API_ENDPOINTS.STOCKS}/${stockCode}/history?start_date=${startDateStr}&end_date=${endDateStr}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('获取K线数据失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取K线数据失败');
  }

  return result.data;

}

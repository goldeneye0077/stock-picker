/**
 * 股票数据服务
 * 封装所有股票相关的API调用
 */

import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

export interface StockListParams {
  date?: string;
  search?: string;
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

/**
 * 获取股票列表
 */
export async function fetchStockList(params: StockListParams = {}) {
  const url = params.date
    ? `${API_BASE_URL}${API_ENDPOINTS.STOCKS}/history/date/${params.date}`
    : `${API_BASE_URL}${API_ENDPOINTS.STOCKS}`;

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
    throw new Error(result.message || '获取股票详情失败');
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

/**
 * 获取股票技术分析
 */
export async function fetchStockAnalysis(stockCode: string) {
  const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.STOCKS}/${stockCode}/analysis`);

  if (!response.ok) {
    throw new Error('获取技术分析失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取技术分析失败');
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
    `${API_BASE_URL}${API_ENDPOINTS.STOCKS}/search?q=${encodeURIComponent(query)}`
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

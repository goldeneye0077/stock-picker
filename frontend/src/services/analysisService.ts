/**
 * 分析数据服务
 * 封装所有分析相关的API调用
 */

import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

export interface FundFlowParams {
  days?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface VolumeAnalysisParams {
  days?: number;
  board?: string;
  exchange?: string;
  stockSearch?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface MainForceParams {
  days?: number;
  limit?: number;
}

/**
 * 获取资金流向数据
 */
export async function fetchFundFlowData(params: FundFlowParams = {}) {
  const searchParams = new URLSearchParams({
    days: String(params.days || 30)
  });

  if (params.dateFrom) searchParams.append('date_from', params.dateFrom);
  if (params.dateTo) searchParams.append('date_to', params.dateTo);

  const response = await fetch(
    `${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/fund-flow?${searchParams}`
  );

  if (!response.ok) {
    throw new Error('获取资金流向数据失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取资金流向数据失败');
  }

  return result.data;
}

/**
 * 获取成交量分析数据
 */
export async function fetchVolumeAnalysisData(params: VolumeAnalysisParams = {}) {
  const searchParams = new URLSearchParams({
    days: String(params.days || 10)
  });

  if (params.board) searchParams.append('board', params.board);
  if (params.exchange) searchParams.append('exchange', params.exchange);
  if (params.stockSearch) searchParams.append('stock_search', params.stockSearch);
  if (params.dateFrom) searchParams.append('date_from', params.dateFrom);
  if (params.dateTo) searchParams.append('date_to', params.dateTo);

  const response = await fetch(
    `${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/volume?${searchParams}`
  );

  if (!response.ok) {
    throw new Error('获取成交量分析数据失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取成交量分析数据失败');
  }

  return result.data;
}

/**
 * 获取主力行为分析数据
 */
export async function fetchMainForceData(params: MainForceParams = {}) {
  const searchParams = new URLSearchParams({
    days: String(params.days || 7),
    limit: String(params.limit || 20)
  });

  const response = await fetch(
    `${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/main-force?${searchParams}`
  );

  if (!response.ok) {
    throw new Error('获取主力行为分析数据失败');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.message || '获取主力行为分析数据失败');
  }

  return result.data;
}

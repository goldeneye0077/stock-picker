/**
 * 高级智能选股服务
 * 基于多因子动量模型的高级选股算法
 * 参考幻方量化等优秀量化算法设计
 */

import { DATA_SERVICE_URL } from '../config/api';
import axios from 'axios';

// 创建axios实例
const apiClient = axios.create({
  baseURL: DATA_SERVICE_URL,
  timeout: 30000, // 30秒超时
});

// 高级选股策略接口
export interface AdvancedSelectionStrategy {
  id: number;
  strategy_name: string;
  description: string;
  min_score: number;
  require_uptrend: boolean;
  require_hot_sector: boolean;
  max_results: number;
  is_active: boolean;
}

// 高级选股结果接口
export interface AdvancedSelectionResult {
  stock_code: string;
  stock_name: string;
  industry: string;
  composite_score: number;
  technical_score: number;
  momentum_score: number;
  trend_quality_score: number;
  sector_score: number;
  fundamental_score: number;
  current_price: number;
  price_change_20d: number;
  volume_ratio: number;
  rsi: number;
  macd_signal: number;
  trend_slope: number;
  trend_r2: number;
  sharpe_ratio: number;
  volatility?: number;
  max_drawdown: number;
  sector_heat: number;
  roe: number;
  pe_ttm: number;
  revenue_growth: number;
  analysis_date: string;
  selection_reason: string;
  buy_point?: number;
  sell_point?: number;
  risk_level?: string;
  target_price?: number;
  stop_loss_price?: number;
  holding_period?: string;
  is_price_breakout?: number;
  is_volume_breakout?: number;
}

// 高级选股参数接口
export interface AdvancedSelectionParams {
  min_score?: number;
  max_results?: number;
  require_uptrend?: boolean;
  require_hot_sector?: boolean;
}

// 高级选股响应接口
export interface AdvancedSelectionResponse {
  parameters: {
    min_score: number;
    max_results: number;
    require_uptrend: boolean;
    require_hot_sector: boolean;
  };
  count: number;
  results: AdvancedSelectionResult[];
  timestamp: string;
  run_id?: string;
}

// 策略响应接口
export interface StrategyResponse {
  count: number;
  strategies: AdvancedSelectionStrategy[];
  timestamp: string;
}

export interface AdvancedSelectionHistoryItem {
  run_id: string;
  strategy_id: number | null;
  strategy_name: string | null;
  stock_code: string;
  stock_name: string;
  composite_score: number;
  selection_date: string;
  risk_advice: string | null;
  selection_reason: string;
  created_at: string;
}

// 算法对比接口
export interface AlgorithmComparison {
  old_algorithm: {
    name: string;
    weights: string;
    description: string;
  };
  new_algorithm: {
    name: string;
    weights: string;
    description: string;
  };
  improvements: string[];
  advanced_results_count: number;
  advanced_results_sample: AdvancedSelectionResult[];
  timestamp: string;
}

// 统计信息接口
export interface AdvancedStatistics {
  total_strategies: number;
  active_strategies: number;
  strategy_statistics: Array<{
    strategy_id: number;
    strategy_name: string;
    sample_count: number;
    avg_composite_score: number;
    avg_momentum_score: number;
    avg_sector_score: number;
  }>;
  algorithm_description: string;
  reference_algorithms: string[];
  key_features: string[];
  timestamp: string;
}

/**
 * 获取高级选股策略列表
 */
export async function fetchAdvancedSelectionStrategies(): Promise<StrategyResponse> {
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/advanced-selection/advanced/strategies`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('获取高级选股策略列表失败:', error);
    throw error;
  }
}

/**
 * 运行高级智能选股
 */
export async function runAdvancedSelection(
  params: AdvancedSelectionParams = {}
): Promise<AdvancedSelectionResponse> {
  try {
    const defaultParams: AdvancedSelectionParams = {
      min_score: 60,
      max_results: 20,
      require_uptrend: true,
      require_hot_sector: true,
      ...params
    };

    const queryParams = new URLSearchParams();
    if (defaultParams.min_score !== undefined) queryParams.append('min_score', defaultParams.min_score.toString());
    if (defaultParams.max_results !== undefined) queryParams.append('max_results', defaultParams.max_results.toString());
    if (defaultParams.require_uptrend !== undefined) queryParams.append('require_uptrend', defaultParams.require_uptrend.toString());
    if (defaultParams.require_hot_sector !== undefined) queryParams.append('require_hot_sector', defaultParams.require_hot_sector.toString());

    const url = `${DATA_SERVICE_URL}/api/advanced-selection/advanced/run${queryParams.toString() ? `?${queryParams}` : ''}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('运行高级选股失败:', error);
    throw error;
  }
}

/**
 * 按策略ID运行高级选股
 */
export async function runStrategyById(strategyId: number): Promise<AdvancedSelectionResponse> {
  try {
    const response = await apiClient.post(`/api/advanced-selection/advanced/run-strategy/${strategyId}`);
    return response.data;
  } catch (error) {
    console.error(`按策略ID运行高级选股失败 (ID: ${strategyId}):`, error);
    throw error;
  }
}

/**
 * 分析单只股票
 */
export async function analyzeSingleStock(stockCode: string): Promise<{ stock_code: string; analysis: AdvancedSelectionResult; timestamp: string }> {
  try {
    const response = await apiClient.get(`/api/advanced-selection/advanced/analyze/${stockCode}`);
    return response.data;
  } catch (error) {
    console.error(`分析单只股票失败 (${stockCode}):`, error);
    throw error;
  }
}

/**
 * 对比新旧算法效果
 */
export async function compareAlgorithms(
  minScore: number = 60,
  maxResults: number = 10
): Promise<AlgorithmComparison> {
  try {
    const response = await apiClient.get('/api/advanced-selection/advanced/compare-algorithms', {
      params: { min_score: minScore, max_results: maxResults }
    });
    return response.data;
  } catch (error) {
    console.error('对比算法失败:', error);
    throw error;
  }
}

/**
 * 获取高级选股统计信息
 */
export async function getAdvancedStatistics(): Promise<AdvancedStatistics> {
  try {
    const response = await apiClient.get('/api/advanced-selection/advanced/statistics');
    return response.data;
  } catch (error) {
    console.error('获取高级选股统计信息失败:', error);
    throw error;
  }
}

export async function getAdvancedSelectionHistory(
  options: {
    limit?: number;
    days?: number;
    strategyId?: number;
    startDate?: string;
    endDate?: string;
  } = {}
): Promise<{ count: number; results: AdvancedSelectionHistoryItem[]; timestamp: string }> {
  try {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.append('limit', String(options.limit));
    if (options.days !== undefined) params.append('days', String(options.days));
    if (options.strategyId !== undefined) params.append('strategy_id', String(options.strategyId));
    if (options.startDate) params.append('start_date', options.startDate);
    if (options.endDate) params.append('end_date', options.endDate);

    const query = params.toString();
    const response = await apiClient.get(`/api/advanced-selection/advanced/history${query ? `?${query}` : ''}`);
    return response.data;
  } catch (error) {
    console.error('获取高级选股历史记录失败:', error);
    throw error;
  }
}

export async function deleteAdvancedSelectionHistoryItem(payload: {
  run_id: string;
  stock_code: string;
  selection_date: string;
}): Promise<{ deleted: number }> {
  try {
    const params = new URLSearchParams({
      run_id: payload.run_id,
      stock_code: payload.stock_code,
      selection_date: payload.selection_date,
    });

    const response = await apiClient.delete(
      `/api/advanced-selection/advanced/history/item?${params.toString()}`
    );
    return response.data;
  } catch (error) {
    console.error('删除单条高级选股历史记录失败:', error);
    throw error;
  }
}

export async function deleteAdvancedSelectionHistoryBatch(
  items: { run_id: string; stock_code: string; selection_date: string }[]
): Promise<{ requested: number; deleted: number }> {
  try {
    const response = await apiClient.delete(
      '/api/advanced-selection/advanced/history/batch',
      {
        data: items,
      }
    );
    return response.data;
  } catch (error) {
    console.error('批量删除高级选股历史记录失败:', error);
    throw error;
  }
}

/**
 * 获取算法描述
 */
export function getAlgorithmDescription(): string {
  return '多因子动量模型（动量35%、趋势质量25%、板块热度20%、基本面20%）';
}

/**
 * 获取参考算法列表
 */
export function getReferenceAlgorithms(): string[] {
  return ['幻方量化', '九坤投资', '明汯投资'];
}

/**
 * 获取关键特性
 */
export function getKeyFeatures(): string[] {
  return [
    '20+技术因子计算',
    '动量与趋势质量分析',
    '板块热度与轮动识别',
    '风险控制与回撤管理',
    '机器学习算法参考'
  ];
}

/**
 * 格式化选股结果用于显示
 */
export function formatSelectionResult(result: AdvancedSelectionResult) {
  return {
    ...result,
    price_change_20d_formatted: `${result.price_change_20d.toFixed(1)}%`,
    sector_heat_formatted: `${result.sector_heat.toFixed(0)}分`,
    roe_formatted: `${result.roe.toFixed(1)}%`,
    pe_ttm_formatted: result.pe_ttm > 0 ? result.pe_ttm.toFixed(1) : 'N/A',
    trend_slope_formatted: result.trend_slope.toFixed(3),
    trend_r2_formatted: result.trend_r2.toFixed(3),
    macd_signal_formatted: result.macd_signal.toFixed(3)
  };
}

/**
 * 获取风险等级
 */
export function getRiskLevel(score: number): string {
  if (score >= 80) return '低';
  if (score >= 60) return '中';
  return '高';
}

/**
 * 获取持有期建议
 */
export function getHoldingPeriod(momentumScore: number, trendQualityScore: number): string {
  if (momentumScore > trendQualityScore + 20) return '短线';
  if (trendQualityScore > momentumScore + 20) return '长线';
  return '中线';
}

/**
 * 计算目标价位
 */
export function calculateTargetPrice(currentPrice: number, compositeScore: number): number {
  let targetRatio = 0;
  if (compositeScore >= 90) targetRatio = 0.25;
  else if (compositeScore >= 80) targetRatio = 0.15;
  else if (compositeScore >= 70) targetRatio = 0.10;
  else if (compositeScore >= 60) targetRatio = 0.05;

  return currentPrice * (1 + targetRatio);
}

/**
 * 计算止损价位
 */
export function calculateStopLossPrice(currentPrice: number, riskLevel: string): number {
  let stopLossRatio = 0.10; // 默认10%
  if (riskLevel === '低') stopLossRatio = 0.08;
  else if (riskLevel === '中') stopLossRatio = 0.12;
  else if (riskLevel === '高') stopLossRatio = 0.15;

  return currentPrice * (1 - stopLossRatio);
}

/**
 * 智能选股服务
 * 提供智能选股相关的API调用
 */

import { DATA_SERVICE_URL } from '../config/api';

export interface SmartSelectionResult {
  id: number;
  stock_code: string;
  stock_name: string;
  overall_score: number;
  technical_score: number;
  fundamental_score: number;
  capital_score: number;
  market_score: number;
  selection_reason: string;
  risk_level: '低' | '中' | '高';
  target_price: number;
  stop_loss_price: number;
  holding_period: '短线' | '中线' | '长线';
  selection_date: string;
}

export interface SelectionStrategy {
  id: number;
  strategy_name: string;
  description: string;
  technical_weight: number;
  fundamental_weight: number;
  capital_weight: number;
  market_weight: number;
  is_active: boolean;
}

export interface StrategyConfig {
  weights: {
    technical: number;
    fundamental: number;
    capital: number;
    market: number;
  };
  min_score: number;
  max_results: number;
}

export interface BacktestResult {
  strategy_config: StrategyConfig;
  start_date: string;
  end_date: string;
  total_return: number;
  annual_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  win_rate: number;
  total_trades: number;
  profit_trades: number;
  loss_trades: number;
  average_profit: number;
  average_loss: number;
  profit_factor: number;
  backtest_completed: boolean;
  message: string;
  timestamp: string;
}

export interface SelectionStatistics {
  total_selections: number;
  average_score: number;
  high_score_count: number;
  medium_score_count: number;
  low_score_count: number;
  low_risk_count: number;
  medium_risk_count: number;
  high_risk_count: number;
  short_term_count: number;
  medium_term_count: number;
  long_term_count: number;
  most_selected_industry: string;
  best_performing_strategy: string;
  timestamp: string;
}

/**
 * 获取选股策略列表
 */
export const fetchSelectionStrategies = async (): Promise<{
  count: number;
  strategies: SelectionStrategy[];
  timestamp: string;
}> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/smart-selection/strategies`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取选股策略列表失败:', error);
    throw error;
  }
};

/**
 * 运行智能选股
 */
export const runSmartSelection = async (
  strategyConfig: StrategyConfig
): Promise<{
  strategy_config: StrategyConfig;
  count: number;
  results: SmartSelectionResult[];
  timestamp: string;
}> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/smart-selection/run`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(strategyConfig),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('运行智能选股失败:', error);
    throw error;
  }
};

/**
 * 获取选股结果
 */
export const fetchSelectionResults = async (
  limit: number = 20,
  minScore: number = 70
): Promise<{
  limit: number;
  min_score: number;
  count: number;
  results: SmartSelectionResult[];
  timestamp: string;
}> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/smart-selection/results?limit=${limit}&min_score=${minScore}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取选股结果失败:', error);
    throw error;
  }
};

/**
 * 运行策略回测
 */
export const runBacktest = async (
  strategyConfig: StrategyConfig,
  startDate: string,
  endDate: string
): Promise<BacktestResult> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/smart-selection/backtest?start_date=${startDate}&end_date=${endDate}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(strategyConfig),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('运行策略回测失败:', error);
    throw error;
  }
};

/**
 * 获取选股统计信息
 */
export const fetchSelectionStatistics = async (): Promise<SelectionStatistics> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/smart-selection/statistics`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取选股统计信息失败:', error);
    throw error;
  }
};

/**
 * 健康检查
 */
export const checkSmartSelectionHealth = async (): Promise<{
  status: string;
  service: string;
  timestamp: string;
}> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/smart-selection/health`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('智能选股健康检查失败:', error);
    throw error;
  }
};
/**
 * 智能选股服务
 * 提供智能选股相关的API调用
 */

import { DATA_SERVICE_URL } from '../config/api';

const toFetchError = (error: unknown) => {
  if (error instanceof Error) {
    if (error.name === 'TypeError' && /failed to fetch/i.test(error.message)) {
      return new Error(`无法连接数据服务 (${DATA_SERVICE_URL})，请确认 data-service 已启动且端口配置正确`);
    }
    return error;
  }
  return new Error(String(error));
};

const normalizeAdvancedCompositeScores = (results: SmartSelectionResult[] | undefined) => {
  if (!results || results.length === 0) {
    return results;
  }

  const rawScores = results
    .map((item) => {
      const raw = typeof item.composite_score === 'number' ? item.composite_score : item.overall_score;
      return Number.isFinite(raw) ? raw : 0;
    })
    .filter((value) => value > 0);

  if (rawScores.length === 0) {
    return results;
  }

  const maxScore = Math.max(...rawScores);
  if (maxScore <= 0 || maxScore >= 99) {
    return results;
  }

  return results.map((item) => {
    const raw = typeof item.composite_score === 'number' ? item.composite_score : item.overall_score;
    const safeRaw = Number.isFinite(raw) ? raw : 0;
    const scaled = Math.max(0, Math.min(100, (safeRaw / maxScore) * 100));
    const normalized = Number(scaled.toFixed(1));

    return {
      ...item,
      composite_score: normalized,
    };
  });
};

export interface SmartSelectionResult {
  id: number;
  stock_code: string;
  stock_name: string;
  industry?: string;
  overall_score: number;
  composite_score?: number; // 高级算法使用的字段名
  technical_score: number;
  fundamental_score: number;
  capital_score: number;
  market_score: number;
  sector_score?: number; // 高级算法：板块热度评分
  momentum_score?: number; // 高级算法：动量评分
  trend_quality_score?: number; // 高级算法：趋势质量评分
  selection_reason: string;
  risk_level: '低' | '中' | '高';
  target_price: number;
  stop_loss_price: number;
  holding_period: '短线' | '中线' | '长线';
  selection_date: string;
  current_price?: number; // 当前价格
  valuation_score?: number;
  quality_score?: number;
  growth_score?: number;
  volume_score?: number;
  sentiment_score?: number;
  risk_score?: number;
  price_change_20d?: number;
  volume_ratio?: number;
  rsi?: number;
  macd_signal?: number;
  trend_slope?: number;
  trend_r2?: number;
  sharpe_ratio?: number;
  volatility?: number;
  max_drawdown?: number;
  sector_heat?: number;
  roe?: number;
  pe_ttm?: number;
  revenue_growth?: number;
  analysis_date?: string;
  buy_point?: number;
  sell_point?: number;
  is_price_breakout?: number;
  is_volume_breakout?: number;
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
  original_id?: number;
  algorithm_type?: 'basic' | 'advanced'; // 算法类型：基础算法或高级算法
  min_score?: number; // 高级策略：最低评分要求
  max_results?: number; // 高级策略：最大结果数
  require_uptrend?: boolean; // 高级策略：是否要求上升趋势
  require_hot_sector?: boolean; // 高级策略：是否要求热门板块
}

export interface AdvancedSelectionJobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  processed: number;
  total: number;
  selected: number;
  created_at: string;
  updated_at: string;
  parameters: {
    min_score: number;
    max_results: number;
    require_uptrend: boolean;
    require_hot_sector: boolean;
    require_breakout: boolean;
    strategy_id: number | null;
    strategy_name: string | null;
  };
  error: string | null;
  result_count?: number;
  results?: SmartSelectionResult[];
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
  portfolio_summary?: {
    initial_capital: number;
    final_value: number;
    cash: number;
    positions_count: number;
    transactions_count: number;
  };
  equity_curve?: {
    date: string;
    total_value: number;
    cash: number;
    positions_value: number;
    positions_count: number;
  }[];
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
    console.error('获取策略列表失败:', error);
    throw toFetchError(error);
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
    throw toFetchError(error);
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
  endDate: string,
  algorithmType: 'basic' | 'advanced' = 'basic'
): Promise<BacktestResult> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/smart-selection/backtest?start_date=${startDate}&end_date=${endDate}&algorithm_type=${algorithmType}`,
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
    throw toFetchError(error);
  }
};

/**
 * 获取选股统计信息
 */

export const fetchSuperMainforceConfig = async (): Promise<any> => {
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/super-mainforce/config`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw toFetchError(error);
  }
};

export const updateSuperMainforceConfig = async (config: any): Promise<any> => {
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/super-mainforce/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw toFetchError(error);
  }
};

export const runSuperMainforceBacktest = async (
  startDate?: string,
  endDate?: string
): Promise<any> => {
  const qs = new URLSearchParams();
  if (startDate) qs.set('start_date', startDate);
  if (endDate) qs.set('end_date', endDate);
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/super-mainforce/backtest?${qs.toString()}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw toFetchError(error);
  }
};

export const fetchSuperMainforceRealtime = async (date?: string): Promise<any> => {
  const qs = new URLSearchParams();
  if (date) qs.set('date', date);
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/super-mainforce/realtime?${qs.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw toFetchError(error);
  }
};

export const fetchSuperMainforceSignals = async (date?: string, limit: number = 200): Promise<any> => {
  const qs = new URLSearchParams();
  if (date) qs.set('date', date);
  qs.set('limit', String(limit));
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/super-mainforce/signals?${qs.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw toFetchError(error);
  }
};
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
    throw toFetchError(error);
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

// ==================== 高级算法相关函数 ====================

/**
 * 获取高级选股策略列表
 */
export const fetchAdvancedSelectionStrategies = async (): Promise<{
  count: number;
  strategies: SelectionStrategy[];
  timestamp: string;
}> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/advanced-selection/advanced/strategies`,
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
    console.error('获取高级选股策略列表失败:', error);
    throw toFetchError(error);
  }
};

/**
 * 运行高级智能选股
 */
export const runAdvancedSelection = async (
  minScore: number = 60,
  maxResults: number = 20,
  requireUptrend: boolean = true,
  requireHotSector: boolean = true,
  strategyId?: number,
  strategyName?: string,
): Promise<{
  parameters: {
    min_score: number;
    max_results: number;
    require_uptrend: boolean;
    require_hot_sector: boolean;
  };
  count: number;
  results: SmartSelectionResult[];
  timestamp: string;
}> => {
  try {
    const params = new URLSearchParams({
      min_score: minScore.toString(),
      max_results: maxResults.toString(),
      require_uptrend: requireUptrend.toString(),
      require_hot_sector: requireHotSector.toString(),
    });

    if (strategyId !== undefined) {
      params.append('strategy_id', strategyId.toString());
    }
    if (strategyName) {
      params.append('strategy_name', strategyName);
    }

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/advanced-selection/advanced/run?${params}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      ...data,
      results: normalizeAdvancedCompositeScores(data?.results) || [],
    };
  } catch (error) {
    console.error('运行AI选股失败:', error);
    throw toFetchError(error);
  }
};

/**
 * 按策略ID运行高级选股
 */
export const runAdvancedStrategyById = async (
  strategyId: number
): Promise<{
  strategy: SelectionStrategy;
  count: number;
  results: SmartSelectionResult[];
  timestamp: string;
}> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/advanced-selection/advanced/run-strategy/${strategyId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      ...data,
      results: normalizeAdvancedCompositeScores(data?.results) || [],
    };
  } catch (error) {
    console.error(`按策略ID运行高级选股失败 (ID: ${strategyId}):`, error);
    throw toFetchError(error);
  }
};

export const runAdvancedSelectionAsync = async (
  minScore: number = 60,
  maxResults: number = 20,
  requireUptrend: boolean = true,
  requireHotSector: boolean = true,
  strategyId?: number,
  strategyName?: string,
  requireBreakout: boolean = false,
): Promise<{
  job_id: string;
  status: string;
  created_at: string;
}> => {
  try {
    const params = new URLSearchParams({
      min_score: minScore.toString(),
      max_results: maxResults.toString(),
      require_uptrend: requireUptrend.toString(),
      require_hot_sector: requireHotSector.toString(),
      require_breakout: requireBreakout.toString(),
    });

    if (strategyId !== undefined) {
      params.append('strategy_id', strategyId.toString());
    }
    if (strategyName) {
      params.append('strategy_name', strategyName);
    }

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/advanced-selection/advanced/run-async?${params}`,
      {
        method: 'POST',
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
    console.error('创建高级选股后台任务失败:', error);
    throw toFetchError(error);
  }
};

export const getAdvancedSelectionJob = async (
  jobId: string
): Promise<AdvancedSelectionJobStatus> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/advanced-selection/advanced/jobs/${jobId}`,
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const job = await response.json();
    if (job?.status === 'completed') {
      return {
        ...job,
        results: normalizeAdvancedCompositeScores(job?.results),
      };
    }
    return job;
  } catch (error) {
    console.error(`查询高级选股任务失败 (${jobId}):`, error);
    throw toFetchError(error);
  }
};

/**
 * 对比新旧算法效果
 */
export const compareAlgorithms = async (
  minScore: number = 60,
  maxResults: number = 5
): Promise<{
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
  advanced_results_sample: SmartSelectionResult[];
  timestamp: string;
}> => {
  try {
    const params = new URLSearchParams({
      min_score: minScore.toString(),
      max_results: maxResults.toString(),
    });

    const response = await fetch(
      `${DATA_SERVICE_URL}/api/advanced-selection/advanced/compare-algorithms?${params}`,
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
    console.error('对比算法失败:', error);
    throw toFetchError(error);
  }
};

/**
 * 获取高级选股统计信息
 */
export const getAdvancedStatistics = async (): Promise<{
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
}> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}/api/advanced-selection/advanced/statistics`,
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
    console.error('获取高级选股统计信息失败:', error);
    throw toFetchError(error);
  }
};

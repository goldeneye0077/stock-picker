/**
 * 基本面分析API服务
 * 提供股票基本面数据获取和分析功能
 */

import { DATA_SERVICE_URL, API_ENDPOINTS } from '../config/api';

// 基本面分析结果接口
export interface FundamentalAnalysis {
  stock_code: string;
  analysis: {
    financial_health?: FinancialHealth;
    profitability?: Profitability;
    valuation?: Valuation;
    growth?: Growth;
    efficiency?: Efficiency;
    overall_score?: number;
    recommendation?: string;
    timestamp?: string;
  };
  timestamp: string;
}

// 财务健康度
export interface FinancialHealth {
  current_ratio?: number;        // 流动比率
  quick_ratio?: number;          // 速动比率
  debt_to_equity?: number;       // 负债权益比
  interest_coverage?: number;    // 利息保障倍数
  score?: number;
  grade?: string;
}

// 盈利能力
export interface Profitability {
  roe?: number;                  // 净资产收益率
  roa?: number;                  // 总资产收益率
  gross_margin?: number;         // 毛利率
  net_margin?: number;           // 净利率
  operating_margin?: number;     // 营业利润率
  score?: number;
  grade?: string;
}

// 估值指标
export interface Valuation {
  pe_ratio?: number;             // 市盈率
  pb_ratio?: number;             // 市净率
  ps_ratio?: number;             // 市销率
  dividend_yield?: number;       // 股息率
  peg_ratio?: number;            // PEG比率
  score?: number;
  grade?: string;
}

// 成长性
export interface Growth {
  revenue_growth?: number;       // 营收增长率
  profit_growth?: number;        // 利润增长率
  eps_growth?: number;           // EPS增长率
  asset_growth?: number;         // 资产增长率
  score?: number;
  grade?: string;
}

// 运营效率
export interface Efficiency {
  asset_turnover?: number;       // 资产周转率
  inventory_turnover?: number;   // 存货周转率
  receivable_turnover?: number;  // 应收账款周转率
  operating_cycle?: number;      // 营业周期
  score?: number;
  grade?: string;
}

// 财务指标数据
export interface FinancialIndicators {
  stock_code: string;
  period: string;
  data: {
    basic_eps?: number;          // 基本每股收益
    diluted_eps?: number;        // 稀释每股收益
    total_revenue?: number;      // 营业总收入
    revenue?: number;            // 营业收入
    total_profit?: number;       // 利润总额
    net_profit?: number;         // 净利润
    net_profit_attr?: number;    // 归属母公司净利润
    total_assets?: number;       // 总资产
    total_liabilities?: number;  // 总负债
    total_equity?: number;       // 总权益
    operating_cash_flow?: number; // 经营活动现金流量净额
    investing_cash_flow?: number; // 投资活动现金流量净额
    financing_cash_flow?: number; // 筹资活动现金流量净额
    [key: string]: any;
  };
  timestamp: string;
}

// 财务报表数据
export interface FinancialStatements {
  stock_code: string;
  period: string;
  income_statement?: any;        // 利润表
  balance_sheet?: any;           // 资产负债表
  cash_flow?: any;               // 现金流量表
  timestamp: string;
}

// 高分股票
export interface TopFundamentalStock {
  stock_code: string;
  stock_name: string;
  overall_score: number;
  financial_health_score: number;
  profitability_score: number;
  valuation_score: number;
  growth_score: number;
  efficiency_score: number;
  recommendation: string;
  industry?: string;
  market_cap?: number;
  pe_ratio?: number;
  pb_ratio?: number;
}

/**
 * 获取股票基本面分析
 * @param stockCode 股票代码
 */
export const fetchFundamentalAnalysis = async (stockCode: string): Promise<FundamentalAnalysis> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}${API_ENDPOINTS.FUNDAMENTAL}/stock/${stockCode}/analysis`
    );

    if (!response.ok) {
      throw new Error(`获取基本面分析失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('获取基本面分析失败:', error);
    throw error;
  }
};

/**
 * 获取股票财务指标
 * @param stockCode 股票代码
 * @param period 报告期（可选）
 */
export const fetchFinancialIndicators = async (
  stockCode: string,
  period?: string
): Promise<FinancialIndicators> => {
  try {
    const url = new URL(
      `${DATA_SERVICE_URL}${API_ENDPOINTS.FUNDAMENTAL}/stock/${stockCode}/financial-indicators`
    );

    if (period) {
      url.searchParams.append('period', period);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`获取财务指标失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('获取财务指标失败:', error);
    throw error;
  }
};

/**
 * 获取股票财务报表
 * @param stockCode 股票代码
 * @param period 报告期（可选）
 */
export const fetchFinancialStatements = async (
  stockCode: string,
  period?: string
): Promise<FinancialStatements> => {
  try {
    const url = new URL(
      `${DATA_SERVICE_URL}${API_ENDPOINTS.FUNDAMENTAL}/stock/${stockCode}/financial-statements`
    );

    if (period) {
      url.searchParams.append('period', period);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`获取财务报表失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('获取财务报表失败:', error);
    throw error;
  }
};

/**
 * 获取高分股票列表
 * @param limit 返回数量（默认20）
 * @param minScore 最低评分（默认70）
 */
export const fetchTopFundamentalStocks = async (
  limit: number = 20,
  minScore: number = 70
): Promise<{ stocks: TopFundamentalStock[] }> => {
  try {
    const url = new URL(
      `${DATA_SERVICE_URL}${API_ENDPOINTS.FUNDAMENTAL}/top-stocks`
    );

    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('min_score', minScore.toString());

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`获取高分股票失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('获取高分股票失败:', error);
    throw error;
  }
};

/**
 * 获取股票估值数据
 * @param stockCode 股票代码
 */
export const fetchValuationData = async (stockCode: string): Promise<any> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}${API_ENDPOINTS.FUNDAMENTAL}/stock/${stockCode}/valuation`
    );

    if (!response.ok) {
      throw new Error(`获取估值数据失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('获取估值数据失败:', error);
    throw error;
  }
};

/**
 * 获取股票分红数据
 * @param stockCode 股票代码
 */
export const fetchDividendData = async (stockCode: string): Promise<any> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}${API_ENDPOINTS.FUNDAMENTAL}/stock/${stockCode}/dividend`
    );

    if (!response.ok) {
      throw new Error(`获取分红数据失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('获取分红数据失败:', error);
    throw error;
  }
};

/**
 * 获取股票股东数据
 * @param stockCode 股票代码
 */
export const fetchShareholderData = async (stockCode: string): Promise<any> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}${API_ENDPOINTS.FUNDAMENTAL}/stock/${stockCode}/shareholders`
    );

    if (!response.ok) {
      throw new Error(`获取股东数据失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('获取股东数据失败:', error);
    throw error;
  }
};

/**
 * 比较多只股票的基本面
 * @param stockCodes 股票代码数组
 */
export const compareStocksFundamentals = async (stockCodes: string[]): Promise<any> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}${API_ENDPOINTS.FUNDAMENTAL}/compare`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stock_codes: stockCodes }),
      }
    );

    if (!response.ok) {
      throw new Error(`股票比较失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('股票比较失败:', error);
    throw error;
  }
};

/**
 * 批量获取基本面数据
 * @param stockCodes 股票代码数组
 */
export const batchFetchFundamentalData = async (stockCodes: string[]): Promise<any> => {
  try {
    const response = await fetch(
      `${DATA_SERVICE_URL}${API_ENDPOINTS.FUNDAMENTAL}/batch/fetch-and-save`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stock_codes: stockCodes }),
      }
    );

    if (!response.ok) {
      throw new Error(`批量获取基本面数据失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('批量获取基本面数据失败:', error);
    throw error;
  }
};


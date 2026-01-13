/**
 * 股票列表 Hook
 * 管理股票列表数据的获取、搜索和筛选
 */

import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  fetchStockList,
  fetchStockDetail,
  fetchStockAnalysis,
  searchStocks,
  type StockListParams,
  type StockItem
} from '../services/stockService';

export function useStockList(initialParams: StockListParams = {}) {
  const [data, setData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<StockListParams>(initialParams);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<any[]>([]);

  // 获取股票列表
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchStockList(params);
      setData(result);
    } catch (error) {
      console.error('Error fetching stock list:', error);
      message.error('获取股票列表失败');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  // 搜索股票
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);

    if (!query || query.trim().length === 0) {
      setSearchOptions([]);
      return;
    }

    try {
      const results = await searchStocks(query);
      const options = results.map((stock: any) => ({
        value: stock.code,
        label: `${stock.code} - ${stock.name}`
      }));
      setSearchOptions(options);
    } catch (error) {
      console.error('Error searching stocks:', error);
      setSearchOptions([]);
    }
  }, []);

  // 更新参数
  const updateParams = useCallback((newParams: Partial<StockListParams>) => {
    setParams((prev) => ({ ...prev, ...newParams }));
  }, []);

  // 重置参数
  const resetParams = useCallback(() => {
    setParams(initialParams);
    setSearchQuery('');
    setSearchOptions([]);
  }, [initialParams]);

  // 初始加载
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    params,
    searchQuery,
    searchOptions,
    fetchData,
    updateParams,
    resetParams,
    handleSearch,
    setSearchQuery
  };
}

/**
 * 股票详情 Hook
 * 管理单个股票的详情数据
 */
export function useStockDetail() {
  const [detail, setDetail] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [currentCode, setCurrentCode] = useState<string | null>(null);

  const fetchDetail = useCallback(async (stockCode: string) => {
    setCurrentCode(stockCode);
    setLoading(true);
    try {
      const detailData = await fetchStockDetail(stockCode);
      setDetail(detailData);
    } catch (error) {
      console.error('Error fetching stock detail:', error);
      message.error('获取股票详情失败');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAnalysisData = useCallback(async (stockCode: string, options: { date?: string } = {}) => {
    setCurrentCode(stockCode);
    setLoading(true);
    try {
      const analysisData = await fetchStockAnalysis(stockCode, options);
      setAnalysis(analysisData);
    } catch (error) {
      console.error('Error fetching stock analysis:', error);
      message.error('获取技术分析失败');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setDetail(null);
    setAnalysis(null);
    setCurrentCode(null);
  }, []);

  return {
    detail,
    analysis,
    loading,
    currentCode,
    fetchDetail,
    fetchAnalysisData,
    reset
  };
}

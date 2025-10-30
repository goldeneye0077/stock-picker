/**
 * 资金流向数据Hook
 * 管理资金流向数据的获取和状态
 */

import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  fetchMarketMoneyflowData,
  type FundFlowParams
} from '../services/analysisService';

interface FundFlowDisplay {
  type: string;
  amount: string;
  percent: number;
  color: string;
}

export function useFundFlow(initialParams: FundFlowParams = {}) {
  const [data, setData] = useState<FundFlowDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<FundFlowParams>(initialParams);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchMarketMoneyflowData(params);

      if (result.summary) {
        const summary = result.summary;
        const totalFlow =
          Math.abs(summary.totalElgAmount) +
          Math.abs(summary.totalLgAmount) +
          Math.abs(summary.totalMdAmount) +
          Math.abs(summary.totalSmAmount);

        const displayData: FundFlowDisplay[] = [
          {
            type: '超大单',
            amount: `${summary.totalElgAmount >= 0 ? '+' : ''}${(summary.totalElgAmount / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? (Math.abs(summary.totalElgAmount) / totalFlow) * 100 : 0,
            color: '#f50'
          },
          {
            type: '大单',
            amount: `${summary.totalLgAmount >= 0 ? '+' : ''}${(summary.totalLgAmount / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? (Math.abs(summary.totalLgAmount) / totalFlow) * 100 : 0,
            color: '#ff7a45'
          },
          {
            type: '中单',
            amount: `${summary.totalMdAmount >= 0 ? '+' : ''}${(summary.totalMdAmount / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? (Math.abs(summary.totalMdAmount) / totalFlow) * 100 : 0,
            color: '#2db7f5'
          },
          {
            type: '小单',
            amount: `${summary.totalSmAmount >= 0 ? '+' : ''}${(summary.totalSmAmount / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? (Math.abs(summary.totalSmAmount) / totalFlow) * 100 : 0,
            color: '#87d068'
          }
        ];

        setData(displayData);
        message.success('大盘资金流向数据已刷新');
      } else {
        setData([]);
        message.info('暂无大盘资金流向数据');
      }
    } catch (error) {
      console.error('Error fetching market moneyflow data:', error);
      message.error('刷新大盘资金流向数据失败');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  // 更新参数
  const updateParams = useCallback((newParams: Partial<FundFlowParams>) => {
    setParams((prev) => ({ ...prev, ...newParams }));
  }, []);

  // 重置参数
  const resetParams = useCallback(() => {
    setParams(initialParams);
  }, [initialParams]);

  // 初始加载
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    params,
    fetchData,
    updateParams,
    resetParams
  };
}

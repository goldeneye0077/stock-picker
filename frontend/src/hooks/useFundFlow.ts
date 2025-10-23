/**
 * 资金流向数据Hook
 * 管理资金流向数据的获取和状态
 */

import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  fetchFundFlowData,
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
      const result = await fetchFundFlowData(params);

      if (result.summary) {
        const summary = result.summary;
        const totalFlow =
          Math.abs(summary.totalMainFlow) +
          Math.abs(summary.totalRetailFlow) +
          Math.abs(summary.totalInstitutionalFlow);

        const displayData: FundFlowDisplay[] = [
          {
            type: '主力资金',
            amount: `${summary.totalMainFlow >= 0 ? '+' : ''}${(summary.totalMainFlow / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? (Math.abs(summary.totalMainFlow) / totalFlow) * 100 : 0,
            color: '#f50'
          },
          {
            type: '机构资金',
            amount: `${summary.totalInstitutionalFlow >= 0 ? '+' : ''}${(summary.totalInstitutionalFlow / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? (Math.abs(summary.totalInstitutionalFlow) / totalFlow) * 100 : 0,
            color: '#2db7f5'
          },
          {
            type: '散户资金',
            amount: `${summary.totalRetailFlow >= 0 ? '+' : ''}${(summary.totalRetailFlow / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? (Math.abs(summary.totalRetailFlow) / totalFlow) * 100 : 0,
            color: '#87d068'
          }
        ];

        setData(displayData);
        message.success('资金流向数据已刷新');
      } else {
        setData([]);
        message.info('暂无资金流向数据');
      }
    } catch (error) {
      console.error('Error fetching fund flow data:', error);
      message.error('刷新资金流向数据失败');
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

/**
 * 主力行为分析Hook
 * 管理主力行为数据的获取和状态
 */

import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  fetchMainForceData,
  type MainForceParams
} from '../services/analysisService';

interface MainForceSummary {
  strongCount: number;
  moderateCount: number;
  weakCount: number;
  avgStrength: number;
}

export function useMainForce(initialParams: MainForceParams = {}) {
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState<MainForceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<MainForceParams>({
    days: 7,
    limit: 20,
    ...initialParams
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchMainForceData(params);
      setData(result.mainForce || []);
      setSummary(result.summary || null);
      message.success('主力行为数据已刷新');
    } catch (error) {
      console.error('Error fetching main force data:', error);
      message.error('获取主力行为数据失败');
      setData([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [params]);

  const updateParams = useCallback((newParams: Partial<MainForceParams>) => {
    setParams((prev) => ({ ...prev, ...newParams }));
  }, []);

  const resetParams = useCallback(() => {
    setParams({ days: 7, limit: 20, ...initialParams });
  }, [initialParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    summary,
    loading,
    params,
    fetchData,
    updateParams,
    resetParams
  };
}

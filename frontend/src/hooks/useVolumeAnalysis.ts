/**
 * 成交量分析Hook
 * 管理成交量异动数据的获取和状态
 */

import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import {
  fetchVolumeAnalysisData,
  type VolumeAnalysisParams
} from '../services/analysisService';

export function useVolumeAnalysis(initialParams: VolumeAnalysisParams = {}) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<VolumeAnalysisParams>({
    days: 10,
    ...initialParams
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchVolumeAnalysisData(params);
      setData(result.volumeSurges || []);
      message.success('成交量数据已刷新');
    } catch (error) {
      console.error('Error fetching volume analysis:', error);
      message.error('获取成交量数据失败');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  const updateParams = useCallback((newParams: Partial<VolumeAnalysisParams>) => {
    setParams((prev) => ({ ...prev, ...newParams }));
  }, []);

  const resetParams = useCallback(() => {
    setParams({ days: 10, ...initialParams });
  }, [initialParams]);

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

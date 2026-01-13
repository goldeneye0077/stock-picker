/**
 * 股票列表页面
 * 重构后的版本 - 使用子组件和 Hook 实现模块化
 * 性能优化：使用 useCallback 稳定回调函数引用
 */

import React, { useState, useCallback } from 'react';
import { Card, Modal, Descriptions, Alert, Button, Tabs, message } from 'antd';
import { StockSearchBar, StockTable } from '../components/StockList';
import { useStockList, useStockDetail } from '../hooks/useStockList';
import { fetchStockHistory } from '../services/stockService';
import KLineChart from '../components/KLineChart';
import FundamentalDetailModal from '../components/Fundamental/FundamentalDetailModal';
import type { StockItem } from '../services/stockService';

const { TabPane } = Tabs;

const StockList: React.FC = () => {
  // 使用自定义 Hooks
  const {
    data,
    loading,
    searchQuery,
    searchOptions,
    params,
    fetchData,
    updateParams,
    resetParams,
    handleSearch,
    setSearchQuery
  } = useStockList();

  const { detail, analysis, loading: detailLoading, fetchDetail, fetchAnalysisData, reset: resetDetail } = useStockDetail();

  // 本地状态
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isAnalysisModalVisible, setIsAnalysisModalVisible] = useState(false);
  const [isFundamentalModalVisible, setIsFundamentalModalVisible] = useState(false);
  const [currentStock, setCurrentStock] = useState<StockItem | null>(null);
  const [klineData, setKlineData] = useState<any[]>([]);

  // 处理搜索 - 使用 useCallback 优化
  const handleSearchSubmit = useCallback((value: string) => {
    if (value) {
      message.info(`搜索: ${value}`);
      // 可以在这里添加搜索逻辑
    }
  }, []);

  // 处理日期变化 - 使用 useCallback 优化
  const handleDateChange = useCallback((date: any, dateString: string | string[]) => {
    const finalDateString = Array.isArray(dateString) ? dateString[0] : dateString;
    updateParams({ date: finalDateString || undefined });
  }, [updateParams]);

  // 重置日期 - 使用 useCallback 优化
  const handleResetDate = useCallback(() => {
    updateParams({ date: undefined });
  }, [updateParams]);

  // 显示详情模态框 - 使用 useCallback 优化
  const showDetailModal = useCallback(async (record: StockItem) => {
    setCurrentStock(record);
    setIsDetailModalVisible(true);
    await fetchDetail(record.code);
  }, [fetchDetail]);

  // 显示分析模态框 - 使用 useCallback 优化
  const showAnalysisModal = useCallback(async (record: StockItem) => {
    setCurrentStock(record);
    setIsAnalysisModalVisible(true);

    try {
      await fetchAnalysisData(record.code, { date: params.date });

      const historyData = await fetchStockHistory(record.code, {
        period: 'daily'
      });

      if (historyData && historyData.klines) {
        setKlineData(historyData.klines);
      }
    } catch (error) {
      console.error('Error fetching analysis data:', error);
    }
  }, [fetchAnalysisData, params.date]);

  // 显示基本面分析模态框 - 使用 useCallback 优化
  const showFundamentalModal = useCallback((record: StockItem) => {
    setCurrentStock(record);
    setIsFundamentalModalVisible(true);
    // 基本面数据在弹窗组件内部加载
  }, []);

  // 关闭模态框 - 使用 useCallback 优化
  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalVisible(false);
    setCurrentStock(null);
    resetDetail();
  }, [resetDetail]);

  const handleCloseAnalysisModal = useCallback(() => {
    setIsAnalysisModalVisible(false);
    setCurrentStock(null);
    setKlineData([]);
    resetDetail();
  }, [resetDetail]);

  const handleCloseFundamentalModal = useCallback(() => {
    setIsFundamentalModalVisible(false);
    setCurrentStock(null);
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflow: 'hidden' }}>
      {params.date && (
        <Alert
          message={`正在查看 ${params.date} 的历史数据`}
          type="info"
          closable
          onClose={handleResetDate}
          style={{ marginBottom: '16px' }}
          action={
            <Button size="small" onClick={handleResetDate}>
              返回实时数据
            </Button>
          }
        />
      )}

      <Card
        title="股票列表"
        extra={
          <StockSearchBar
            searchQuery={searchQuery}
            searchOptions={searchOptions}
            selectedDate={params.date || null}
            loading={loading}
            onSearch={handleSearchSubmit}
            onSearchChange={handleSearch}
            onDateChange={handleDateChange}
            onReset={handleResetDate}
            onRefresh={fetchData}
          />
        }
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <StockTable
            data={data}
            loading={loading}
            onRowClick={showDetailModal}
            onAnalysisClick={showAnalysisModal}
            onFundamentalClick={showFundamentalModal}
          />
        </div>
      </Card>

      {/* 股票详情模态框 */}
      <Modal
        title={`股票详情 - ${currentStock?.code} ${currentStock?.name}`}
        open={isDetailModalVisible}
        onCancel={handleCloseDetailModal}
        footer={null}
        width={800}
        loading={detailLoading}
      >
        {detail && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="股票代码">{detail.code}</Descriptions.Item>
            <Descriptions.Item label="股票名称">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="交易所">{detail.exchange}</Descriptions.Item>
            <Descriptions.Item label="行业">{detail.industry || '-'}</Descriptions.Item>
            <Descriptions.Item label="最新价">
              ¥{detail.current_price?.toFixed(2) || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="涨跌幅">
              <span style={{
                color: detail.change_percent > 0 ? '#cf1322' : detail.change_percent < 0 ? '#3f8600' : '#666'
              }}>
                {detail.change_percent > 0 ? '+' : ''}
                {detail.change_percent?.toFixed(2)}%
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="成交量">{detail.volume || '-'}</Descriptions.Item>
            <Descriptions.Item label="成交额">{detail.amount || '-'}</Descriptions.Item>
            <Descriptions.Item label="市盈率">{detail.pe_ratio || '-'}</Descriptions.Item>
            <Descriptions.Item label="市净率">{detail.pb_ratio || '-'}</Descriptions.Item>
            <Descriptions.Item label="总市值">{detail.total_market_cap || '-'}</Descriptions.Item>
            <Descriptions.Item label="流通市值">{detail.circulating_market_cap || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* 技术分析模态框 */}
      <Modal
        title={`技术分析 - ${currentStock?.code} ${currentStock?.name}`}
        open={isAnalysisModalVisible}
        onCancel={handleCloseAnalysisModal}
        footer={null}
        width={1200}
        loading={detailLoading}
      >
        <Tabs defaultActiveKey="kline">
          <TabPane tab="K线图" key="kline">
            {klineData.length > 0 ? (
              <KLineChart data={klineData} />
            ) : (
              <div style={{ textAlign: 'center', padding: '50px', color: '#999' }}>
                暂无K线数据
              </div>
            )}
          </TabPane>
          <TabPane tab="技术指标" key="indicators">
            {analysis && analysis.indicators ? (
              <div>
                {/* 移动平均线指标 */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#1890ff' }}>
                    移动平均线（MA）
                  </div>
                  <Descriptions bordered column={4} size="small">
                    <Descriptions.Item label="MA5">{analysis.indicators.ma5?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="MA10">{analysis.indicators.ma10?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="MA20">{analysis.indicators.ma20?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="MA60">{analysis.indicators.ma60?.toFixed(2) || '-'}</Descriptions.Item>
                  </Descriptions>
                </div>

                {/* 趋势指标 */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#1890ff' }}>
                    趋势指标
                  </div>
                  <Descriptions bordered column={3} size="small">
                    <Descriptions.Item label="MACD">{analysis.indicators.macd?.toFixed(4) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="MACD信号">{analysis.indicators.macd_signal?.toFixed(4) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="MACD柱">{analysis.indicators.macd_hist?.toFixed(4) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="RSI(14)">{analysis.indicators.rsi?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="KDJ_K">{analysis.indicators.kdj_k?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="KDJ_D">{analysis.indicators.kdj_d?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="KDJ_J">{analysis.indicators.kdj_j?.toFixed(2) || '-'}</Descriptions.Item>
                  </Descriptions>
                </div>

                {/* 换手率和量比 */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#1890ff' }}>
                    成交活跃度指标
                  </div>
                  <Descriptions bordered column={3} size="small">
                    <Descriptions.Item label="换手率">{analysis.indicators.turnover_rate ? `${analysis.indicators.turnover_rate.toFixed(2)}%` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="换手率(自由流通股)">{analysis.indicators.turnover_rate_f ? `${analysis.indicators.turnover_rate_f.toFixed(2)}%` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="量比">{analysis.indicators.volume_ratio?.toFixed(2) || '-'}</Descriptions.Item>
                  </Descriptions>
                </div>

                {/* 估值指标 */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#1890ff' }}>
                    估值指标
                  </div>
                  <Descriptions bordered column={4} size="small">
                    <Descriptions.Item label="市盈率(PE)">{analysis.indicators.pe?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="市盈率TTM">{analysis.indicators.pe_ttm?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="市净率(PB)">{analysis.indicators.pb?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="市销率(PS)">{analysis.indicators.ps?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="市销率TTM">{analysis.indicators.ps_ttm?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="股息率">{analysis.indicators.dv_ratio?.toFixed(2) || '-'}</Descriptions.Item>
                    <Descriptions.Item label="股息率TTM">{analysis.indicators.dv_ttm?.toFixed(2) || '-'}</Descriptions.Item>
                  </Descriptions>
                </div>

                {/* 市值和股本 */}
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#1890ff' }}>
                    市值与股本
                  </div>
                  <Descriptions bordered column={3} size="small">
                    <Descriptions.Item label="总市值">{analysis.indicators.total_mv ? `${(analysis.indicators.total_mv / 10000).toFixed(2)}亿` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="流通市值">{analysis.indicators.circ_mv ? `${(analysis.indicators.circ_mv / 10000).toFixed(2)}亿` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="总股本">{analysis.indicators.total_share ? `${(analysis.indicators.total_share / 10000).toFixed(2)}亿股` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="流通股本">{analysis.indicators.float_share ? `${(analysis.indicators.float_share / 10000).toFixed(2)}亿股` : '-'}</Descriptions.Item>
                    <Descriptions.Item label="自由流通股本">{analysis.indicators.free_share ? `${(analysis.indicators.free_share / 10000).toFixed(2)}亿股` : '-'}</Descriptions.Item>
                  </Descriptions>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '50px', color: '#999' }}>
                暂无技术指标数据
              </div>
            )}
          </TabPane>
        </Tabs>
      </Modal>

      {/* 基本面分析模态框 */}
      {currentStock && (
        <FundamentalDetailModal
          visible={isFundamentalModalVisible}
          stockCode={currentStock.code}
          stockName={currentStock.name}
          onClose={handleCloseFundamentalModal}
        />
      )}
    </div>
  );
};

export default StockList;

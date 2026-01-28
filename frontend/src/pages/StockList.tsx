/**
 * 股票列表页面
 * 重构后的版本 - 使用子组件和 Hook 实现模块化
 * 性能优化：使用 useCallback 稳定回调函数引用
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Modal, Descriptions, Alert, Button, message } from 'antd';
import { useLocation } from 'react-router-dom';
import { StockSearchBar, StockTable } from '../components/StockList';
import { useStockList, useStockDetail } from '../hooks/useStockList';
import FundamentalDetailModal from '../components/Fundamental/FundamentalDetailModal';
import TechnicalAnalysisModal from '../components/TechnicalAnalysisModal';
import type { StockItem } from '../services/stockService';

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
    handleSearch,
    setSearchQuery,
  } = useStockList();

  const { detail, loading: detailLoading, fetchDetail, reset: resetDetail } = useStockDetail();
  const location = useLocation();

  // 本地状态
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isAnalysisModalVisible, setIsAnalysisModalVisible] = useState(false);
  const [isFundamentalModalVisible, setIsFundamentalModalVisible] = useState(false);
  const [currentStock, setCurrentStock] = useState<StockItem | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('search');
    if (!q) return;
    const query = q.trim();
    if (!query) return;
    if (query === searchQuery) return;
    setSearchQuery(query);
    handleSearch(query);
    message.info(`已定位到搜索：${query}`);
  }, [handleSearch, location.search, searchQuery, setSearchQuery]);

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
    setIsAnalysisModalVisible(true);
  }, []);

  // 显示分析模态框 - 使用 useCallback 优化
  const showAnalysisModal = useCallback(async (record: StockItem) => {
    setCurrentStock(record);
    setIsAnalysisModalVisible(true);
  }, []);

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
  }, []);

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
              <span
                className={
                  detail.change_percent > 0 ? 'sq-rise sq-mono' : detail.change_percent < 0 ? 'sq-fall sq-mono' : 'sq-neutral sq-mono'
                }
              >
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

      <TechnicalAnalysisModal
        open={isAnalysisModalVisible}
        onClose={handleCloseAnalysisModal}
        stockCode={currentStock?.code}
        stockName={currentStock?.name}
        analysisDate={params.date || null}
      />

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

/**
 * 股票列表页面
 * 重构后的版本 - 使用子组件和 Hook 实现模块化
 * 性能优化：使用 useCallback 稳定回调函数引用
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Descriptions, Alert, Button, Space, Tag, message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { DownloadOutlined, StarOutlined, StockOutlined } from '@ant-design/icons';
import { StockSearchBar, StockTable } from '../components/StockList';
import { useStockList, useStockDetail } from '../hooks/useStockList';
import FundamentalDetailModal from '../components/Fundamental/FundamentalDetailModal';
import TechnicalAnalysisModal from '../components/TechnicalAnalysisModal';
import type { StockItem } from '../services/stockService';
import { useAuth } from '../context/AuthContext';
import { addToWatchlist, ApiError, getWatchlist, removeFromWatchlist } from '../services/authService';
import FigmaPageHero from '../components/FigmaPageHero';
import FigmaCard from '../components/FigmaCard';
import { FigmaBorderRadius } from '../styles/FigmaDesignTokens';

const StockList: React.FC<{ mode?: 'all' | 'watchlist' }> = ({ mode = 'all' }) => {
  const { token } = useAuth();
  const navigate = useNavigate();

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
  } = useStockList(mode === 'watchlist' ? { codes: [] } : {});

  const { detail, loading: detailLoading, reset: resetDetail } = useStockDetail();
  const location = useLocation();

  // 本地状态
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isAnalysisModalVisible, setIsAnalysisModalVisible] = useState(false);
  const [isFundamentalModalVisible, setIsFundamentalModalVisible] = useState(false);
  const [currentStock, setCurrentStock] = useState<StockItem | null>(null);
  const [watchlistCodes, setWatchlistCodes] = useState<string[]>([]);
  const [watchlistPendingCodes, setWatchlistPendingCodes] = useState<Set<string>>(() => new Set());

  const refreshWatchlist = useCallback(async () => {
    if (!token) return;
    const res = await getWatchlist(token);
    setWatchlistCodes(res.data.codes || []);
  }, [token]);

  useEffect(() => {
    if (!token) {
      setWatchlistCodes([]);
      setWatchlistPendingCodes(new Set());
      return;
    }
    refreshWatchlist().catch(() => {});
  }, [refreshWatchlist, token]);

  useEffect(() => {
    if (mode !== 'watchlist') return;
    refreshWatchlist();
  }, [mode, refreshWatchlist]);

  useEffect(() => {
    if (mode !== 'watchlist') {
      updateParams({ codes: undefined });
      return;
    }
    updateParams({ codes: watchlistCodes });
  }, [mode, updateParams, watchlistCodes]);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('search');
    if (!q) return;
    const query = q.trim();
    if (!query) return;
    if (query === searchQuery) return;
    setSearchQuery(query);
    handleSearch(query);
    updateParams({ search: query });
    message.info(`已定位到搜索：${query}`);
  }, [handleSearch, location.search, searchQuery, setSearchQuery, updateParams]);

  // 处理搜索 - 使用 useCallback 优化
  const handleSearchSubmit = useCallback((value: string) => {
    const q = (value || '').trim();
    if (!q) {
      updateParams({ search: undefined });
      message.info('已清除搜索条件');
      return;
    }
    updateParams({ search: q });
    message.info(`搜索: ${q}`);
  }, [updateParams]);

  const handleSearchChange = useCallback((value: string) => {
    handleSearch(value);
    const q = (value || '').trim();
    if (!q) updateParams({ search: undefined });
  }, [handleSearch, updateParams]);

  const watchlistCodeSet = React.useMemo(() => new Set(watchlistCodes), [watchlistCodes]);

  const handleToggleWatchlist = useCallback(async (record: StockItem, action: 'add' | 'remove') => {
    if (!token) {
      message.warning('请先登录');
      return;
    }
    const code = String(record.code || '').trim();
    if (!code) return;
    if (watchlistPendingCodes.has(code)) return;

    const key = `watchlist-${action}-${code}`;
    const setPending = (pending: boolean) => {
      setWatchlistPendingCodes((prev) => {
        const next = new Set(prev);
        if (pending) next.add(code);
        else next.delete(code);
        return next;
      });
    };

    if (action === 'add' && watchlistCodeSet.has(code)) {
      message.info({ content: '已在自选', key, duration: 1.2 });
      return;
    }
    setPending(true);
    message.loading({ content: action === 'add' ? '正在加入自选...' : '正在移除自选...', key, duration: 0 });

    if (action === 'add') {
      setWatchlistCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
    } else {
      setWatchlistCodes((prev) => prev.filter((c) => c !== code));
    }

    try {
      if (action === 'add') {
        await addToWatchlist(token, code);
        message.success({ content: '已加入自选', key, duration: 1.2 });
      } else {
        await removeFromWatchlist(token, code);
        message.success({ content: '已移除自选', key, duration: 1.2 });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (action === 'add' && err.status === 409) {
          message.info({ content: '已在自选', key, duration: 1.2 });
        } else if (action === 'remove' && err.status === 404) {
          message.info({ content: '已移除自选', key, duration: 1.2 });
        } else {
          message.error({ content: err.message || '操作失败', key, duration: 1.6 });
          if (action === 'add') {
            setWatchlistCodes((prev) => prev.filter((c) => c !== code));
          } else {
            setWatchlistCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
          }
        }
      } else {
        message.error({ content: '操作失败', key, duration: 1.6 });
        if (action === 'add') {
          setWatchlistCodes((prev) => prev.filter((c) => c !== code));
        } else {
          setWatchlistCodes((prev) => (prev.includes(code) ? prev : [...prev, code]));
        }
      }
    } finally {
      setPending(false);
      refreshWatchlist().catch(() => {});
    }
  }, [refreshWatchlist, token, watchlistCodeSet, watchlistPendingCodes]);

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

  const handleExport = useCallback(() => {
    if (!data || data.length === 0) {
      message.info('暂无可导出的数据');
      return;
    }

    const headers = [
      'code',
      'name',
      'price',
      'change',
      'changeAmount',
      'volume',
      'amount',
      'quoteTime',
      'status',
      'signal',
    ];
    const escapeCell = (v: unknown) => {
      const raw = String(v ?? '');
      const escaped = raw.replaceAll('"', '""');
      return `"${escaped}"`;
    };
    const rows = data.map((r) => [
      escapeCell(r.code),
      escapeCell(r.name),
      escapeCell(r.price),
      escapeCell(r.change),
      escapeCell(r.changeAmount),
      escapeCell(r.volume),
      escapeCell(r.amount),
      escapeCell(r.quoteTime),
      escapeCell(r.status),
      escapeCell(r.signal),
    ]);
    const csv = ['\ufeff' + headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mode === 'watchlist' ? 'watchlist' : 'stocks'}-${new Date().toISOString().slice(0, 19).replaceAll(':', '')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }, [data, mode]);

  return (
    <div className="sq-figma-page">
        <FigmaPageHero
          icon={
            mode === 'watchlist'
              ? <StarOutlined style={{ fontSize: 18 }} />
              : <StockOutlined style={{ fontSize: 18 }} />
          }
          title={mode === 'watchlist' ? '自选股管理' : '股票行情列表'}
          subTitle={
            mode === 'watchlist'
              ? '实时监控您的重点关注标的，捕捉交易良机'
              : '提供全市场股票实时行情、资金流向及技术指标监控'
          }
          actions={
            <>
              {mode === 'watchlist' ? (
                <Button type="primary" onClick={() => navigate('/smart-selection')} style={{ borderRadius: FigmaBorderRadius.lg }}>
                  智能筛选
                </Button>
              ) : null}
              <Button icon={<DownloadOutlined />} onClick={handleExport} style={{ borderRadius: FigmaBorderRadius.lg }}>
                导出数据
              </Button>
            </>
          }
        />

        {params.date ? (
          <Alert
            message={`正在查看 ${params.date} 的历史数据`}
            type="info"
            closable
            onClose={handleResetDate}
            style={{ marginBottom: 24, borderRadius: FigmaBorderRadius.lg }}
            action={
              <Button size="small" onClick={handleResetDate} style={{ borderRadius: FigmaBorderRadius.lg }}>
                返回实时数据
              </Button>
            }
          />
        ) : null}

        <FigmaCard style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              borderBottom: '1px solid color-mix(in srgb, var(--sq-border) 60%, transparent)',
            }}
          >
            <Space size={10} wrap>
              <Tag color={loading ? 'default' : 'green'} style={{ borderRadius: FigmaBorderRadius.full, marginInlineEnd: 0 }}>
                {loading ? '正在刷新数据' : '行情数据就绪'}
              </Tag>
              {mode === 'watchlist' ? (
                <Tag style={{ borderRadius: FigmaBorderRadius.full, marginInlineEnd: 0 }}>我的自选：{watchlistCodes.length}</Tag>
              ) : null}
            </Space>

            <StockSearchBar
              searchQuery={searchQuery}
              searchOptions={searchOptions}
              selectedDate={params.date || null}
              loading={loading}
              onSearch={handleSearchSubmit}
              onSearchChange={handleSearchChange}
              onDateChange={handleDateChange}
              onReset={handleResetDate}
              onRefresh={fetchData}
            />
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            <StockTable
              data={data}
              loading={loading}
              onRowClick={showDetailModal}
              onAnalysisClick={showAnalysisModal}
              onFundamentalClick={showFundamentalModal}
              watchlistMode={mode === 'watchlist'}
              watchlistCodes={watchlistCodeSet}
              watchlistPendingCodes={watchlistPendingCodes}
              onToggleWatchlist={handleToggleWatchlist}
            />
          </div>
        </FigmaCard>

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

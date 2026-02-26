import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Col,
  DatePicker,
  InputNumber,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { QuestionCircleOutlined, SyncOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

import {
  collectAuctionSnapshot,
  fetchAuctionSuperMainForce,
  type AuctionSuperMainForceData,
  type AuctionSuperMainForceItem,
} from '../services/analysisService';
import TechnicalAnalysisModal from '../components/TechnicalAnalysisModal';
import FigmaPageHero from '../components/FigmaPageHero';
import FigmaCard from '../components/FigmaCard';
import { FigmaBorderRadius } from '../styles/FigmaDesignTokens';
import { A_SHARE_COLORS } from '../utils/constants';

const SuperMainForce: React.FC = () => {
  const [data, setData] = useState<AuctionSuperMainForceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(dayjs().format('YYYY-MM-DD'));
  const [includeAuctionLimitUp, setIncludeAuctionLimitUp] = useState(false);
  const [themeAlpha, setThemeAlpha] = useState(0.25);
  const [peFilterEnabled, setPeFilterEnabled] = useState(false);
  const [showLowGapOnly, setShowLowGapOnly] = useState(false);
  const [currentStock, setCurrentStock] = useState<{
    code: string;
    name: string;
    tags: Array<{ label: string; color?: string }>;
  } | null>(null);
  const [isAnalysisModalVisible, setIsAnalysisModalVisible] = useState(false);

  const limit = 20;
  const sortMode = 'candidate_first' as const;
  const dynamicThemeAlpha = true;
  const rollingWindowDays = 20;

  const hasSelectedDate = !!selectedDate;
  const hasSnapshot = data?.dataSource === 'quote_history';
  const hasItems = (data?.items?.length ?? 0) > 0;
  const isSelectedDateDataComplete = hasSelectedDate && hasSnapshot && hasItems;
  const isNotCollected = hasSelectedDate && !hasSnapshot;
  const isCollectedNoItems = hasSelectedDate && hasSnapshot && !hasItems;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const first = await fetchAuctionSuperMainForce(
        limit,
        selectedDate ?? undefined,
        !includeAuctionLimitUp,
        themeAlpha,
        peFilterEnabled,
        sortMode,
        dynamicThemeAlpha,
        rollingWindowDays,
      );
      const effectiveTradeDate = selectedDate ?? first.tradeDate ?? null;

      let result = first;
      const needCollect =
        !!effectiveTradeDate && (result.dataSource === 'none' || (result.items?.length ?? 0) === 0);

      if (needCollect) {
        message.loading({
          content: `${effectiveTradeDate} 数据未就绪，开始从 Tushare 采集...`,
          key: 'super_main_force_collect',
          duration: 0,
        });

        const { inserted } = await collectAuctionSnapshot(effectiveTradeDate);
        message.success({
          content: `采集完成（插入 ${inserted} 条），正在刷新...`,
          key: 'super_main_force_collect',
        });

        result = await fetchAuctionSuperMainForce(
          limit,
          effectiveTradeDate,
          !includeAuctionLimitUp,
          themeAlpha,
          peFilterEnabled,
          sortMode,
          dynamicThemeAlpha,
          rollingWindowDays,
        );
      }

      setData(result);
      if (result.tradeDate && result.tradeDate !== selectedDate) {
        setSelectedDate(result.tradeDate);
      }

      if ((result.items?.length ?? 0) > 0) {
        message.success('超强主力数据已刷新');
      } else if (effectiveTradeDate) {
        message.warning(`${effectiveTradeDate} 暂无可展示的集合竞价数据`);
      } else {
        message.warning('暂无可展示的集合竞价数据');
      }
    } catch (error) {
      console.error(error);
      message.error('获取超强主力数据失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [
    selectedDate,
    includeAuctionLimitUp,
    themeAlpha,
    peFilterEnabled,
    limit,
    sortMode,
    dynamicThemeAlpha,
    rollingWindowDays,
  ]);

  const forceRefresh = useCallback(async () => {
    const effectiveTradeDate = selectedDate ?? dayjs().format('YYYY-MM-DD');
    setLoading(true);
    try {
      message.loading({
        content: `${effectiveTradeDate} 强制重新采集中...`,
        key: 'super_main_force_force_collect',
        duration: 0,
      });
      const { inserted } = await collectAuctionSnapshot(effectiveTradeDate, undefined, true);
      message.success({
        content: `强制采集完成（插入 ${inserted} 条），正在刷新...`,
        key: 'super_main_force_force_collect',
      });

      const result = await fetchAuctionSuperMainForce(
        limit,
        effectiveTradeDate,
        !includeAuctionLimitUp,
        themeAlpha,
        peFilterEnabled,
        sortMode,
        dynamicThemeAlpha,
        rollingWindowDays,
      );
      setData(result);
      setSelectedDate(effectiveTradeDate);
      message.success('超强主力数据已刷新');
    } catch (error) {
      console.error(error);
      message.error('强制刷新失败');
    } finally {
      setLoading(false);
    }
  }, [
    selectedDate,
    includeAuctionLimitUp,
    themeAlpha,
    peFilterEnabled,
    limit,
    sortMode,
    dynamicThemeAlpha,
    rollingWindowDays,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDateChange = (date: Dayjs | null, dateString: string | string[]) => {
    if (!date) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(Array.isArray(dateString) ? (dateString[0] ?? '') : dateString);
  };

  const showAnalysisModal = useCallback((record: AuctionSuperMainForceItem) => {
    if (!record.stock) return;
    const tags: Array<{ label: string; color?: string }> = [];
    if (record.themeName) tags.push({ label: record.themeName, color: 'blue' });
    if (record.industry) tags.push({ label: record.industry, color: 'geekblue' });
    if (record.auctionLimitUp) tags.push({ label: '竞价涨停', color: 'gold' });
    if (record.likelyLimitUp) tags.push({ label: '冲板优选', color: 'red' });
    setCurrentStock({ code: record.stock, name: record.name ?? '', tags });
    setIsAnalysisModalVisible(true);
  }, []);

  const handleCloseAnalysisModal = useCallback(() => {
    setIsAnalysisModalVisible(false);
    setCurrentStock(null);
  }, []);

  const columns: ColumnsType<AuctionSuperMainForceItem> = [
    {
      title: '序号',
      dataIndex: 'rank',
      key: 'rank',
      width: 70,
    },
    {
      title: '股票',
      dataIndex: 'stock',
      key: 'stock',
      width: 150,
      render: (text: string, record: AuctionSuperMainForceItem) => (
        <Space direction="vertical" size={0}>
          <Typography.Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              showAnalysisModal(record);
            }}
            style={{ fontWeight: 'bold' }}
          >
            {text}
          </Typography.Link>
          <Typography.Text style={{ fontSize: 12, color: 'var(--sq-text-secondary)' }}>
            {record.name}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '竞价热度',
      dataIndex: 'heatScore',
      key: 'heatScore',
      width: 170,
      sorter: (a, b) => a.heatScore - b.heatScore,
      render: (val: number, record: AuctionSuperMainForceItem) => (
        <Space>
          <span>{val.toFixed(1)}</span>
          {record.auctionLimitUp && <Tag color="gold">竞价涨停</Tag>}
          {record.likelyLimitUp && <Tag color="red">冲板优选</Tag>}
          {!!record.themeEnhanceFactor && record.themeEnhanceFactor > 1.0001 && (
            <Tag color="blue">题材x{record.themeEnhanceFactor.toFixed(2)}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '冲板概率',
      dataIndex: 'likelyLimitUpProb',
      key: 'likelyLimitUpProb',
      width: 110,
      sorter: (a, b) => Number(a.likelyLimitUpProb || 0) - Number(b.likelyLimitUpProb || 0),
      render: (val?: number) => `${(Number(val || 0) * 100).toFixed(1)}%`,
    },
    {
      title: '竞价涨幅',
      dataIndex: 'gapPercent',
      key: 'gapPercent',
      width: 110,
      sorter: (a, b) => a.gapPercent - b.gapPercent,
      render: (val: number) => {
        const value = Number(val);
        if (!Number.isFinite(value)) {
          return <span className="sq-neutral sq-mono">-</span>;
        }
        const color = value > 0 ? A_SHARE_COLORS.RISE : value < 0 ? A_SHARE_COLORS.FALL : '#666';
        return (
          <span className="sq-mono" style={{ color }}>
            {value.toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: '当日盈亏',
      key: 'dailyProfit',
      width: 110,
      render: (_: unknown, record: AuctionSuperMainForceItem) => {
        const close = Number(record.close);
        const auctionPrice = Number(record.price);
        let v: number | undefined;
        if (Number.isFinite(close) && Number.isFinite(auctionPrice) && auctionPrice > 0) {
          // 当日盈亏口径：集合竞价成交价买入 -> 当日(或当前)价格
          v = ((close - auctionPrice) / auctionPrice) * 100;
        } else {
          const rawChangePercent = Number(record.changePercent);
          if (Number.isFinite(rawChangePercent)) {
            // 兼容旧数据：缺少 close 时使用昨收口径近似
            v = rawChangePercent - Number(record.gapPercent || 0);
          }
        }
        if (v === undefined || !Number.isFinite(v)) {
          return <span className="sq-neutral sq-mono">-</span>;
        }
        const pnlColor = v >= 0 ? A_SHARE_COLORS.RISE : A_SHARE_COLORS.FALL;
        return (
          <span className="sq-mono" style={{ color: pnlColor }}>
            {v >= 0 ? '+' : ''}
            {v.toFixed(2)}%
          </span>
        );
      },
    },
    {
      title: '量比',
      dataIndex: 'volumeRatio',
      key: 'volumeRatio',
      width: 90,
      sorter: (a, b) => a.volumeRatio - b.volumeRatio,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: '换手率',
      dataIndex: 'turnoverRate',
      key: 'turnoverRate',
      width: 100,
      sorter: (a, b) => a.turnoverRate - b.turnoverRate,
      render: (val: number) => `${val.toFixed(2)}%`,
    },
    {
      title: '竞价金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      sorter: (a, b) => a.amount - b.amount,
      render: (val: number) => `${(val / 1e8).toFixed(2)}亿`,
    },
    {
      title: '竞价均价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: '昨收',
      dataIndex: 'preClose',
      key: 'preClose',
      width: 100,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: '行业',
      dataIndex: 'industry',
      key: 'industry',
      width: 140,
      ellipsis: true,
    },
  ];

  const tableItems = useMemo(() => {
    const rawItems = data?.items || [];
    const stFiltered = rawItems.filter((item) => !(item.name || '').toUpperCase().includes('ST'));
    const ranked = [...stFiltered]
      .sort((a, b) => {
        const candidateOrder = Number(Boolean(b.likelyLimitUp)) - Number(Boolean(a.likelyLimitUp));
        if (candidateOrder !== 0) return candidateOrder;
        return Number(b.heatScore ?? 0) - Number(a.heatScore ?? 0);
      })
      .map((item, index) => ({ ...item, rank: index + 1 }));
    return showLowGapOnly ? ranked.filter((item) => Number(item.gapPercent ?? 0) < 5) : ranked;
  }, [data?.items, showLowGapOnly]);

  return (
    <div className="sq-figma-page">
      <FigmaPageHero
        icon={<ThunderboltOutlined style={{ fontSize: 18 }} />}
        title="超强主力"
        subTitle="集合竞价强势标的排行，辅助筛选更可能冲板的候选股票"
        badge={
          isSelectedDateDataComplete
            ? { text: '数据齐全: 量比已就绪', status: 'success' }
            : isNotCollected
              ? { text: '未采集: 量比可能偏低', status: 'error' }
              : isCollectedNoItems
                ? { text: '已采集且无候选', status: 'warning' }
                : undefined
        }
        actions={
          <>
            <Button
              icon={<SyncOutlined spin={loading} />}
              onClick={loadData}
              loading={loading}
              style={{ borderRadius: FigmaBorderRadius.lg }}
            >
              刷新
            </Button>
            <Button
              onClick={forceRefresh}
              disabled={loading}
              style={{ borderRadius: FigmaBorderRadius.lg }}
            >
              强制刷新
            </Button>
          </>
        }
      />

      <FigmaCard gradient purpleGlow style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <Space wrap size={[10, 10]}>
            <DatePicker
              value={selectedDate ? dayjs(selectedDate) : null}
              onChange={handleDateChange}
              allowClear
              format="YYYY-MM-DD"
              disabled={loading}
              style={{ borderRadius: FigmaBorderRadius.lg }}
            />

            <Space size={6}>
              <Typography.Text style={{ fontSize: 12, color: 'var(--sq-text-secondary)' }}>
                含竞价涨停
              </Typography.Text>
              <Switch size="small" checked={includeAuctionLimitUp} onChange={setIncludeAuctionLimitUp} disabled={loading} />
            </Space>

            <Space size={6}>
              <Typography.Text style={{ fontSize: 12, color: 'var(--sq-text-secondary)' }}>
                PE筛选
              </Typography.Text>
              <Switch size="small" checked={peFilterEnabled} onChange={setPeFilterEnabled} disabled={loading} />
            </Space>

            <Space size={6}>
              <Typography.Text style={{ fontSize: 12, color: 'var(--sq-text-secondary)' }}>
                α
              </Typography.Text>
              <InputNumber
                min={0}
                max={0.5}
                step={0.05}
                value={themeAlpha}
                onChange={(v) => setThemeAlpha(Number(v ?? 0))}
                disabled={loading}
                style={{ width: 96, borderRadius: FigmaBorderRadius.lg }}
              />
              <Tooltip title="启用滚动调参与动态市场识别后，接口会返回生效后的 α。">
                <QuestionCircleOutlined style={{ color: 'var(--sq-primary)' }} />
              </Tooltip>
            </Space>

            <Button
              type={showLowGapOnly ? 'primary' : 'default'}
              onClick={() => setShowLowGapOnly((v) => !v)}
              disabled={loading || !hasItems}
              style={{ borderRadius: FigmaBorderRadius.lg }}
            >
              {showLowGapOnly ? '显示全部' : '只看涨幅<5%'}
            </Button>
          </Space>
        </div>

        <Row gutter={24}>
          <Col xs={24} md={16}>
            <Typography.Paragraph style={{ marginBottom: 8, color: 'var(--sq-text-secondary)' }}>
              展示集合竞价阶段的强势标的排行，优先突出更可能冲板的候选股票。
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 0, fontSize: 13, color: 'var(--sq-text-tertiary)' }}>
              当前版本包含：冲板概率、滚动调参（近N日）、动态题材系数、候选优先排序。
            </Typography.Paragraph>
          </Col>
          <Col xs={24} md={8}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic title="候选标的数量" value={data?.summary.count || 0} suffix="只" />
              </Col>
              <Col span={12}>
                <Statistic
                  title="冲板优选"
                  value={data?.summary.limitUpCandidates || 0}
                  suffix="只"
                  valueStyle={{ color: 'var(--sq-neon-red-deep)' }}
                />
              </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={12}>
                <Statistic title="平均竞价热度" value={data?.summary.avgHeat || 0} precision={1} />
              </Col>
              <Col span={12}>
                <Statistic title="总竞价金额" value={(data?.summary.totalAmount || 0) / 1e8} precision={2} suffix="亿" />
              </Col>
            </Row>
            {(data?.summary?.marketRegime || data?.summary?.themeAlphaEffective !== undefined) && (
              <Typography.Paragraph
                style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: 'var(--sq-text-tertiary)' }}
              >
                {`市场状态: ${data?.summary?.marketRegime || 'unknown'} | α输入: ${(data?.summary?.themeAlphaInput ?? themeAlpha).toFixed(2)} | α生效: ${(data?.summary?.themeAlphaEffective ?? themeAlpha).toFixed(2)}`}
              </Typography.Paragraph>
            )}
          </Col>
        </Row>
      </FigmaCard>

      <FigmaCard>
        <Table
          loading={loading}
          columns={columns}
          dataSource={tableItems.slice(0, 20)}
          rowKey={(record) => `${record.stock}-${record.rank}`}
          pagination={false}
          scroll={{ x: 1400 }}
        />
      </FigmaCard>

      <TechnicalAnalysisModal
        open={isAnalysisModalVisible}
        onClose={handleCloseAnalysisModal}
        stockCode={currentStock?.code}
        stockName={currentStock?.name}
        analysisDate={selectedDate}
        tags={currentStock?.tags}
      />
    </div>
  );
};

export default SuperMainForce;

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Space, Statistic, Row, Col, Tag, Button, Typography, DatePicker, Switch, message, InputNumber, Tooltip } from 'antd';
import { ThunderboltOutlined, SyncOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import {
  collectAuctionSnapshot,
  fetchAuctionSuperMainForce,
  type AuctionSuperMainForceItem,
  type AuctionSuperMainForceData
} from '../services/analysisService';
import dayjs, { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import TechnicalAnalysisModal from '../components/TechnicalAnalysisModal';

const SuperMainForce: React.FC = () => {
  const [data, setData] = useState<AuctionSuperMainForceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(dayjs().format('YYYY-MM-DD'));
  const [includeAuctionLimitUp, setIncludeAuctionLimitUp] = useState(false);
  const [themeAlpha, setThemeAlpha] = useState<number>(0.25);
  const [peFilterEnabled, setPeFilterEnabled] = useState<boolean>(false);
  const [showLowGapOnly, setShowLowGapOnly] = useState(false);
  const [currentStock, setCurrentStock] = useState<{
    code: string;
    name: string;
    tags: Array<{ label: string; color?: string }>;
  } | null>(null);
  const [isAnalysisModalVisible, setIsAnalysisModalVisible] = useState(false);
  const limit = 20;
  const hasSelectedDate = !!selectedDate;
  const hasSnapshot = (data?.dataSource && data.dataSource !== 'none') || false;
  const hasItems = (data?.items?.length ?? 0) > 0;
  const isSelectedDateDataComplete = hasSelectedDate && hasSnapshot && hasItems;
  const isNotCollected = hasSelectedDate && !hasSnapshot;
  const isCollectedNoItems = hasSelectedDate && hasSnapshot && !hasItems;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const first = await fetchAuctionSuperMainForce(limit, selectedDate ?? undefined, !includeAuctionLimitUp, themeAlpha, peFilterEnabled);
      const effectiveTradeDate = selectedDate ?? first.tradeDate ?? null;

      let result = first;
      const needCollect =
        !!effectiveTradeDate &&
        (result.dataSource === 'none' || (result.items?.length ?? 0) === 0);

      if (needCollect) {
        message.loading({
          content: `${effectiveTradeDate} 数据未准备好，开始从 Tushare 采集...`,
          key: 'super_mainforce_collect',
          duration: 0
        });

        const { inserted } = await collectAuctionSnapshot(effectiveTradeDate);

        message.success({
          content: `采集完成（插入 ${inserted} 条），正在刷新...`,
          key: 'super_mainforce_collect'
        });

        result = await fetchAuctionSuperMainForce(limit, effectiveTradeDate, !includeAuctionLimitUp, themeAlpha, peFilterEnabled);
      }

      setData(result);
      if (result.tradeDate && result.tradeDate !== selectedDate) {
        setSelectedDate(result.tradeDate);
      }

      if ((result.items?.length ?? 0) > 0) {
        message.success('集合竞价超强主力数据已刷新');
      } else if (effectiveTradeDate) {
        message.warning(`${effectiveTradeDate} 暂无可展示的集合竞价数据`);
      } else {
        message.warning('暂无可展示的集合竞价数据');
      }
    } catch (error) {
      console.error(error);
      message.error('获取集合竞价超强主力数据失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, includeAuctionLimitUp, themeAlpha, peFilterEnabled, limit]);

  const forceRefresh = useCallback(async () => {
    const effectiveTradeDate = selectedDate ?? dayjs().format('YYYY-MM-DD');
    setLoading(true);
    try {
      message.loading({
        content: `${effectiveTradeDate} 强制从 Tushare 重新采集...`,
        key: 'super_mainforce_force_collect',
        duration: 0
      });

      const { inserted } = await collectAuctionSnapshot(effectiveTradeDate, undefined, true);

      message.success({
        content: `强制采集完成（插入 ${inserted} 条），正在刷新...`,
        key: 'super_mainforce_force_collect'
      });

      const result = await fetchAuctionSuperMainForce(limit, effectiveTradeDate, !includeAuctionLimitUp, themeAlpha, peFilterEnabled);
      setData(result);
      setSelectedDate(effectiveTradeDate);

      if ((result.items?.length ?? 0) > 0) {
        message.success('集合竞价超强主力数据已刷新');
      } else {
        message.warning(`${effectiveTradeDate} 暂无可展示的集合竞价数据`);
      }
    } catch (error) {
      console.error(error);
      message.error('强制刷新失败');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, includeAuctionLimitUp, themeAlpha, peFilterEnabled, limit]);

  const handleDateChange = (date: Dayjs | null, dateString: string) => {
    if (date) {
      setSelectedDate(dateString);
    } else {
      setSelectedDate(null);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showAnalysisModal = useCallback(async (record: AuctionSuperMainForceItem) => {
    const stockCode = record.stock;
    const stockName = record.name ?? '';
    if (!stockCode) return;

    const tags: Array<{ label: string; color?: string }> = [];
    if (record.themeName) tags.push({ label: record.themeName, color: 'blue' });
    if (record.industry) tags.push({ label: record.industry, color: 'geekblue' });
    if (record.auctionLimitUp) tags.push({ label: '竞价涨停', color: 'gold' });
    if (record.likelyLimitUp) tags.push({ label: '冲板优选', color: 'red' });

    setCurrentStock({ code: stockCode, name: stockName, tags });
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
      width: 70
    },
    {
      title: '股票',
      dataIndex: 'stock',
      key: 'stock',
      width: 130,
      render: (text: string, record: AuctionSuperMainForceItem) => {
        const industryText = record.industry ?? '';
        const industryToken = industryText ? industryText.replace(/(开发|制造|服务)$/g, '') : '';
        const shouldFallbackToIndustry =
          !!record.themeName && !!industryToken && !record.themeName.includes(industryToken);
        const displayThemeOrIndustry = shouldFallbackToIndustry
          ? industryText
          : (record.themeName || industryText);

        return (
          <Space direction="vertical" size={0}>
            <Typography.Link
              href="#"
              style={{ fontWeight: 'bold' }}
              onClick={(e) => {
                e.preventDefault();
                showAnalysisModal(record);
              }}
            >
              {text}
            </Typography.Link>
            <Typography.Link
              href="#"
              style={{ fontSize: 12, color: 'var(--sq-text-secondary)' }}
              onClick={(e) => {
                e.preventDefault();
                showAnalysisModal(record);
              }}
            >
              {record.name}
            </Typography.Link>
            {displayThemeOrIndustry ? (
              <span style={{ fontSize: 12, color: 'var(--sq-text-tertiary)' }}>{displayThemeOrIndustry}</span>
            ) : null}
            {industryText && industryText !== displayThemeOrIndustry ? (
              <span style={{ fontSize: 12, color: 'var(--sq-text-secondary)' }}>{industryText}</span>
            ) : null}
          </Space>
        );
      }
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
            <Tag color="blue">题材×{record.themeEnhanceFactor.toFixed(2)}</Tag>
          )}
        </Space>
      )
    },
    {
      title: '竞价涨幅',
      dataIndex: 'gapPercent',
      key: 'gapPercent',
      width: 110,
      sorter: (a, b) => a.gapPercent - b.gapPercent,
      render: (val: number) => {
        return <span className={`${val >= 0 ? 'sq-rise' : 'sq-fall'} sq-mono`}>{val.toFixed(2)}%</span>;
      }
    },
    {
      title: '当日盈亏',
      key: 'dailyProfit',
      width: 110,
      render: (_: unknown, record: AuctionSuperMainForceItem) => {
        const day = Number(record.changePercent || 0);
        const gap = Number(record.gapPercent || 0);
        const v = day - gap;
        return <span className={`${v >= 0 ? 'sq-rise' : 'sq-fall'} sq-mono`}>{v.toFixed(2)}%</span>;
      }
    },
    {
      title: '量比',
      dataIndex: 'volumeRatio',
      key: 'volumeRatio',
      width: 100,
      sorter: (a, b) => a.volumeRatio - b.volumeRatio,
      render: (val: number) => val.toFixed(2)
    },
    {
      title: '换手率',
      dataIndex: 'turnoverRate',
      key: 'turnoverRate',
      width: 110,
      sorter: (a, b) => a.turnoverRate - b.turnoverRate,
      render: (val: number) => `${val.toFixed(2)}%`
    },
    {
      title: '竞价金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 130,
      sorter: (a, b) => a.amount - b.amount,
      render: (val: number) => `${(val / 1e8).toFixed(2)}亿`
    },
    {
      title: '竞价均价',
      dataIndex: 'price',
      key: 'price',
      width: 110,
      render: (val: number) => val.toFixed(2)
    },
    {
      title: '昨收',
      dataIndex: 'preClose',
      key: 'preClose',
      width: 110,
      render: (val: number) => val.toFixed(2)
    },
    {
      title: '行业',
      dataIndex: 'industry',
      key: 'industry',
      width: 150,
      ellipsis: true
    }
  ];

  const rawItems = data?.items || [];
  const items = rawItems.filter((item) => {
    const name = (item.name || '').toUpperCase();
    return !name.includes('ST');
  });
  const tableItems = showLowGapOnly
    ? items.filter((item) => Number(item.gapPercent ?? 0) < 5)
    : items;

  return (
    <div style={{ padding: 24 }}>
      <Card
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <ThunderboltOutlined />
            <span style={{ fontSize: 16, fontWeight: 'bold' }}>超强主力·竞价打板</span>
          </Space>
        }
        extra={
          <Space>
            <DatePicker
              size="small"
              value={selectedDate ? dayjs(selectedDate) : null}
              onChange={(date, dateString) =>
                handleDateChange(
                  date as Dayjs | null,
                  Array.isArray(dateString) ? (dateString[0] ?? '') : dateString
                )
              }
              allowClear
              format="YYYY-MM-DD"
              disabled={loading}
            />
            {isSelectedDateDataComplete ? (
              <Space size={6}>
                <Tag color="green">数据齐全：量比已就绪</Tag>
                <Tooltip title="量比来源于 daily_basic.volume_ratio。该口径在集合竞价阶段通常已就绪，可直接参考。">
                  <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                </Tooltip>
              </Space>
            ) : isNotCollected ? (
              <Space size={6}>
                <Tag color="red">未采集：量比可能偏低（daily_basic 未就绪）</Tag>
                <Tooltip title="集合竞价阶段 daily_basic.volume_ratio 可能未就绪，建议点击“刷新”采集或使用“强制刷新”。如仍偏低，可参考“竞价量比”。">
                  <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                </Tooltip>
              </Space>
            ) : isCollectedNoItems ? (
              <Space size={6}>
                <Tag color="orange">已采集且无候选：量比可能不稳定</Tag>
                <Tooltip title="早盘集合竞价数据不完全会导致量比偏低。可尝试“强制刷新”或稍后再试，并结合竞价量比进行判断。">
                  <QuestionCircleOutlined style={{ color: '#1890ff' }} />
                </Tooltip>
              </Space>
            ) : null}
            <Space size={4}>
              <span style={{ fontSize: 12, color: '#aaa' }}>含竞价涨停</span>
              <Switch
                size="small"
                checked={includeAuctionLimitUp}
                onChange={setIncludeAuctionLimitUp}
                disabled={loading}
              />
            </Space>
            <Space size={4}>
              <span style={{ fontSize: 12, color: '#aaa' }}>PE筛选</span>
              <Switch
                size="small"
                checked={peFilterEnabled}
                onChange={setPeFilterEnabled}
                disabled={loading}
              />
            </Space>
            <Space size={4}>
              <span style={{ fontSize: 12, color: '#aaa' }}>α</span>
              <InputNumber
                size="small"
                min={0}
                max={0.5}
                step={0.05}
                value={themeAlpha}
                onChange={(v) => setThemeAlpha(Number(v ?? 0))}
                disabled={loading}
                style={{ width: 86 }}
              />
            </Space>
            <Button
              size="small"
              type={showLowGapOnly ? 'primary' : 'default'}
              onClick={() => setShowLowGapOnly((v) => !v)}
              disabled={loading || !hasItems}
            >
              {showLowGapOnly ? '显示全部' : '只看涨幅<5%'}
            </Button>
            <Button icon={<SyncOutlined spin={loading} />} onClick={loadData} loading={loading} size="small">
              刷新
            </Button>
            <Button onClick={forceRefresh} disabled={loading} size="small">
              强制刷新
            </Button>
          </Space>
        }
      >
        <Row gutter={24}>
          <Col xs={24} md={16}>
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              本页功能说明：展示集合竞价阶段的强势标的排行，辅助筛选更可能“冲板”的候选股票。支持选择交易日、设置是否包含竞价涨停，并可调整题材增强系数 α 来放大/减弱题材热度对评分的影响。
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 0, fontSize: 13, color: '#aaa' }}>
              操作说明：点击“刷新”获取数据；当数据缺失时会自动触发采集；点击“强制刷新”会重新采集并刷新当前日期数据。
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 0, fontSize: 13, color: '#aaa' }}>
              标记说明：“竞价涨停”表示集合竞价已触及涨停；“冲板优选”为更可能触及涨停的候选提示；“题材×系数”表示题材热度对评分的增强倍数。
            </Typography.Paragraph>
          </Col>
          <Col xs={24} md={8}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="候选标的数量"
                  value={data?.summary.count || 0}
                  suffix="只"
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="冲板优选"
                  value={data?.summary.limitUpCandidates || 0}
                  suffix="只"
                  valueStyle={{ color: '#cf1322' }}
                />
              </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={12}>
                <Statistic
                  title="平均竞价热度"
                  value={data?.summary.avgHeat || 0}
                  precision={1}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="总竞价金额"
                  value={(data?.summary.totalAmount || 0) / 1e8}
                  precision={2}
                  suffix="亿"
                />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          loading={loading}
          columns={columns}
          dataSource={tableItems.slice(0, 20)}
          rowKey={(record) => `${record.stock}-${record.rank}`}
          pagination={false}
          scroll={{ x: 1300 }}
        />
      </Card>

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

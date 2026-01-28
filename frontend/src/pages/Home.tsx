import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Progress, Row, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import { BarChartOutlined, CalculatorOutlined, RightOutlined, SyncOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import {
  collectAuctionSnapshot,
  fetchAuctionSuperMainForce,
  fetchPreviousTradeDate,
  type AuctionSuperMainForceItem,
  type AuctionSuperMainForceData
} from '../services/analysisService';
import { fetchSelectionStrategies, type SelectionStrategy } from '../services/smartSelectionService';

type MonthlyLimitUpRecord = {
  tradeDate: string;
  stock: string;
  name: string;
  heatScore: number;
  gapPercent: number;
  changePercent: number;
  profitPercent: number;
};

type MonthlySuperMainForceStats = {
  fromDate: string;
  toDate: string;
  requestedDays: number;
  coveredDays: number;
  totalSelected: number;
  totalCloseLimitUp: number;
  closeLimitUpRate: number;
  records: MonthlyLimitUpRecord[];
};

const buildRecentWeekdays = (days: number) => {
  const dates: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = dayjs().subtract(i, 'day');
    const weekday = d.day();
    if (weekday === 0 || weekday === 6) continue;
    dates.push(d.format('YYYY-MM-DD'));
  }
  return dates;
};

const fallbackPreviousWeekday = (baseDate: string) => {
  let d = dayjs(baseDate).subtract(1, 'day');
  for (let i = 0; i < 60; i += 1) {
    const weekday = d.day();
    if (weekday !== 0 && weekday !== 6) return d.format('YYYY-MM-DD');
    d = d.subtract(1, 'day');
  }
  return dayjs(baseDate).subtract(1, 'day').format('YYYY-MM-DD');
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= items.length) return;
      results[idx] = await mapper(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

const buildMockEquitySeries = (days: number) => {
  const dates: string[] = [];
  const portfolio: number[] = [];
  const hs300: number[] = [];

  let p = 1;
  let h = 1;

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
    dates.push(d);

    const t = days - 1 - i;
    const pDaily = 0.0014 + Math.sin(t / 6) * 0.001 + Math.sin(t / 17) * 0.0006;
    const hDaily = 0.0006 + Math.sin(t / 9) * 0.0007 + Math.sin(t / 23) * 0.0004;

    p *= 1 + pDaily;
    h *= 1 + hDaily;

    portfolio.push(Number(p.toFixed(4)));
    hs300.push(Number(h.toFixed(4)));
  }

  return { dates, portfolio, hs300 };
};

const Home: React.FC = () => {
  const navigate = useNavigate();

  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [sample, setSample] = useState<AuctionSuperMainForceData | null>(null);
  const [sampleRefreshKey, setSampleRefreshKey] = useState(0);

  const [monthLoading, setMonthLoading] = useState(false);
  const [monthProgress, setMonthProgress] = useState({ total: 0, done: 0 });
  const [monthError, setMonthError] = useState<string | null>(null);
  const [monthStats, setMonthStats] = useState<MonthlySuperMainForceStats | null>(null);

  const [strategiesLoading, setStrategiesLoading] = useState(false);
  const [strategiesError, setStrategiesError] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<SelectionStrategy[]>([]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setSampleLoading(true);
      setSampleError(null);
      try {
        const baseDate = dayjs().format('YYYY-MM-DD');
        let targetTradeDate = baseDate;
        try {
          targetTradeDate = await fetchPreviousTradeDate(baseDate);
        } catch {
          targetTradeDate = fallbackPreviousWeekday(baseDate);
        }

        const first = await fetchAuctionSuperMainForce(10, targetTradeDate, true, 0.25, false);
        if (cancelled) return;
        const effectiveTradeDate = first.tradeDate ?? targetTradeDate;
        const needCollect =
          !first.tradeDate || first.dataSource === 'none' || (first.items?.length ?? 0) === 0;

        let data = first;
        if (needCollect) {
          message.loading({
            content: `${effectiveTradeDate} 数据未准备好，开始从 Tushare 采集...`,
            key: 'home_super_mainforce_collect',
            duration: 0
          });

          const { inserted } = await collectAuctionSnapshot(effectiveTradeDate);
          if (cancelled) return;

          message.success({
            content: `采集完成（插入 ${inserted} 条），正在刷新...`,
            key: 'home_super_mainforce_collect'
          });

          data = await fetchAuctionSuperMainForce(10, effectiveTradeDate, true, 0.25, false);
        }

        if (cancelled) return;
        setSample(data);
      } catch (e) {
        if (cancelled) return;
        setSampleError(e instanceof Error ? e.message : '加载超强主力样例失败');
        setSample(null);
      } finally {
        if (!cancelled) setSampleLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [sampleRefreshKey]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setMonthLoading(true);
      setMonthError(null);

      const dates = buildRecentWeekdays(45).slice(0, 22);
      setMonthProgress({ total: dates.length, done: 0 });

      try {
        const results = await mapWithConcurrency(
          dates,
          3,
          async (tradeDate) => {
            const data = await fetchAuctionSuperMainForce(20, tradeDate, false, 0.25);
            if (!cancelled) {
              setMonthProgress((p) => ({ total: p.total, done: Math.min(p.total, p.done + 1) }));
            }
            return data;
          }
        );

        if (cancelled) return;

        const valid = results.filter((r) => (r.items?.length ?? 0) > 0 && !!r.tradeDate);
        const fromDate = valid.length ? valid[valid.length - 1].tradeDate! : dates[dates.length - 1];
        const toDate = valid.length ? valid[0].tradeDate! : dates[0];

        let totalSelected = 0;
        let totalCloseLimitUp = 0;
        const records: MonthlyLimitUpRecord[] = [];

        for (const day of valid) {
          const items = day.items || [];
          totalSelected += items.length;
          for (const item of items) {
            const gap = Number(item.gapPercent || 0);
            const dayChange = Number(item.changePercent || 0);
            const profitPercent = dayChange - gap;

            if (item.auctionLimitUp) continue;

            let limitPct = 10;
            if (
              item.stock.startsWith('300') ||
              item.stock.startsWith('301') ||
              item.stock.startsWith('688') ||
              item.stock.startsWith('689')
            ) {
              limitPct = 20;
            } else if (item.stock.startsWith('8') || item.stock.startsWith('4')) {
              limitPct = 30;
            }

            const isCloseLimitUp = dayChange >= limitPct - 0.2;
            if (!isCloseLimitUp) continue;

            totalCloseLimitUp += 1;
            records.push({
              tradeDate: day.tradeDate || '',
              stock: item.stock,
              name: item.name,
              heatScore: item.heatScore,
              gapPercent: gap,
              changePercent: dayChange,
              profitPercent,
            });
          }
        }

        records.sort((a, b) => {
          if (a.profitPercent !== b.profitPercent) return b.profitPercent - a.profitPercent;
          if (a.tradeDate !== b.tradeDate) return b.tradeDate.localeCompare(a.tradeDate);
          return b.heatScore - a.heatScore;
        });

        const closeLimitUpRate = totalSelected > 0 ? (totalCloseLimitUp / totalSelected) * 100 : 0;

        setMonthStats({
          fromDate,
          toDate,
          requestedDays: dates.length,
          coveredDays: valid.length,
          totalSelected,
          totalCloseLimitUp,
          closeLimitUpRate,
          records,
        });
      } catch (e) {
        if (cancelled) return;
        setMonthError(e instanceof Error ? e.message : '加载近月统计失败');
        setMonthStats(null);
      } finally {
        if (!cancelled) setMonthLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fallback: SelectionStrategy[] = [
      {
        id: 1001,
        strategy_name: '动量突破',
        description: '侧重技术动量，捕捉强势突破股票',
        technical_weight: 0.35,
        fundamental_weight: 0.30,
        capital_weight: 0.25,
        market_weight: 0.10,
        is_active: true,
        algorithm_type: 'advanced',
        min_score: 50,
        max_results: 15,
        require_uptrend: true,
        require_hot_sector: true,
      },
      {
        id: 1002,
        strategy_name: '趋势跟随',
        description: '以趋势质量为核心，过滤震荡与弱势标的',
        technical_weight: 0.30,
        fundamental_weight: 0.20,
        capital_weight: 0.25,
        market_weight: 0.25,
        is_active: true,
        algorithm_type: 'advanced',
        min_score: 55,
        max_results: 20,
        require_uptrend: true,
        require_hot_sector: false,
      },
      {
        id: 1003,
        strategy_name: '价值成长',
        description: '基本面与趋势并重，偏中线持有',
        technical_weight: 0.20,
        fundamental_weight: 0.50,
        capital_weight: 0.15,
        market_weight: 0.15,
        is_active: true,
        algorithm_type: 'basic',
        min_score: 60,
        max_results: 20,
      },
      {
        id: 1004,
        strategy_name: '底部掘金',
        description: '偏反转，关注估值与量能拐点',
        technical_weight: 0.25,
        fundamental_weight: 0.35,
        capital_weight: 0.25,
        market_weight: 0.15,
        is_active: true,
        algorithm_type: 'basic',
        min_score: 58,
        max_results: 25,
      },
    ];

    const run = async () => {
      setStrategiesLoading(true);
      setStrategiesError(null);
      try {
        const res = await fetchSelectionStrategies();
        if (cancelled) return;
        const list = (res.strategies || []).filter((s) => s.is_active).slice(0, 6);
        setStrategies(list.length ? list : fallback);
      } catch (e) {
        if (cancelled) return;
        setStrategiesError(e instanceof Error ? e.message : '加载策略失败');
        setStrategies(fallback);
      } finally {
        if (!cancelled) setStrategiesLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const sampleColumns = useMemo(() => {
    const cols: ColumnsType<AuctionSuperMainForceItem> = [
      { title: '排名', dataIndex: 'rank', key: 'rank', width: 70 },
      {
        title: '股票',
        dataIndex: 'stock',
        key: 'stock',
        width: 140,
        render: (text: string, record: AuctionSuperMainForceItem) => (
          <Space direction="vertical" size={0}>
            <span style={{ fontWeight: 600 }}>{text}</span>
            <span style={{ fontSize: 12, color: '#aaa' }}>{record.name}</span>
          </Space>
        ),
      },
      {
        title: '竞价热度',
        dataIndex: 'heatScore',
        key: 'heatScore',
        width: 180,
        render: (val: number, record: AuctionSuperMainForceItem) => (
          <Space size={8}>
            <span>{Number(val || 0).toFixed(1)}</span>
            {record.auctionLimitUp ? <Tag color="gold">竞价涨停</Tag> : null}
            {record.likelyLimitUp ? <Tag color="red">冲板优选</Tag> : null}
          </Space>
        ),
      },
      {
        title: '竞价涨幅',
        dataIndex: 'gapPercent',
        key: 'gapPercent',
        width: 110,
        render: (val: number) => {
          const v = Number(val || 0);
          return <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600' }}>{v.toFixed(2)}%</span>;
        },
      },
      {
        title: '收盘涨幅',
        dataIndex: 'changePercent',
        key: 'closeChangePercent',
        width: 110,
        render: (val: number | undefined) => {
          const v = Number(val || 0);
          const color = v >= 0 ? '#cf1322' : '#3f8600';
          return <span style={{ color }}>{v.toFixed(2)}%</span>;
        },
      },
      {
        title: '当日盈亏',
        key: 'dailyProfit',
        width: 110,
        render: (_: any, record: AuctionSuperMainForceItem) => {
          const day = Number(record.changePercent || 0);
          const gap = Number(record.gapPercent || 0);
          const v = day - gap;
          const color = v >= 0 ? '#cf1322' : '#3f8600';
          return <span style={{ color }}>{v.toFixed(2)}%</span>;
        },
      },
      {
        title: '行业',
        dataIndex: 'industry',
        key: 'industry',
        ellipsis: true,
      },
    ];
    return cols;
  }, []);

  const monthColumns = useMemo(() => {
    const cols: ColumnsType<MonthlyLimitUpRecord> = [
      { title: '日期', dataIndex: 'tradeDate', key: 'tradeDate', width: 110 },
      {
        title: '股票',
        dataIndex: 'stock',
        key: 'stock',
        width: 130,
        render: (_: string, record: MonthlyLimitUpRecord) => (
          <Space direction="vertical" size={0}>
            <span style={{ fontWeight: 600 }}>{record.stock}</span>
            <span style={{ fontSize: 12, color: '#aaa' }}>{record.name}</span>
          </Space>
        ),
      },
      {
        title: '竞价涨幅',
        dataIndex: 'gapPercent',
        key: 'gapPercent',
        width: 110,
        render: (val: number) => {
          const v = Number(val || 0);
          return <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600' }}>{v.toFixed(2)}%</span>;
        },
      },
      {
        title: '收盘涨幅',
        dataIndex: 'changePercent',
        key: 'changePercent',
        width: 110,
        render: (val: number) => {
          const v = Number(val || 0);
          return <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600' }}>{v.toFixed(2)}%</span>;
        },
      },
      {
        title: '当日盈亏',
        dataIndex: 'profitPercent',
        key: 'profitPercent',
        width: 110,
        render: (val: number) => {
          const v = Number(val || 0);
          return <span style={{ color: v >= 0 ? '#cf1322' : '#3f8600' }}>{v.toFixed(2)}%</span>;
        },
      },
    ];
    return cols;
  }, []);

  const chart = useMemo(() => buildMockEquitySeries(60), []);
  const chartOption = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['组合净值(示例)', '沪深300(示例)'],
        textStyle: { color: '#d9d9d9' },
      },
      grid: { left: 40, right: 16, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: chart.dates,
        axisLabel: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#303030' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#aaa' },
        splitLine: { lineStyle: { color: '#1f1f1f' } },
      },
      series: [
        {
          name: '组合净值(示例)',
          type: 'line',
          showSymbol: false,
          smooth: true,
          data: chart.portfolio,
          lineStyle: { width: 2, color: '#1890ff' },
        },
        {
          name: '沪深300(示例)',
          type: 'line',
          showSymbol: false,
          smooth: true,
          data: chart.hs300,
          lineStyle: { width: 2, color: '#52c41a' },
        },
      ],
    };
  }, [chart]);

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]}>
        {/* 顶部大横幅：AI智能选股引擎介绍 */}
        <Col span={24}>
          <Card
            style={{ 
              background: 'linear-gradient(135deg, #1890ff 0%, #722ed1 100%)',
              border: 'none'
            }}
            styles={{ body: { padding: '32px' } }}
          >
            <Row gutter={[32, 16]} align="middle">
              <Col xs={24} md={14}>
                <Space direction="vertical" size={8}>
                  <Space>
                    <ThunderboltOutlined style={{ fontSize: 28, color: '#fff' }} />
                    <Typography.Title level={2} style={{ margin: 0, color: '#fff' }}>
                      AI智能选股引擎
                    </Typography.Title>
                  </Space>
                  <Typography.Paragraph style={{ marginBottom: 16, color: 'rgba(255,255,255,0.9)', fontSize: 16 }}>
                    以竞价热度、题材强度、资金行为与多因子评分为核心，提供"超强主力"与"精算智选"两条主线，
                    帮你在开盘前更快锁定候选标的，并通过策略回测与收益曲线对比做决策校验。
                  </Typography.Paragraph>
                  <Space wrap>
                    <Button 
                      type="primary" 
                      size="large"
                      icon={<ThunderboltOutlined />} 
                      onClick={() => navigate('/super-main-force')}
                      style={{ background: '#fff', color: '#1890ff', borderColor: '#fff' }}
                    >
                      超强主力
                    </Button>
                    <Button 
                      size="large"
                      icon={<CalculatorOutlined />} 
                      onClick={() => navigate('/smart-selection')}
                      style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}
                    >
                      精算智选
                    </Button>
                    <Button 
                      type="link" 
                      icon={<RightOutlined />} 
                      onClick={() => navigate('/stocks')}
                      style={{ color: '#fff' }}
                    >
                      浏览股票
                    </Button>
                  </Space>
                </Space>
              </Col>
              <Col xs={24} md={10}>
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Statistic 
                      title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>近月入选</span>} 
                      value={monthStats?.totalSelected || 0} 
                      suffix="只"
                      valueStyle={{ color: '#fff', fontSize: 28 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic 
                      title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>收盘涨停</span>} 
                      value={monthStats?.totalCloseLimitUp || 0} 
                      suffix="只"
                      valueStyle={{ color: '#faad14', fontSize: 28 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic 
                      title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>涨停率</span>} 
                      value={monthStats?.closeLimitUpRate || 0} 
                      precision={1}
                      suffix="%"
                      valueStyle={{ color: '#52c41a', fontSize: 28 }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic 
                      title={<span style={{ color: 'rgba(255,255,255,0.8)' }}>策略数量</span>} 
                      value={strategies?.length || 0} 
                      suffix="个"
                      valueStyle={{ color: '#fff', fontSize: 28 }}
                    />
                  </Col>
                </Row>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 市场概览区域 */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <BarChartOutlined style={{ color: '#1890ff' }} />
                <span>实时市场概览</span>
              </Space>
            }
          >
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic 
                      title="上证指数" 
                      value={3145.68} 
                      precision={2}
                      valueStyle={{ color: '#cf1322', fontSize: 20 }}
                      suffix={
                        <span style={{ fontSize: 12, color: '#cf1322', marginLeft: 4 }}>
                          +0.45%
                        </span>
                      }
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic 
                      title="深证成指" 
                      value={9852.32} 
                      precision={2}
                      valueStyle={{ color: '#3f8600', fontSize: 20 }}
                      suffix={
                        <span style={{ fontSize: 12, color: '#3f8600', marginLeft: 4 }}>
                          -0.32%
                        </span>
                      }
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic 
                      title="创业板指" 
                      value={1967.85} 
                      precision={2}
                      valueStyle={{ color: '#cf1322', fontSize: 20 }}
                      suffix={
                        <span style={{ fontSize: 12, color: '#cf1322', marginLeft: 4 }}>
                          +0.68%
                        </span>
                      }
                    />
                  </Col>
                </Row>
              </Col>
              <Col span={24}>
                <div style={{ marginTop: 16 }}>
                  <Typography.Text strong style={{ marginBottom: 8, display: 'block' }}>热门板块</Typography.Text>
                  <Space wrap>
                    <Tag color="#f50" style={{ marginBottom: 8 }}>人工智能 +2.5%</Tag>
                    <Tag color="#2db7f5" style={{ marginBottom: 8 }}>新能源 +1.8%</Tag>
                    <Tag color="#87d068" style={{ marginBottom: 8 }}>半导体 +1.5%</Tag>
                    <Tag color="#108ee9" style={{ marginBottom: 8 }}>军工 +1.2%</Tag>
                    <Tag color="#f50" style={{ marginBottom: 8 }}>券商 +0.9%</Tag>
                  </Space>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 核心功能区域 */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <CalculatorOutlined style={{ color: '#722ed1' }} />
                <span>核心功能</span>
              </Space>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12}>
                <Card size="small" bordered={false} style={{ background: 'rgba(24, 144, 255, 0.05)' }}>
                  <Space>
                    <ThunderboltOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                    <div>
                      <Typography.Text strong>超强主力</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        集合竞价阶段快速锁定强势标的
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12}>
                <Card size="small" bordered={false} style={{ background: 'rgba(114, 46, 209, 0.05)' }}>
                  <Space>
                    <CalculatorOutlined style={{ fontSize: 24, color: '#722ed1' }} />
                    <div>
                      <Typography.Text strong>精算智选</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        多因子模型精挑细选
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12}>
                <Card size="small" bordered={false} style={{ background: 'rgba(82, 196, 26, 0.05)' }}>
                  <Space>
                    <BarChartOutlined style={{ fontSize: 24, color: '#52c41a' }} />
                    <div>
                      <Typography.Text strong>策略回测</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        验证策略有效性
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12}>
                <Card size="small" bordered={false} style={{ background: 'rgba(250, 173, 20, 0.05)' }}>
                  <Space>
                    <RightOutlined style={{ fontSize: 24, color: '#faad14' }} />
                    <div>
                      <Typography.Text strong>实时监控</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        把握每一个交易机会
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 超强主力样例 */}
        <Col span={24}>
          <Row gutter={[16, 16]} align="stretch">
            <Col xs={24} lg={14}>
              <Card
                style={{ height: '100%' }}
                title={
                  <Space>
                    <ThunderboltOutlined style={{ color: '#faad14' }} />
                    <span>超强主力样例</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>
                      {sample?.tradeDate ? `（${sample.tradeDate}）` : ''}
                    </span>
                  </Space>
                }
                extra={
                  <Space>
                    <Button size="small" onClick={() => navigate('/super-main-force')}>
                      查看全部
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      icon={<SyncOutlined />}
                      onClick={() => setSampleRefreshKey((v) => v + 1)}
                    >
                      刷新数据
                    </Button>
                  </Space>
                }
                styles={{ body: { padding: 0 } }}
              >
                {sampleError ? <Alert type="error" message={sampleError} /> : null}
                <Table
                  loading={sampleLoading}
                  columns={sampleColumns}
                  dataSource={(sample?.items || []).slice(0, 8)}
                  rowKey={(r: AuctionSuperMainForceItem) => `${r.stock}-${r.rank}`}
                  pagination={false}
                  size="small"
                />
              </Card>
            </Col>

            <Col xs={24} lg={10}>
              <Card
                style={{ height: '100%' }}
                title={
                  <Space>
                    <BarChartOutlined style={{ color: '#52c41a' }} />
                    <span>近月涨停表现</span>
                  </Space>
                }
                extra={
                  <Button size="small" onClick={() => navigate('/super-main-force')}>
                    去验证
                  </Button>
                }
              >
                {monthError ? <Alert type="error" message={monthError} /> : null}
                {monthLoading ? (
                  <div>
                    <div style={{ marginBottom: 8, color: '#aaa', fontSize: 12 }}>
                      正在汇总近月数据：{monthProgress.done}/{monthProgress.total}
                    </div>
                    <Progress percent={monthProgress.total ? (monthProgress.done / monthProgress.total) * 100 : 0} />
                  </div>
                ) : null}

                <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
                  <Col span={12}>
                    <Statistic title="统计区间" value={monthStats ? `${monthStats.fromDate} ~ ${monthStats.toDate}` : '-'} valueStyle={{ fontSize: 12 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic 
                      title="收盘涨停率" 
                      value={monthStats?.closeLimitUpRate || 0} 
                      precision={1} 
                      suffix="%"
                      valueStyle={{ color: '#52c41a', fontSize: 20 }}
                    />
                  </Col>
                </Row>

                <div style={{ marginTop: 12 }}>
                  {!monthLoading && !monthError && monthStats && monthStats.coveredDays < monthStats.requestedDays ? (
                    <Alert
                      type="warning"
                      message={`近月仅覆盖 ${monthStats.coveredDays}/${monthStats.requestedDays} 个交易日`}
                      showIcon
                      style={{ marginBottom: 12 }}
                    />
                  ) : null}
                  <Table
                    loading={monthLoading}
                    columns={monthColumns}
                    dataSource={(monthStats?.records || []).slice(0, 8)}
                    rowKey={(r: MonthlyLimitUpRecord) => `${r.tradeDate}-${r.stock}`}
                    pagination={false}
                    size="small"
                  />
                </div>
              </Card>
            </Col>
          </Row>
        </Col>

        {/* 精选策略 */}
        <Col span={24}>
          <Card
            title={
              <Space>
                <CalculatorOutlined style={{ color: '#722ed1' }} />
                <span>精选策略</span>
              </Space>
            }
            extra={
              <Button size="small" type="primary" onClick={() => navigate('/smart-selection')}>
                去使用
              </Button>
            }
            loading={strategiesLoading}
          >
            {strategiesError ? <Alert type="warning" message={strategiesError} /> : null}
            <Row gutter={[16, 16]}>
              {(strategies || []).map((s) => (
                <Col key={s.id} xs={24} md={12} lg={8} xl={6}>
                  <Card 
                    size="small" 
                    title={
                      <Space>
                        <span>{s.strategy_name}</span>
                        {s.algorithm_type ? <Tag color={s.algorithm_type === 'advanced' ? 'purple' : 'blue'}>{s.algorithm_type}</Tag> : null}
                      </Space>
                    }
                    hoverable
                    onClick={() => navigate('/smart-selection')}
                  >
                    <Typography.Paragraph style={{ marginBottom: 10, color: '#aaa', fontSize: 12 }}>
                      {s.description}
                    </Typography.Paragraph>
                    <Row gutter={4} style={{ marginBottom: 10 }}>
                      <Col span={6}>
                        <div style={{ fontSize: 10, color: '#aaa' }}>技术</div>
                        <Progress percent={Math.round((s.technical_weight || 0) * 100)} size="small" showInfo={false} strokeColor="#1890ff" />
                      </Col>
                      <Col span={6}>
                        <div style={{ fontSize: 10, color: '#aaa' }}>基本面</div>
                        <Progress percent={Math.round((s.fundamental_weight || 0) * 100)} size="small" showInfo={false} strokeColor="#722ed1" />
                      </Col>
                      <Col span={6}>
                        <div style={{ fontSize: 10, color: '#aaa' }}>资金</div>
                        <Progress percent={Math.round((s.capital_weight || 0) * 100)} size="small" showInfo={false} strokeColor="#52c41a" />
                      </Col>
                      <Col span={6}>
                        <div style={{ fontSize: 10, color: '#aaa' }}>市场</div>
                        <Progress percent={Math.round((s.market_weight || 0) * 100)} size="small" showInfo={false} strokeColor="#faad14" />
                      </Col>
                    </Row>
                    <Space wrap>
                      {typeof s.min_score === 'number' ? <Tag color="blue">最低{s.min_score}分</Tag> : null}
                      {typeof s.max_results === 'number' ? <Tag color="purple">最多{s.max_results}只</Tag> : null}
                      {s.require_uptrend ? <Tag color="green">上升趋势</Tag> : null}
                      {s.require_hot_sector ? <Tag color="gold">热门板块</Tag> : null}
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title={
              <Space>
                <ThunderboltOutlined style={{ color: '#1890ff' }} />
                <span>AI选股工作流</span>
              </Space>
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card size="small" hoverable onClick={() => navigate('/stocks')}>
                  <Space direction="vertical" size={6}>
                    <Typography.Text strong>1. 建立观察池</Typography.Text>
                    <Typography.Text type="secondary">从全市场快速筛选行业/题材/形态</Typography.Text>
                    <Button type="link" icon={<RightOutlined />} style={{ padding: 0 }}>
                      去浏览股票
                    </Button>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" hoverable onClick={() => navigate('/super-main-force')}>
                  <Space direction="vertical" size={6}>
                    <Typography.Text strong>2. 竞价锁定强势</Typography.Text>
                    <Typography.Text type="secondary">用热度评分+题材增强，缩小范围</Typography.Text>
                    <Button type="link" icon={<RightOutlined />} style={{ padding: 0 }}>
                      去超强主力
                    </Button>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card size="small" hoverable onClick={() => navigate('/smart-selection')}>
                  <Space direction="vertical" size={6}>
                    <Typography.Text strong>3. 策略校验与回测</Typography.Text>
                    <Typography.Text type="secondary">用多因子策略挑选并验证可复制性</Typography.Text>
                    <Button type="link" icon={<RightOutlined />} style={{ padding: 0 }}>
                      去精算智选
                    </Button>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 收益曲线和功能推荐 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BarChartOutlined style={{ color: '#1890ff' }} />
                <span>收益曲线对比（虚拟示例）</span>
              </Space>
            }
          >
            <ReactECharts option={chartOption} style={{ height: 280 }} notMerge lazyUpdate />
            <Alert 
              type="info" 
              message="提示：此处为演示用虚拟曲线，用于对比展示布局与指标含义；实际回测曲线以「精算智选→回测」为准。" 
              style={{ marginTop: 12 }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="特色功能">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={8}>
                <Card size="small" hoverable>
                  <Space>
                    <ThunderboltOutlined style={{ fontSize: 28, color: '#faad14' }} />
                    <div>
                      <Typography.Text strong>题材增强α</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        调节α系数，放大/减弱题材影响
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card size="small" hoverable>
                  <Space>
                    <BarChartOutlined style={{ fontSize: 28, color: '#1890ff' }} />
                    <div>
                      <Typography.Text strong>自动数据采集</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        数据缺失时自动触发采集
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card size="small" hoverable>
                  <Space>
                    <CalculatorOutlined style={{ fontSize: 28, color: '#722ed1' }} />
                    <div>
                      <Typography.Text strong>多策略组合</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        组合多个策略，分散风险
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card size="small" hoverable>
                  <Space>
                    <RightOutlined style={{ fontSize: 28, color: '#52c41a' }} />
                    <div>
                      <Typography.Text strong>实时行情监控</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        把握盘中实时机会
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card size="small" hoverable>
                  <Space>
                    <SyncOutlined style={{ fontSize: 28, color: '#13c2c2' }} />
                    <div>
                      <Typography.Text strong>30秒自动刷新</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        实时盈亏数据快速掌握
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Card size="small" hoverable>
                  <Space>
                    <BarChartOutlined style={{ fontSize: 28, color: '#eb2f96' }} />
                    <div>
                      <Typography.Text strong>回测验证</Typography.Text>
                      <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa', fontSize: 12 }}>
                        历史数据验证策略有效性
                      </Typography.Paragraph>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 快捷入口 */}
        <Col span={24}>
          <Card title="快捷入口" size="small">
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} md={6}>
                <Button 
                  type="primary" 
                  block 
                  size="large"
                  icon={<ThunderboltOutlined />}
                  onClick={() => navigate('/super-main-force')}
                >
                  超强主力
                </Button>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Button 
                  block 
                  size="large"
                  icon={<CalculatorOutlined />}
                  onClick={() => navigate('/smart-selection')}
                >
                  精算智选
                </Button>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Button 
                  block 
                  size="large"
                  icon={<BarChartOutlined />}
                  onClick={() => navigate('/backtest-analysis')}
                >
                  回测分析
                </Button>
              </Col>
              <Col xs={24} sm={12} md={6}>
                <Button 
                  block 
                  size="large"
                  icon={<RightOutlined />}
                  onClick={() => navigate('/stocks')}
                >
                  股票列表
                </Button>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Home;

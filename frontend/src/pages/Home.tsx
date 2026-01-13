import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Col, Progress, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { BarChartOutlined, CalculatorOutlined, RightOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { fetchAuctionSuperMainForce, type AuctionSuperMainForceItem, type AuctionSuperMainForceData } from '../services/analysisService';
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
        const recent = buildRecentWeekdays(3);
        const tradeDate = recent.length > 1 ? recent[1] : recent[0];
        const data = await fetchAuctionSuperMainForce(10, tradeDate, true, 0.25, false);
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
  }, []);

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
        <Col span={24}>
          <Card>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} md={16}>
                <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
                  AI智能选股引擎
                </Typography.Title>
                <Typography.Paragraph style={{ marginBottom: 12, color: '#aaa' }}>
                  以竞价热度、题材强度、资金行为与多因子评分为核心，提供“超强主力”与“精算智选”两条主线，
                  帮你在开盘前更快锁定候选标的，并通过策略回测与收益曲线对比做决策校验。
                </Typography.Paragraph>
                <Space wrap>
                  <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => navigate('/super-main-force')}>
                    进入超强主力
                  </Button>
                  <Button icon={<CalculatorOutlined />} onClick={() => navigate('/smart-selection')}>
                    进入精算智选
                  </Button>
                  <Button type="text" icon={<RightOutlined />} onClick={() => navigate('/stocks')}>
                    浏览股票列表
                  </Button>
                </Space>
              </Col>
              <Col xs={24} md={8}>
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Statistic title="近月入选数" value={monthStats?.totalSelected || 0} suffix="只" />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="收盘涨停（竞价未涨停）"
                      value={monthStats?.totalCloseLimitUp || 0}
                      suffix="只"
                      valueStyle={{ color: '#faad14' }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="收盘涨停率"
                      value={monthStats?.closeLimitUpRate || 0}
                      precision={1}
                      suffix="%"
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic title="样例数据日" value={sample?.tradeDate || '-'} />
                  </Col>
                </Row>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col span={24}>
          <Row gutter={[16, 16]} align="stretch">
            <Col xs={24} lg={14}>
              <Card
                style={{ height: '100%' }}
                title={
                  <Space>
                    <ThunderboltOutlined />
                    <span>超强主力样例</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>
                      {sample?.tradeDate ? `（${sample.tradeDate}）` : ''}
                    </span>
                  </Space>
                }
                extra={
                  <Button size="small" onClick={() => navigate('/super-main-force')}>
                    查看全部
                  </Button>
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
                    <BarChartOutlined />
                    <span>最近一个月：超强主力入选后涨停名单</span>
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
                    <Statistic title="统计区间" value={monthStats ? `${monthStats.fromDate} ~ ${monthStats.toDate}` : '-'} />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="口径"
                      value="入选股票中收盘涨停（竞价未涨停）占比"
                      valueStyle={{ fontSize: 12, color: '#aaa' }}
                    />
                  </Col>
                </Row>

                <div style={{ marginTop: 12 }}>
                  {!monthLoading && !monthError && monthStats && monthStats.records.length === 0 ? (
                    <Alert type="info" message="近月暂无竞价涨停记录" showIcon style={{ marginBottom: 12 }} />
                  ) : null}
                  <Table
                    loading={monthLoading}
                    columns={monthColumns}
                    dataSource={(monthStats?.records || []).slice(0, 10)}
                    rowKey={(r: MonthlyLimitUpRecord) => `${r.tradeDate}-${r.stock}`}
                    pagination={false}
                    size="small"
                  />
                </div>
              </Card>
            </Col>
          </Row>
        </Col>

        <Col span={24}>
          <Card
            title={
              <Space>
                <CalculatorOutlined />
                <span>精算智选：策略样例</span>
              </Space>
            }
            extra={
              <Button size="small" onClick={() => navigate('/smart-selection')}>
                去使用
              </Button>
            }
            loading={strategiesLoading}
          >
            {strategiesError ? <Alert type="warning" message={strategiesError} /> : null}
            <Row gutter={[16, 16]}>
              {(strategies || []).map((s) => (
                <Col key={s.id} xs={24} md={12} lg={8}>
                  <Card size="small" title={<Space><span>{s.strategy_name}</span>{s.algorithm_type ? <Tag>{s.algorithm_type}</Tag> : null}</Space>}>
                    <Typography.Paragraph style={{ marginBottom: 10, color: '#aaa' }}>
                      {s.description}
                    </Typography.Paragraph>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, color: '#aaa' }}>技术</div>
                      <Progress percent={Math.round((s.technical_weight || 0) * 100)} size="small" showInfo />
                      <div style={{ fontSize: 12, color: '#aaa' }}>基本面</div>
                      <Progress percent={Math.round((s.fundamental_weight || 0) * 100)} size="small" showInfo />
                      <div style={{ fontSize: 12, color: '#aaa' }}>资金</div>
                      <Progress percent={Math.round((s.capital_weight || 0) * 100)} size="small" showInfo />
                      <div style={{ fontSize: 12, color: '#aaa' }}>市场</div>
                      <Progress percent={Math.round((s.market_weight || 0) * 100)} size="small" showInfo />
                    </div>
                    <Space wrap>
                      {typeof s.min_score === 'number' ? <Tag color="blue">最低分 {s.min_score}</Tag> : null}
                      {typeof s.max_results === 'number' ? <Tag color="purple">最多 {s.max_results}</Tag> : null}
                      {s.require_uptrend ? <Tag color="green">要求上升趋势</Tag> : null}
                      {s.require_hot_sector ? <Tag color="gold">偏热门板块</Tag> : null}
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
                <BarChartOutlined />
                <span>收益曲线对比（虚拟示例）</span>
              </Space>
            }
          >
            <ReactECharts option={chartOption} style={{ height: 320 }} notMerge lazyUpdate />
            <div style={{ marginTop: 8, color: '#aaa', fontSize: 12 }}>
              提示：此处为演示用虚拟曲线，用于对比展示布局与指标含义；实际回测曲线以“精算智选→回测”为准。
            </div>
          </Card>
        </Col>

        <Col span={24}>
          <Card title="你可能还需要的功能">
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12} lg={8}>
                <Card size="small" title="一键采集补齐数据">
                  <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa' }}>
                    超强主力在数据缺失时可自动触发采集，减少“空表”的等待成本。
                  </Typography.Paragraph>
                </Card>
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Card size="small" title="题材增强α调参">
                  <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa' }}>
                    通过 α 放大/减弱题材热度，适配不同市场风格。
                  </Typography.Paragraph>
                </Card>
              </Col>
              <Col xs={24} md={12} lg={8}>
                <Card size="small" title="权限与多用户">
                  <Typography.Paragraph style={{ marginBottom: 0, color: '#aaa' }}>
                    支持按路径授权，适合团队内部试用与分角色管理。
                  </Typography.Paragraph>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Home;

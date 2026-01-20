import React, { useCallback, useEffect, useState } from 'react';
import { PageContainer } from '@ant-design/pro-components';
import {
  Card,
  Row,
  Col,
  DatePicker,
  Select,
  Button,
  Statistic,
  Space,
  Alert,
} from 'antd';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { LineChartOutlined } from '@ant-design/icons';
import {
  fetchAdvancedSelectionStrategies,
  runBacktest,
  type SelectionStrategy,
  type StrategyConfig,
  type BacktestResult,
} from '../services/smartSelectionService';

const { RangePicker } = DatePicker;
const { Option } = Select;

const BacktestAnalysis: React.FC = () => {
  const [strategies, setStrategies] = useState<SelectionStrategy[]>([]);
  const [strategyId, setStrategyId] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStrategies = useCallback(async () => {
    if (strategies.length > 0) {
      return;
    }
    try {
      const res = await fetchAdvancedSelectionStrategies();
      setStrategies(res.strategies || []);
      if (res.strategies && res.strategies.length > 0) {
        setStrategyId(res.strategies[0].id);
      }
    } catch {
      setError('加载策略列表失败');
    }
  }, [strategies.length]);

  useEffect(() => {
    void loadStrategies();
  }, [loadStrategies]);

  const buildStrategyConfig = (strategy: SelectionStrategy): StrategyConfig => {
    return {
      weights: {
        technical: strategy.technical_weight || 0.35,
        fundamental: strategy.fundamental_weight || 0.3,
        capital: strategy.capital_weight || 0.25,
        market: strategy.market_weight || 0.1,
      },
      min_score: strategy.min_score ?? 70,
      max_results: strategy.max_results ?? 20,
    };
  };

  const handleRun = async () => {
    if (!strategyId) {
      setError('请选择策略');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (strategies.length === 0) {
        await loadStrategies();
      }
      const strategy = strategies.find(s => s.id === strategyId);
      if (!strategy) {
        setError('未找到选中的策略');
        return;
      }

      const today = dayjs().format('YYYY-MM-DD');
      const defaultStart = dayjs().subtract(90, 'day').format('YYYY-MM-DD');

      const s = startDate || defaultStart;
      const e = endDate || today;

      const cfg = buildStrategyConfig(strategy);
      const res = await runBacktest(cfg, s, e, 'advanced');
      setResult(res);
    } catch {
      setError('运行回测失败');
    } finally {
      setLoading(false);
    }
  };

  const equityOption = result && result.equity_curve && result.equity_curve.length > 0
    ? {
        backgroundColor: '#1f1f1f',
        tooltip: { trigger: 'axis' },
        legend: {
          data: ['总资产', '现金'],
          textStyle: { color: '#fff' },
        },
        grid: { left: '6%', right: '4%', top: '12%', bottom: '12%' },
        xAxis: {
          type: 'category',
          data: result.equity_curve.map(item => item.date),
          axisLine: { lineStyle: { color: '#434343' } },
          axisLabel: { color: '#999999' },
        },
        yAxis: {
          type: 'value',
          axisLine: { lineStyle: { color: '#434343' } },
          axisLabel: { color: '#999999' },
          splitLine: { lineStyle: { color: '#434343' } },
        },
        dataZoom: [
          { type: 'inside', start: 60, end: 100 },
          { type: 'slider', start: 60, end: 100 },
        ],
        series: [
          {
            name: '总资产',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: result.equity_curve.map(item => item.total_value),
            lineStyle: { width: 2, color: '#52c41a' },
          },
          {
            name: '现金',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: result.equity_curve.map(item => item.cash),
            lineStyle: { width: 1, color: '#1890ff' },
          },
        ],
      }
    : null;

  return (
    <PageContainer
      header={{
        title: (
          <Space>
            <LineChartOutlined />
            <span>回测资金曲线分析</span>
          </Space>
        ),
        subTitle: '单独查看资金曲线，支持自定义区间和策略',
      }}
    >
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card>
            <Space size="large" align="center">
              <span>选择策略</span>
              <Select
                style={{ width: 260 }}
                value={strategyId}
                onChange={value => setStrategyId(value)}
                placeholder="请选择策略"
              >
                {strategies.map(s => (
                  <Option key={s.id} value={s.id}>
                    {s.strategy_name}
                  </Option>
                ))}
              </Select>
              <span>回测区间</span>
              <RangePicker
                value={
                  startDate && endDate
                    ? [dayjs(startDate), dayjs(endDate)]
                    : undefined
                }
                onChange={(_, dateStrings) => {
                  const ds = dateStrings as [string, string];
                  setStartDate(ds[0] || null);
                  setEndDate(ds[1] || null);
                }}
              />
              <Button type="primary" loading={loading} onClick={handleRun}>
                运行回测
              </Button>
            </Space>
          </Card>
        </Col>
        {error && (
          <Col span={24}>
            <Alert type="error" message={error} />
          </Col>
        )}
        {result && (
          <>
            <Col span={24}>
              <Card>
                <Row gutter={[16, 16]}>
                  <Col span={6}>
                    <Statistic
                      title="总收益率"
                      value={result.total_return}
                      precision={2}
                      suffix="%"
                      valueStyle={{
                        color: result.total_return >= 0 ? '#52c41a' : '#ff4d4f',
                      }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="年化收益率"
                      value={result.annual_return}
                      precision={2}
                      suffix="%"
                      valueStyle={{
                        color: result.annual_return >= 0 ? '#52c41a' : '#ff4d4f',
                      }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="最大回撤"
                      value={result.max_drawdown}
                      precision={2}
                      suffix="%"
                      valueStyle={{
                        color: result.max_drawdown >= 20 ? '#ff4d4f' : '#faad14',
                      }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="夏普比率"
                      value={result.sharpe_ratio}
                      precision={2}
                      valueStyle={{
                        color: result.sharpe_ratio >= 1.5
                          ? '#52c41a'
                          : result.sharpe_ratio >= 1.0
                          ? '#faad14'
                          : '#ff4d4f',
                      }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
            <Col span={24}>
              <Card>
                {equityOption ? (
                  <ReactECharts
                    style={{ height: '400px', width: '100%' }}
                    option={equityOption}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                    暂无资金曲线数据
                  </div>
                )}
              </Card>
            </Col>
          </>
        )}
      </Row>
    </PageContainer>
  );
};

export default BacktestAnalysis;

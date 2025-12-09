/**
 * 精算智选页面
 * 智能选股功能主页面
 */

import React, { useState, useEffect } from 'react';
import {
  PageContainer,
  ProCard,
  ProTable,
} from '@ant-design/pro-components';
import {
  Row,
  Col,
  Card,
  Statistic,
  Progress,
  Tag,
  Button,
  Space,
  Form,
  Select,
  Slider,
  InputNumber,
  Alert,
  Spin,
  Typography,
  Divider,
} from 'antd';
import {
  CalculatorOutlined,
  LineChartOutlined,
  BarChartOutlined,
  PieChartOutlined,
  RocketOutlined,
  SafetyOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import {
  fetchSelectionStrategies,
  runSmartSelection,
  fetchSelectionResults,
  type SmartSelectionResult as ApiSmartSelectionResult,
  type SelectionStrategy as ApiSelectionStrategy,
  type StrategyConfig,
} from '../services/smartSelectionService';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

// 使用从服务导入的类型别名
type SmartSelectionResult = ApiSmartSelectionResult;
type SelectionStrategy = ApiSelectionStrategy;

const SmartSelection: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SmartSelectionResult[]>([]);
  const [strategies, setStrategies] = useState<SelectionStrategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<number>(1);
  const [minScore, setMinScore] = useState<number>(70);
  const [maxResults, setMaxResults] = useState<number>(20);
  const [error, setError] = useState<string | null>(null);
  const [form] = Form.useForm();


  // 加载数据
  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    setLoading(true);
    setError(null);
    try {
      // 并行加载策略和结果
      const [strategiesResponse, resultsResponse] = await Promise.all([
        fetchSelectionStrategies(),
        fetchSelectionResults(maxResults, minScore),
      ]);

      setStrategies(strategiesResponse.strategies);
      setResults(resultsResponse.results);

      // 设置默认选中的策略
      if (strategiesResponse.strategies.length > 0) {
        setSelectedStrategy(strategiesResponse.strategies[0].id);
      }
    } catch (error) {
      console.error('加载选股数据失败:', error);
      setError('加载数据失败，请检查网络连接或稍后重试');
      // 如果API调用失败，使用默认策略
      setStrategies([
        {
          id: 1,
          strategy_name: '均衡策略',
          description: '技术面、基本面、资金面均衡配置',
          technical_weight: 0.35,
          fundamental_weight: 0.30,
          capital_weight: 0.25,
          market_weight: 0.10,
        } as SelectionStrategy,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRunSelection = async () => {
    setLoading(true);
    setError(null);
    try {
      const selectedStrategyData = strategies.find(s => s.id === selectedStrategy);
      if (!selectedStrategyData) {
        throw new Error('未找到选中的策略');
      }

      const strategyConfig: StrategyConfig = {
        weights: {
          technical: selectedStrategyData.technical_weight,
          fundamental: selectedStrategyData.fundamental_weight,
          capital: selectedStrategyData.capital_weight,
          market: selectedStrategyData.market_weight,
        },
        min_score: minScore,
        max_results: maxResults,
      };

      const response = await runSmartSelection(strategyConfig);
      setResults(response.results);
    } catch (error) {
      console.error('运行选股失败:', error);
      setError('运行选股失败，请检查参数配置或稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case '低': return '#52c41a';
      case '中': return '#faad14';
      case '高': return '#ff4d4f';
      default: return '#666';
    }
  };

  const getHoldingPeriodColor = (period: string) => {
    switch (period) {
      case '短线': return '#1890ff';
      case '中线': return '#722ed1';
      case '长线': return '#13c2c2';
      default: return '#666';
    }
  };

  const columns: any[] = [
    {
      title: '股票代码',
      dataIndex: 'stock_code',
      key: 'stock_code',
      width: 120,
      render: (text: string, record: SmartSelectionResult) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{text}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{record.stock_name}</div>
        </div>
      ),
    },
    {
      title: '综合评分',
      dataIndex: 'overall_score',
      key: 'overall_score',
      width: 100,
      render: (score: number) => (
        <div style={{ textAlign: 'center' }}>
          <Progress
            type="circle"
            percent={score}
            size={60}
            strokeColor={score >= 80 ? '#52c41a' : score >= 70 ? '#1890ff' : '#faad14'}
            format={() => (
              <div style={{ fontSize: 14, fontWeight: 'bold' }}>{score}</div>
            )}
          />
        </div>
      ),
      sorter: (a: SmartSelectionResult, b: SmartSelectionResult) => a.overall_score - b.overall_score,
    },
    {
      title: '维度评分',
      key: 'dimension_scores',
      width: 200,
      render: (_: any, record: SmartSelectionResult) => (
        <div>
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>技术面: </Text>
            <Progress percent={record.technical_score} size="small" showInfo={false} strokeColor="#1890ff" />
            <Text style={{ fontSize: 12, marginLeft: 8 }}>{record.technical_score}</Text>
          </div>
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>基本面: </Text>
            <Progress percent={record.fundamental_score} size="small" showInfo={false} strokeColor="#52c41a" />
            <Text style={{ fontSize: 12, marginLeft: 8 }}>{record.fundamental_score}</Text>
          </div>
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>资金面: </Text>
            <Progress percent={record.capital_score} size="small" showInfo={false} strokeColor="#722ed1" />
            <Text style={{ fontSize: 12, marginLeft: 8 }}>{record.capital_score}</Text>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>市场面: </Text>
            <Progress percent={record.market_score} size="small" showInfo={false} strokeColor="#fa8c16" />
            <Text style={{ fontSize: 12, marginLeft: 8 }}>{record.market_score}</Text>
          </div>
        </div>
      ),
    },
    {
      title: '风险与建议',
      key: 'risk_advice',
      width: 180,
      render: (_: any, record: SmartSelectionResult) => (
        <div>
          <div style={{ marginBottom: 8 }}>
            <Tag color={getRiskColor(record.risk_level)}>{record.risk_level}风险</Tag>
            <Tag color={getHoldingPeriodColor(record.holding_period)}>{record.holding_period}</Tag>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>目标价: </Text>
            <Text strong>¥{record.target_price.toFixed(2)}</Text>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>止损价: </Text>
            <Text type="danger">¥{record.stop_loss_price.toFixed(2)}</Text>
          </div>
        </div>
      ),
    },
    {
      title: '入选理由',
      dataIndex: 'selection_reason',
      key: 'selection_reason',
      width: 200,
      render: (text: string) => (
        <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 13 }}>
          {text}
        </Paragraph>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: SmartSelectionResult) => (
        <Space>
          <Button type="link" size="small">详情</Button>
          <Button type="link" size="small">加入自选</Button>
        </Space>
      ),
    },
  ];

  const selectedStrategyData = strategies.find(s => s.id === selectedStrategy);

  return (
    <PageContainer
      header={{
        title: '精算智选',
        subTitle: '基于多维度分析的智能选股系统',
        extra: [
          <Button key="backtest" icon={<LineChartOutlined />}>策略回测</Button>,
          <Button key="export" type="primary">导出结果</Button>,
        ],
      }}
    >
      <Row gutter={[16, 16]}>
        {/* 左侧：策略配置 */}
        <Col span={6}>
          <ProCard title="选股策略配置" headerBordered>
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                strategy: 1,
                minScore: 70,
                maxResults: 20,
              }}
            >
              <Form.Item label="选择策略" name="strategy">
                <Select onChange={setSelectedStrategy} optionLabelProp="label">
                  {strategies.map(strategy => (
                    <Option
                      key={strategy.id}
                      value={strategy.id}
                      label={strategy.strategy_name}
                    >
                      <div style={{ padding: '4px 0' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{strategy.strategy_name}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{strategy.description}</div>
                      </div>
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {selectedStrategyData && (
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Title level={5} style={{ marginBottom: 12 }}>策略权重分布</Title>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>技术面: </Text>
                    <Progress
                      percent={selectedStrategyData.technical_weight * 100}
                      size="small"
                      showInfo={false}
                      strokeColor="#1890ff"
                    />
                    <Text style={{ fontSize: 12, marginLeft: 8 }}>{(selectedStrategyData.technical_weight * 100).toFixed(0)}%</Text>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>基本面: </Text>
                    <Progress
                      percent={selectedStrategyData.fundamental_weight * 100}
                      size="small"
                      showInfo={false}
                      strokeColor="#52c41a"
                    />
                    <Text style={{ fontSize: 12, marginLeft: 8 }}>{(selectedStrategyData.fundamental_weight * 100).toFixed(0)}%</Text>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>资金面: </Text>
                    <Progress
                      percent={selectedStrategyData.capital_weight * 100}
                      size="small"
                      showInfo={false}
                      strokeColor="#722ed1"
                    />
                    <Text style={{ fontSize: 12, marginLeft: 8 }}>{(selectedStrategyData.capital_weight * 100).toFixed(0)}%</Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>市场面: </Text>
                    <Progress
                      percent={selectedStrategyData.market_weight * 100}
                      size="small"
                      showInfo={false}
                      strokeColor="#fa8c16"
                    />
                    <Text style={{ fontSize: 12, marginLeft: 8 }}>{(selectedStrategyData.market_weight * 100).toFixed(0)}%</Text>
                  </div>
                </Card>
              )}

              <Form.Item label="最低评分" name="minScore">
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={minScore}
                  onChange={setMinScore}
                  marks={{
                    0: '0',
                    50: '50',
                    70: '70',
                    85: '85',
                    100: '100',
                  }}
                />
              </Form.Item>

              <Form.Item label="最大结果数" name="maxResults">
                <InputNumber
                  min={1}
                  max={100}
                  value={maxResults}
                  onChange={(value) => value && setMaxResults(value)}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  icon={<CalculatorOutlined />}
                  onClick={handleRunSelection}
                  loading={loading}
                  block
                  size="large"
                >
                  运行智能选股
                </Button>
              </Form.Item>
            </Form>

            <Alert
              message="使用提示"
              description={
                <div>
                  <Paragraph style={{ fontSize: 12, marginBottom: 8 }}>
                    1. 选择适合当前市场环境的策略
                  </Paragraph>
                  <Paragraph style={{ fontSize: 12, marginBottom: 8 }}>
                    2. 调整评分阈值控制选股质量
                  </Paragraph>
                  <Paragraph style={{ fontSize: 12 }}>
                    3. 建议结合个人风险偏好进行二次筛选
                  </Paragraph>
                </div>
              }
              type="info"
              showIcon
            />
          </ProCard>
        </Col>

        {/* 右侧：选股结果 */}
        <Col span={18}>
          <ProCard
            title={
              <Space>
                <RocketOutlined />
                <span>智能选股结果</span>
                <Tag color="blue">{results.length} 只股票</Tag>
                <Tag color="green">平均评分: {results.length > 0 ? (results.reduce((sum, r) => sum + r.overall_score, 0) / results.length).toFixed(1) : 0}</Tag>
              </Space>
            }
            extra={
              <Space>
                <Button icon={<BarChartOutlined />}>图表分析</Button>
                <Button icon={<PieChartOutlined />}>行业分布</Button>
              </Space>
            }
            headerBordered
          >
            {error ? (
              <Alert
                message="错误"
                description={error}
                type="error"
                showIcon
                action={
                  <Button size="small" onClick={loadResults}>
                    重试
                  </Button>
                }
              />
            ) : loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16 }}>正在运行智能选股算法...</div>
              </div>
            ) : results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <CalculatorOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
                <div style={{ fontSize: 16, color: '#666', marginBottom: 8 }}>
                  暂无选股结果
                </div>
                <div style={{ fontSize: 14, color: '#999' }}>
                  请配置策略并运行智能选股
                </div>
              </div>
            ) : (
              <ProTable<SmartSelectionResult>
                dataSource={results}
                columns={columns}
                rowKey="id"
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showQuickJumper: true,
                }}
                search={false}
                options={false}
                dateFormatter="string"
              />
            )}
          </ProCard>

          {/* 统计信息 */}
          {results.length > 0 && (
            <ProCard title="统计概览" style={{ marginTop: 16 }} headerBordered>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Card size="small">
                    <Statistic
                      title="平均综合评分"
                      value={results.reduce((sum, r) => sum + r.overall_score, 0) / results.length}
                      precision={1}
                      valueStyle={{ color: '#1890ff' }}
                      prefix={<BarChartOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small">
                    <Statistic
                      title="低风险股票"
                      value={results.filter(r => r.risk_level === '低').length}
                      suffix={`/ ${results.length}`}
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<SafetyOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small">
                    <Statistic
                      title="中线持有"
                      value={results.filter(r => r.holding_period === '中线').length}
                      suffix={`/ ${results.length}`}
                      valueStyle={{ color: '#722ed1' }}
                      prefix={<ClockCircleOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small">
                    <Statistic
                      title="高评分(>80)"
                      value={results.filter(r => r.overall_score >= 80).length}
                      suffix={`/ ${results.length}`}
                      valueStyle={{ color: '#fa8c16' }}
                      prefix={<RocketOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
            </ProCard>
          )}
        </Col>
      </Row>
    </PageContainer>
  );
};

export default SmartSelection;
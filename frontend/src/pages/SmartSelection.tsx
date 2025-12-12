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
  Switch,
  Tooltip,
  Modal,
} from 'antd';
import {
  CalculatorOutlined,
  LineChartOutlined,
  BarChartOutlined,
  PieChartOutlined,
  RocketOutlined,
  SafetyOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  FireOutlined,
} from '@ant-design/icons';
import {
  fetchSelectionStrategies,
  runSmartSelection,
  fetchSelectionResults,
  fetchAdvancedSelectionStrategies,
  runAdvancedSelection,
  runAdvancedStrategyById,
  compareAlgorithms,
  getAdvancedStatistics,
  runBacktest,
  type SmartSelectionResult as ApiSmartSelectionResult,
  type SelectionStrategy as ApiSelectionStrategy,
  type StrategyConfig,
  type BacktestResult,
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
  const [algorithmType, setAlgorithmType] = useState<'basic' | 'advanced'>('basic'); // 算法类型：基础或高级
  const [minScore, setMinScore] = useState<number>(50);
  const [maxResults, setMaxResults] = useState<number>(20);
  const [requireUptrend, setRequireUptrend] = useState<boolean>(true); // 是否要求上升趋势（高级算法）
  const [requireHotSector, setRequireHotSector] = useState<boolean>(true); // 是否要求热门板块（高级算法）
  const [error, setError] = useState<string | null>(null);
  const [algorithmComparison, setAlgorithmComparison] = useState<any>(null); // 算法对比数据
  const [advancedStatistics, setAdvancedStatistics] = useState<any>(null); // 高级算法统计
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null); // 回测结果
  const [backtestLoading, setBacktestLoading] = useState<boolean>(false); // 回测加载状态
  const [backtestModalVisible, setBacktestModalVisible] = useState<boolean>(false); // 回测弹窗显示状态
  const [form] = Form.useForm();


  // 加载数据
  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    setLoading(true);
    setError(null);
    try {
      // 只加载策略列表，不加载选股结果（提高页面打开速度）
      const [basicStrategiesResponse, advancedStrategiesResponse] = await Promise.all([
        fetchSelectionStrategies(),
        fetchAdvancedSelectionStrategies(),
      ]);

      // 合并策略列表，为高级策略添加算法类型标记
      // 为策略生成唯一ID：基础策略保持原ID，高级策略ID = 原ID + 1000
      const basicStrategies = basicStrategiesResponse.strategies.map(s => ({
        ...s,
        algorithm_type: 'basic' as const,
        original_id: s.id, // 保存原始ID
        id: s.id // 基础策略保持原ID
      }));

      const advancedStrategies = advancedStrategiesResponse.strategies.map(s => ({
        ...s,
        algorithm_type: 'advanced' as const,
        original_id: s.id, // 保存原始ID
        id: s.id + 1000 // 高级策略ID = 原ID + 1000，避免重复
      }));

      const allStrategies = [...basicStrategies, ...advancedStrategies];
      setStrategies(allStrategies);

      // 清空选股结果，让用户手动运行选股
      setResults([]);

      // 设置默认选中的策略（第一个基础策略）
      if (basicStrategies.length > 0) {
        setSelectedStrategy(basicStrategies[0].id);
        setAlgorithmType('basic');
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
          algorithm_type: 'basic',
        } as SelectionStrategy,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleStrategyChange = (strategyId: number) => {
    setSelectedStrategy(strategyId);
    const selectedStrategyData = strategies.find(s => s.id === strategyId);
    if (selectedStrategyData) {
      setAlgorithmType(selectedStrategyData.algorithm_type || 'basic');

      // 如果是高级算法，设置开关的初始值为策略中的值
      if (selectedStrategyData.algorithm_type === 'advanced') {
        if (selectedStrategyData.require_uptrend !== undefined) {
          setRequireUptrend(selectedStrategyData.require_uptrend);
        } else {
          setRequireUptrend(true); // 默认值
        }
        if (selectedStrategyData.require_hot_sector !== undefined) {
          setRequireHotSector(selectedStrategyData.require_hot_sector);
        } else {
          setRequireHotSector(true); // 默认值
        }
      } else {
        // 如果是基础算法，重置开关状态
        setRequireUptrend(true);
        setRequireHotSector(true);
      }
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

      // 根据算法类型调用不同的API
      if (algorithmType === 'basic') {
        // 基础算法
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
        console.log('基础算法返回结果:', response.results);
        if (response.results && response.results.length > 0) {
          console.log('第一条数据:', response.results[0]);
        }
        setResults(response.results);
      } else {
        // 高级算法 - 优先使用用户当前设置的参数
        const strategyMinScore = minScore; // 使用用户设置的评分
        const strategyMaxResults = maxResults; // 使用用户设置的最大结果数
        const strategyRequireUptrend = requireUptrend; // 使用用户设置的开关状态
        const strategyRequireHotSector = requireHotSector; // 使用用户设置的开关状态

        // 并行运行选股和加载算法对比/统计信息
        const [selectionResponse, comparisonResponse, statsResponse] = await Promise.all([
          runAdvancedSelection(
            strategyMinScore,
            strategyMaxResults,
            strategyRequireUptrend,
            strategyRequireHotSector
          ),
          compareAlgorithms(60, 5),
          getAdvancedStatistics(),
        ]);

        console.log('高级算法返回结果:', selectionResponse.results);
        if (selectionResponse.results && selectionResponse.results.length > 0) {
          console.log('第一条数据:', selectionResponse.results[0]);
        }
        setResults(selectionResponse.results);
        setAlgorithmComparison(comparisonResponse);
        setAdvancedStatistics(statsResponse);
      }
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

  const handleRunBacktest = async () => {
    setBacktestLoading(true);
    setError(null);
    try {
      const selectedStrategyData = strategies.find(s => s.id === selectedStrategy);
      if (!selectedStrategyData) {
        throw new Error('未找到选中的策略');
      }

      // 设置回测参数
      const endDate = new Date().toISOString().split('T')[0]; // 今天
      const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 90天前

      let strategyConfig: StrategyConfig;

      if (algorithmType === 'basic') {
        // 基础算法
        strategyConfig = {
          weights: {
            technical: selectedStrategyData.technical_weight,
            fundamental: selectedStrategyData.fundamental_weight,
            capital: selectedStrategyData.capital_weight,
            market: selectedStrategyData.market_weight,
          },
          min_score: minScore,
          max_results: maxResults,
        };
      } else {
        // 高级算法 - 使用策略配置中的权重
        strategyConfig = {
          weights: {
            technical: selectedStrategyData.technical_weight || 0.35,
            fundamental: selectedStrategyData.fundamental_weight || 0.30,
            capital: selectedStrategyData.capital_weight || 0.25,
            market: selectedStrategyData.market_weight || 0.10,
          },
          min_score: minScore,
          max_results: maxResults,
        };
      }

      // 运行回测
      const result = await runBacktest(
        strategyConfig,
        startDate,
        endDate,
        algorithmType
      );

      setBacktestResult(result);
      setBacktestModalVisible(true);

    } catch (error) {
      console.error('运行策略回测失败:', error);
      setError('运行策略回测失败，请检查参数配置或稍后重试');
    } finally {
      setBacktestLoading(false);
    }
  };

  const handleCloseBacktestModal = () => {
    setBacktestModalVisible(false);
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
          <div style={{ fontSize: 12, color: '#666' }}>{record.stock_name || '--'}</div>
        </div>
      ),
    },
    {
      title: '综合评分',
      dataIndex: 'composite_score',
      key: 'composite_score',
      width: 100,
      render: (score: any) => {
        // 确保score是数字类型
        const numericScore = typeof score === 'number' ? score : parseFloat(score) || 0;
        // 如果评分是小数（0-1），转换为百分比（0-100）
        const displayScore = numericScore;
        const percentValue = displayScore < 1 ? displayScore * 100 : displayScore;
        const displayValue = displayScore < 1 ? (displayScore * 100).toFixed(1) : displayScore.toFixed(1);

        return (
          <div style={{ textAlign: 'center' }}>
            <Progress
              type="circle"
              percent={percentValue}
              size={60}
              strokeColor={percentValue >= 80 ? '#52c41a' : percentValue >= 70 ? '#1890ff' : '#faad14'}
              format={() => (
                <div style={{ fontSize: 14, fontWeight: 'bold' }}>{displayValue}</div>
              )}
            />
          </div>
        );
      },
      sorter: (a: SmartSelectionResult, b: SmartSelectionResult) => {
        // 兼容两种API返回结构：composite_score 或 overall_score
        const scoreA = a.composite_score || a.overall_score || 0;
        const scoreB = b.composite_score || b.overall_score || 0;
        return scoreA - scoreB;
      },
    },
    {
      title: '维度评分',
      key: 'dimension_scores',
      width: 200,
      render: (_: any, record: SmartSelectionResult) => {
        // 兼容不同的API返回结构
        // 基础算法：technical_score, fundamental_score, capital_score, market_score
        // 高级算法：technical_score, fundamental_score, sector_score, momentum_score, trend_quality_score
        const technicalScore = record.technical_score || 0;
        const fundamentalScore = record.fundamental_score || 0;
        const capitalScore = record.capital_score || 0;
        const marketScore = record.market_score || 0;
        const sectorScore = record.sector_score || 0;
        const momentumScore = record.momentum_score || 0;
        const trendQualityScore = record.trend_quality_score || 0;

        // 判断是基础算法还是高级算法
        const isAdvancedAlgorithm = algorithmType === 'advanced' ||
          (sectorScore > 0 && momentumScore > 0) ||
          (record.sector_score !== undefined);

        return (
          <div>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>技术面: </Text>
              <Progress
                percent={technicalScore < 1 ? technicalScore * 100 : technicalScore}
                size="small"
                showInfo={false}
                strokeColor="#1890ff"
              />
              <Text style={{ fontSize: 12, marginLeft: 8 }}>
                {technicalScore < 1 ? (technicalScore * 100).toFixed(1) : technicalScore.toFixed(1)}
              </Text>
            </div>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>基本面: </Text>
              <Progress
                percent={fundamentalScore < 1 ? fundamentalScore * 100 : fundamentalScore}
                size="small"
                showInfo={false}
                strokeColor="#52c41a"
              />
              <Text style={{ fontSize: 12, marginLeft: 8 }}>
                {fundamentalScore < 1 ? (fundamentalScore * 100).toFixed(1) : fundamentalScore.toFixed(1)}
              </Text>
            </div>
            {isAdvancedAlgorithm ? (
              // 高级算法显示
              <>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>板块热度: </Text>
                  <Progress
                    percent={sectorScore < 1 ? sectorScore * 100 : sectorScore}
                    size="small"
                    showInfo={false}
                    strokeColor="#722ed1"
                  />
                  <Text style={{ fontSize: 12, marginLeft: 8 }}>
                    {sectorScore < 1 ? (sectorScore * 100).toFixed(1) : sectorScore.toFixed(1)}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>动量: </Text>
                  <Progress
                    percent={momentumScore < 1 ? momentumScore * 100 : momentumScore}
                    size="small"
                    showInfo={false}
                    strokeColor="#fa8c16"
                  />
                  <Text style={{ fontSize: 12, marginLeft: 8 }}>
                    {momentumScore < 1 ? (momentumScore * 100).toFixed(1) : momentumScore.toFixed(1)}
                  </Text>
                </div>
              </>
            ) : (
              // 基础算法显示
              <>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>资金面: </Text>
                  <Progress
                    percent={capitalScore < 1 ? capitalScore * 100 : capitalScore}
                    size="small"
                    showInfo={false}
                    strokeColor="#722ed1"
                  />
                  <Text style={{ fontSize: 12, marginLeft: 8 }}>
                    {capitalScore < 1 ? (capitalScore * 100).toFixed(1) : capitalScore.toFixed(1)}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>市场面: </Text>
                  <Progress
                    percent={marketScore < 1 ? marketScore * 100 : marketScore}
                    size="small"
                    showInfo={false}
                    strokeColor="#fa8c16"
                  />
                  <Text style={{ fontSize: 12, marginLeft: 8 }}>
                    {marketScore < 1 ? (marketScore * 100).toFixed(1) : marketScore.toFixed(1)}
                  </Text>
                </div>
              </>
            )}
          </div>
        );
      },
    },
    {
      title: '风险与建议',
      key: 'risk_advice',
      width: 180,
      render: (_: any, record: SmartSelectionResult) => (
        <div>
          <div style={{ marginBottom: 8 }}>
            <Tag color={getRiskColor(record.risk_level || '中')}>{record.risk_level || '中'}风险</Tag>
            <Tag color={getHoldingPeriodColor(record.holding_period || '中线')}>{record.holding_period || '中线'}</Tag>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>目标价: </Text>
            <Text strong>¥{record.target_price ? record.target_price.toFixed(2) : '--'}</Text>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>止损价: </Text>
            <Text type="danger">¥{record.stop_loss_price ? record.stop_loss_price.toFixed(2) : '--'}</Text>
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
        title: (
          <Space>
            {algorithmType === 'basic' ? <CalculatorOutlined /> : <ExperimentOutlined />}
            <span>精算智选</span>
            <Tag color={algorithmType === 'advanced' ? 'purple' : 'blue'}>
              {algorithmType === 'advanced' ? '高级算法' : '基础算法'}
            </Tag>
          </Space>
        ),
        subTitle: algorithmType === 'basic'
          ? '基于多维度分析的智能选股系统'
          : '基于多因子动量模型的高级选股系统',
        extra: [
          <Button
            key="backtest"
            icon={<LineChartOutlined />}
            onClick={handleRunBacktest}
            loading={backtestLoading}
          >
            策略回测
          </Button>,
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
                minScore: 50,
                maxResults: 20,
              }}
            >
              <Form.Item label="选择策略" name="strategy">
                <Select onChange={handleStrategyChange} optionLabelProp="label">
                  {strategies.map(strategy => (
                    <Option
                      key={strategy.id}
                      value={strategy.id}
                      label={strategy.strategy_name}
                    >
                      <div style={{ padding: '4px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ fontWeight: 'bold' }}>{strategy.strategy_name}</div>
                          <Tag
                            size="small"
                            color={strategy.algorithm_type === 'advanced' ? 'purple' : 'blue'}
                            style={{ marginLeft: 8 }}
                          >
                            {strategy.algorithm_type === 'advanced' ? '高级算法' : '基础算法'}
                          </Tag>
                        </div>
                        <div style={{ fontSize: 12, color: '#666' }}>{strategy.description}</div>
                      </div>
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {selectedStrategyData && (
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Title level={5} style={{ marginBottom: 12 }}>
                    {algorithmType === 'basic' ? '策略权重分布' : '算法配置'}
                  </Title>

                  {algorithmType === 'basic' ? (
                    // 基础算法权重分布 - 显示实际策略配置
                    <>
                      <div style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>技术面: </Text>
                        <Progress
                          percent={selectedStrategyData.technical_weight * 100}
                          size="small"
                          showInfo={false}
                          strokeColor="#1890ff"
                        />
                        <Text style={{ fontSize: 12, marginLeft: 8 }}>{(selectedStrategyData.technical_weight * 100).toFixed(1)}%</Text>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>基本面: </Text>
                        <Progress
                          percent={selectedStrategyData.fundamental_weight * 100}
                          size="small"
                          showInfo={false}
                          strokeColor="#52c41a"
                        />
                        <Text style={{ fontSize: 12, marginLeft: 8 }}>{(selectedStrategyData.fundamental_weight * 100).toFixed(1)}%</Text>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>资金面: </Text>
                        <Progress
                          percent={selectedStrategyData.capital_weight * 100}
                          size="small"
                          showInfo={false}
                          strokeColor="#722ed1"
                        />
                        <Text style={{ fontSize: 12, marginLeft: 8 }}>{(selectedStrategyData.capital_weight * 100).toFixed(1)}%</Text>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>市场面: </Text>
                        <Progress
                          percent={selectedStrategyData.market_weight * 100}
                          size="small"
                          showInfo={false}
                          strokeColor="#fa8c16"
                        />
                        <Text style={{ fontSize: 12, marginLeft: 8 }}>{(selectedStrategyData.market_weight * 100).toFixed(1)}%</Text>
                      </div>
                      <Divider style={{ margin: '12px 0' }} />
                      <div style={{ fontSize: 11, color: '#666' }}>
                        <Text type="secondary">策略配置: </Text>
                        <Text>{selectedStrategyData.strategy_name}</Text>
                      </div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                        <Text type="secondary">描述: </Text>
                        <Text>{selectedStrategyData.description}</Text>
                      </div>
                    </>
                  ) : (
                    // 高级算法配置 - 显示实际策略配置
                    <>
                      <div style={{ marginBottom: 12 }}>
                        <Text strong style={{ fontSize: 12 }}>多因子动量模型</Text>
                        <Paragraph style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                          动量35%、趋势质量25%、板块热度20%、基本面20%
                        </Paragraph>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>最低评分: </Text>
                          <Text strong>{selectedStrategyData.min_score || 60}</Text>
                        </Space>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>最大结果数: </Text>
                          <Text strong>{selectedStrategyData.max_results || 20}</Text>
                        </Space>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <Space>
                          <Switch
                            checked={requireUptrend}
                            onChange={setRequireUptrend}
                            checkedChildren="要求上升趋势"
                            unCheckedChildren="不要求趋势"
                            size="small"
                          />
                          <Tooltip title="筛选趋势斜率>0的股票">
                            <FireOutlined style={{ color: requireUptrend ? '#fa8c16' : '#ccc' }} />
                          </Tooltip>
                        </Space>
                      </div>
                      <div>
                        <Space>
                          <Switch
                            checked={requireHotSector}
                            onChange={setRequireHotSector}
                            checkedChildren="要求热门板块"
                            unCheckedChildren="不要求板块"
                            size="small"
                          />
                          <Tooltip title="筛选板块热度>50的股票">
                            <FireOutlined style={{ color: requireHotSector ? '#fa8c16' : '#ccc' }} />
                          </Tooltip>
                        </Space>
                      </div>
                      <Divider style={{ margin: '12px 0' }} />
                      <div style={{ fontSize: 11, color: '#666' }}>
                        <Text type="secondary">策略配置: </Text>
                        <Text>{selectedStrategyData.strategy_name}</Text>
                      </div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                        <Text type="secondary">描述: </Text>
                        <Text>{selectedStrategyData.description}</Text>
                      </div>
                    </>
                  )}
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
                  icon={algorithmType === 'basic' ? <CalculatorOutlined /> : <ExperimentOutlined />}
                  onClick={handleRunSelection}
                  loading={loading}
                  block
                  size="large"
                >
                  {algorithmType === 'basic' ? '运行智能选股' : '运行高级选股'}
                </Button>
              </Form.Item>
            </Form>

            <Alert
              message={algorithmType === 'basic' ? "使用提示" : "高级算法提示"}
              description={
                algorithmType === 'basic' ? (
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
                ) : (
                  <div>
                    <Paragraph style={{ fontSize: 12, marginBottom: 8 }}>
                      1. 高级算法侧重技术动量和趋势质量
                    </Paragraph>
                    <Paragraph style={{ fontSize: 12, marginBottom: 8 }}>
                      2. 建议开启"热门板块"筛选提高成功率
                    </Paragraph>
                    <Paragraph style={{ fontSize: 12 }}>
                      3. 综合评分&gt;70分为优质选股
                    </Paragraph>
                  </div>
                )
              }
              type={algorithmType === 'basic' ? "info" : "success"}
              showIcon
            />
          </ProCard>
        </Col>

        {/* 右侧：选股结果 */}
        <Col span={18}>
          <ProCard
            title={
              <Space>
                {algorithmType === 'basic' ? <RocketOutlined /> : <ExperimentOutlined />}
                <span>{algorithmType === 'basic' ? '智能选股结果' : '高级选股结果'}</span>
                <Tag color="blue">{results.length} 只股票</Tag>
                <Tag color="green">平均评分: {results.length > 0 ? (results.reduce((sum, r) => sum + (r.composite_score || r.overall_score || 0), 0) / results.length).toFixed(1) : 0}</Tag>
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
                <div style={{ marginTop: 16 }}>
                  {algorithmType === 'basic' ? '正在运行智能选股算法...' : '正在运行高级选股算法...'}
                </div>
              </div>
            ) : results.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                {algorithmType === 'basic' ? (
                  <CalculatorOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
                ) : (
                  <ExperimentOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
                )}
                <div style={{ fontSize: 16, color: '#666', marginBottom: 8 }}>
                  暂无选股结果
                </div>
                <div style={{ fontSize: 14, color: '#999' }}>
                  {algorithmType === 'basic'
                    ? '请配置策略并运行智能选股'
                    : '请配置策略并运行高级选股'}
                </div>
              </div>
            ) : (
              <ProTable<SmartSelectionResult>
                dataSource={results}
                columns={columns}
                rowKey={(record) => `${record.stock_code}_${record.id || Date.now()}`}
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
                      value={results.reduce((sum, r) => sum + (r.composite_score || r.overall_score || 0), 0) / results.length}
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
                      value={results.filter(r => {
                        const score = r.composite_score || r.overall_score || 0;
                        return score >= 80;
                      }).length}
                      suffix={`/ ${results.length}`}
                      valueStyle={{ color: '#fa8c16' }}
                      prefix={<RocketOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
            </ProCard>
          )}

          {/* 算法对比（仅当有对比数据时显示） */}
          {algorithmComparison && algorithmType === 'advanced' && (
            <ProCard title="算法对比" style={{ marginTop: 16 }} headerBordered>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Card title="旧算法（简单加权）" size="small">
                    <div style={{ marginBottom: 8 }}>
                      <Text strong>权重配置:</Text>
                      <Paragraph style={{ fontSize: 13, marginBottom: 8 }}>
                        {algorithmComparison.old_algorithm.weights}
                      </Paragraph>
                    </div>
                    <div>
                      <Text strong>算法描述:</Text>
                      <Paragraph style={{ fontSize: 13 }}>
                        {algorithmComparison.old_algorithm.description}
                      </Paragraph>
                    </div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card title="新算法（多因子动量）" size="small">
                    <div style={{ marginBottom: 8 }}>
                      <Text strong>权重配置:</Text>
                      <Paragraph style={{ fontSize: 13, marginBottom: 8 }}>
                        {algorithmComparison.new_algorithm.weights}
                      </Paragraph>
                    </div>
                    <div>
                      <Text strong>算法描述:</Text>
                      <Paragraph style={{ fontSize: 13 }}>
                        {algorithmComparison.new_algorithm.description}
                      </Paragraph>
                    </div>
                  </Card>
                </Col>
              </Row>
              <Divider />
              <Title level={5}>改进点:</Title>
              <ul style={{ paddingLeft: 20 }}>
                {algorithmComparison.improvements.map((improvement: string, index: number) => (
                  <li key={index} style={{ marginBottom: 8, fontSize: 13 }}>{improvement}</li>
                ))}
              </ul>
            </ProCard>
          )}

          {/* 高级算法统计信息（仅当有统计信息且使用高级算法时显示） */}
          {advancedStatistics && algorithmType === 'advanced' && (
            <ProCard title="高级算法统计" style={{ marginTop: 16 }} headerBordered>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Card size="small">
                    <Statistic
                      title="总策略数"
                      value={advancedStatistics.total_strategies}
                      valueStyle={{ color: '#1890ff' }}
                      prefix={<BarChartOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small">
                    <Statistic
                      title="活跃策略"
                      value={advancedStatistics.active_strategies}
                      suffix={`/ ${advancedStatistics.total_strategies}`}
                      valueStyle={{ color: '#52c41a' }}
                      prefix={<SafetyOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small">
                    <Statistic
                      title="参考算法"
                      value={advancedStatistics.reference_algorithms.length}
                      valueStyle={{ color: '#722ed1' }}
                      prefix={<ThunderboltOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small">
                    <Statistic
                      title="关键特性"
                      value={advancedStatistics.key_features.length}
                      valueStyle={{ color: '#fa8c16' }}
                      prefix={<ExperimentOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
              <Divider />
              <Title level={5}>算法描述:</Title>
              <Paragraph style={{ fontSize: 13, marginBottom: 16 }}>
                {advancedStatistics.algorithm_description}
              </Paragraph>
              <Title level={5}>参考算法:</Title>
              <div style={{ marginBottom: 16 }}>
                {advancedStatistics.reference_algorithms.map((algo: string, index: number) => (
                  <Tag key={index} color="blue" style={{ marginRight: 8, marginBottom: 8 }}>
                    {algo}
                  </Tag>
                ))}
              </div>
              <Title level={5}>关键特性:</Title>
              <ul style={{ paddingLeft: 20 }}>
                {advancedStatistics.key_features.map((feature: string, index: number) => (
                  <li key={index} style={{ marginBottom: 8, fontSize: 13 }}>{feature}</li>
                ))}
              </ul>
            </ProCard>
          )}
        </Col>
      </Row>

      {/* 策略回测结果弹窗 */}
      <Modal
        title="策略回测结果"
        open={backtestModalVisible}
        onCancel={handleCloseBacktestModal}
        width={800}
        footer={[
          <Button key="close" onClick={handleCloseBacktestModal}>
            关闭
          </Button>,
        ]}
      >
        {backtestResult ? (
          <div>
            {/* 回测功能说明 */}
            <Alert
              message="📊 回测功能说明"
              description="当前回测使用基于历史数据的真实选股算法（简化版），包含技术面和基本面分析。买卖规则：持有5天后自动卖出。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            {/* 回测基本信息 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Title level={5}>回测基本信息</Title>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <div>
                    <Text type="secondary">回测期间: </Text>
                    <Text strong>{backtestResult.start_date} 至 {backtestResult.end_date}</Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">算法类型: </Text>
                    <Text strong>{algorithmType === 'basic' ? '基础算法' : '高级算法'}</Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">最低评分: </Text>
                    <Text strong>{backtestResult.strategy_config?.min_score || 40}</Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">最大结果数: </Text>
                    <Text strong>{backtestResult.strategy_config?.max_results || 5}</Text>
                  </div>
                </Col>
                <Col span={12}>
                  <div>
                    <Text type="secondary">回测状态: </Text>
                    <Tag color={backtestResult.backtest_completed ? 'success' : 'error'}>
                      {backtestResult.backtest_completed ? '已完成' : '失败'}
                    </Tag>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">消息: </Text>
                    <Text>{backtestResult.message}</Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">权重配置: </Text>
                    {backtestResult.strategy_config?.weights && (
                      <div>
                        <Text strong>技术面: {(backtestResult.strategy_config.weights.technical * 100).toFixed(1)}%</Text>
                        <br />
                        <Text strong>基本面: {(backtestResult.strategy_config.weights.fundamental * 100).toFixed(1)}%</Text>
                        <br />
                        <Text strong>资金面: {(backtestResult.strategy_config.weights.capital * 100).toFixed(1)}%</Text>
                        <br />
                        <Text strong>市场面: {(backtestResult.strategy_config.weights.market * 100).toFixed(1)}%</Text>
                      </div>
                    )}
                  </div>
                </Col>
              </Row>
            </Card>

            {/* 核心绩效指标 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Title level={5}>核心绩效指标</Title>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Statistic
                    title="总收益率"
                    value={backtestResult.total_return}
                    precision={2}
                    suffix="%"
                    valueStyle={{
                      color: backtestResult.total_return >= 0 ? '#52c41a' : '#ff4d4f'
                    }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="年化收益率"
                    value={backtestResult.annual_return}
                    precision={2}
                    suffix="%"
                    valueStyle={{
                      color: backtestResult.annual_return >= 0 ? '#52c41a' : '#ff4d4f'
                    }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="最大回撤"
                    value={backtestResult.max_drawdown}
                    precision={2}
                    suffix="%"
                    valueStyle={{
                      color: backtestResult.max_drawdown <= -10 ? '#ff4d4f' : '#faad14'
                    }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="夏普比率"
                    value={backtestResult.sharpe_ratio}
                    precision={2}
                    valueStyle={{
                      color: backtestResult.sharpe_ratio >= 1.5 ? '#52c41a' :
                             backtestResult.sharpe_ratio >= 1.0 ? '#faad14' : '#ff4d4f'
                    }}
                  />
                </Col>
              </Row>
            </Card>

            {/* 交易统计 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Title level={5}>交易统计</Title>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Statistic
                    title="胜率"
                    value={backtestResult.win_rate}
                    precision={2}
                    suffix="%"
                    valueStyle={{
                      color: backtestResult.win_rate >= 60 ? '#52c41a' :
                             backtestResult.win_rate >= 50 ? '#faad14' : '#ff4d4f'
                    }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="总交易次数"
                    value={backtestResult.total_trades}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="盈利交易"
                    value={backtestResult.profit_trades}
                    suffix={`/ ${backtestResult.total_trades}`}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="亏损交易"
                    value={backtestResult.loss_trades}
                    suffix={`/ ${backtestResult.total_trades}`}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Col>
              </Row>
            </Card>

            {/* 盈亏分析 */}
            <Card size="small">
              <Title level={5}>盈亏分析</Title>
              <Row gutter={[16, 16]}>
                <Col span={6}>
                  <Statistic
                    title="平均盈利"
                    value={backtestResult.average_profit}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="平均亏损"
                    value={backtestResult.average_loss}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="盈亏比"
                    value={backtestResult.profit_factor}
                    precision={2}
                    valueStyle={{
                      color: backtestResult.profit_factor >= 2.0 ? '#52c41a' :
                             backtestResult.profit_factor >= 1.5 ? '#faad14' : '#ff4d4f'
                    }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="回测时间"
                    value={new Date(backtestResult.timestamp).toLocaleString()}
                    valueStyle={{ color: '#666', fontSize: 12 }}
                  />
                </Col>
              </Row>
            </Card>

            {/* 策略配置详情 */}
            {backtestResult.strategy_config && (
              <Card size="small" style={{ marginTop: 16 }}>
                <Title level={5}>策略配置详情</Title>
                <pre style={{ fontSize: 12, backgroundColor: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                  {JSON.stringify(backtestResult.strategy_config, null, 2)}
                </pre>
              </Card>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>正在加载回测结果...</div>
          </div>
        )}
      </Modal>
    </PageContainer>
  );
};

export default SmartSelection;
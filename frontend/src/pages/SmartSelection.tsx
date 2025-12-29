/**
 * 精算智选页面
 * 智能选股功能主页面
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  DatePicker,
  Tabs,
  Popconfirm,
  Table,
} from 'antd';
import {
  CalculatorOutlined,
  BarChartOutlined,
  PieChartOutlined,
  RocketOutlined,
  SafetyOutlined,
  ClockCircleOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  FireOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import {
  fetchSelectionStrategies,
  runSmartSelection,
  fetchAdvancedSelectionStrategies,
  compareAlgorithms,
  getAdvancedStatistics,
  runBacktest,
  runAdvancedSelectionAsync,
  getAdvancedSelectionJob,
  type SmartSelectionResult as ApiSmartSelectionResult,
  type SelectionStrategy as ApiSelectionStrategy,
  type StrategyConfig,
  type BacktestResult,
  type AdvancedSelectionJobStatus,
} from '../services/smartSelectionService';
import {
  getAdvancedSelectionHistory,
  deleteAdvancedSelectionHistoryItem,
  deleteAdvancedSelectionHistoryBatch,
  type AdvancedSelectionHistoryItem,
} from '../services/advancedSelectionService';
import FundamentalDetailModal from '../components/Fundamental/FundamentalDetailModal';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

type SmartSelectionResult = ApiSmartSelectionResult;
type SelectionStrategy = ApiSelectionStrategy;

let cachedSelectionResults: SmartSelectionResult[] = [];

const SELECTION_CACHE_KEY = 'advanced_selection_cached_results';

if (typeof window !== 'undefined') {
  try {
    const stored = window.localStorage.getItem(SELECTION_CACHE_KEY);
    if (stored) {
      cachedSelectionResults = JSON.parse(stored);
    }
  } catch {
    cachedSelectionResults = [];
  }
}

const saveCachedSelectionResults = (results: SmartSelectionResult[]) => {
  cachedSelectionResults = results;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SELECTION_CACHE_KEY, JSON.stringify(results));
    } catch {
      window.localStorage.removeItem(SELECTION_CACHE_KEY);
    }
  }
};

const SmartSelection: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SmartSelectionResult[]>([]);
  const [strategies, setStrategies] = useState<SelectionStrategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<number>(1);
  const [algorithmType, setAlgorithmType] = useState<'basic' | 'advanced'>('basic');
  const [minScore, setMinScore] = useState<number>(25);
  const [maxResults, setMaxResults] = useState<number>(20);
  const [requireUptrend, setRequireUptrend] = useState<boolean>(true); // 是否要求上升趋势（高级算法）
  const [requireHotSector, setRequireHotSector] = useState<boolean>(true); // 是否要求热门板块（高级算法）
  const [error, setError] = useState<string | null>(null);
  const [algorithmComparison, setAlgorithmComparison] = useState<any>(null); // 算法对比数据
  const [advancedStatistics, setAdvancedStatistics] = useState<any>(null); // 高级算法统计
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null); // 当前选中策略的回测结果
  const [backtestCompareResults, setBacktestCompareResults] = useState<
    { strategyId: number; strategyName: string; result: BacktestResult }[]
  >([]); // 多策略对比结果
  const [activeBacktestStrategyId, setActiveBacktestStrategyId] = useState<number | null>(null); // 回测弹窗中当前展示的策略ID
  const [backtestStartDate, setBacktestStartDate] = useState<string | null>(null);
  const [backtestEndDate, setBacktestEndDate] = useState<string | null>(null);
  const [backtestLoading, setBacktestLoading] = useState<boolean>(false); // 回测加载状态
  const [backtestModalVisible, setBacktestModalVisible] = useState<boolean>(false); // 回测弹窗显示状态
  const [historyVisible, setHistoryVisible] = useState<boolean>(false);
  const [historyItems, setHistoryItems] = useState<AdvancedSelectionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyTotalCount, setHistoryTotalCount] = useState<number | null>(null);
  const [historyStrategyId, setHistoryStrategyId] = useState<number | undefined>(undefined);
  const [historyStartDate, setHistoryStartDate] = useState<string | undefined>(undefined);
  const [historyEndDate, setHistoryEndDate] = useState<string | undefined>(undefined);
  const [historySelectedKeys, setHistorySelectedKeys] = useState<React.Key[]>([]);
  const [historyDeleting, setHistoryDeleting] = useState<boolean>(false);
  const [form] = Form.useForm();
  const [selectionProgress, setSelectionProgress] = useState<number>(0);
  const advancedJobTimerRef = useRef<number | null>(null);
  const [advancedJobs, setAdvancedJobs] = useState<AdvancedSelectionJobStatus[]>([]);
  const [chartModalVisible, setChartModalVisible] = useState<boolean>(false);
  const [industryModalVisible, setIndustryModalVisible] = useState<boolean>(false);
  const [fundamentalModalVisible, setFundamentalModalVisible] = useState<boolean>(false);
  const [currentFundamentalStock, setCurrentFundamentalStock] = useState<SmartSelectionResult | null>(null);

  const getConceptCategory = (industry?: string | null): string => {
    if (!industry || industry.trim() === '') {
      return '其他';
    }
    const name = industry.trim();
    if (
      name.includes('白酒') ||
      name.includes('饮料') ||
      name.includes('食品') ||
      name.includes('乳业') ||
      name.includes('啤酒')
    ) {
      return '大消费';
    }
    if (
      name.includes('商贸') ||
      name.includes('零售') ||
      name.includes('连锁') ||
      name.includes('家电') ||
      name.includes('家居') ||
      name.includes('餐饮') ||
      name.includes('旅游') ||
      name.includes('酒店') ||
      name.includes('休闲服务') ||
      name.includes('餐饮旅游')
    ) {
      return '泛消费';
    }
    if (
      name.includes('银行') ||
      name.includes('证券') ||
      name.includes('保险') ||
      name.includes('非银') ||
      name.includes('信托')
    ) {
      return '金融';
    }
    if (
      name.includes('军工') ||
      name.includes('航天') ||
      name.includes('航空') ||
      name.includes('国防')
    ) {
      return '军工';
    }
    if (
      name.includes('新能源') ||
      name.includes('光伏') ||
      name.includes('风电') ||
      name.includes('锂电') ||
      name.includes('储能') ||
      name.includes('充电桩') ||
      name.includes('电池')
    ) {
      return '新能源';
    }
    if (
      name.includes('有色') ||
      name.includes('有色金属') ||
      name.includes('煤炭') ||
      name.includes('钢铁') ||
      name.includes('石油') ||
      name.includes('采掘') ||
      name.includes('稀土') ||
      name.includes('矿业')
    ) {
      return '资源周期';
    }
    if (
      name.includes('计算机') ||
      name.includes('电子') ||
      name.includes('半导体') ||
      name.includes('通信') ||
      name.includes('传媒') ||
      name.includes('互联网') ||
      name.includes('软件') ||
      name.includes('游戏') ||
      name.includes('云计算') ||
      name.includes('人工智能')
    ) {
      return '科技成长';
    }
    if (
      name.includes('医药') ||
      name.includes('生物') ||
      name.includes('医疗') ||
      name.includes('药品') ||
      name.includes('医疗器械')
    ) {
      return '医药健康';
    }
    if (
      name.includes('房地产') ||
      name.includes('建筑') ||
      name.includes('建材') ||
      name.includes('工程') ||
      name.includes('装饰')
    ) {
      return '地产基建';
    }
    if (
      name.includes('公用事业') ||
      name.includes('电力') ||
      name.includes('水务') ||
      name.includes('环保') ||
      name.includes('燃气')
    ) {
      return '防御类';
    }
    return '其他';
  };

  const scoreChartOption = useMemo(() => {
    if (!results || results.length === 0) {
      return null;
    }
    const sorted = [...results].sort((a, b) => {
      const scoreA = a.composite_score || a.overall_score || 0;
      const scoreB = b.composite_score || b.overall_score || 0;
      return scoreB - scoreA;
    });
    const topN = sorted.slice(0, 20);
    const categories = topN.map(item => `${item.stock_name}(${item.stock_code})`);
    const compositeScores = topN.map(item => item.composite_score || item.overall_score || 0);

    const dimensionDefs: { key: keyof SmartSelectionResult; name: string; color: string }[] = [
      { key: 'technical_score', name: '技术面', color: '#1890ff' },
      { key: 'fundamental_score', name: '基本面', color: '#52c41a' },
      { key: 'capital_score', name: '资金面', color: '#faad14' },
      { key: 'market_score', name: '市场情绪', color: '#722ed1' },
      { key: 'sector_score', name: '板块热度', color: '#13c2c2' },
      { key: 'momentum_score', name: '动量', color: '#fa541c' },
      { key: 'trend_quality_score', name: '趋势质量', color: '#eb2f96' },
    ];

    const activeDimensions = dimensionDefs.filter(dim =>
      topN.some(item => typeof item[dim.key] === 'number' && (item[dim.key] as number) !== 0)
    );

    return {
      backgroundColor: '#1f1f1f',
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        data: ['综合评分', ...activeDimensions.map(dim => dim.name)],
        textStyle: { color: '#fff' },
      },
      grid: {
        left: '4%',
        right: '4%',
        top: '14%',
        bottom: '16%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          color: '#999999',
          rotate: 40,
        },
        axisLine: { lineStyle: { color: '#434343' } },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#434343' } },
        axisLabel: { color: '#999999' },
        splitLine: { lineStyle: { color: '#434343' } },
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100 },
      ],
      series: [
        {
          name: '综合评分',
          type: 'bar',
          data: compositeScores,
          itemStyle: { color: '#faad14' },
          barMaxWidth: 24,
        },
        ...activeDimensions.map(dim => ({
          name: dim.name,
          type: 'bar',
          data: topN.map(item => {
            const value = item[dim.key];
            if (typeof value !== 'number') {
              return 0;
            }
            return value <= 1 ? value * 100 : value;
          }),
          barMaxWidth: 24,
          itemStyle: { color: dim.color },
        })),
      ],
    };
  }, [results]);

  const industryDistributionOption = useMemo(() => {
    if (!results || results.length === 0) {
      return null;
    }
    const counts: Record<string, number> = {};
    results.forEach(item => {
      const concept = getConceptCategory(item.industry);
      counts[concept] = (counts[concept] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const data = entries.map(([name, value]) => ({
      name,
      value,
    }));
    return {
      backgroundColor: '#1f1f1f',
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c}只 ({d}%)',
      },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        left: 10,
        top: 20,
        bottom: 20,
        textStyle: { color: '#fff' },
      },
      series: [
        {
          name: '概念分布',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['60%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderColor: '#000',
            borderWidth: 1,
          },
          label: {
            color: '#fff',
          },
          labelLine: {
            length: 10,
            length2: 10,
          },
          data,
        },
      ],
    };
  }, [results]);

  const clearAdvancedJobTimer = useCallback(() => {
    if (advancedJobTimerRef.current !== null) {
      window.clearInterval(advancedJobTimerRef.current);
      advancedJobTimerRef.current = null;
    }
  }, []);

  const resetSelectionProgress = useCallback(() => {
    clearAdvancedJobTimer();
    setSelectionProgress(0);
  }, [clearAdvancedJobTimer]);

  const loadResults = useCallback(async () => {
    resetSelectionProgress();
    setLoading(true);
    setError(null);
    try {
      // 只加载策略列表，不加载选股结果（提高页面打开速度）
      const [, advancedStrategiesResponse] = await Promise.all([
        fetchSelectionStrategies(),
        fetchAdvancedSelectionStrategies(),
      ]);

      // 仅保留高级算法策略，为策略生成唯一ID：原ID + 1000
      const advancedStrategies = advancedStrategiesResponse.strategies.map(s => ({
        ...s,
        algorithm_type: 'advanced' as const,
        original_id: s.id, // 保存原始ID
        id: s.id + 1000 // 高级策略ID = 原ID + 1000，避免重复
      }));

      const allStrategies = [...advancedStrategies];
      setStrategies(allStrategies);

      setResults(cachedSelectionResults);

      // 设置默认选中的策略（第一个高级策略）
      if (advancedStrategies.length > 0) {
        const defaultStrategyId = advancedStrategies[0].id;
        setSelectedStrategy(defaultStrategyId);
        setAlgorithmType('advanced');
        form.setFieldsValue({ strategy: defaultStrategyId });
      }
    } catch (error) {
      console.error('加载选股数据失败:', error);
      setError('加载数据失败，请检查网络连接或稍后重试');
      // 如果API调用失败，使用默认策略
      setStrategies([
        {
          id: 1001,
          strategy_name: '动量突破',
          description: '侧重技术动量，捕捉强势突破股票',
          technical_weight: 0.35,
          fundamental_weight: 0.30,
          capital_weight: 0.25,
          market_weight: 0.10,
          algorithm_type: 'advanced',
          min_score: 50,
          max_results: 15,
          require_uptrend: true,
          require_hot_sector: true,
        } as SelectionStrategy,
      ]);
      setSelectedStrategy(1001);
      setAlgorithmType('advanced');
      form.setFieldsValue({ strategy: 1001 });
    } finally {
      setLoading(false);
    }
  }, [form, resetSelectionProgress]);

  useEffect(() => {
    return () => {
      clearAdvancedJobTimer();
    };
  }, [clearAdvancedJobTimer]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

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
    setError(null);
    const isBasicAlgorithm = algorithmType === 'basic';
    if (isBasicAlgorithm) {
      resetSelectionProgress();
    }
    setLoading(true);
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
        setResults(response.results);
        saveCachedSelectionResults(response.results || []);
      } else {
        const strategyMinScore = minScore;
        const strategyMaxResults = maxResults;
        const strategyRequireUptrend = requireUptrend;
        const strategyRequireHotSector = requireHotSector;

        const currentStrategy = strategies.find(s => s.id === selectedStrategy);
        const strategyIdForHistory = currentStrategy ? (currentStrategy as any).original_id ?? currentStrategy.id : undefined;
        const strategyNameForHistory = currentStrategy?.strategy_name;

        resetSelectionProgress();
        setSelectionProgress(1);

        const asyncResponse = await runAdvancedSelectionAsync(
          strategyMinScore,
          strategyMaxResults,
          strategyRequireUptrend,
          strategyRequireHotSector,
          strategyIdForHistory,
          strategyNameForHistory
        );

        setAdvancedJobs(prev => {
          const createdAt = asyncResponse.created_at;
          const baseJob: AdvancedSelectionJobStatus = {
            job_id: asyncResponse.job_id,
            status: 'pending',
            progress: 0,
            processed: 0,
            total: 0,
            selected: 0,
            created_at: createdAt,
            updated_at: createdAt,
            parameters: {
              min_score: strategyMinScore,
              max_results: strategyMaxResults,
              require_uptrend: strategyRequireUptrend,
              require_hot_sector: strategyRequireHotSector,
              require_breakout: false,
              strategy_id: strategyIdForHistory ?? null,
              strategy_name: strategyNameForHistory ?? null,
            },
            error: null,
            result_count: 0,
            results: [],
          };
          const others = prev.filter(job => job.job_id !== asyncResponse.job_id);
          return [baseJob, ...others];
        });

        const pollJob = async () => {
          if (!asyncResponse.job_id) {
            return;
          }
          try {
            const job = await getAdvancedSelectionJob(asyncResponse.job_id);
            setAdvancedJobs(prev => {
              const others = prev.filter(j => j.job_id !== job.job_id);
              const summary: AdvancedSelectionJobStatus = {
                ...job,
              };
              return [summary, ...others];
            });
            if (job.total > 0) {
              const percent = job.progress * 100;
              setSelectionProgress(prev => {
                if (percent <= 0 && prev > 0) {
                  return prev;
                }
                const clamped = Math.max(1, Math.min(100, percent));
                return clamped;
              });
            }
            if (job.status === 'running' || job.status === 'pending') {
              return;
            }
            clearAdvancedJobTimer();
            if (job.status === 'completed') {
              const jobResults = job.results || [];
              setResults(jobResults);
              saveCachedSelectionResults(jobResults);
              setSelectionProgress(100);
              setLoading(false);
              Promise.all([
                compareAlgorithms(60, 5),
                getAdvancedStatistics(),
              ])
                .then(([comparisonResponse, statsResponse]) => {
                  setAlgorithmComparison(comparisonResponse);
                  setAdvancedStatistics(statsResponse);
                })
                .catch((extraError) => {
                  console.error('加载高级算法统计信息失败:', extraError);
                });
            } else if (job.status === 'failed') {
              setError(job.error || '高级选股任务失败');
              resetSelectionProgress();
              setLoading(false);
            }
          } catch (pollError) {
            clearAdvancedJobTimer();
            setError(pollError instanceof Error ? pollError.message : '查询高级选股任务失败');
            resetSelectionProgress();
            setLoading(false);
          }
        };

        await pollJob();
        const timer = window.setInterval(() => {
          pollJob();
        }, 3000);
        advancedJobTimerRef.current = timer;
      }
    } catch (error) {
      console.error('运行选股失败:', error);
      setError(error instanceof Error ? error.message : '运行选股失败，请检查参数配置或稍后重试');
    } finally {
      if (isBasicAlgorithm) {
        resetSelectionProgress();
        setLoading(false);
      }
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

  const getAdvancedWeightsDescription = (strategy?: SelectionStrategy) => {
    if (!strategy) {
      return '动量、趋势、板块热度、基本面综合打分';
    }
    if (strategy.strategy_name.includes('动量突破')) {
      return '动量约70%、趋势约10%、板块热度约20%、基本面权重极低';
    }
    if (strategy.strategy_name.includes('趋势跟随')) {
      return '趋势质量约50%、动量约20%、板块热度约15%、基本面约15%';
    }
    if (strategy.strategy_name.includes('价值成长')) {
      return '基本面约60%、趋势约15%、动量约10%、板块热度约15%';
    }
    if (strategy.strategy_name.includes('底部掘金')) {
      return '估值约30%、风险约20%、量能约20%、质量约10%、反转信号加分';
    }
    return '动量、趋势、板块热度、基本面综合打分';
  };

  const buildStrategyConfigForBacktest = (
    strategy: SelectionStrategy,
    algoType: 'basic' | 'advanced'
  ): StrategyConfig => {
    if (algoType === 'basic') {
      return {
        weights: {
          technical: strategy.technical_weight,
          fundamental: strategy.fundamental_weight,
          capital: strategy.capital_weight,
          market: strategy.market_weight,
        },
        min_score: minScore,
        max_results: maxResults,
      };
    }
    return {
      weights: {
        technical: strategy.technical_weight || 0.35,
        fundamental: strategy.fundamental_weight || 0.30,
        capital: strategy.capital_weight || 0.25,
        market: strategy.market_weight || 0.10,
      },
      min_score: minScore,
      max_results: maxResults,
    };
  };

  const handleRunBacktest = async () => {
    setBacktestLoading(true);
    setError(null);
    try {
      const selectedStrategyData = strategies.find(s => s.id === selectedStrategy);
      if (!selectedStrategyData) {
        throw new Error('未找到选中的策略');
      }

      // 设置回测参数（优先使用用户在弹窗中选择的区间）
      const today = new Date().toISOString().split('T')[0];
      const defaultStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const startDate = backtestStartDate || defaultStart;
      const endDate = backtestEndDate || today;

      setBacktestStartDate(startDate);
      setBacktestEndDate(endDate);

      const strategyConfig = buildStrategyConfigForBacktest(
        selectedStrategyData,
        algorithmType
      );

      // 当前策略回测
      const primaryResult = await runBacktest(
        strategyConfig,
        startDate,
        endDate,
        algorithmType
      );

      setBacktestResult(primaryResult);
      setActiveBacktestStrategyId(selectedStrategyData.id);

      // 多策略对比（只在高级算法下进行）
      if (algorithmType === 'advanced') {
        const compareStrategies: SelectionStrategy[] = [];

        const findByName = (keyword: string) =>
          strategies.find(s => s.strategy_name.includes(keyword));

        const momentum = findByName('动量突破');
        const trend = findByName('趋势跟随');
        const value = findByName('价值成长');

        [momentum, trend, value].forEach(s => {
          if (s && !compareStrategies.some(cs => cs.id === s.id)) {
            compareStrategies.push(s);
          }
        });

        if (compareStrategies.length === 0) {
          compareStrategies.push(...strategies.slice(0, 3));
        }

        const comparePromises = compareStrategies.map(async (strategy) => {
          const cfg = buildStrategyConfigForBacktest(strategy, 'advanced');
          const res = await runBacktest(cfg, startDate, endDate, 'advanced');
          return {
            strategyId: strategy.id,
            strategyName: strategy.strategy_name,
            result: res,
          };
        });

        const compareResults = await Promise.all(comparePromises);
        setBacktestCompareResults(compareResults);
      } else {
        setBacktestCompareResults([]);
      }

      setBacktestModalVisible(true);

    } catch (error) {
      console.error('运行策略回测失败:', error);
      setError('运行策略回测失败，请检查参数配置或稍后重试');
    } finally {
      setBacktestLoading(false);
    }
  };

  const handleViewHistory = async () => {
    setHistoryLoading(true);
    setError(null);
    try {
      const response = await getAdvancedSelectionHistory({
        limit: 200,
        strategyId: historyStrategyId,
        startDate: historyStartDate,
        endDate: historyEndDate,
      });
      setHistoryTotalCount(response.count);
      setHistoryItems(response.results);
      setHistoryVisible(true);
      setHistorySelectedKeys([]);
    } catch (error) {
      console.error('获取高级选股历史记录失败:', error);
      setError('获取历史选股记录失败，请稍后重试');
    } finally {
      setHistoryLoading(false);
    }
  };

  

  const handleCloseBacktestModal = () => {
    setBacktestModalVisible(false);
  };

  const handleShowFundamentalModal = (record: SmartSelectionResult) => {
    setCurrentFundamentalStock(record);
    setFundamentalModalVisible(true);
  };

  const handleCloseFundamentalModal = () => {
    setFundamentalModalVisible(false);
    setCurrentFundamentalStock(null);
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
      title: '估值与盈利',
      key: 'valuation_profitability',
      width: 180,
      render: (_: any, record: SmartSelectionResult) => {
        const roeValue =
          typeof record.roe === 'number' ? `${record.roe.toFixed(1)}%` : '--';
        const peValue =
          typeof record.pe_ttm === 'number' && record.pe_ttm > 0
            ? record.pe_ttm.toFixed(1)
            : 'N/A';
        return (
          <div>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>ROE: </Text>
              <Text strong style={{ fontSize: 12 }}>{roeValue}</Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>PE(TTM): </Text>
              <Text strong style={{ fontSize: 12 }}>{peValue}</Text>
            </div>
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
        <Tooltip title={text}>
          <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 13 }}>
            {text}
          </Paragraph>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: SmartSelectionResult) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleShowFundamentalModal(record)}>详情</Button>
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
          : '基于多因子动量模型的AI选股系统',
        extra: [
          <Button
            key="history"
            icon={<ClockCircleOutlined />}
            onClick={handleViewHistory}
          >
            历史选股
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
                minScore: 25,
                maxResults: 20,
              }}
            >
              <Form.Item label="选择策略" name="strategy">
                <Select
                  showSearch
                  listHeight={420}
                  onChange={handleStrategyChange}
                  optionLabelProp="label"
                  filterOption={(input, option) =>
                    String(option?.label ?? '')
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                >
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
                          {getAdvancedWeightsDescription(selectedStrategyData)}
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
                <Button
                  icon={<BarChartOutlined />}
                  disabled={results.length === 0}
                  onClick={() => setChartModalVisible(true)}
                >
                  图表分析
                </Button>
                <Button
                  icon={<PieChartOutlined />}
                  disabled={results.length === 0}
                  onClick={() => setIndustryModalVisible(true)}
                >
                  概念分布
                </Button>
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
                {algorithmType === 'advanced' && selectionProgress > 0 && (
                  <div style={{ marginTop: 16, padding: '0 80px' }}>
                    <Progress
                      percent={Math.round(selectionProgress)}
                      status={selectionProgress >= 100 ? 'success' : 'active'}
                      showInfo
                    />
                  </div>
                )}
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

          

          <Modal
            open={chartModalVisible}
            title="图表分析"
            width={1000}
            onCancel={() => setChartModalVisible(false)}
            footer={[
              <Button key="close" onClick={() => setChartModalVisible(false)}>
                关闭
              </Button>,
            ]}
          >
            {results.length === 0 || !scoreChartOption ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                暂无选股结果，请先运行选股。
              </div>
            ) : (
              <ReactECharts style={{ height: '420px', width: '100%' }} option={scoreChartOption} />
            )}
          </Modal>

          <Modal
            open={industryModalVisible}
            title="概念分布"
            width={900}
            onCancel={() => setIndustryModalVisible(false)}
            footer={[
              <Button key="close" onClick={() => setIndustryModalVisible(false)}>
                关闭
              </Button>,
            ]}
          >
            {results.length === 0 || !industryDistributionOption ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                暂无选股结果，请先运行选股。
              </div>
            ) : (
              <ReactECharts style={{ height: '420px', width: '100%' }} option={industryDistributionOption} />
            )}
          </Modal>

          <Modal
            open={historyVisible}
            title="高级选股任务与历史记录"
            width={1000}
            onCancel={() => setHistoryVisible(false)}
            footer={[
              <Button key="close" onClick={() => setHistoryVisible(false)}>
                关闭
              </Button>,
            ]}
          >
            <Space style={{ marginBottom: 16 }}>
              <Select
                allowClear
                placeholder="按策略筛选"
                style={{ width: 200 }}
                value={historyStrategyId}
                onChange={(value) => setHistoryStrategyId(value)}
              >
                {strategies.map(strategy => (
                  <Option
                    key={strategy.id}
                    value={strategy.original_id !== undefined ? strategy.original_id : strategy.id}
                  >
                    {strategy.strategy_name}
                  </Option>
                ))}
              </Select>
              <RangePicker
                onChange={(_, dateStrings) => {
                  const ds = dateStrings as [string, string];
                  setHistoryStartDate(ds[0] || undefined);
                  setHistoryEndDate(ds[1] || undefined);
                }}
              />
              <Button type="primary" onClick={handleViewHistory}>
                查询
              </Button>
              <Button
                onClick={() => {
                  setHistoryStrategyId(undefined);
                  setHistoryStartDate(undefined);
                  setHistoryEndDate(undefined);
                  handleViewHistory();
                }}
              >
                重置
              </Button>
            </Space>
            <Tabs
              defaultActiveKey="list"
              items={[
                {
                  key: 'jobs',
                  label: '后台任务',
                  children: advancedJobs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      暂无后台任务
                    </div>
                  ) : (
                    <Table<AdvancedSelectionJobStatus>
                      dataSource={advancedJobs}
                      rowKey={(job) => job.job_id}
                      pagination={false}
                      columns={[
                        {
                          title: '任务ID',
                          dataIndex: 'job_id',
                          key: 'job_id',
                          width: 160,
                          render: (value: string) => value.slice(0, 16),
                        },
                        {
                          title: '状态',
                          dataIndex: 'status',
                          key: 'status',
                          width: 100,
                          render: (status: AdvancedSelectionJobStatus['status']) => {
                            let color = 'default';
                            if (status === 'running') color = 'processing';
                            else if (status === 'completed') color = 'success';
                            else if (status === 'failed') color = 'error';
                            return <Tag color={color}>{status}</Tag>;
                          },
                        },
                        {
                          title: '进度',
                          key: 'progress',
                          width: 260,
                          render: (_: any, job: AdvancedSelectionJobStatus) => (
                            <Progress
                              percent={Math.round((job.progress || 0) * 100)}
                              status={
                                job.status === 'completed'
                                  ? 'success'
                                  : job.status === 'failed'
                                  ? 'exception'
                                  : 'active'
                              }
                            />
                          ),
                        },
                        {
                          title: '已处理/总数',
                          key: 'processed_total',
                          width: 140,
                          render: (_: any, job: AdvancedSelectionJobStatus) =>
                            `${job.processed}/${job.total}`,
                        },
                        {
                          title: '已选中',
                          dataIndex: 'selected',
                          key: 'selected',
                          width: 100,
                        },
                        {
                          title: '创建时间',
                          dataIndex: 'created_at',
                          key: 'created_at',
                          width: 200,
                        },
                        {
                          title: '更新时间',
                          dataIndex: 'updated_at',
                          key: 'updated_at',
                          width: 200,
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 140,
                          render: (_: any, job: AdvancedSelectionJobStatus) => (
                            <Space>
                              <Button
                                size="small"
                                type="link"
                                disabled={job.status !== 'completed' || !job.results || job.results.length === 0}
                                onClick={() => {
                                  if (job.results && job.results.length > 0) {
                                    setResults(job.results);
                                    saveCachedSelectionResults(job.results);
                                    setHistoryVisible(false);
                                  }
                                }}
                              >
                                查看结果
                              </Button>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  ),
                },
                {
                  key: 'list',
                  label: '列表模式',
                  children: historyLoading ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      <Spin />
                    </div>
                  ) : historyItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                      暂无历史选股记录
                    </div>
                  ) : (
                    <ProTable<AdvancedSelectionHistoryItem>
                      dataSource={historyItems}
                      rowKey={(record) => `${record.run_id}-${record.stock_code}-${record.selection_date}`}
                      rowSelection={{
                        selectedRowKeys: historySelectedKeys,
                        onChange: (keys) => setHistorySelectedKeys(keys),
                      }}
                      toolBarRender={() => [
                        <Popconfirm
                          key="delete-selected"
                          title="确认删除选中的历史记录？"
                          okText="确认"
                          cancelText="取消"
                          placement="topRight"
                          onConfirm={async () => {
                            if (historySelectedKeys.length === 0 || historyDeleting) {
                              return;
                            }
                            setHistoryDeleting(true);
                            try {
                              const items = historyItems
                                .filter(item =>
                                  historySelectedKeys.includes(`${item.run_id}-${item.stock_code}-${item.selection_date}`)
                                )
                                .map(item => ({
                                  run_id: item.run_id,
                                  stock_code: item.stock_code,
                                  selection_date: item.selection_date,
                                }));
                              if (items.length > 0) {
                                await deleteAdvancedSelectionHistoryBatch(items);
                                await handleViewHistory();
                              }
                            } catch (e) {
                              console.error('批量删除历史记录失败:', e);
                            } finally {
                              setHistoryDeleting(false);
                            }
                          }}
                        >
                          <Button
                            danger
                            disabled={historySelectedKeys.length === 0}
                            loading={historyDeleting}
                          >
                            批量删除
                          </Button>
                        </Popconfirm>,
                      ]}
                      columns={[
                        {
                          title: '选股日期',
                          dataIndex: 'selection_date',
                          key: 'selection_date',
                          width: 120,
                        },
                        {
                          title: '策略名称',
                          dataIndex: 'strategy_name',
                          key: 'strategy_name',
                          width: 160,
                          render: (_, record) => record.strategy_name || '动量突破',
                        },
                        {
                          title: '股票代码',
                          dataIndex: 'stock_code',
                          key: 'stock_code',
                          width: 120,
                        },
                        {
                          title: '股票名称',
                          dataIndex: 'stock_name',
                          key: 'stock_name',
                          width: 120,
                        },
                        {
                          title: '综合评分',
                          dataIndex: 'composite_score',
                          key: 'composite_score',
                          width: 100,
                        },
                        {
                          title: '风险建议',
                          dataIndex: 'risk_advice',
                          key: 'risk_advice',
                          width: 260,
                          render: (_, record) => record.risk_advice || '-',
                        },
                        {
                          title: '入选理由',
                          dataIndex: 'selection_reason',
                          key: 'selection_reason',
                          width: 260,
                          render: (_, record) => (
                            <Tooltip title={record.selection_reason || ''}>
                              <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 13 }}>
                                {record.selection_reason || ''}
                              </Paragraph>
                            </Tooltip>
                          ),
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 120,
                          render: (_, record) => (
                            <Space>
                              <Popconfirm
                                title="确认删除该条历史记录？"
                                okText="确认"
                                cancelText="取消"
                                placement="left"
                                onConfirm={async () => {
                                  if (historyDeleting) {
                                    return;
                                  }
                                  setHistoryDeleting(true);
                                  try {
                                    await deleteAdvancedSelectionHistoryItem({
                                      run_id: record.run_id,
                                      stock_code: record.stock_code,
                                      selection_date: record.selection_date,
                                    });
                                    await handleViewHistory();
                                  } catch (e) {
                                    console.error('删除历史记录失败:', e);
                                  } finally {
                                    setHistoryDeleting(false);
                                  }
                                }}
                              >
                                <Button
                                  danger
                                  size="small"
                                  loading={historyDeleting}
                                >
                                  删除
                                </Button>
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                      pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        showQuickJumper: true,
                      }}
                      search={false}
                      options={false}
                      dateFormatter="string"
                    />
                  ),
                },
                {
                  key: 'stats',
                  label: '统计视图',
                  children: (
                    <Row gutter={[16, 16]}>
                      <Col span={8}>
                        <Card size="small">
                          <Statistic
                            title="历史选股总数"
                            value={historyTotalCount ?? historyItems.length}
                            valueStyle={{ color: '#1890ff' }}
                          />
                        </Card>
                      </Col>
                      <Col span={8}>
                        <Card size="small">
                          <Statistic
                            title="历史运行批次"
                            value={Array.from(new Set(historyItems.map(item => item.run_id))).length}
                            valueStyle={{ color: '#52c41a' }}
                          />
                        </Card>
                      </Col>
                      <Col span={8}>
                        <Card size="small">
                          <Statistic
                            title="涉及策略数量"
                            value={Array.from(new Set(historyItems.map(item => item.strategy_name || '未命名策略'))).length}
                            valueStyle={{ color: '#fa8c16' }}
                          />
                        </Card>
                      </Col>
                    </Row>
                  ),
                },
              ]}
            />
          </Modal>

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
        width={1000}
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

            {/* 回测结果较差提示 */}
            {backtestResult.total_return <= -20 && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                message="回测结果较差"
                description={`总收益率为 ${backtestResult.total_return.toFixed(2)}%，该策略在本次区间表现不佳，请谨慎使用。`}
              />
            )}

            {/* 回测基本信息 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Title level={5}>回测基本信息</Title>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">回测期间: </Text>
                    <Text strong>{backtestResult.start_date} 至 {backtestResult.end_date}</Text>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">调整回测区间: </Text>
                    <div style={{ marginTop: 4 }}>
                      <RangePicker
                        allowClear={false}
                        value={
                          backtestStartDate && backtestEndDate
                            ? [dayjs(backtestStartDate), dayjs(backtestEndDate)]
                            : undefined
                        }
                        onChange={(_, dateStrings) => {
                          const ds = dateStrings as [string, string];
                          const start = ds[0] || null;
                          const end = ds[1] || null;
                          setBacktestStartDate(start);
                          setBacktestEndDate(end);
                        }}
                      />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Button
                        type="primary"
                        size="small"
                        loading={backtestLoading}
                        onClick={handleRunBacktest}
                      >
                        重新回测
                      </Button>
                    </div>
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

            {/* 核心绩效指标 + 策略对比 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Title level={5} style={{ marginBottom: 0 }}>核心绩效指标</Title>
                {backtestCompareResults.length > 0 && (
                  <Space size="small">
                    <Text type="secondary">选择查看策略:</Text>
                    <Select
                      size="small"
                      style={{ width: 200 }}
                      value={activeBacktestStrategyId ?? selectedStrategy}
                      onChange={(value) => {
                        const item = backtestCompareResults.find(r => r.strategyId === value);
                        if (item) {
                          setBacktestResult(item.result);
                          setActiveBacktestStrategyId(value);
                        }
                      }}
                    >
                      {backtestCompareResults.map(item => (
                        <Select.Option key={item.strategyId} value={item.strategyId}>
                          {item.strategyName}
                        </Select.Option>
                      ))}
                    </Select>
                  </Space>
                )}
              </div>
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

            {/* 策略对比表 */}
            {backtestCompareResults.length > 0 && (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Title level={5}>三种策略回测结果对比</Title>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="strategyId"
                  dataSource={backtestCompareResults}
                  columns={[
                    {
                      title: '策略',
                      dataIndex: 'strategyName',
                      key: 'strategyName',
                      render: (
                        text: string,
                        record: { strategyId: number; strategyName: string; result: BacktestResult }
                      ) => (
                        <span style={{ fontWeight: record.strategyId === activeBacktestStrategyId ? 'bold' : 'normal' }}>
                          {text}
                        </span>
                      ),
                    },
                    {
                      title: '总收益率',
                      key: 'total_return',
                      render: (
                        _: unknown,
                        record: { strategyId: number; strategyName: string; result: BacktestResult }
                      ) => (
                        <span style={{ color: record.result.total_return >= 0 ? '#52c41a' : '#ff4d4f' }}>
                          {record.result.total_return.toFixed(2)}%
                        </span>
                      ),
                    },
                    {
                      title: '年化收益率',
                      key: 'annual_return',
                      render: (
                        _: unknown,
                        record: { strategyId: number; strategyName: string; result: BacktestResult }
                      ) => (
                        <span style={{ color: record.result.annual_return >= 0 ? '#52c41a' : '#ff4d4f' }}>
                          {record.result.annual_return.toFixed(2)}%
                        </span>
                      ),
                    },
                    {
                      title: '最大回撤',
                      key: 'max_drawdown',
                      render: (
                        _: unknown,
                        record: { strategyId: number; strategyName: string; result: BacktestResult }
                      ) => (
                        <span style={{ color: record.result.max_drawdown >= 20 ? '#ff4d4f' : '#faad14' }}>
                          {record.result.max_drawdown.toFixed(2)}%
                        </span>
                      ),
                    },
                    {
                      title: '胜率',
                      key: 'win_rate',
                      render: (
                        _: unknown,
                        record: { strategyId: number; strategyName: string; result: BacktestResult }
                      ) => (
                        <span style={{ color: record.result.win_rate >= 60 ? '#52c41a' : record.result.win_rate >= 50 ? '#faad14' : '#ff4d4f' }}>
                          {record.result.win_rate.toFixed(2)}%
                        </span>
                      ),
                    },
                    {
                      title: '盈亏比',
                      key: 'profit_factor',
                      render: (
                        _: unknown,
                        record: { strategyId: number; strategyName: string; result: BacktestResult }
                      ) => (
                        <span style={{ color: record.result.profit_factor >= 2 ? '#52c41a' : record.result.profit_factor >= 1.5 ? '#faad14' : '#ff4d4f' }}>
                          {record.result.profit_factor.toFixed(2)}
                        </span>
                      ),
                    },
                    {
                      title: '夏普比率',
                      key: 'sharpe_ratio',
                      render: (
                        _: unknown,
                        record: { strategyId: number; strategyName: string; result: BacktestResult }
                      ) => (
                        <span style={{ color: record.result.sharpe_ratio >= 1.5 ? '#52c41a' : record.result.sharpe_ratio >= 1.0 ? '#faad14' : '#ff4d4f' }}>
                          {record.result.sharpe_ratio.toFixed(2)}
                        </span>
                      ),
                    },
                    {
                      title: '总交易次数',
                      key: 'total_trades',
                      render: (
                        _: unknown,
                        record: { strategyId: number; strategyName: string; result: BacktestResult }
                      ) => (
                        <span style={{ color: '#1890ff' }}>
                          {record.result.total_trades}
                        </span>
                      ),
                    },
                  ]}
                />
              </Card>
            )}

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

            {/* 资金曲线 + 盈亏分析 */}
            <Card size="small">
              <Title level={5}>资金曲线与盈亏分析</Title>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <div style={{ height: 260 }}>
                    {backtestResult.equity_curve && backtestResult.equity_curve.length > 0 ? (
                      <ReactECharts
                        style={{ height: '240px', width: '100%' }}
                        option={{
                          backgroundColor: '#1f1f1f',
                          tooltip: {
                            trigger: 'axis',
                          },
                          legend: {
                            data: ['总资产', '现金'],
                            textStyle: { color: '#fff' },
                          },
                          grid: {
                            left: '6%',
                            right: '4%',
                            top: '12%',
                            bottom: '12%',
                          },
                          xAxis: {
                            type: 'category',
                            data: backtestResult.equity_curve.map(item => item.date),
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
                            {
                              type: 'inside',
                              start: 60,
                              end: 100,
                            },
                            {
                              type: 'slider',
                              start: 60,
                              end: 100,
                            },
                          ],
                          series: [
                            {
                              name: '总资产',
                              type: 'line',
                              smooth: true,
                              showSymbol: false,
                              data: backtestResult.equity_curve.map(item => item.total_value),
                              lineStyle: { width: 2, color: '#52c41a' },
                            },
                            {
                              name: '现金',
                              type: 'line',
                              smooth: true,
                              showSymbol: false,
                              data: backtestResult.equity_curve.map(item => item.cash),
                              lineStyle: { width: 1, color: '#1890ff' },
                            },
                          ],
                        }}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
                        暂无资金曲线数据
                      </div>
                    )}
                  </div>
                </Col>
                <Col span={12}>
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

      {currentFundamentalStock && (
        <FundamentalDetailModal
          visible={fundamentalModalVisible}
          stockCode={currentFundamentalStock.stock_code}
          stockName={currentFundamentalStock.stock_name}
          onClose={handleCloseFundamentalModal}
        />
      )}
    </PageContainer>
  );
};

export default SmartSelection;

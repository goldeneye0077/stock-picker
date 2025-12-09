/**
 * 基本面详情弹窗组件
 * 显示股票的财务指标、估值、分红等基本面数据
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Tag,
  Table,
  Typography,
  Space,
  Alert,
  Spin,
} from 'antd';
import {
  BarChartOutlined,
  DollarOutlined,
  RiseOutlined,
  LineChartOutlined,
  PieChartOutlined,
  TrophyOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  fetchFundamentalAnalysis,
  fetchFinancialIndicators,
  fetchValuationData,
  fetchDividendData,
  fetchShareholderData,
} from '../../services/fundamentalService';
import type {
  FundamentalAnalysis,
  FinancialIndicators,
  TopFundamentalStock,
} from '../../services/fundamentalService';

const { Title, Text, Paragraph } = Typography;

interface FundamentalDetailModalProps {
  visible: boolean;
  stockCode: string;
  stockName: string;
  onClose: () => void;
}

const FundamentalDetailModal: React.FC<FundamentalDetailModalProps> = ({
  visible,
  stockCode,
  stockName,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [analysisData, setAnalysisData] = useState<FundamentalAnalysis | null>(null);
  const [financialIndicators, setFinancialIndicators] = useState<FinancialIndicators | null>(null);
  const [valuationData, setValuationData] = useState<any>(null);
  const [dividendData, setDividendData] = useState<any>(null);
  const [shareholderData, setShareholderData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载基本面数据
  useEffect(() => {
    if (visible && stockCode) {
      loadFundamentalData();
    }
  }, [visible, stockCode]);

  const loadFundamentalData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 并行加载所有数据
      const [
        analysisResult,
        indicatorsResult,
        valuationResult,
        dividendResult,
        shareholderResult,
      ] = await Promise.allSettled([
        fetchFundamentalAnalysis(stockCode),
        fetchFinancialIndicators(stockCode),
        fetchValuationData(stockCode),
        fetchDividendData(stockCode),
        fetchShareholderData(stockCode),
      ]);

      // 处理分析结果
      if (analysisResult.status === 'fulfilled') {
        setAnalysisData(analysisResult.value);
      } else {
        console.warn('获取基本面分析失败:', analysisResult.reason);
      }

      // 处理财务指标
      if (indicatorsResult.status === 'fulfilled') {
        setFinancialIndicators(indicatorsResult.value);
      } else {
        console.warn('获取财务指标失败:', indicatorsResult.reason);
      }

      // 处理估值数据
      if (valuationResult.status === 'fulfilled') {
        setValuationData(valuationResult.value);
      } else {
        console.warn('获取估值数据失败:', valuationResult.reason);
      }

      // 处理分红数据
      if (dividendResult.status === 'fulfilled') {
        setDividendData(dividendResult.value);
      } else {
        console.warn('获取分红数据失败:', dividendResult.reason);
      }

      // 处理股东数据
      if (shareholderResult.status === 'fulfilled') {
        setShareholderData(shareholderResult.value);
      } else {
        console.warn('获取股东数据失败:', shareholderResult.reason);
      }

    } catch (error) {
      console.error('加载基本面数据失败:', error);
      setError('加载基本面数据失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 获取评分颜色
  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#52c41a'; // 优秀
    if (score >= 60) return '#1890ff'; // 良好
    if (score >= 40) return '#faad14'; // 一般
    return '#ff4d4f'; // 较差
  };

  // 获取评分等级
  const getScoreGrade = (score: number): string => {
    if (score >= 80) return '优秀';
    if (score >= 60) return '良好';
    if (score >= 40) return '一般';
    return '较差';
  };

  // 获取建议颜色
  const getRecommendationColor = (recommendation: string): string => {
    const rec = recommendation.toLowerCase();
    if (rec.includes('强烈推荐') || rec.includes('买入')) return '#52c41a';
    if (rec.includes('增持') || rec.includes('持有')) return '#1890ff';
    if (rec.includes('中性') || rec.includes('观望')) return '#faad14';
    if (rec.includes('减持') || rec.includes('卖出')) return '#ff4d4f';
    return '#666';
  };

  // 渲染概览标签
  const renderOverviewTab = () => {
    if (!analysisData) {
      return <Alert message="暂无基本面分析数据" type="info" showIcon />;
    }

    const { analysis } = analysisData;
    const overallScore = analysis.overall_score || 0;
    const recommendation = analysis.recommendation || '暂无建议';

    return (
      <div>
        {/* 总体评分 */}
        <Card
          title={
            <Space>
              <TrophyOutlined />
              <span>总体评分</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div style={{ textAlign: 'center' }}>
                <Progress
                  type="circle"
                  percent={overallScore}
                  strokeColor={getScoreColor(overallScore)}
                  size={120}
                  format={(percent) => (
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 'bold' }}>{percent}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>总分</div>
                    </div>
                  )}
                />
                <div style={{ marginTop: 8 }}>
                  <Tag color={getScoreColor(overallScore)} style={{ fontSize: 14 }}>
                    {getScoreGrade(overallScore)}
                  </Tag>
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div style={{ padding: '8px 0' }}>
                <Title level={5} style={{ marginBottom: 16 }}>
                  <InfoCircleOutlined style={{ marginRight: 8 }} />
                  投资建议
                </Title>
                <Tag
                  color={getRecommendationColor(recommendation)}
                  style={{ fontSize: 16, padding: '8px 16px', marginBottom: 12 }}
                >
                  {recommendation}
                </Tag>
                <Paragraph type="secondary" style={{ fontSize: 13 }}>
                  基于财务健康度、盈利能力、估值水平、成长性和运营效率的综合评估
                </Paragraph>
              </div>
            </Col>
          </Row>
        </Card>

        {/* 各维度评分 */}
        <Card
          title={
            <Space>
              <BarChartOutlined />
              <span>各维度评分</span>
            </Space>
          }
          style={{ marginBottom: 16 }}
        >
          <Row gutter={[16, 16]}>
            {analysis.financial_health && (
              <Col span={8}>
                <Card size="small" title="财务健康度" variant="borderless">
                  <Progress
                    percent={analysis.financial_health?.score || 0}
                    strokeColor={getScoreColor(analysis.financial_health?.score || 0)}
                    format={() => `${analysis.financial_health?.score || 0}分`}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    等级: {analysis.financial_health?.grade || 'N/A'}
                  </Text>
                </Card>
              </Col>
            )}
            {analysis.profitability && (
              <Col span={8}>
                <Card size="small" title="盈利能力" variant="borderless">
                  <Progress
                    percent={analysis.profitability?.score || 0}
                    strokeColor={getScoreColor(analysis.profitability?.score || 0)}
                    format={() => `${analysis.profitability?.score || 0}分`}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    等级: {analysis.profitability?.grade || 'N/A'}
                  </Text>
                </Card>
              </Col>
            )}
            {analysis.valuation && (
              <Col span={8}>
                <Card size="small" title="估值水平" variant="borderless">
                  <Progress
                    percent={analysis.valuation?.score || 0}
                    strokeColor={getScoreColor(analysis.valuation?.score || 0)}
                    format={() => `${analysis.valuation?.score || 0}分`}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    等级: {analysis.valuation?.grade || 'N/A'}
                  </Text>
                </Card>
              </Col>
            )}
            {analysis.growth && (
              <Col span={8}>
                <Card size="small" title="成长性" variant="borderless">
                  <Progress
                    percent={analysis.growth?.score || 0}
                    strokeColor={getScoreColor(analysis.growth?.score || 0)}
                    format={() => `${analysis.growth?.score || 0}分`}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    等级: {analysis.growth?.grade || 'N/A'}
                  </Text>
                </Card>
              </Col>
            )}
            {analysis.efficiency && (
              <Col span={8}>
                <Card size="small" title="运营效率" variant="borderless">
                  <Progress
                    percent={analysis.efficiency?.score || 0}
                    strokeColor={getScoreColor(analysis.efficiency?.score || 0)}
                    format={() => `${analysis.efficiency?.score || 0}分`}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    等级: {analysis.efficiency?.grade || 'N/A'}
                  </Text>
                </Card>
              </Col>
            )}
          </Row>
        </Card>
      </div>
    );
  };

  // 渲染财务指标标签
  const renderFinancialIndicatorsTab = () => {
    if (!financialIndicators) {
      return <Alert message="暂无财务指标数据" type="info" showIcon />;
    }

    const { data } = financialIndicators;

    const indicators = [
      {
        title: '净资产收益率(ROE)',
        value: data.roe ? `${data.roe.toFixed(2)}%` : 'N/A',
        description: '净利润/净资产',
      },
      {
        title: '净利率',
        value: data.profit_to_gr ? `${data.profit_to_gr.toFixed(2)}%` : 'N/A',
        description: '净利润/营业收入',
      },
      {
        title: '资产负债率',
        value: data.debt_to_assets ? `${data.debt_to_assets.toFixed(2)}%` : 'N/A',
        description: '总负债/总资产',
      },
      {
        title: '营业利润率',
        value: data.op_of_gr ? `${data.op_of_gr.toFixed(2)}%` : 'N/A',
        description: '营业利润/营业收入',
      },
      {
        title: '年化ROE',
        value: data.roe_yearly ? `${data.roe_yearly.toFixed(2)}%` : 'N/A',
        description: '年化净资产收益率',
      },
      {
        title: '年化ROA',
        value: data.roa_yearly ? `${data.roa_yearly.toFixed(2)}%` : 'N/A',
        description: '年化总资产收益率',
      },
      {
        title: '权益乘数',
        value: data.assets_to_eqt ? data.assets_to_eqt.toFixed(2) : 'N/A',
        description: '总资产/净资产',
      },
      {
        title: '负债权益比',
        value: data.debt_to_eqt ? data.debt_to_eqt.toFixed(2) : 'N/A',
        description: '总负债/净资产',
      },
    ];

    return (
      <Card title="财务指标概览">
        <Row gutter={[16, 16]}>
          {indicators.map((indicator, index) => (
            <Col span={6} key={index}>
              <Card size="small" variant="borderless">
                <Statistic
                  title={indicator.title}
                  value={indicator.value}
                  valueStyle={{ fontSize: 16 }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {indicator.description}
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    );
  };

  // 渲染估值标签
  const renderValuationTab = () => {
    if (!valuationData || !valuationData.data) {
      return <Alert message="暂无估值数据" type="info" showIcon />;
    }

    const { data } = valuationData;

    const valuationMetrics = [
      {
        title: '市盈率(PE)',
        value: data.pe ? data.pe.toFixed(2) : 'N/A',
        description: '股价/每股收益',
        goodRange: '0-20',
      },
      {
        title: '市净率(PB)',
        value: data.pb ? data.pb.toFixed(2) : 'N/A',
        description: '股价/每股净资产',
        goodRange: '0-3',
      },
      {
        title: '市销率(PS)',
        value: data.ps ? data.ps.toFixed(2) : 'N/A',
        description: '市值/营业收入',
        goodRange: '0-5',
      },
      {
        title: '股息率',
        value: data.dv_ratio ? `${data.dv_ratio.toFixed(2)}%` : 'N/A',
        description: '每股股息/股价',
        goodRange: '>2%',
      },
      {
        title: 'TTM市盈率',
        value: data.pe_ttm ? data.pe_ttm.toFixed(2) : 'N/A',
        description: '股价/TTM每股收益',
        goodRange: '0-20',
      },
    ];

    return (
      <Card title="估值指标">
        <Row gutter={[16, 16]}>
          {valuationMetrics.map((metric, index) => (
            <Col span={8} key={index}>
              <Card size="small" variant="borderless">
                <Statistic
                  title={metric.title}
                  value={metric.value}
                  valueStyle={{ fontSize: 16 }}
                />
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {metric.description}
                  </Text>
                </div>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    合理区间: {metric.goodRange}
                  </Text>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    );
  };

  // 渲染分红标签
  const renderDividendTab = () => {
    if (!dividendData || !dividendData.data || dividendData.data.length === 0) {
      return <Alert message="暂无分红数据" type="info" showIcon />;
    }

    const dividendHistory = dividendData.data.slice(0, 5); // 显示最近5次分红

    const columns = [
      {
        title: '分红年度',
        dataIndex: 'end_date',
        key: 'end_date',
        width: 100,
      },
      {
        title: '每股股息',
        dataIndex: 'div_cash',
        key: 'div_cash',
        width: 100,
        render: (value: number) => (value ? `¥${value.toFixed(3)}` : '-'),
      },
      {
        title: '分红总额',
        dataIndex: 'total_div',
        key: 'total_div',
        width: 120,
        render: (value: number) =>
          value ? `${(value / 100000000).toFixed(2)}亿` : '-',
      },
      {
        title: '除权除息日',
        dataIndex: 'ex_date',
        key: 'ex_date',
        width: 120,
      },
      {
        title: '股权登记日',
        dataIndex: 'record_date',
        key: 'record_date',
        width: 120,
      },
    ];

    return (
      <Card title="分红历史">
        <Table
          dataSource={dividendHistory}
          columns={columns}
          rowKey={(record: any) => `${record.end_date || ''}_${record.ann_date || ''}_${record.div_proc || ''}`}
          size="small"
          pagination={false}
        />
      </Card>
    );
  };

  // 渲染股东标签
  const renderShareholdersTab = () => {
    if (!shareholderData || !shareholderData.data || shareholderData.data.length === 0) {
      return <Alert message="暂无股东数据" type="info" showIcon />;
    }

    const topShareholders = shareholderData.data.slice(0, 10); // 显示前10大股东

    const columns = [
      {
        title: '股东名称',
        dataIndex: 'holder_name',
        key: 'holder_name',
        width: 150,
      },
      {
        title: '持股数量',
        dataIndex: 'hold_amount',
        key: 'hold_amount',
        width: 120,
        render: (value: number) =>
          value ? `${(value / 10000).toFixed(2)}万股` : '-',
      },
      {
        title: '持股比例',
        dataIndex: 'hold_ratio',
        key: 'hold_ratio',
        width: 100,
        render: (value: number) => (value ? `${(value * 100).toFixed(2)}%` : '-'),
      },
      {
        title: '股东类型',
        dataIndex: 'holder_type',
        key: 'holder_type',
        width: 100,
      },
      {
        title: '报告期',
        dataIndex: 'end_date',
        key: 'end_date',
        width: 100,
      },
    ];

    return (
      <Card title="前十大股东">
        <Table
          dataSource={topShareholders}
          columns={columns}
          rowKey={(record: any) => `${record.holder_name || ''}_${record.end_date || ''}`}
          size="small"
          pagination={false}
        />
      </Card>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <BarChartOutlined />
          <span>基本面分析 - {stockName} ({stockCode})</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={900}
      footer={null}
      destroyOnHidden
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>加载基本面数据中...</div>
        </div>
      ) : error ? (
        <Alert message={error} type="error" showIcon />
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'overview',
              label: (
                <span>
                  <InfoCircleOutlined />
                  概览
                </span>
              ),
              children: renderOverviewTab(),
            },
            {
              key: 'financial',
              label: (
                <span>
                  <DollarOutlined />
                  财务指标
                </span>
              ),
              children: renderFinancialIndicatorsTab(),
            },
            {
              key: 'valuation',
              label: (
                <span>
                  <LineChartOutlined />
                  估值分析
                </span>
              ),
              children: renderValuationTab(),
            },
            {
              key: 'dividend',
              label: (
                <span>
                  <PieChartOutlined />
                  分红数据
                </span>
              ),
              children: renderDividendTab(),
            },
            {
              key: 'shareholders',
              label: (
                <span>
                  <RiseOutlined />
                  股东分析
                </span>
              ),
              children: renderShareholdersTab(),
            },
          ]}
        />
      )}
    </Modal>
  );
};

export default FundamentalDetailModal;
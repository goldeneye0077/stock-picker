import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Space,
  Button,
  Select,
  Alert,
  Divider,
  Typography,
  Spin,
  Tabs,
  Tag,
  Progress,
  Collapse,
  Timeline,
  Descriptions
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  LineChartOutlined,
  SafetyOutlined,
  FileTextOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { DATA_SERVICE_URL } from '../config/api';

const { Option } = Select;
const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;

interface ConsistencyResult {
  source1: string;
  source2: string;
  test_date: string;
  consistent: boolean;
  match_rate: number;
  data1_count: number;
  data2_count: number;
  common_count: number;
  avg_sample_size: number;
  column_results: Array<{
    column: string;
    match_rate: number;
    avg_error: number;
    sample_count: number;
  }>;
  reason?: string;
}

interface ValidationReport {
  total_validations: number;
  consistent_pairs: number;
  inconsistent_pairs: number;
  avg_match_rate: number;
  min_match_rate: number;
  max_match_rate: number;
  results: ConsistencyResult[];
  timestamp: string;
}

const DataSourceConsistency: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [multiSourceStatus, setMultiSourceStatus] = useState<any>(null);
  const [days, setDays] = useState<number>(7);
  const [runningValidation, setRunningValidation] = useState(false);

  // 获取一致性报告
  const fetchConsistencyReport = async (daysParam: number = days) => {
    setLoading(true);
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/api/data/multi-source/consistency?days=${daysParam}`);
      if (response.data.success) {
        setValidationReport(response.data.data);
      }
    } catch (error) {
      console.error('获取一致性报告失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取多数据源状态
  const fetchMultiSourceStatus = async () => {
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/api/data/multi-source/status`);
      if (response.data.success) {
        setMultiSourceStatus(response.data.data);
      }
    } catch (error) {
      console.error('获取多数据源状态失败:', error);
    }
  };

  // 运行一致性验证
  const runConsistencyValidation = async () => {
    setRunningValidation(true);
    try {
      await axios.post(`${DATA_SERVICE_URL}/api/data/multi-source/run-health-check`);
      // 等待2秒后获取报告
      setTimeout(() => {
        fetchConsistencyReport();
        fetchMultiSourceStatus();
        setRunningValidation(false);
      }, 2000);
    } catch (error) {
      console.error('运行一致性验证失败:', error);
      setRunningValidation(false);
    }
  };

  // 页面加载时获取数据
  useEffect(() => {
    fetchConsistencyReport();
    fetchMultiSourceStatus();
  }, []);

  // 处理天数变化
  const handleDaysChange = (value: number) => {
    setDays(value);
    fetchConsistencyReport(value);
  };

  // 一致性结果表格列定义
  const consistencyColumns = [
    {
      title: '数据源对',
      key: 'source_pair',
      render: (_: any, record: ConsistencyResult) => (
        <Space>
          <Tag color="blue">{record.source1}</Tag>
          <Text>vs</Text>
          <Tag color="blue">{record.source2}</Tag>
        </Space>
      ),
    },
    {
      title: '测试日期',
      dataIndex: 'test_date',
      key: 'test_date',
      width: 120,
    },
    {
      title: '一致性',
      key: 'consistent',
      render: (_: any, record: ConsistencyResult) => (
        <Tag color={record.consistent ? 'success' : 'error'}>
          {record.consistent ? '一致' : '不一致'}
        </Tag>
      ),
    },
    {
      title: '匹配率',
      dataIndex: 'match_rate',
      key: 'match_rate',
      render: (rate: number) => (
        <Space>
          <Progress
            percent={rate * 100}
            size="small"
            strokeColor={rate >= 0.95 ? '#52c41a' : rate >= 0.90 ? '#faad14' : '#ff4d4f'}
            format={(percent) => `${(percent || 0).toFixed(1)}%`}
          />
        </Space>
      ),
    },
    {
      title: '数据量',
      key: 'data_counts',
      render: (_: any, record: ConsistencyResult) => (
        <Text>
          {record.data1_count} / {record.data2_count}
        </Text>
      ),
    },
    {
      title: '共同数据',
      dataIndex: 'common_count',
      key: 'common_count',
      render: (count: number) => count || 0,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: ConsistencyResult) => (
        <Button
          size="small"
          onClick={() => {
            // 这里可以添加查看详细信息的逻辑
            console.log('查看详细信息:', record);
          }}
        >
          详情
        </Button>
      ),
    },
  ];

  // 列匹配详情表格列定义
  const columnMatchColumns = [
    {
      title: '列名',
      dataIndex: 'column',
      key: 'column',
    },
    {
      title: '匹配率',
      dataIndex: 'match_rate',
      key: 'match_rate',
      render: (rate: number) => `${(rate * 100).toFixed(1)}%`,
    },
    {
      title: '平均误差',
      dataIndex: 'avg_error',
      key: 'avg_error',
      render: (error: number) => error.toFixed(4),
    },
    {
      title: '样本数',
      dataIndex: 'sample_count',
      key: 'sample_count',
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: any) => (
        <Tag color={record.match_rate >= 0.95 ? 'success' : record.match_rate >= 0.90 ? 'warning' : 'error'}>
          {record.match_rate >= 0.95 ? '优秀' : record.match_rate >= 0.90 ? '良好' : '需改进'}
        </Tag>
      ),
    },
  ];

  // 计算统计信息
  const calculateStats = () => {
    if (!validationReport) return null;

    const { total_validations, consistent_pairs, inconsistent_pairs, avg_match_rate } = validationReport;
    const consistencyRate = total_validations > 0 ? (consistent_pairs / total_validations) * 100 : 0;

    return {
      totalValidations: total_validations,
      consistentPairs: consistent_pairs,
      inconsistentPairs: inconsistent_pairs,
      consistencyRate: consistencyRate.toFixed(1),
      avgMatchRate: (avg_match_rate * 100).toFixed(1),
    };
  };

  const stats = calculateStats();

  return (
    <div style={{ padding: '24px' }}>
      {/* 标题和操作区域 */}
      <Card style={{ marginBottom: '24px' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2} style={{ margin: 0 }}>
              <SafetyOutlined /> 数据源一致性报告
            </Title>
            <Text type="secondary">监控多个数据源之间数据的一致性，确保数据准确性</Text>
          </Col>
          <Col>
            <Space>
              <Select
                value={days}
                onChange={handleDaysChange}
                style={{ width: 120 }}
              >
                <Option value={1}>最近1天</Option>
                <Option value={7}>最近7天</Option>
                <Option value={30}>最近30天</Option>
              </Select>
              <Button
                type="primary"
                icon={<SyncOutlined spin={runningValidation} />}
                onClick={runConsistencyValidation}
                loading={runningValidation}
              >
                运行一致性验证
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: '24px' }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总验证对数"
                value={stats.totalValidations}
                prefix={<DatabaseOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="一致对数"
                value={stats.consistentPairs}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="不一致对数"
                value={stats.inconsistentPairs}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="平均匹配率"
                value={stats.avgMatchRate}
                suffix="%"
                valueStyle={{ color: parseFloat(stats.avgMatchRate) >= 95 ? '#52c41a' : '#ff4d4f' }}
                prefix={<BarChartOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 一致性概览 */}
      {stats && (
        <Card style={{ marginBottom: '24px' }} title="一致性概览">
          <Row gutter={16}>
            <Col span={18}>
              <Progress
                percent={parseFloat(stats.consistencyRate)}
                status={parseFloat(stats.consistencyRate) >= 90 ? 'success' : 'normal'}
                strokeColor={{
                  '0%': '#ff4d4f',
                  '50%': '#faad14',
                  '100%': '#52c41a',
                }}
              />
            </Col>
            <Col span={6}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {stats.consistencyRate}%
                </div>
                <Text type="secondary">一致率</Text>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* 多数据源状态 */}
      {multiSourceStatus && (
        <Card style={{ marginBottom: '24px' }} title="数据源状态">
          <Row gutter={16}>
            {Object.entries(multiSourceStatus.sources || {}).map(([sourceName, sourceInfo]: [string, any]) => (
              <Col span={8} key={sourceName}>
                <Card size="small">
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <DatabaseOutlined style={{ marginRight: '8px' }} />
                    <Text strong>{sourceName}</Text>
                    <Tag
                      color={
                        sourceInfo.health?.status === 'healthy' ? 'success' :
                        sourceInfo.health?.status === 'degraded' ? 'warning' : 'error'
                      }
                      style={{ marginLeft: '8px' }}
                    >
                      {sourceInfo.health?.status === 'healthy' ? '健康' :
                       sourceInfo.health?.status === 'degraded' ? '降级' : '不可用'}
                    </Tag>
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    <div>成功率: {(sourceInfo.health?.success_rate * 100).toFixed(1)}%</div>
                    <div>延迟: {sourceInfo.health?.avg_latency.toFixed(2)}秒</div>
                    <div>请求数: {sourceInfo.health?.total_requests}</div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {/* 主内容区域 */}
      <Tabs defaultActiveKey="consistency">
        <TabPane tab="一致性报告" key="consistency">
          <Card>
            {validationReport && validationReport.results && validationReport.results.length > 0 ? (
              <Table
                columns={consistencyColumns}
                dataSource={validationReport.results}
                rowKey={(record) => `${record.source1}_${record.source2}_${record.test_date}`}
                loading={loading}
                pagination={{ pageSize: 10 }}
                expandable={{
                  expandedRowRender: (record: ConsistencyResult) => (
                    <div style={{ margin: 0 }}>
                      <Title level={5}>列匹配详情</Title>
                      {record.column_results && record.column_results.length > 0 ? (
                        <Table
                          columns={columnMatchColumns}
                          dataSource={record.column_results}
                          rowKey="column"
                          size="small"
                          pagination={false}
                        />
                      ) : (
                        <Alert
                          message="无列匹配详情"
                          description="该数据源对没有详细的列匹配信息。"
                          type="info"
                          showIcon
                        />
                      )}
                      <Divider />
                      <Descriptions size="small" column={2}>
                        <Descriptions.Item label="数据源1数据量">{record.data1_count}</Descriptions.Item>
                        <Descriptions.Item label="数据源2数据量">{record.data2_count}</Descriptions.Item>
                        <Descriptions.Item label="共同数据量">{record.common_count}</Descriptions.Item>
                        <Descriptions.Item label="平均样本大小">{record.avg_sample_size?.toFixed(1) || 0}</Descriptions.Item>
                        {record.reason && (
                          <Descriptions.Item label="不一致原因" span={2}>
                            {record.reason}
                          </Descriptions.Item>
                        )}
                      </Descriptions>
                    </div>
                  ),
                  rowExpandable: () => true,
                }}
              />
            ) : (
              <Alert
                message="暂无一致性报告"
                description="当前没有可用的数据源一致性报告，请点击'运行一致性验证'按钮生成报告。"
                type="info"
                showIcon
              />
            )}
          </Card>
        </TabPane>

        <TabPane tab="验证统计" key="statistics">
          <Card>
            {validationReport ? (
              <div>
                <Row gutter={16}>
                  <Col span={12}>
                    <Card title="验证统计" size="small">
                      <Descriptions column={1}>
                        <Descriptions.Item label="总验证对数">
                          {validationReport.total_validations}
                        </Descriptions.Item>
                        <Descriptions.Item label="一致对数">
                          <Tag color="success">{validationReport.consistent_pairs}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="不一致对数">
                          <Tag color="error">{validationReport.inconsistent_pairs}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="平均匹配率">
                          {(validationReport.avg_match_rate * 100).toFixed(1)}%
                        </Descriptions.Item>
                        <Descriptions.Item label="最低匹配率">
                          {(validationReport.min_match_rate * 100).toFixed(1)}%
                        </Descriptions.Item>
                        <Descriptions.Item label="最高匹配率">
                          {(validationReport.max_match_rate * 100).toFixed(1)}%
                        </Descriptions.Item>
                        <Descriptions.Item label="报告时间">
                          {new Date(validationReport.timestamp).toLocaleString('zh-CN')}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card title="一致性趋势" size="small">
                      <div style={{ height: '200px', padding: '10px' }}>
                        {/* 这里可以添加图表组件，暂时用文字描述 */}
                        <div style={{ border: '1px solid #d9d9d9', borderRadius: '4px', padding: '10px', height: '100%' }}>
                          <Text>一致性验证结果分布：</Text>
                          <ul style={{ marginTop: '10px' }}>
                            <li>一致对数: {validationReport.consistent_pairs}</li>
                            <li>不一致对数: {validationReport.inconsistent_pairs}</li>
                            <li>一致率: {validationReport.total_validations > 0 ?
                              ((validationReport.consistent_pairs / validationReport.total_validations) * 100).toFixed(1) : 0}%</li>
                          </ul>
                        </div>
                      </div>
                    </Card>
                  </Col>
                </Row>

                {/* 改进建议 */}
                <Card title="改进建议" style={{ marginTop: '16px' }}>
                  <Timeline>
                    {validationReport.inconsistent_pairs > 0 && (
                      <Timeline.Item color="red">
                        <p>有 {validationReport.inconsistent_pairs} 对数据源不一致，需要检查数据源配置</p>
                      </Timeline.Item>
                    )}
                    {validationReport.avg_match_rate < 0.95 && (
                      <Timeline.Item color="orange">
                        <p>平均匹配率较低 ({(validationReport.avg_match_rate * 100).toFixed(1)}%)，建议优化数据采集流程</p>
                      </Timeline.Item>
                    )}
                    {validationReport.min_match_rate < 0.90 && (
                      <Timeline.Item color="orange">
                        <p>最低匹配率只有 {(validationReport.min_match_rate * 100).toFixed(1)}%，存在严重不一致问题</p>
                      </Timeline.Item>
                    )}
                    {validationReport.consistent_pairs === validationReport.total_validations && (
                      <Timeline.Item color="green">
                        <p>所有数据源对都一致，数据质量优秀</p>
                      </Timeline.Item>
                    )}
                  </Timeline>
                </Card>
              </div>
            ) : (
              <Alert
                message="暂无验证统计"
                description="当前没有可用的验证统计信息。"
                type="info"
                showIcon
              />
            )}
          </Card>
        </TabPane>

        <TabPane tab="配置管理" key="configuration">
          <Card>
            {multiSourceStatus ? (
              <Collapse defaultActiveKey={['basic']}>
                <Panel header="基本配置" key="basic">
                  <Descriptions column={2}>
                    <Descriptions.Item label="首选数据源">
                      {multiSourceStatus.preferred_source || '未设置'}
                    </Descriptions.Item>
                    <Descriptions.Item label="备用顺序">
                      {multiSourceStatus.fallback_order?.join(', ') || '未设置'}
                    </Descriptions.Item>
                    <Descriptions.Item label="缓存大小">
                      {multiSourceStatus.cache_size} 条
                    </Descriptions.Item>
                    <Descriptions.Item label="缓存有效期">
                      {multiSourceStatus.cache_ttl} 秒
                    </Descriptions.Item>
                    <Descriptions.Item label="数据源总数">
                      {multiSourceStatus.total_sources}
                    </Descriptions.Item>
                  </Descriptions>
                </Panel>
                <Panel header="操作" key="operations">
                  <Space>
                    <Button
                      icon={<SyncOutlined />}
                      onClick={runConsistencyValidation}
                      loading={runningValidation}
                    >
                      运行健康检查
                    </Button>
                    <Button
                      icon={<DatabaseOutlined />}
                      onClick={async () => {
                        try {
                          await axios.post(`${DATA_SERVICE_URL}/api/data/multi-source/clear-cache`);
                          // 刷新状态
                          setTimeout(() => fetchMultiSourceStatus(), 1000);
                        } catch (error) {
                          console.error('清空缓存失败:', error);
                        }
                      }}
                    >
                      清空缓存
                    </Button>
                  </Space>
                </Panel>
              </Collapse>
            ) : (
              <Alert
                message="暂无配置信息"
                description="当前没有可用的数据源配置信息。"
                type="info"
                showIcon
              />
            )}
          </Card>
        </TabPane>
      </Tabs>

      {/* 底部提示 */}
      <Card style={{ marginTop: '24px' }}>
        <Alert
          message="数据源一致性监控说明"
          description={
            <div>
              <p>1. 数据源一致性监控用于验证多个数据源之间数据的一致性</p>
              <p>2. 匹配率 ≥ 95% 表示数据一致，90%-95% 表示基本一致，&lt;90% 表示不一致</p>
              <p>3. 建议定期运行一致性验证，确保数据准确性</p>
              <p>4. 发现不一致问题时，需要检查数据源配置和数据采集流程</p>
              <p>5. 系统会自动使用健康的数据源，当首选数据源不可用时自动切换到备用数据源</p>
            </div>
          }
          type="info"
          showIcon
        />
      </Card>
    </div>
  );
};

export default DataSourceConsistency;
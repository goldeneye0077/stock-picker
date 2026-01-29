import React, { useState, useEffect, useCallback } from 'react';
import { Card, Form, Switch, Slider, Select, Button, Divider, Space, message, Spin, Statistic, Row, Col, Alert, Modal, Progress, Typography } from 'antd';
import { SaveOutlined, ReloadOutlined, SyncOutlined, ClockCircleOutlined, DatabaseOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { DATA_SERVICE_URL } from '../config/api';

const { Option } = Select;
const { Text } = Typography;

const formatShanghaiDateTime = (value?: string) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
};

const getHealthDisplay = (available: boolean, status?: string) => {
  if (!available) return { text: '❌ 不可用', color: '#ff4d4f' };
  if (status === 'healthy') return { text: '✅ 健康', color: '#52c41a' };
  if (status === 'degraded') return { text: '⚠️ 降级', color: '#faad14' };
  if (status === 'unavailable') return { text: '⚠️ 异常', color: '#faad14' };
  return { text: '--', color: '#999' };
};

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [dataStatus, setDataStatus] = useState<any>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [multiSourceStatus, setMultiSourceStatus] = useState<any>(null);
  const [qualityMetrics, setQualityMetrics] = useState<any>(null);
  const [incrementalStatus, setIncrementalStatus] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingMultiSource, setLoadingMultiSource] = useState(false);
  const [loadingQuality, setLoadingQuality] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);

  const onFinish = async (values: any) => {
    try {
      // 保存多数据源配置
      if (values.dataSource) {
        await axios.put(`${DATA_SERVICE_URL}/api/data/collection-config/preferred_source?config_value=${encodeURIComponent(values.dataSource)}`);
      }

      if (values.fallbackOrder && values.fallbackOrder.length > 0) {
        await axios.put(`${DATA_SERVICE_URL}/api/data/collection-config/fallback_order?config_value=${encodeURIComponent(values.fallbackOrder.join(','))}`);
      }

      if (values.cacheTTL) {
        await axios.put(`${DATA_SERVICE_URL}/api/data/multi-source/cache-ttl/${values.cacheTTL}`);
      }

      if (values.enableIncremental !== undefined) {
        await axios.put(`${DATA_SERVICE_URL}/api/data/collection-config/incremental_enabled?config_value=${encodeURIComponent(values.enableIncremental.toString())}`);
      }

      if (values.incrementalDays) {
        await axios.put(`${DATA_SERVICE_URL}/api/data/collection-config/incremental_days?config_value=${encodeURIComponent(values.incrementalDays.toString())}`);
      }

      message.success('设置保存成功');
      console.log('Settings saved:', values);

      // 刷新状态
      setTimeout(() => {
        fetchMultiSourceStatus();
        fetchIncrementalStatus();
      }, 1000);

    } catch (error) {
      console.error('保存设置失败:', error);
      message.error('保存设置失败');
    }
  };

  // 获取数据采集状态
  const fetchDataStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/api/data/status`);
      if (response.data.success) {
        setDataStatus(response.data.data);
      }
    } catch (error) {
      console.error('获取数据状态失败:', error);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // 获取调度器状态
  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/api/data/scheduler-status`);
      setSchedulerStatus(response.data);
    } catch (error) {
      console.error('获取调度器状态失败:', error);
    }
  }, []);

  // 获取多数据源状态
  const fetchMultiSourceStatus = useCallback(async () => {
    setLoadingMultiSource(true);
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/api/data/multi-source/status`);
      if (response.data.success) {
        setMultiSourceStatus(response.data.data);
      }
    } catch (error) {
      console.error('获取多数据源状态失败:', error);
    } finally {
      setLoadingMultiSource(false);
    }
  }, []);

  // 获取数据质量指标
  const fetchQualityMetrics = useCallback(async () => {
    setLoadingQuality(true);
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/api/data/quality-metrics?days=7`);
      if (response.data.success) {
        setQualityMetrics(response.data.data);
      }
    } catch (error) {
      console.error('获取数据质量指标失败:', error);
      // 如果API不存在，设置默认值
      setQualityMetrics({
        days: 7,
        total_metrics: 0,
        healthy_metrics: 0
      });
    } finally {
      setLoadingQuality(false);
    }
  }, []);

  // 获取增量更新状态
  const fetchIncrementalStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/api/data/incremental-status`);
      if (response.data.success) {
        setIncrementalStatus(response.data.data);
      }
    } catch (error) {
      console.error('获取增量更新状态失败:', error);
      // 如果API不存在，设置默认状态
      setIncrementalStatus({
        incremental_enabled: false,
        last_collection_date: '--',
        stats: {
          total_count: 0,
          success_rate: 0
        }
      });
    }
  }, []);

  // 获取配置
  const fetchConfig = useCallback(async () => {
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/api/data/collection-config`);
      if (response.data.success) {
        const config = response.data.data;
        const formValues: any = {};

        if (config.preferred_source) {
          formValues.dataSource = config.preferred_source.value;
        }

        if (config.fallback_order) {
          formValues.fallbackOrder = config.fallback_order.value.split(',').filter((item: string) => item.trim());
        }

        if (config.cache_ttl) {
          formValues.cacheTTL = parseInt(config.cache_ttl.value);
        }

        if (config.incremental_enabled) {
          formValues.enableIncremental = config.incremental_enabled.value === 'true';
        }

        if (config.incremental_days) {
          formValues.incrementalDays = parseInt(config.incremental_days.value);
        }

        form.setFieldsValue(formValues);
      }
    } catch (error) {
      console.error('获取配置失败:', error);
    }
  }, [form]);

  // 手动触发数据采集 - 快速更新今日数据
  const handleCollectData = async () => {
    setCollecting(true);
    setProgressModalVisible(true);
    setProgress(0);
    setCurrentStep('正在启动数据更新任务...');
    setStartTime(new Date());

    try {
      const response = await axios.post(`${DATA_SERVICE_URL}/api/data/quick-refresh-all`);

      if (!response.data.success) {
        message.error('数据更新任务启动失败');
        setProgressModalVisible(false);
        setCollecting(false);
        return;
      }

      const strategy = response.data.strategy || 'incremental';

      if (strategy === 'incremental') {
        setCurrentStep('增量更新任务已启动，后台将更新最近数据...');
      } else {
        setCurrentStep('全量更新任务已启动，后台将更新最近7天数据...');
      }
      setProgress(40);

      await new Promise(resolve => setTimeout(resolve, 3000));

      setCurrentStep('正在刷新状态（后台任务可能仍在运行）...');
      setProgress(80);

      await fetchDataStatus();
      await fetchIncrementalStatus();

      setCurrentStep('数据更新任务已启动，可稍后再次刷新查看结果');
      setProgress(100);

      setTimeout(() => {
        setProgressModalVisible(false);
        setCollecting(false);
        message.success('数据更新任务已启动');
      }, 1000);
    } catch (error: any) {
      message.error(`数据更新失败: ${error.message}`);
      setProgressModalVisible(false);
      setCollecting(false);
    }
  };

  // 页面加载时获取状态
  useEffect(() => {
    fetchDataStatus();
    fetchSchedulerStatus();
    fetchMultiSourceStatus();
    fetchQualityMetrics();
    fetchIncrementalStatus();
    fetchConfig();
  }, [fetchDataStatus, fetchSchedulerStatus, fetchMultiSourceStatus, fetchQualityMetrics, fetchIncrementalStatus, fetchConfig]);

  return (
    <div style={{ padding: '24px' }}>
      {/* 数据采集管理卡片 */}
      <Card
        title={
          <Space>
            <DatabaseOutlined />
            数据采集管理
          </Space>
        }
        extra={
          <Space>
            <Button
              type="primary"
              icon={<SyncOutlined spin={collecting} />}
              onClick={handleCollectData}
              loading={collecting}
              disabled={collecting}
            >
              立即更新数据
            </Button>
            <Button
              icon={<CheckCircleOutlined />}
              onClick={async () => {
                try {
                  await axios.post(`${DATA_SERVICE_URL}/api/data/multi-source/run-health-check`);
                  message.success('健康检查已启动');
                  setTimeout(() => fetchMultiSourceStatus(), 2000);
                } catch {
                  message.error('启动健康检查失败');
                }
              }}
            >
              运行健康检查
            </Button>
            <Button
              icon={<DatabaseOutlined />}
              onClick={async () => {
                try {
                  await axios.post(`${DATA_SERVICE_URL}/api/data/multi-source/clear-cache`);
                  message.success('缓存已清空');
                  setTimeout(() => fetchMultiSourceStatus(), 1000);
                } catch {
                  message.error('清空缓存失败');
                }
              }}
            >
              清空缓存
            </Button>
          </Space>
        }
        style={{ marginBottom: '24px' }}
      >
        <Spin spinning={loadingStatus}>
          {/* 数据状态统计 */}
          <Row gutter={16} style={{ marginBottom: '16px' }}>
            <Col span={6}>
              <Statistic
                title="股票总数"
                value={dataStatus?.total_stocks || 0}
                prefix={<DatabaseOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="最近7天有数据"
                value={dataStatus?.stocks_with_recent_data || 0}
                suffix={`/ ${dataStatus?.total_stocks || 0}`}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="成交量分析记录"
                value={dataStatus?.recent_analysis_count || 0}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="最后更新"
                value={formatShanghaiDateTime(dataStatus?.last_update)}
                valueStyle={{ fontSize: '14px' }}
              />
            </Col>
          </Row>

          {/* 调度器状态 */}
          {schedulerStatus && (
            <Alert
              message={
                <Space>
                  <ClockCircleOutlined />
                  定时任务状态
                </Space>
              }
              description={
                schedulerStatus.running ? (
                  <div>
                    <div>✅ 调度器正在运行</div>
                    {schedulerStatus.jobs && schedulerStatus.jobs.length > 0 && (
                      <div style={{ marginTop: '8px' }}>
                        {schedulerStatus.jobs.map((job: any) => (
                          <div key={job.id}>
                            📅 {job.name}: 下次执行时间 {job.next_run_time ? new Date(job.next_run_time).toLocaleString('zh-CN') : '未安排'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  '⚠️ 调度器未运行'
                )
              }
              type={schedulerStatus.running ? 'success' : 'warning'}
              showIcon
            />
          )}

          {/* 数据更新提示 */}
          {dataStatus && dataStatus.stocks_with_recent_data < dataStatus.total_stocks * 0.8 && (
            <Alert
              message="数据可能已过时"
              description={`当前只有 ${((dataStatus.stocks_with_recent_data / dataStatus.total_stocks) * 100).toFixed(1)}% 的股票有最近7天的数据，建议点击"立即更新数据"按钮刷新。`}
              type="warning"
              showIcon
              style={{ marginTop: '16px' }}
            />
          )}
        </Spin>
      </Card>

      {/* 多数据源状态卡片 */}
      <Card
        title={
          <Space>
            <DatabaseOutlined />
            多数据源状态
          </Space>
        }
        style={{ marginBottom: '24px' }}
      >
        <Spin spinning={loadingMultiSource}>
          {multiSourceStatus && (
            <div>
              <Row gutter={16} style={{ marginBottom: '16px' }}>
                <Col span={6}>
                  <Statistic
                    title="数据源总数"
                    value={multiSourceStatus.total_sources || 0}
                    prefix={<DatabaseOutlined />}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="首选数据源"
                    value={multiSourceStatus.preferred_source || '未设置'}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="缓存大小"
                    value={multiSourceStatus.cache_size || 0}
                    suffix="条"
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="缓存有效期"
                    value={multiSourceStatus.cache_ttl || 0}
                    suffix="秒"
                  />
                </Col>
              </Row>

              {/* 数据源详情 */}
              {multiSourceStatus.sources && Object.keys(multiSourceStatus.sources).length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <Divider orientation="left">数据源详情</Divider>
                  {Object.entries(multiSourceStatus.sources).map(([sourceName, sourceInfo]: [string, any]) => {
                    const healthDisplay = getHealthDisplay(!!sourceInfo.available, sourceInfo.health?.status);
                    return (
                      <Card
                        key={sourceName}
                        size="small"
                        style={{ marginBottom: '8px' }}
                        title={
                          <Space>
                            <span>{sourceName}</span>
                            <span style={{ color: healthDisplay.color }}>
                              {healthDisplay.text}
                            </span>
                          </Space>
                        }
                      >
                        <Row gutter={16}>
                          <Col span={8}>
                            <div>可用性: {sourceInfo.available ? '✅ 可用' : '❌ 不可用'}</div>
                            <div>成功率: {(((sourceInfo.health?.success_rate ?? 0) * 100)).toFixed(1)}%</div>
                          </Col>
                          <Col span={8}>
                            <div>平均延迟: {(sourceInfo.health?.avg_latency ?? 0).toFixed(2)}秒</div>
                            <div>总请求数: {sourceInfo.health?.total_requests ?? 0}</div>
                          </Col>
                          <Col span={8}>
                            <div>成功请求: {sourceInfo.health?.successful_requests ?? 0}</div>
                            <div>失败请求: {sourceInfo.health?.failed_requests ?? 0}</div>
                          </Col>
                        </Row>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Spin>
      </Card>

      {/* 数据质量监控卡片 */}
      <Card
        title={
          <Space>
            <CheckCircleOutlined />
            数据质量监控
          </Space>
        }
        style={{ marginBottom: '24px' }}
      >
        <Spin spinning={loadingQuality}>
          {qualityMetrics && (
            <div>
              {qualityMetrics.total_metrics === 0 && (
                <Alert
                  message="数据质量监控 API 不可用或未配置"
                  type="error"
                  showIcon
                  style={{ marginBottom: '16px' }}
                />
              )}
              <Row gutter={16} style={{ marginBottom: '16px' }}>
                <Col span={6}>
                  <Statistic
                    title="监控天数"
                    value={qualityMetrics.days || 0}
                    suffix="天"
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="总指标数"
                    value={qualityMetrics.total_metrics || 0}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="健康指标"
                    value={qualityMetrics.healthy_metrics || 0}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="健康率"
                    value={qualityMetrics.total_metrics > 0 ? ((qualityMetrics.healthy_metrics / qualityMetrics.total_metrics) * 100).toFixed(1) : 0}
                    suffix="%"
                  />
                </Col>
              </Row>

              {/* 指标详情 */}
              {qualityMetrics.metrics && qualityMetrics.metrics.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <Divider orientation="left">关键指标</Divider>
                  <Row gutter={16}>
                    {qualityMetrics.metrics.slice(0, 4).map((metric: any, index: number) => (
                      <Col span={6} key={index}>
                        <Card size="small">
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                              {metric.value}{metric.unit || ''}
                            </div>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              {metric.name}
                            </div>
                            <div style={{
                              fontSize: '12px',
                              color: metric.is_healthy ? '#52c41a' : '#ff4d4f'
                            }}>
                              {metric.is_healthy ? '✅ 健康' : '❌ 异常'}
                            </div>
                          </div>
                        </Card>
                      </Col>
                    ))}
                  </Row>
                </div>
              )}
            </div>
          )}
        </Spin>
      </Card>

      {/* 增量更新状态卡片 */}
      <Card
        title={
          <Space>
            <SyncOutlined />
            增量更新状态
          </Space>
        }
        style={{ marginBottom: '24px' }}
      >
        {incrementalStatus ? (
          <div>
            <Row gutter={16} style={{ marginBottom: '16px' }}>
              <Col span={6}>
                <Statistic
                  title="增量更新启用"
                  value={incrementalStatus.incremental_enabled ? '✅ 已启用' : '❌ 未启用'}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="上次采集时间"
                  value={incrementalStatus.last_collection_date || '--'}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="总采集次数"
                  value={incrementalStatus.stats?.total_count || 0}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="成功率"
                  value={incrementalStatus.stats?.success_rate?.toFixed(1) || 0}
                  suffix="%"
                />
              </Col>
            </Row>

            {/* 上次增量采集详情 */}
            {incrementalStatus.last_incremental && (
              <Alert
                message="上次增量采集详情"
                description={
                  <div>
                    <div>开始时间: {incrementalStatus.last_incremental.start_date}</div>
                    <div>结束时间: {incrementalStatus.last_incremental.end_date}</div>
                    <div>股票数量: {incrementalStatus.last_incremental.stock_count}</div>
                    <div>K线数据: {incrementalStatus.last_incremental.kline_count}</div>
                    <div>耗时: {incrementalStatus.last_incremental.elapsed_time?.toFixed(1)}秒</div>
                  </div>
                }
                type="info"
                showIcon
              />
            )}
          </div>
        ) : (
          <Alert
            message="增量更新状态"
            description="增量更新功能已整合到设置模块中，您可以在下方系统设置中配置增量更新参数。"
            type="info"
            showIcon
          />
        )}
      </Card>

      {/* 系统设置卡片 */}
      <Card title="系统设置">
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            enableNotifications: true,
            volumeThreshold: 2.0,
            fundThreshold: 100,
            dataSource: 'tushare',
            fallbackOrder: ['akshare'],
            cacheTTL: 300,
            enableIncremental: false,
            incrementalDays: 7,
            refreshInterval: 30,
            theme: 'dark',
          }}
        >
          <Divider>通知设置</Divider>
          <Form.Item
            name="enableNotifications"
            label="启用推送通知"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Divider>分析参数</Divider>
          <Form.Item
            name="volumeThreshold"
            label="成交量异动阈值（倍数）"
          >
            <Slider
              min={1.5}
              max={5.0}
              step={0.1}
              marks={{
                1.5: '1.5倍',
                2.0: '2.0倍',
                3.0: '3.0倍',
                5.0: '5.0倍',
              }}
            />
          </Form.Item>

          <Form.Item
            name="fundThreshold"
            label="主力资金阈值（万元）"
          >
            <Slider
              min={50}
              max={1000}
              step={50}
              marks={{
                50: '50万',
                100: '100万',
                500: '500万',
                1000: '1000万',
              }}
            />
          </Form.Item>

          <Divider>数据源设置</Divider>
          <Form.Item
            name="dataSource"
            label="首选数据源"
          >
            <Select>
              <Option value="tushare">Tushare Pro</Option>
              <Option value="akshare">AKShare</Option>
              <Option value="auto">自动选择</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="fallbackOrder"
            label="备用数据源顺序"
          >
            <Select mode="multiple">
              <Option value="tushare">Tushare Pro</Option>
              <Option value="akshare">AKShare</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="cacheTTL"
            label="缓存有效期（秒）"
          >
            <Select>
              <Option value={60}>60秒</Option>
              <Option value={300}>5分钟</Option>
              <Option value={600}>10分钟</Option>
              <Option value={1800}>30分钟</Option>
              <Option value={3600}>1小时</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="enableIncremental"
            label="启用增量更新"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            name="incrementalDays"
            label="增量更新天数"
          >
            <Select>
              <Option value={1}>1天</Option>
              <Option value={3}>3天</Option>
              <Option value={7}>7天</Option>
              <Option value={14}>14天</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="refreshInterval"
            label="数据刷新间隔（秒）"
          >
            <Select>
              <Option value={10}>10秒</Option>
              <Option value={30}>30秒</Option>
              <Option value={60}>1分钟</Option>
              <Option value={300}>5分钟</Option>
            </Select>
          </Form.Item>

          <Divider>界面设置</Divider>
          <Form.Item
            name="theme"
            label="主题"
          >
            <Select>
              <Option value="dark">深色主题</Option>
              <Option value="light">浅色主题</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                保存设置
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => form.resetFields()}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 数据采集进度模态框 */}
      <Modal
        title={
          <Space>
            <SyncOutlined spin />
            数据采集进度
          </Space>
        }
        open={progressModalVisible}
        footer={null}
        closable={false}
        centered
        width={500}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Text strong style={{ fontSize: '16px' }}>{currentStep}</Text>
            <Progress
              percent={progress}
              status={progress === 100 ? 'success' : 'active'}
              strokeColor={{
                '0%': '#108ee9',
                '100%': '#87d068',
              }}
            />
          </div>

          {startTime && progress < 100 && (
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="已用时"
                  value={Math.floor((new Date().getTime() - startTime.getTime()) / 1000)}
                  suffix="秒"
                  prefix={<ClockCircleOutlined />}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="预计剩余"
                  value={Math.floor((100 - progress) / 100 * 30)}
                  suffix="秒"
                  prefix={<ClockCircleOutlined />}
                />
              </Col>
            </Row>
          )}

          {progress === 100 && (
            <Alert
              message="数据采集完成"
              description="所有数据已成功采集并保存到数据库"
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
            />
          )}
        </Space>
      </Modal>
    </div>
  );
};

export default Settings;

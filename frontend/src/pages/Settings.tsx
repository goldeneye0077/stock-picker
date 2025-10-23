import React, { useState, useEffect } from 'react';
import { Card, Form, Switch, Slider, Select, Button, Divider, Space, message, Spin, Statistic, Row, Col, Alert, Modal, Progress, Typography } from 'antd';
import { SaveOutlined, ReloadOutlined, SyncOutlined, ClockCircleOutlined, DatabaseOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { DATA_SERVICE_URL } from '../config/api';

const { Option } = Select;
const { Text } = Typography;

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [dataStatus, setDataStatus] = useState<any>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [startTime, setStartTime] = useState<Date | null>(null);

  const onFinish = (values: any) => {
    console.log('Settings saved:', values);
  };

  // 获取数据采集状态
  const fetchDataStatus = async () => {
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
  };

  // 获取调度器状态
  const fetchSchedulerStatus = async () => {
    try {
      const response = await axios.get(`${DATA_SERVICE_URL}/api/data/scheduler-status`);
      setSchedulerStatus(response.data);
    } catch (error) {
      console.error('获取调度器状态失败:', error);
    }
  };

  // 手动触发数据采集
  const handleCollectData = async () => {
    setCollecting(true);
    setProgressModalVisible(true);
    setProgress(0);
    setCurrentStep('正在启动数据采集任务...');
    setStartTime(new Date());

    try {
      const response = await axios.post(`${DATA_SERVICE_URL}/api/data/batch-collect-7days`, {
        include_moneyflow: true
      });

      if (response.data.success) {
        // 模拟进度更新
        simulateProgress();
      } else {
        message.error('启动数据采集失败');
        setProgressModalVisible(false);
        setCollecting(false);
      }
    } catch (error: any) {
      message.error(`采集失败: ${error.message}`);
      setProgressModalVisible(false);
      setCollecting(false);
    }
  };

  // 模拟进度更新
  const simulateProgress = () => {
    const steps = [
      { progress: 4, step: '正在获取交易日历...', duration: 2000 },
      { progress: 10, step: '正在下载股票基本信息...', duration: 2500 },
      { progress: 20, step: '正在下载K线数据 (1/7)...', duration: 2500 },
      { progress: 28, step: '正在下载K线数据 (3/7)...', duration: 2500 },
      { progress: 36, step: '正在下载K线数据 (5/7)...', duration: 2500 },
      { progress: 44, step: '正在下载K线数据 (7/7)...', duration: 2000 },
      { progress: 52, step: '正在下载DC资金流向数据 (1/7)...', duration: 2500 },
      { progress: 60, step: '正在下载DC资金流向数据 (3/7)...', duration: 2500 },
      { progress: 68, step: '正在下载DC资金流向数据 (5/7)...', duration: 2500 },
      { progress: 76, step: '正在下载DC资金流向数据 (7/7)...', duration: 2000 },
      { progress: 82, step: '正在下载每日技术指标 (1/7)...', duration: 2500 },
      { progress: 88, step: '正在下载每日技术指标 (3/7)...', duration: 2500 },
      { progress: 94, step: '正在下载每日技术指标 (5/7)...', duration: 2500 },
      { progress: 98, step: '正在下载每日技术指标 (7/7)...', duration: 2000 },
      { progress: 100, step: '数据采集完成！', duration: 1000 },
    ];

    let index = 0;
    const updateProgress = () => {
      if (index < steps.length) {
        const { progress: prog, step, duration } = steps[index];
        setProgress(prog);
        setCurrentStep(step);
        index++;
        setTimeout(updateProgress, duration);
      } else {
        // 采集完成
        setTimeout(() => {
          setProgressModalVisible(false);
          setCollecting(false);
          message.success('数据采集完成！');
          fetchDataStatus();
        }, 1000);
      }
    };

    updateProgress();
  };

  // 页面加载时获取状态
  useEffect(() => {
    fetchDataStatus();
    fetchSchedulerStatus();

    // 每30秒刷新一次状态
    const interval = setInterval(() => {
      fetchDataStatus();
      fetchSchedulerStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

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
          <Button
            type="primary"
            icon={<SyncOutlined spin={collecting} />}
            onClick={handleCollectData}
            loading={collecting}
            disabled={collecting}
          >
            立即更新数据
          </Button>
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
                value={dataStatus?.last_update ? new Date(dataStatus.last_update).toLocaleString('zh-CN') : '--'}
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
            label="数据源"
          >
            <Select>
              <Option value="tushare">Tushare Pro</Option>
              <Option value="sina">新浪财经</Option>
              <Option value="eastmoney">东方财富</Option>
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
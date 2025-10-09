import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, List, Tag, message, Progress, Space, Typography } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, RiseOutlined, FundOutlined } from '@ant-design/icons';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

const { Text, Title } = Typography;

// 市场概览内容组件
const MarketOverviewContent: React.FC<{ stats: any[], signals: any[] }> = ({ stats, signals }) => {
  const getMarketStatus = () => {
    const totalStocks = stats[0]?.value || 0;
    const todaySignals = stats[1]?.value || 0;
    const volumeSurges = stats[2]?.value || 0;

    if (totalStocks === 0) return { status: '数据加载中', color: '#666' };
    if (todaySignals >= 5) return { status: '活跃', color: '#52c41a' };
    if (volumeSurges >= 3) return { status: '异动', color: '#faad14' };
    return { status: '平稳', color: '#1890ff' };
  };

  const marketStatus = getMarketStatus();

  return (
    <div style={{ padding: '12px 0' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 市场状态 */}
        <div style={{ textAlign: 'center' }}>
          <Title level={4} style={{ margin: 0, color: marketStatus.color }}>
            <FundOutlined style={{ marginRight: 8 }} />
            市场状态：{marketStatus.status}
          </Title>
        </div>

        {/* 活跃度指标 */}
        <Row gutter={16}>
          <Col span={12}>
            <Text type="secondary">信号活跃度</Text>
            <Progress
              percent={Math.min((stats[1]?.value || 0) * 20, 100)}
              strokeColor={marketStatus.color}
              size="small"
              format={(percent) => `${stats[1]?.value || 0}个`}
            />
          </Col>
          <Col span={12}>
            <Text type="secondary">成交量异动</Text>
            <Progress
              percent={Math.min((stats[2]?.value || 0) * 15, 100)}
              strokeColor="#faad14"
              size="small"
              format={(percent) => `${stats[2]?.value || 0}个`}
            />
          </Col>
        </Row>

        {/* 热点板块 */}
        <div>
          <Text strong style={{ color: '#1890ff' }}>
            <RiseOutlined style={{ marginRight: 4 }} />
            今日热点
          </Text>
          <div style={{ marginTop: 8 }}>
            {signals.length > 0 ? (
              <Space wrap>
                {signals.slice(0, 3).map((signal: any, index) => (
                  <Tag key={index} color="blue" style={{ margin: '2px' }}>
                    {signal.stock} {signal.name}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary">暂无热点数据</Text>
            )}
          </div>
        </div>

        {/* 市场趋势简要分析 */}
        <div style={{
          backgroundColor: '#001529',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #d9d9d9'
        }}>
          <Text style={{
            fontSize: '13px',
            color: '#ffffff',
            fontWeight: '500'
          }}>
            📊 基于当前数据分析：监控 <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{stats[0]?.value || 0}</span> 只股票，
            发现 <span style={{ color: '#faad14', fontWeight: 'bold' }}>{stats[1]?.value || 0}</span> 个买入信号，
            <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{stats[2]?.value || 0}</span> 只股票出现成交量异动
          </Text>
        </div>
      </Space>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState([
    { title: '今日监控股票', value: 0, prefix: <ArrowUpOutlined /> },
    { title: '主力介入信号', value: 0, prefix: <ArrowUpOutlined /> },
    { title: '买入提醒', value: 0, prefix: <ArrowUpOutlined /> },
    { title: '预警消息', value: 0, prefix: <ArrowDownOutlined /> },
  ]);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch market overview
      const overviewResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/market-overview`);
      const overviewResult = await overviewResponse.json();

      if (overviewResult.success) {
        const data = overviewResult.data;
        setStats([
          { title: '今日监控股票', value: data.totalStocks || 0, prefix: <ArrowUpOutlined /> },
          { title: '主力介入信号', value: data.todaySignals || 0, prefix: <ArrowUpOutlined /> },
          { title: '成交量异动', value: data.volumeSurges || 0, prefix: <ArrowUpOutlined /> },
          { title: '重点关注', value: data.topVolumeSurge?.length || 0, prefix: <ArrowDownOutlined /> },
        ]);

        // Format signals from top volume surge data
        if (data.topVolumeSurge) {
          const formattedSignals = data.topVolumeSurge.slice(0, 5).map((item: any) => ({
            stock: item.stock_code,
            name: item.name || '未知',
            signal: '成交量异动',
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            volumeRatio: item.volume_ratio
          }));
          setSignals(formattedSignals);
        }
      }

      // Fetch recent signals
      const signalsResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/signals?days=1`);
      const signalsResult = await signalsResponse.json();

      if (signalsResult.success && signalsResult.data.signals.length > 0) {
        const recentSignals = signalsResult.data.signals.slice(0, 5).map((signal: any) => ({
          stock: signal.stock_code,
          name: signal.stock_name || '未知',
          signal: signal.signal_type,
          time: new Date(signal.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          confidence: signal.confidence
        }));
        setSignals(recentSignals);
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      message.error('获取面板数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]}>
        {stats.map((stat, index) => (
          <Col span={6} key={index}>
            <Card loading={loading}>
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={stat.prefix}
                valueStyle={{ color: stat.prefix.type.name === 'ArrowUpOutlined' ? '#3f8600' : '#cf1322' }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col span={12}>
          <Card title="今日信号" extra={<a href="#more" onClick={fetchDashboardData}>刷新</a>}>
            <List
              dataSource={signals}
              loading={loading}
              locale={{ emptyText: '暂无信号数据' }}
              renderItem={(item: any) => (
                <List.Item>
                  <List.Item.Meta
                    title={`${item.stock} ${item.name}`}
                    description={`${item.time}${item.volumeRatio ? ` | 量比: ${item.volumeRatio.toFixed(2)}` : ''}${item.confidence ? ` | 置信度: ${(item.confidence * 100).toFixed(1)}%` : ''}`}
                  />
                  <Tag color={item.signal.includes('买入') ? 'green' : (item.signal.includes('异动') ? 'orange' : 'blue')}>
                    {item.signal}
                  </Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="市场概览" style={{ height: '300px' }} loading={loading}>
            <MarketOverviewContent stats={stats} signals={signals} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
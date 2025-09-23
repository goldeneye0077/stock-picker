import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, List, Tag, message } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

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
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '200px',
              color: '#666'
            }}>
              <span>图表组件位置 - 待接入TradingView</span>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
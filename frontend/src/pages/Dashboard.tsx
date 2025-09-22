import React from 'react';
import { Card, Row, Col, Statistic, List, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';

const Dashboard: React.FC = () => {
  const mockStats = [
    { title: '今日监控股票', value: 168, prefix: <ArrowUpOutlined /> },
    { title: '主力介入信号', value: 12, prefix: <ArrowUpOutlined /> },
    { title: '买入提醒', value: 5, prefix: <ArrowUpOutlined /> },
    { title: '预警消息', value: 3, prefix: <ArrowDownOutlined /> },
  ];

  const mockSignals = [
    { stock: '000001', name: '平安银行', signal: '主力介入', time: '09:30' },
    { stock: '000002', name: '万科A', signal: '买入信号', time: '10:15' },
    { stock: '600036', name: '招商银行', signal: '资金流入', time: '11:20' },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]}>
        {mockStats.map((stat, index) => (
          <Col span={6} key={index}>
            <Card>
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
          <Card title="今日信号" extra={<a href="#more">查看更多</a>}>
            <List
              dataSource={mockSignals}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={`${item.stock} ${item.name}`}
                    description={item.time}
                  />
                  <Tag color={item.signal === '买入信号' ? 'green' : 'blue'}>
                    {item.signal}
                  </Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="市场概览" style={{ height: '300px' }}>
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
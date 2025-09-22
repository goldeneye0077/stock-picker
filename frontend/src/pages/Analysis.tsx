import React from 'react';
import { Card, Row, Col, Progress, List, Avatar } from 'antd';
import { FundOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';

const Analysis: React.FC = () => {
  const fundFlowData = [
    { type: '主力资金', amount: '+2.8亿', percent: 65, color: '#f50' },
    { type: '中户资金', amount: '-1.2亿', percent: 25, color: '#2db7f5' },
    { type: '散户资金', amount: '-1.6亿', percent: 40, color: '#87d068' },
  ];

  const volumeAnalysis = [
    { stock: '000001', name: '平安银行', volumeRatio: 2.8, trend: 'up' },
    { stock: '000002', name: '万科A', volumeRatio: 1.5, trend: 'down' },
    { stock: '600036', name: '招商银行', volumeRatio: 3.2, trend: 'up' },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title="资金流向分析" extra={<FundOutlined />}>
            {fundFlowData.map((item, index) => (
              <div key={index} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>{item.type}</span>
                  <span style={{ color: item.amount.startsWith('+') ? '#3f8600' : '#cf1322' }}>
                    {item.amount}
                  </span>
                </div>
                <Progress
                  percent={item.percent}
                  strokeColor={item.color}
                  showInfo={false}
                />
              </div>
            ))}
          </Card>
        </Col>

        <Col span={12}>
          <Card title="成交量异动分析">
            <List
              dataSource={volumeAnalysis}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        icon={item.trend === 'up' ? <RiseOutlined /> : <FallOutlined />}
                        style={{
                          backgroundColor: item.trend === 'up' ? '#52c41a' : '#ff4d4f'
                        }}
                      />
                    }
                    title={`${item.stock} ${item.name}`}
                    description={`量比: ${item.volumeRatio}倍`}
                  />
                  <div style={{
                    color: item.trend === 'up' ? '#3f8600' : '#cf1322',
                    fontWeight: 'bold'
                  }}>
                    {item.trend === 'up' ? '放量上涨' : '缩量下跌'}
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col span={24}>
          <Card title="主力行为分析" style={{ height: '400px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '300px',
              color: '#666'
            }}>
              <span>主力识别算法图表 - 待实现机器学习模型</span>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Analysis;
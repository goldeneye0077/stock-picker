import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Progress, List, Avatar, message } from 'antd';
import { FundOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

const Analysis: React.FC = () => {
  const [fundFlowData, setFundFlowData] = useState([]);
  const [volumeAnalysis, setVolumeAnalysis] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAnalysisData = async () => {
    setLoading(true);
    try {
      // Fetch fund flow data
      const fundFlowResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/fund-flow?days=30`);
      const fundFlowResult = await fundFlowResponse.json();

      if (fundFlowResult.success && fundFlowResult.data.summary) {
        const summary = fundFlowResult.data.summary;
        const totalFlow = Math.abs(summary.totalMainFlow) + Math.abs(summary.totalRetailFlow) + Math.abs(summary.totalInstitutionalFlow);

        setFundFlowData([
          {
            type: '主力资金',
            amount: `${summary.totalMainFlow >= 0 ? '+' : ''}${(summary.totalMainFlow / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? Math.abs(summary.totalMainFlow) / totalFlow * 100 : 0,
            color: '#f50'
          },
          {
            type: '机构资金',
            amount: `${summary.totalInstitutionalFlow >= 0 ? '+' : ''}${(summary.totalInstitutionalFlow / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? Math.abs(summary.totalInstitutionalFlow) / totalFlow * 100 : 0,
            color: '#2db7f5'
          },
          {
            type: '散户资金',
            amount: `${summary.totalRetailFlow >= 0 ? '+' : ''}${(summary.totalRetailFlow / 100000000).toFixed(1)}亿`,
            percent: totalFlow > 0 ? Math.abs(summary.totalRetailFlow) / totalFlow * 100 : 0,
            color: '#87d068'
          }
        ]);
      }

      // Fetch volume analysis data
      const volumeResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/volume?days=10`);
      const volumeResult = await volumeResponse.json();

      if (volumeResult.success && volumeResult.data.volumeSurges) {
        const volumeData = volumeResult.data.volumeSurges.slice(0, 10).map((item: any) => ({
          stock: item.stock_code,
          name: '股票' + item.stock_code, // Fallback name
          volumeRatio: item.volume_ratio,
          trend: item.volume_ratio > 2 ? 'up' : 'down'
        }));
        setVolumeAnalysis(volumeData);
      }

    } catch (error) {
      console.error('Error fetching analysis data:', error);
      message.error('获取分析数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysisData();
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title="资金流向分析" extra={<FundOutlined />} loading={loading}>
            {fundFlowData.map((item: any, index) => (
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
            {fundFlowData.length === 0 && !loading && (
              <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                暂无资金流向数据
              </div>
            )}
          </Card>
        </Col>

        <Col span={12}>
          <Card title="成交量异动分析" loading={loading}>
            <List
              dataSource={volumeAnalysis}
              locale={{ emptyText: '暂无成交量异动数据' }}
              renderItem={(item: any) => (
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
                    description={`量比: ${item.volumeRatio?.toFixed(2) || 0}倍`}
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
          <Card title="主力行为分析" style={{ height: '400px' }} loading={loading}>
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
import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Progress, List, Avatar, message, Table, Tag, Statistic, Space, Typography } from 'antd';
import { FundOutlined, RiseOutlined, FallOutlined, TrophyOutlined, FireOutlined, StarOutlined } from '@ant-design/icons';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

const { Text, Title } = Typography;

const Analysis: React.FC = () => {
  const [fundFlowData, setFundFlowData] = useState([]);
  const [volumeAnalysis, setVolumeAnalysis] = useState([]);
  const [mainForceData, setMainForceData] = useState([]);
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

      // 直接使用模拟的主力行为分析数据（暂时不依赖API）
      const mockMainForceData = [
        {
          key: '1',
          stock: '600519',
          name: '贵州茅台',
          behavior: '持续建仓',
          strength: 85,
          volume: '12.5亿',
          trend: 'strong',
          days: 3
        },
        {
          key: '2',
          stock: '000858',
          name: '五粮液',
          behavior: '震荡洗盘',
          strength: 72,
          volume: '8.3亿',
          trend: 'moderate',
          days: 5
        },
        {
          key: '3',
          stock: '300750',
          name: '宁德时代',
          behavior: '大幅建仓',
          strength: 92,
          volume: '25.8亿',
          trend: 'strong',
          days: 2
        },
        {
          key: '4',
          stock: '002415',
          name: '海康威视',
          behavior: '缓慢减仓',
          strength: 45,
          volume: '6.7亿',
          trend: 'weak',
          days: 7
        },
        {
          key: '5',
          stock: '600036',
          name: '招商银行',
          behavior: '稳定持有',
          strength: 68,
          volume: '15.2亿',
          trend: 'moderate',
          days: 4
        }
      ];
      setMainForceData(mockMainForceData);

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
        <Col span={10}>
          <Card title="资金流向分析" extra={<FundOutlined />} loading={loading}>
            {fundFlowData.map((item: any, index) => (
              <div key={index} style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  flexWrap: 'nowrap'
                }}>
                  <span style={{ minWidth: '80px', fontSize: '14px' }}>{item.type}</span>
                  <span style={{
                    color: item.amount.startsWith('+') ? '#3f8600' : '#cf1322',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    marginLeft: '8px'
                  }}>
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

        <Col span={14}>
          <Card title="成交量异动分析" loading={loading} style={{ height: '100%' }}>
            <List
              dataSource={volumeAnalysis}
              locale={{ emptyText: '暂无成交量异动数据' }}
              size="small"
              split={false}
              renderItem={(item: any) => (
                <List.Item style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #e8e8e8',
                  backgroundColor: '#001529',
                  marginBottom: '8px',
                  borderRadius: '6px',
                  border: '1px solid #434343'
                }}>
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        icon={item.trend === 'up' ? <RiseOutlined /> : <FallOutlined />}
                        style={{
                          backgroundColor: item.trend === 'up' ? '#52c41a' : '#ff4d4f'
                        }}
                      />
                    }
                    title={
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'nowrap',
                        minWidth: 0
                      }}>
                        <span style={{
                          fontWeight: '500',
                          fontSize: '14px',
                          color: '#ffffff',
                          flex: '1',
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.stock} {item.name}
                        </span>
                        <span style={{
                          color: item.trend === 'up' ? '#52c41a' : '#ff4d4f',
                          fontWeight: 'bold',
                          fontSize: '12px',
                          marginLeft: '12px',
                          flexShrink: 0
                        }}>
                          {item.trend === 'up' ? '放量上涨' : '缩量下跌'}
                        </span>
                      </div>
                    }
                    description={
                      <div style={{
                        fontSize: '12px',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'nowrap'
                      }}>
                        <span>量比: </span>
                        <span style={{ fontWeight: 'bold', color: '#40a9ff', marginRight: '8px' }}>
                          {item.volumeRatio?.toFixed(2) || 0}倍
                        </span>
                        {item.volumeRatio > 2 && (
                          <span style={{
                            color: '#ff7875',
                            fontWeight: 'bold',
                            fontSize: '11px',
                            flexShrink: 0
                          }}>
                            异常放量
                          </span>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col span={24}>
          <Card
            title={
              <Space>
                <TrophyOutlined style={{ color: '#faad14' }} />
                主力行为分析
              </Space>
            }
            loading={loading}
          >
            {mainForceData.length > 0 ? (
              <div>
                {/* 统计概览 */}
                <Row gutter={16} style={{ marginBottom: '24px' }}>
                  <Col span={6}>
                    <Card size="small" style={{ textAlign: 'center' }}>
                      <Statistic
                        title="强势建仓"
                        value={mainForceData.filter(item => item.trend === 'strong').length}
                        prefix={<FireOutlined style={{ color: '#ff4d4f' }} />}
                        valueStyle={{ color: '#ff4d4f' }}
                        suffix="只"
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" style={{ textAlign: 'center' }}>
                      <Statistic
                        title="稳定操作"
                        value={mainForceData.filter(item => item.trend === 'moderate').length}
                        prefix={<StarOutlined style={{ color: '#1890ff' }} />}
                        valueStyle={{ color: '#1890ff' }}
                        suffix="只"
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" style={{ textAlign: 'center' }}>
                      <Statistic
                        title="平均强度"
                        value={Math.round(mainForceData.reduce((sum, item) => sum + item.strength, 0) / mainForceData.length)}
                        prefix={<TrophyOutlined style={{ color: '#52c41a' }} />}
                        valueStyle={{ color: '#52c41a' }}
                        suffix="%"
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card size="small" style={{ textAlign: 'center' }}>
                      <Statistic
                        title="总成交量"
                        value="68.5"
                        prefix={<RiseOutlined style={{ color: '#faad14' }} />}
                        valueStyle={{ color: '#faad14' }}
                        suffix="亿"
                      />
                    </Card>
                  </Col>
                </Row>

                {/* 主力行为表格 */}
                <Table
                  dataSource={mainForceData}
                  pagination={false}
                  size="small"
                  scroll={{ y: 200 }}
                  columns={[
                    {
                      title: '股票',
                      dataIndex: 'stock',
                      key: 'stock',
                      width: 80,
                      render: (text, record) => (
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{text}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>{record.name}</div>
                        </div>
                      )
                    },
                    {
                      title: '主力行为',
                      dataIndex: 'behavior',
                      key: 'behavior',
                      width: 100,
                      render: (text, record) => {
                        const colors = {
                          strong: '#ff4d4f',
                          moderate: '#1890ff',
                          weak: '#666'
                        };
                        return (
                          <Tag color={colors[record.trend] || '#666'}>
                            {text}
                          </Tag>
                        );
                      }
                    },
                    {
                      title: '强度指数',
                      dataIndex: 'strength',
                      key: 'strength',
                      width: 120,
                      render: (strength) => (
                        <div>
                          <Progress
                            percent={strength}
                            size="small"
                            strokeColor={
                              strength >= 80 ? '#ff4d4f' :
                              strength >= 60 ? '#faad14' : '#52c41a'
                            }
                            format={() => `${strength}%`}
                          />
                        </div>
                      )
                    },
                    {
                      title: '成交量',
                      dataIndex: 'volume',
                      key: 'volume',
                      width: 80,
                      render: (volume) => (
                        <Text strong style={{ color: '#1890ff' }}>{volume}</Text>
                      )
                    },
                    {
                      title: '持续天数',
                      dataIndex: 'days',
                      key: 'days',
                      width: 80,
                      render: (days) => (
                        <Tag color="blue">{days}天</Tag>
                      )
                    },
                    {
                      title: '操作建议',
                      key: 'advice',
                      width: 100,
                      render: (_, record) => {
                        let advice = '';
                        let color = '';
                        if (record.strength >= 80 && record.trend === 'strong') {
                          advice = '重点关注';
                          color = '#ff4d4f';
                        } else if (record.strength >= 60) {
                          advice = '适度关注';
                          color = '#faad14';
                        } else {
                          advice = '谨慎观察';
                          color = '#666';
                        }
                        return <Tag color={color}>{advice}</Tag>;
                      }
                    }
                  ]}
                />
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '200px',
                color: '#666'
              }}>
                <span>暂无主力行为分析数据</span>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Analysis;
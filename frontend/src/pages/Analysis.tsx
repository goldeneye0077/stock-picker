import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Progress, List, Avatar, message, Table, Tag, Statistic, Space, Typography, Select, Input, Button, DatePicker, Tooltip } from 'antd';
import { FundOutlined, RiseOutlined, FallOutlined, TrophyOutlined, FireOutlined, StarOutlined, SearchOutlined, ReloadOutlined, InfoCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const Analysis: React.FC = () => {
  const [fundFlowData, setFundFlowData] = useState([]);
  const [volumeAnalysis, setVolumeAnalysis] = useState([]);
  const [mainForceData, setMainForceData] = useState([]);
  const [mainForceSummary, setMainForceSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 筛选条件状态
  const [filters, setFilters] = useState({
    board: '',      // 板块: main/gem/star/bse
    exchange: '',   // 交易所: SSE/SZSE/BSE
    stockSearch: '', // 股票代码或名称搜索
    dateFrom: '',   // 开始日期
    dateTo: ''      // 结束日期
  });

  // 主力行为分析筛选条件
  const [mainForceFilters, setMainForceFilters] = useState({
    days: 7,        // 分析天数
    limit: 20,      // 显示数量
    dateFrom: '',   // 开始日期
    dateTo: ''      // 结束日期
  });

  // 资金流向分析筛选条件
  const [fundFlowFilters, setFundFlowFilters] = useState({
    days: 30,       // 分析天数
    dateFrom: '',   // 开始日期
    dateTo: ''      // 结束日期
  });

  // 单独刷新资金流向分析数据
  const fetchFundFlowData = async () => {
    setLoading(true);
    try {
      const fundFlowParams = new URLSearchParams({
        days: String(fundFlowFilters.days)
      });
      if (fundFlowFilters.dateFrom) fundFlowParams.append('date_from', fundFlowFilters.dateFrom);
      if (fundFlowFilters.dateTo) fundFlowParams.append('date_to', fundFlowFilters.dateTo);

      const fundFlowResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/fund-flow?${fundFlowParams}`);
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
        message.success('资金流向数据已刷新');
      } else {
        setFundFlowData([]);
        message.info('暂无资金流向数据');
      }
    } catch (error) {
      console.error('Error fetching fund flow data:', error);
      message.error('刷新资金流向数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 单独刷新成交量异动分析数据
  const fetchVolumeAnalysisData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: '10' });
      if (filters.board) params.append('board', filters.board);
      if (filters.exchange) params.append('exchange', filters.exchange);
      if (filters.stockSearch) params.append('stock_search', filters.stockSearch);
      if (filters.dateFrom) params.append('date_from', filters.dateFrom);
      if (filters.dateTo) params.append('date_to', filters.dateTo);

      const volumeResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/volume?${params}`);
      const volumeResult = await volumeResponse.json();

      if (volumeResult.success && volumeResult.data.volumeSurges) {
        const volumeData = volumeResult.data.volumeSurges.map((item: any) => ({
          stock: item.stock_code,
          name: item.stock_name || '未知股票',
          exchange: item.exchange || '',
          volumeRatio: item.volume_ratio,
          trend: item.volume_ratio > 2 ? 'up' : 'down'
        }));
        setVolumeAnalysis(volumeData);
        message.success('成交量异动数据已刷新');
      } else {
        setVolumeAnalysis([]);
        message.info('暂无成交量异动数据');
      }
    } catch (error) {
      console.error('Error fetching volume analysis data:', error);
      message.error('刷新成交量异动数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 单独刷新主力行为分析数据
  const fetchMainForceData = async () => {
    setLoading(true);
    try {
      const mainForceParams = new URLSearchParams({
        days: String(mainForceFilters.days),
        limit: String(mainForceFilters.limit)
      });
      if (mainForceFilters.dateFrom) mainForceParams.append('date_from', mainForceFilters.dateFrom);
      if (mainForceFilters.dateTo) mainForceParams.append('date_to', mainForceFilters.dateTo);

      const mainForceResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/main-force?${mainForceParams}`);
      const mainForceResult = await mainForceResponse.json();

      if (mainForceResult.success && mainForceResult.data.mainForce) {
        const mainForceDataWithKey = mainForceResult.data.mainForce.map((item: any, index: number) => ({
          key: String(index + 1),
          ...item
        }));
        setMainForceData(mainForceDataWithKey);
        setMainForceSummary(mainForceResult.data.summary);
        message.success('主力行为数据已刷新');
      } else {
        setMainForceData([]);
        setMainForceSummary(null);
        message.info('暂无主力行为数据');
      }
    } catch (error) {
      console.error('Error fetching main force data:', error);
      message.error('刷新主力行为数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalysisData = async () => {
    setLoading(true);
    try {
      // Fetch fund flow data with filters
      const fundFlowParams = new URLSearchParams({
        days: String(fundFlowFilters.days)
      });
      if (fundFlowFilters.dateFrom) fundFlowParams.append('date_from', fundFlowFilters.dateFrom);
      if (fundFlowFilters.dateTo) fundFlowParams.append('date_to', fundFlowFilters.dateTo);

      const fundFlowResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/fund-flow?${fundFlowParams}`);
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

      // Fetch volume analysis data with filters
      const params = new URLSearchParams({ days: '10' });
      if (filters.board) params.append('board', filters.board);
      if (filters.exchange) params.append('exchange', filters.exchange);
      if (filters.stockSearch) params.append('stock_search', filters.stockSearch);
      if (filters.dateFrom) params.append('date_from', filters.dateFrom);
      if (filters.dateTo) params.append('date_to', filters.dateTo);

      const volumeResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/volume?${params}`);
      const volumeResult = await volumeResponse.json();

      console.log('📊 Volume API Response:', volumeResult);
      console.log('📊 Volume Surges:', volumeResult.data?.volumeSurges);

      if (volumeResult.success && volumeResult.data.volumeSurges) {
        const volumeData = volumeResult.data.volumeSurges.map((item: any) => ({
          stock: item.stock_code,
          name: item.stock_name || '未知股票',
          exchange: item.exchange || '',
          volumeRatio: item.volume_ratio,
          trend: item.volume_ratio > 2 ? 'up' : 'down'
        }));
        console.log('📊 Processed Volume Data:', volumeData);
        setVolumeAnalysis(volumeData);
      } else {
        console.warn('⚠️ No volume surge data found:', volumeResult);
        setVolumeAnalysis([]);
      }

      // Fetch main force behavior analysis
      const mainForceParams = new URLSearchParams({
        days: String(mainForceFilters.days),
        limit: String(mainForceFilters.limit)
      });
      if (mainForceFilters.dateFrom) mainForceParams.append('date_from', mainForceFilters.dateFrom);
      if (mainForceFilters.dateTo) mainForceParams.append('date_to', mainForceFilters.dateTo);

      const mainForceResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/main-force?${mainForceParams}`);
      const mainForceResult = await mainForceResponse.json();

      if (mainForceResult.success && mainForceResult.data.mainForce) {
        const mainForceDataWithKey = mainForceResult.data.mainForce.map((item: any, index: number) => ({
          key: String(index + 1),
          ...item
        }));
        setMainForceData(mainForceDataWithKey);
        setMainForceSummary(mainForceResult.data.summary);
      } else {
        setMainForceData([]);
        setMainForceSummary(null);
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
  }, [filters, mainForceFilters, fundFlowFilters]); // 当筛选条件变化时重新获取数据

  // 重置筛选条件
  const handleResetFilters = () => {
    setFilters({
      board: '',
      exchange: '',
      stockSearch: '',
      dateFrom: '',
      dateTo: ''
    });
  };

  // 处理日期范围变化
  const handleDateRangeChange = (dates: any) => {
    if (dates && dates.length === 2) {
      setFilters({
        ...filters,
        dateFrom: dates[0].format('YYYY-MM-DD'),
        dateTo: dates[1].format('YYYY-MM-DD')
      });
    } else {
      setFilters({
        ...filters,
        dateFrom: '',
        dateTo: ''
      });
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]}>
        <Col span={10}>
          <Card
            title="资金流向分析"
            extra={
              <Space size="small" wrap>
                <RangePicker
                  size="small"
                  style={{ width: 200 }}
                  placeholder={['开始日期', '结束日期']}
                  value={fundFlowFilters.dateFrom && fundFlowFilters.dateTo ? [dayjs(fundFlowFilters.dateFrom), dayjs(fundFlowFilters.dateTo)] : null}
                  onChange={(dates) => {
                    if (dates && dates.length === 2) {
                      setFundFlowFilters({
                        ...fundFlowFilters,
                        dateFrom: dates[0].format('YYYY-MM-DD'),
                        dateTo: dates[1].format('YYYY-MM-DD')
                      });
                    } else {
                      setFundFlowFilters({
                        ...fundFlowFilters,
                        dateFrom: '',
                        dateTo: ''
                      });
                    }
                  }}
                  format="YYYY-MM-DD"
                />
                <Select
                  value={fundFlowFilters.days}
                  onChange={(value) => setFundFlowFilters({ ...fundFlowFilters, days: value, dateFrom: '', dateTo: '' })}
                  style={{ width: 100 }}
                  size="small"
                  disabled={!!(fundFlowFilters.dateFrom && fundFlowFilters.dateTo)}
                >
                  <Option value={7}>最近7天</Option>
                  <Option value={15}>最近15天</Option>
                  <Option value={30}>最近30天</Option>
                  <Option value={60}>最近60天</Option>
                </Select>
                <Button
                  size="small"
                  type="primary"
                  icon={<SyncOutlined spin={loading} />}
                  onClick={fetchFundFlowData}
                  loading={loading}
                >
                  刷新数据
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => setFundFlowFilters({ days: 30, dateFrom: '', dateTo: '' })}
                >
                  重置
                </Button>
              </Space>
            }
            loading={loading}
            style={{ height: '600px' }}
          >
            <div style={{ height: '530px', overflowY: 'auto', overflowX: 'hidden' }}>
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
            </div>
          </Card>
        </Col>

        <Col span={14}>
          <Card
            title={
              <Space>
                成交量异动分析
                <Tooltip
                  title={
                    <div style={{ fontSize: '12px' }}>
                      <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>📊 算法说明</div>
                      <div>• 量比 = 当日成交量 ÷ 20日平均成交量</div>
                      <div>• 筛选标准: 量比 &gt; 2.0倍</div>
                      <div>• 关注成交量的放大程度</div>
                      <div style={{ marginTop: '8px', color: '#faad14' }}>⚠️ 侧重于识别明显的放量异动</div>
                    </div>
                  }
                  placement="right"
                >
                  <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'pointer' }} />
                </Tooltip>
              </Space>
            }
            loading={loading}
            style={{ height: '600px' }}
            extra={
              <Space size="small">
                <Button
                  size="small"
                  type="primary"
                  icon={<SyncOutlined spin={loading} />}
                  onClick={fetchVolumeAnalysisData}
                  loading={loading}
                >
                  刷新数据
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleResetFilters}
                >
                  重置
                </Button>
              </Space>
            }
          >
            {/* 筛选条件 */}
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#1f1f1f', borderRadius: '6px' }}>
              <Space wrap size="small">
                <Select
                  placeholder="板块"
                  allowClear
                  value={filters.board || undefined}
                  onChange={(value) => setFilters({ ...filters, board: value || '' })}
                  style={{ width: 120 }}
                  size="small"
                >
                  <Option value="main">主板</Option>
                  <Option value="gem">创业板</Option>
                  <Option value="star">科创板</Option>
                  <Option value="bse">北交所</Option>
                </Select>

                <Select
                  placeholder="交易所"
                  allowClear
                  value={filters.exchange || undefined}
                  onChange={(value) => setFilters({ ...filters, exchange: value || '' })}
                  style={{ width: 120 }}
                  size="small"
                >
                  <Option value="SSE">上交所</Option>
                  <Option value="SZSE">深交所</Option>
                  <Option value="BSE">北交所</Option>
                </Select>

                <Input
                  placeholder="股票代码/名称"
                  allowClear
                  prefix={<SearchOutlined />}
                  value={filters.stockSearch}
                  onChange={(e) => setFilters({ ...filters, stockSearch: e.target.value })}
                  style={{ width: 150 }}
                  size="small"
                />

                <RangePicker
                  size="small"
                  style={{ width: 240 }}
                  placeholder={['开始日期', '结束日期']}
                  value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : null}
                  onChange={handleDateRangeChange}
                  format="YYYY-MM-DD"
                />

                <Text type="secondary" style={{ fontSize: '12px' }}>
                  共 {volumeAnalysis.length} 条
                </Text>
              </Space>
            </div>

            <div style={{ height: '420px', overflowY: 'auto', overflowX: 'hidden' }}>
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
            </div>
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
                <Tooltip
                  title={
                    <div style={{ fontSize: '12px' }}>
                      <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>💰 算法说明</div>
                      <div>• 基于最近7天的主力资金流向数据</div>
                      <div>• 分析维度:</div>
                      <div style={{ marginLeft: '12px' }}>- 总资金流动 &gt; 500万</div>
                      <div style={{ marginLeft: '12px' }}>- 流入天数比例 (持续性)</div>
                      <div style={{ marginLeft: '12px' }}>- 大单占比 (力度)</div>
                      <div>• 行为分类:</div>
                      <div style={{ marginLeft: '12px' }}>- 大幅建仓: 70%+天数流入</div>
                      <div style={{ marginLeft: '12px' }}>- 持续建仓: 50%+天数流入</div>
                      <div style={{ marginLeft: '12px' }}>- 缓慢减仓: 30%-天数流入</div>
                      <div style={{ marginTop: '8px', color: '#52c41a' }}>✅ 能识别温和吸筹的隐蔽操作</div>
                    </div>
                  }
                  placement="left"
                >
                  <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'pointer' }} />
                </Tooltip>
              </Space>
            }
            loading={loading}
            extra={
              <Space size="small" wrap>
                <RangePicker
                  size="small"
                  style={{ width: 240 }}
                  placeholder={['开始日期', '结束日期']}
                  value={mainForceFilters.dateFrom && mainForceFilters.dateTo ? [dayjs(mainForceFilters.dateFrom), dayjs(mainForceFilters.dateTo)] : null}
                  onChange={(dates) => {
                    if (dates && dates.length === 2) {
                      setMainForceFilters({
                        ...mainForceFilters,
                        dateFrom: dates[0].format('YYYY-MM-DD'),
                        dateTo: dates[1].format('YYYY-MM-DD')
                      });
                    } else {
                      setMainForceFilters({
                        ...mainForceFilters,
                        dateFrom: '',
                        dateTo: ''
                      });
                    }
                  }}
                  format="YYYY-MM-DD"
                />
                <Select
                  value={mainForceFilters.days}
                  onChange={(value) => setMainForceFilters({ ...mainForceFilters, days: value, dateFrom: '', dateTo: '' })}
                  style={{ width: 110 }}
                  size="small"
                  disabled={!!(mainForceFilters.dateFrom && mainForceFilters.dateTo)}
                >
                  <Option value={3}>最近3天</Option>
                  <Option value={5}>最近5天</Option>
                  <Option value={7}>最近7天</Option>
                  <Option value={10}>最近10天</Option>
                  <Option value={15}>最近15天</Option>
                  <Option value={30}>最近30天</Option>
                </Select>
                <Select
                  value={mainForceFilters.limit}
                  onChange={(value) => setMainForceFilters({ ...mainForceFilters, limit: value })}
                  style={{ width: 110 }}
                  size="small"
                >
                  <Option value={10}>显示10条</Option>
                  <Option value={20}>显示20条</Option>
                  <Option value={50}>显示50条</Option>
                  <Option value={100}>显示100条</Option>
                </Select>
                <Button
                  size="small"
                  type="primary"
                  icon={<SyncOutlined spin={loading} />}
                  onClick={fetchMainForceData}
                  loading={loading}
                >
                  刷新数据
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => setMainForceFilters({ days: 7, limit: 20, dateFrom: '', dateTo: '' })}
                >
                  重置
                </Button>
              </Space>
            }
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
                        value={mainForceSummary?.totalVolume || '0'}
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
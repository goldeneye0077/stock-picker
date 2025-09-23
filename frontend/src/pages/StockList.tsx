import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Space, Input, message, Modal, Descriptions, Tabs, Row, Col, Statistic } from 'antd';
import { SearchOutlined, ReloadOutlined, LineChartOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

const { TabPane } = Tabs;

const StockList: React.FC = () => {
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isAnalysisModalVisible, setIsAnalysisModalVisible] = useState(false);
  const [currentStock, setCurrentStock] = useState<any>(null);
  const [stockDetail, setStockDetail] = useState<any>(null);
  const [stockAnalysis, setStockAnalysis] = useState<any>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchStocks = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.STOCKS}`);
      const result = await response.json();

      if (result.success && result.data) {
        const formattedData = result.data.map((stock: any, index: number) => ({
          key: index.toString(),
          code: stock.code,
          name: stock.name,
          price: stock.current_price || 0,
          change: stock.change_percent ? `${stock.change_percent > 0 ? '+' : ''}${stock.change_percent.toFixed(2)}%` : '0.00%',
          volume: stock.volume ? `${(stock.volume / 100000000).toFixed(1)}亿` : '0亿',
          status: stock.is_volume_surge ? '成交量异动' : (stock.latest_signal || '观察'),
          signal: stock.latest_signal || '持有',
        }));
        setStockData(formattedData);
      } else {
        message.error('获取股票数据失败');
      }
    } catch (error) {
      console.error('Error fetching stocks:', error);
      message.error('网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStocks();
  }, []);

  // 获取股票详情
  const fetchStockDetail = async (stockCode: string) => {
    setModalLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.STOCKS}/${stockCode}`);
      const result = await response.json();

      if (result.success && result.data) {
        setStockDetail(result.data);
      } else {
        message.error('获取股票详情失败');
      }
    } catch (error) {
      console.error('Error fetching stock detail:', error);
      message.error('获取详情失败');
    } finally {
      setModalLoading(false);
    }
  };

  // 获取股票分析数据
  const fetchStockAnalysis = async (stockCode: string) => {
    setModalLoading(true);
    try {
      // 获取成交量分析
      const volumeResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/volume?stock_code=${stockCode}&days=10`);
      const volumeResult = await volumeResponse.json();

      // 获取资金流向
      const fundFlowResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/fund-flow?stock_code=${stockCode}&days=10`);
      const fundFlowResult = await fundFlowResponse.json();

      // 获取买入信号
      const signalsResponse = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYSIS}/signals?stock_code=${stockCode}&days=7`);
      const signalsResult = await signalsResponse.json();

      setStockAnalysis({
        volume: volumeResult.success ? volumeResult.data : null,
        fundFlow: fundFlowResult.success ? fundFlowResult.data : null,
        signals: signalsResult.success ? signalsResult.data : null
      });
    } catch (error) {
      console.error('Error fetching stock analysis:', error);
      message.error('获取分析数据失败');
    } finally {
      setModalLoading(false);
    }
  };

  // 显示详情模态框
  const showDetailModal = (stock: any) => {
    setCurrentStock(stock);
    setIsDetailModalVisible(true);
    fetchStockDetail(stock.code);
  };

  // 显示分析模态框
  const showAnalysisModal = (stock: any) => {
    setCurrentStock(stock);
    setIsAnalysisModalVisible(true);
    fetchStockAnalysis(stock.code);
  };

  const handleSearch = async (value: string) => {
    if (!value.trim()) {
      fetchStocks();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.STOCKS}/search/${value}`);
      const result = await response.json();

      if (result.success && result.data) {
        const formattedData = result.data.map((stock: any, index: number) => ({
          key: index.toString(),
          code: stock.code,
          name: stock.name,
          price: 0, // Search results may not have price data
          change: '0.00%',
          volume: '0亿',
          status: '观察',
          signal: '持有',
        }));
        setStockData(formattedData);
      }
    } catch (error) {
      console.error('Error searching stocks:', error);
      message.error('搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '股票代码',
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '当前价格',
      dataIndex: 'price',
      key: 'price',
      render: (price: number) => `¥${price}`,
    },
    {
      title: '涨跌幅',
      dataIndex: 'change',
      key: 'change',
      render: (change: string) => (
        <span style={{ color: change.startsWith('+') ? '#3f8600' : '#cf1322' }}>
          {change}
        </span>
      ),
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        let color = 'default';
        if (status === '主力介入') color = 'red';
        if (status === '资金流入') color = 'green';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: '信号',
      dataIndex: 'signal',
      key: 'signal',
      render: (signal: string) => {
        let color = 'default';
        if (signal === '买入') color = 'green';
        if (signal === '关注') color = 'orange';
        return <Tag color={color}>{signal}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record: any) => (
        <Space size="small">
          <Button
            size="small"
            icon={<InfoCircleOutlined />}
            onClick={() => showDetailModal(record)}
          >
            详情
          </Button>
          <Button
            size="small"
            icon={<LineChartOutlined />}
            onClick={() => showAnalysisModal(record)}
          >
            分析
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title="股票列表"
        extra={
          <Space>
            <Input.Search
              placeholder="搜索股票代码或名称"
              style={{ width: 200 }}
              prefix={<SearchOutlined />}
              onSearch={handleSearch}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchStocks} loading={loading}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={stockData}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 800 }}
          loading={loading}
        />
      </Card>

      {/* 股票详情模态框 */}
      <Modal
        title={`股票详情 - ${currentStock?.code} ${currentStock?.name}`}
        visible={isDetailModalVisible}
        onCancel={() => setIsDetailModalVisible(false)}
        footer={null}
        width={800}
        loading={modalLoading}
      >
        {stockDetail && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="股票代码">{stockDetail.stock?.code}</Descriptions.Item>
            <Descriptions.Item label="股票名称">{stockDetail.stock?.name}</Descriptions.Item>
            <Descriptions.Item label="交易所">{stockDetail.stock?.exchange}</Descriptions.Item>
            <Descriptions.Item label="行业">{stockDetail.stock?.industry || '未知'}</Descriptions.Item>
            <Descriptions.Item label="最新价格" span={2}>
              {stockDetail.klines?.[0] ? (
                <Space>
                  <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
                    ¥{stockDetail.klines[0].close}
                  </span>
                  <span style={{
                    color: stockDetail.klines[0].close >= stockDetail.klines[0].open ? '#3f8600' : '#cf1322'
                  }}>
                    {stockDetail.klines[0].close >= stockDetail.klines[0].open ? '↗' : '↘'}
                    {((stockDetail.klines[0].close - stockDetail.klines[0].open) / stockDetail.klines[0].open * 100).toFixed(2)}%
                  </span>
                </Space>
              ) : (
                '暂无数据'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="成交量">
              {stockDetail.klines?.[0]?.volume ? `${(stockDetail.klines[0].volume / 100000000).toFixed(2)}亿` : '暂无数据'}
            </Descriptions.Item>
            <Descriptions.Item label="成交额">
              {stockDetail.klines?.[0]?.amount ? `${(stockDetail.klines[0].amount / 100000000).toFixed(2)}亿` : '暂无数据'}
            </Descriptions.Item>
            <Descriptions.Item label="最高价">
              {stockDetail.klines?.[0]?.high ? `¥${stockDetail.klines[0].high}` : '暂无数据'}
            </Descriptions.Item>
            <Descriptions.Item label="最低价">
              {stockDetail.klines?.[0]?.low ? `¥${stockDetail.klines[0].low}` : '暂无数据'}
            </Descriptions.Item>
          </Descriptions>
        )}

        {stockDetail?.klines && stockDetail.klines.length > 1 && (
          <Card title="近期走势" style={{ marginTop: 16 }}>
            <Row gutter={16}>
              {stockDetail.klines.slice(0, 5).map((kline: any, index: number) => (
                <Col span={4.8} key={index}>
                  <Card size="small">
                    <Statistic
                      title={kline.date}
                      value={kline.close}
                      prefix="¥"
                      valueStyle={{
                        color: kline.close >= kline.open ? '#3f8600' : '#cf1322',
                        fontSize: '14px'
                      }}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        )}
      </Modal>

      {/* 股票分析模态框 */}
      <Modal
        title={`技术分析 - ${currentStock?.code} ${currentStock?.name}`}
        visible={isAnalysisModalVisible}
        onCancel={() => setIsAnalysisModalVisible(false)}
        footer={null}
        width={1000}
        loading={modalLoading}
      >
        {stockAnalysis && (
          <Tabs defaultActiveKey="volume">
            <TabPane tab="成交量分析" key="volume">
              {stockAnalysis.volume?.volumeAnalysis?.length > 0 ? (
                <div>
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={8}>
                      <Statistic
                        title="异动天数"
                        value={stockAnalysis.volume.volumeSurges?.length || 0}
                        suffix="天"
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="最大量比"
                        value={Math.max(...(stockAnalysis.volume.volumeAnalysis.map((v: any) => v.volume_ratio) || [0]))}
                        precision={2}
                        suffix="倍"
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="平均成交量"
                        value={(stockAnalysis.volume.volumeAnalysis[0]?.avg_volume_20 / 100000000) || 0}
                        precision={2}
                        suffix="亿"
                      />
                    </Col>
                  </Row>
                  <Table
                    size="small"
                    dataSource={stockAnalysis.volume.volumeAnalysis.slice(0, 10)}
                    columns={[
                      { title: '日期', dataIndex: 'date', key: 'date' },
                      { title: '量比', dataIndex: 'volume_ratio', key: 'volume_ratio', render: (val: number) => `${val.toFixed(2)}倍` },
                      { title: '是否异动', dataIndex: 'is_volume_surge', key: 'is_volume_surge', render: (val: boolean) => <Tag color={val ? 'red' : 'default'}>{val ? '异动' : '正常'}</Tag> },
                      { title: '分析结果', dataIndex: 'analysis_result', key: 'analysis_result' }
                    ]}
                    pagination={false}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px' }}>暂无成交量分析数据</div>
              )}
            </TabPane>

            <TabPane tab="资金流向" key="fundflow">
              {stockAnalysis.fundFlow?.fundFlow?.length > 0 ? (
                <div>
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={8}>
                      <Statistic
                        title="主力资金净流入"
                        value={stockAnalysis.fundFlow.summary?.totalMainFlow || 0}
                        precision={0}
                        suffix="万"
                        valueStyle={{
                          color: (stockAnalysis.fundFlow.summary?.totalMainFlow || 0) > 0 ? '#3f8600' : '#cf1322'
                        }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="散户资金净流入"
                        value={stockAnalysis.fundFlow.summary?.totalRetailFlow || 0}
                        precision={0}
                        suffix="万"
                        valueStyle={{
                          color: (stockAnalysis.fundFlow.summary?.totalRetailFlow || 0) > 0 ? '#3f8600' : '#cf1322'
                        }}
                      />
                    </Col>
                    <Col span={8}>
                      <Statistic
                        title="平均大单比例"
                        value={(stockAnalysis.fundFlow.summary?.avgLargeOrderRatio || 0) * 100}
                        precision={1}
                        suffix="%"
                      />
                    </Col>
                  </Row>
                  <Table
                    size="small"
                    dataSource={stockAnalysis.fundFlow.fundFlow.slice(0, 10)}
                    columns={[
                      { title: '日期', dataIndex: 'date', key: 'date' },
                      { title: '主力资金', dataIndex: 'main_fund_flow', key: 'main_fund_flow', render: (val: number) => <span style={{ color: val > 0 ? '#3f8600' : '#cf1322' }}>{(val/10000).toFixed(1)}万</span> },
                      { title: '散户资金', dataIndex: 'retail_fund_flow', key: 'retail_fund_flow', render: (val: number) => <span style={{ color: val > 0 ? '#3f8600' : '#cf1322' }}>{(val/10000).toFixed(1)}万</span> },
                      { title: '大单比例', dataIndex: 'large_order_ratio', key: 'large_order_ratio', render: (val: number) => `${(val * 100).toFixed(1)}%` }
                    ]}
                    pagination={false}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px' }}>暂无资金流向数据</div>
              )}
            </TabPane>

            <TabPane tab="买入信号" key="signals">
              {stockAnalysis.signals?.signals?.length > 0 ? (
                <div>
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={12}>
                      <Statistic
                        title="信号总数"
                        value={stockAnalysis.signals.signals.length}
                        suffix="个"
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="平均置信度"
                        value={stockAnalysis.signals.signals.reduce((sum: number, s: any) => sum + s.confidence, 0) / stockAnalysis.signals.signals.length * 100}
                        precision={1}
                        suffix="%"
                      />
                    </Col>
                  </Row>
                  <Table
                    size="small"
                    dataSource={stockAnalysis.signals.signals}
                    columns={[
                      { title: '信号类型', dataIndex: 'signal_type', key: 'signal_type', render: (val: string) => <Tag color="blue">{val}</Tag> },
                      { title: '置信度', dataIndex: 'confidence', key: 'confidence', render: (val: number) => `${(val * 100).toFixed(1)}%` },
                      { title: '触发价格', dataIndex: 'price', key: 'price', render: (val: number) => `¥${val}` },
                      { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (val: string) => new Date(val).toLocaleString('zh-CN') }
                    ]}
                    pagination={false}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px' }}>暂无买入信号数据</div>
              )}
            </TabPane>
          </Tabs>
        )}
      </Modal>
    </div>
  );
};

export default StockList;
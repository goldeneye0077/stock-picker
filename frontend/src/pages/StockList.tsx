import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Space, Input, message, Modal, Descriptions, Tabs, Row, Col, Statistic, DatePicker, Alert, AutoComplete } from 'antd';
import { SearchOutlined, ReloadOutlined, LineChartOutlined, InfoCircleOutlined, CalendarOutlined } from '@ant-design/icons';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import dayjs from 'dayjs';
import KLineChart from '../components/KLineChart';

const { TabPane } = Tabs;

const StockList: React.FC = () => {
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOptions, setSearchOptions] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isAnalysisModalVisible, setIsAnalysisModalVisible] = useState(false);
  const [currentStock, setCurrentStock] = useState<any>(null);
  const [stockDetail, setStockDetail] = useState<any>(null);
  const [stockAnalysis, setStockAnalysis] = useState<any>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchStocks = async (date?: string) => {
    setLoading(true);
    try {
      const url = date
        ? `${API_BASE_URL}${API_ENDPOINTS.STOCKS}/history/date/${date}`
        : `${API_BASE_URL}${API_ENDPOINTS.STOCKS}`;

      const response = await fetch(url);
      const result = await response.json();

      if (result.success && result.data) {
        const formattedData = result.data.map((stock: any, index: number) => ({
          key: index.toString(),
          code: stock.code,
          name: stock.name,
          preClose: stock.pre_close || 0,
          open: stock.open || 0,
          high: stock.high || 0,
          low: stock.low || 0,
          price: stock.current_price || 0,
          change: stock.change_percent ? `${stock.change_percent > 0 ? '+' : ''}${stock.change_percent.toFixed(2)}%` : '0.00%',
          changeAmount: stock.change_amount || 0,
          volume: stock.volume ? `${(stock.volume / 100000000).toFixed(2)}亿` : '0亿',
          amount: stock.amount ? `${(stock.amount / 100000000).toFixed(2)}亿` : '0亿',
          quoteTime: stock.quote_time || stock.quote_date,
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

  const handleDateChange = (date: any, dateString: string) => {
    setSelectedDate(dateString || null);
    if (dateString) {
      fetchStocks(dateString);
    } else {
      fetchStocks();
    }
  };

  const handleResetDate = () => {
    setSelectedDate(null);
    fetchStocks();
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

  // 搜索建议 - 当输入>=1个字符时触发
  const handleSearchInput = async (value: string) => {
    setSearchQuery(value);

    if (value.length >= 1) {
      try {
        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.STOCKS}/search/${value}`);
        const result = await response.json();

        if (result.success && result.data) {
          const options = result.data.slice(0, 10).map((stock: any) => ({
            value: stock.code,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><strong>{stock.code}</strong> {stock.name}</span>
                <span style={{ color: '#999', fontSize: '12px' }}>{stock.exchange}</span>
              </div>
            ),
            stock: stock
          }));
          setSearchOptions(options);
        }
      } catch (error) {
        console.error('Error fetching search suggestions:', error);
      }
    } else {
      setSearchOptions([]);
    }
  };

  // 选择搜索结果
  const handleSearchSelect = async (value: string, option: any) => {
    setSearchQuery(value);
    setSearchOptions([]);

    // 执行搜索
    await handleSearch(value);
  };

  // 执行搜索
  const handleSearch = async (value: string) => {
    if (!value.trim()) {
      fetchStocks(selectedDate || undefined);
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
          price: stock.current_price || 0,
          changeAmount: stock.change_amount || 0,
          change: stock.change_percent ? `${stock.change_percent > 0 ? '+' : ''}${stock.change_percent.toFixed(2)}%` : '0.00%',
          open: stock.open || 0,
          high: stock.high || 0,
          low: stock.low || 0,
          volume: stock.volume ? `${(stock.volume / 100000000).toFixed(2)}亿` : '-',
          amount: stock.amount ? `${(stock.amount / 100000000).toFixed(2)}亿` : '-',
          volumeRatio: stock.volume_ratio || '-',
          status: '观察',
          signal: stock.latest_signal || '持有',
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
      width: 100,
      render: (code: string, record: any) => (
        <a
          style={{ color: '#1890ff', cursor: 'pointer' }}
          onClick={() => showDetailModal(record)}
        >
          {code}
        </a>
      ),
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      render: (name: string, record: any) => (
        <a
          style={{ color: '#1890ff', cursor: 'pointer' }}
          onClick={() => showDetailModal(record)}
        >
          {name}
        </a>
      ),
    },
    {
      title: '最新价',
      dataIndex: 'price',
      key: 'price',
      width: 90,
      render: (price: number) => (price !== undefined && price !== null && price > 0) ? `¥${price.toFixed(2)}` : '-',
    },
    {
      title: '涨跌额',
      dataIndex: 'changeAmount',
      key: 'changeAmount',
      width: 90,
      render: (val: number, record: any) => {
        if (val === undefined || val === null) return '-';
        const color = val > 0 ? '#cf1322' : val < 0 ? '#3f8600' : '#666';
        return <span style={{ color }}>{val > 0 ? '+' : ''}{val.toFixed(2)}</span>;
      },
    },
    {
      title: '涨跌幅',
      dataIndex: 'change',
      key: 'change',
      width: 90,
      render: (change: string) => (
        <span style={{ color: change.startsWith('+') ? '#cf1322' : change.startsWith('-') ? '#3f8600' : '#666' }}>
          {change}
        </span>
      ),
    },
    {
      title: '开盘价',
      dataIndex: 'open',
      key: 'open',
      width: 90,
      render: (val: number) => (val !== undefined && val !== null && val > 0) ? `¥${val.toFixed(2)}` : '-',
    },
    {
      title: '最高价',
      dataIndex: 'high',
      key: 'high',
      width: 90,
      render: (val: number) => (val !== undefined && val !== null && val > 0) ? `¥${val.toFixed(2)}` : '-',
    },
    {
      title: '最低价',
      dataIndex: 'low',
      key: 'low',
      width: 90,
      render: (val: number) => (val !== undefined && val !== null && val > 0) ? `¥${val.toFixed(2)}` : '-',
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      width: 100,
    },
    {
      title: '成交额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
    },
    {
      title: '更新时间',
      dataIndex: 'quoteTime',
      key: 'quoteTime',
      width: 150,
      render: (time: string) => time ? new Date(time).toLocaleString('zh-CN', { hour12: false }) : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        let color = 'default';
        if (status === '主力介入') color = 'red';
        if (status === '资金流入') color = 'green';
        if (status === '成交量异动') color = 'orange';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: '信号',
      dataIndex: 'signal',
      key: 'signal',
      width: 80,
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
      width: 150,
      fixed: 'right' as const,
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
    <div style={{ padding: '24px', maxWidth: '100%', overflow: 'hidden' }}>
      {selectedDate && (
        <Alert
          message={`正在查看 ${selectedDate} 的历史数据`}
          type="info"
          closable
          onClose={handleResetDate}
          style={{ marginBottom: '16px' }}
          action={
            <Button size="small" onClick={handleResetDate}>
              返回实时数据
            </Button>
          }
        />
      )}
      <Card
        title="股票列表"
        extra={
          <Space>
            <DatePicker
              placeholder="选择历史日期"
              format="YYYY-MM-DD"
              value={selectedDate ? dayjs(selectedDate) : null}
              onChange={handleDateChange}
              allowClear
              style={{ width: 160 }}
              suffixIcon={<CalendarOutlined />}
            />
            <AutoComplete
              options={searchOptions}
              value={searchQuery}
              onSearch={handleSearchInput}
              onSelect={handleSearchSelect}
              placeholder="代码/名称/拼音首字母"
              style={{ width: 240 }}
              allowClear
            >
              <Input
                prefix={<SearchOutlined />}
                onPressEnter={(e: any) => handleSearch(e.target.value)}
              />
            </AutoComplete>
            <Button icon={<ReloadOutlined />} onClick={() => fetchStocks(selectedDate || undefined)} loading={loading}>刷新</Button>
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <Table
            columns={columns}
            dataSource={stockData}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1600 }}
            loading={loading}
            sticky
          />
        </div>
      </Card>

      {/* 股票详情模态框 */}
      <Modal
        title={`股票详情 - ${currentStock?.code} ${currentStock?.name}`}
        open={isDetailModalVisible}
        onCancel={() => setIsDetailModalVisible(false)}
        footer={null}
        width={1200}
        loading={modalLoading}
      >
        {stockDetail && (
          <Tabs defaultActiveKey="info">
            <TabPane tab="基本信息" key="info">
              <Descriptions bordered column={2}>
                <Descriptions.Item label="股票代码">{stockDetail.stock?.code}</Descriptions.Item>
                <Descriptions.Item label="股票名称">{stockDetail.stock?.name}</Descriptions.Item>
                <Descriptions.Item label="交易所">{stockDetail.stock?.exchange}</Descriptions.Item>
                <Descriptions.Item label="行业">{stockDetail.stock?.industry || '未知'}</Descriptions.Item>
              </Descriptions>

            {/* 实时行情卡片 */}
            {stockDetail.realtimeQuote && (
              <Card title="实时行情" style={{ marginTop: 16 }} size="small">
                <Row gutter={16}>
                  <Col span={6}>
                    <Statistic
                      title="最新价"
                      value={stockDetail.realtimeQuote.close}
                      prefix="¥"
                      precision={2}
                      valueStyle={{
                        color: stockDetail.realtimeQuote.change_amount > 0 ? '#3f8600' : stockDetail.realtimeQuote.change_amount < 0 ? '#cf1322' : '#666',
                        fontSize: '24px',
                        fontWeight: 'bold'
                      }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="涨跌额"
                      value={stockDetail.realtimeQuote.change_amount}
                      precision={2}
                      valueStyle={{
                        color: stockDetail.realtimeQuote.change_amount > 0 ? '#3f8600' : stockDetail.realtimeQuote.change_amount < 0 ? '#cf1322' : '#666'
                      }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="涨跌幅"
                      value={stockDetail.realtimeQuote.change_percent}
                      precision={2}
                      suffix="%"
                      valueStyle={{
                        color: stockDetail.realtimeQuote.change_percent > 0 ? '#3f8600' : stockDetail.realtimeQuote.change_percent < 0 ? '#cf1322' : '#666'
                      }}
                    />
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: '12px', color: '#999' }}>更新时间</div>
                    <div style={{ fontSize: '14px', marginTop: '8px' }}>
                      {new Date(stockDetail.realtimeQuote.updated_at).toLocaleString('zh-CN', { hour12: false })}
                    </div>
                  </Col>
                </Row>
                <Row gutter={16} style={{ marginTop: 16 }}>
                  <Col span={4}>
                    <Statistic title="昨收" value={stockDetail.realtimeQuote.pre_close} prefix="¥" precision={2} />
                  </Col>
                  <Col span={4}>
                    <Statistic title="今开" value={stockDetail.realtimeQuote.open} prefix="¥" precision={2} />
                  </Col>
                  <Col span={4}>
                    <Statistic title="最高" value={stockDetail.realtimeQuote.high} prefix="¥" precision={2} />
                  </Col>
                  <Col span={4}>
                    <Statistic title="最低" value={stockDetail.realtimeQuote.low} prefix="¥" precision={2} />
                  </Col>
                  <Col span={4}>
                    <Statistic title="成交量" value={(stockDetail.realtimeQuote.vol / 100000000).toFixed(2)} suffix="亿" />
                  </Col>
                  <Col span={4}>
                    <Statistic title="成交额" value={(stockDetail.realtimeQuote.amount / 100000000).toFixed(2)} suffix="亿" />
                  </Col>
                </Row>
              </Card>
            )}

            {/* 今日分时走势 */}
            {stockDetail.intradayQuotes && stockDetail.intradayQuotes.length > 0 && (
              <Card title="今日分时走势" style={{ marginTop: 16 }} size="small">
                <Table
                  size="small"
                  dataSource={stockDetail.intradayQuotes}
                  columns={[
                    {
                      title: '时间',
                      dataIndex: 'snapshot_time',
                      key: 'snapshot_time',
                      render: (time: string) => new Date(time).toLocaleTimeString('zh-CN', { hour12: false })
                    },
                    {
                      title: '价格',
                      dataIndex: 'close',
                      key: 'close',
                      render: (val: number) => `¥${val.toFixed(2)}`
                    },
                    {
                      title: '涨跌额',
                      dataIndex: 'change_amount',
                      key: 'change_amount',
                      render: (val: number) => (
                        <span style={{ color: val > 0 ? '#3f8600' : val < 0 ? '#cf1322' : '#666' }}>
                          {val > 0 ? '+' : ''}{val.toFixed(2)}
                        </span>
                      )
                    },
                    {
                      title: '涨跌幅',
                      dataIndex: 'change_percent',
                      key: 'change_percent',
                      render: (val: number) => (
                        <span style={{ color: val > 0 ? '#3f8600' : val < 0 ? '#cf1322' : '#666' }}>
                          {val > 0 ? '+' : ''}{val.toFixed(2)}%
                        </span>
                      )
                    },
                    {
                      title: '成交量',
                      dataIndex: 'vol',
                      key: 'vol',
                      render: (val: number) => `${(val / 100000000).toFixed(2)}亿`
                    }
                  ]}
                  pagination={false}
                  scroll={{ y: 300 }}
                />
              </Card>
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
            </TabPane>

            <TabPane tab="K线图" key="kline">
              <KLineChart
                data={stockDetail?.klines || []}
                loading={modalLoading}
                height={500}
              />
            </TabPane>
          </Tabs>
        )}
      </Modal>

      {/* 股票分析模态框 */}
      <Modal
        title={`技术分析 - ${currentStock?.code} ${currentStock?.name}`}
        open={isAnalysisModalVisible}
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
                          color: (stockAnalysis.fundFlow.summary?.totalMainFlow || 0) > 0 ? '#cf1322' : '#3f8600'
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
                          color: (stockAnalysis.fundFlow.summary?.totalRetailFlow || 0) > 0 ? '#cf1322' : '#3f8600'
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
                      { title: '主力资金', dataIndex: 'main_fund_flow', key: 'main_fund_flow', render: (val: number) => <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>{(val/10000).toFixed(1)}万</span> },
                      { title: '散户资金', dataIndex: 'retail_fund_flow', key: 'retail_fund_flow', render: (val: number) => <span style={{ color: val > 0 ? '#cf1322' : '#3f8600' }}>{(val/10000).toFixed(1)}万</span> },
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
import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Space, Input, message } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

const StockList: React.FC = () => {
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
      render: () => (
        <Space size="small">
          <Button size="small">详情</Button>
          <Button size="small">分析</Button>
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
    </div>
  );
};

export default StockList;
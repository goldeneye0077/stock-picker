import React from 'react';
import { Table, Card, Tag, Button, Space, Input } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';

const StockList: React.FC = () => {
  const mockData = [
    {
      key: '1',
      code: '000001',
      name: '平安银行',
      price: 12.85,
      change: '+2.15%',
      volume: '5.2亿',
      status: '主力介入',
      signal: '买入',
    },
    {
      key: '2',
      code: '000002',
      name: '万科A',
      price: 18.20,
      change: '-1.08%',
      volume: '3.8亿',
      status: '观察',
      signal: '持有',
    },
    {
      key: '3',
      code: '600036',
      name: '招商银行',
      price: 35.60,
      change: '+3.22%',
      volume: '8.9亿',
      status: '资金流入',
      signal: '关注',
    },
  ];

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
            />
            <Button icon={<ReloadOutlined />}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={mockData}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
};

export default StockList;
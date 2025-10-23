/**
 * 股票列表表格组件
 * 显示股票数据的表格，支持排序和点击查看详情
 * 性能优化：使用 React.memo 和 useMemo
 */

import React, { useMemo, useCallback } from 'react';
import { Table, Tag, Typography } from 'antd';
import { LineChartOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { StockItem } from '../../services/stockService';

const { Text } = Typography;

interface StockTableProps {
  data: StockItem[];
  loading: boolean;
  onRowClick: (record: StockItem) => void;
  onAnalysisClick: (record: StockItem) => void;
}

// 提取数值用于排序
const parseNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[¥+%亿,]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

const StockTableComponent: React.FC<StockTableProps> = ({
  data,
  loading,
  onRowClick,
  onAnalysisClick
}) => {
  // 使用 useMemo 缓存列定义，避免每次渲染都重新创建
  const columns: ColumnsType<StockItem> = useMemo(() => [
    {
      title: '股票代码',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      sorter: (a, b) => a.code.localeCompare(b.code),
      render: (code: string, record) => (
        <a
          style={{ color: '#1890ff', cursor: 'pointer' }}
          onClick={() => onRowClick(record)}
        >
          {code}
        </a>
      )
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name: string, record) => (
        <a
          style={{ color: '#1890ff', cursor: 'pointer' }}
          onClick={() => onRowClick(record)}
        >
          {name}
        </a>
      )
    },
    {
      title: '最新价',
      dataIndex: 'price',
      key: 'price',
      width: 90,
      sorter: (a, b) => (a.price || 0) - (b.price || 0),
      render: (price: number) =>
        price !== undefined && price !== null && price > 0
          ? `¥${price.toFixed(2)}`
          : '-'
    },
    {
      title: '涨跌额',
      dataIndex: 'changeAmount',
      key: 'changeAmount',
      width: 90,
      sorter: (a, b) => (a.changeAmount || 0) - (b.changeAmount || 0),
      render: (val: number) => {
        if (val === undefined || val === null) return '-';
        const color = val > 0 ? '#cf1322' : val < 0 ? '#3f8600' : '#666';
        return (
          <Text style={{ color }}>
            {val > 0 ? '+' : ''}
            {val.toFixed(2)}
          </Text>
        );
      }
    },
    {
      title: '涨跌幅',
      dataIndex: 'change',
      key: 'change',
      width: 90,
      sorter: (a, b) => parseNumber(a.change) - parseNumber(b.change),
      render: (change: string) => {
        const color = change.startsWith('+')
          ? '#cf1322'
          : change.startsWith('-')
          ? '#3f8600'
          : '#666';
        return <Text style={{ color }}>{change}</Text>;
      }
    },
    {
      title: '开盘价',
      dataIndex: 'open',
      key: 'open',
      width: 90,
      sorter: (a, b) => (a.open || 0) - (b.open || 0),
      render: (val: number) =>
        val !== undefined && val !== null && val > 0 ? `¥${val.toFixed(2)}` : '-'
    },
    {
      title: '最高价',
      dataIndex: 'high',
      key: 'high',
      width: 90,
      sorter: (a, b) => (a.high || 0) - (b.high || 0),
      render: (val: number) =>
        val !== undefined && val !== null && val > 0 ? `¥${val.toFixed(2)}` : '-'
    },
    {
      title: '最低价',
      dataIndex: 'low',
      key: 'low',
      width: 90,
      sorter: (a, b) => (a.low || 0) - (b.low || 0),
      render: (val: number) =>
        val !== undefined && val !== null && val > 0 ? `¥${val.toFixed(2)}` : '-'
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      width: 100,
      sorter: (a, b) => parseNumber(a.volume) - parseNumber(b.volume)
    },
    {
      title: '成交额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      sorter: (a, b) => parseNumber(a.amount) - parseNumber(b.amount)
    },
    {
      title: '更新时间',
      dataIndex: 'quoteTime',
      key: 'quoteTime',
      width: 150,
      sorter: (a, b) => {
        if (!a.quoteTime) return -1;
        if (!b.quoteTime) return 1;
        return new Date(a.quoteTime).getTime() - new Date(b.quoteTime).getTime();
      },
      render: (time: string) =>
        time ? new Date(time).toLocaleString('zh-CN', { hour12: false }) : '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        let color = 'default';
        if (status.includes('异动')) color = 'red';
        else if (status.includes('上涨')) color = 'green';
        else if (status.includes('下跌')) color = 'volcano';
        return <Tag color={color}>{status}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right' as const,
      render: (_: any, record) => (
        <a
          onClick={(e) => {
            e.stopPropagation();
            onAnalysisClick(record);
          }}
        >
          <LineChartOutlined style={{ marginRight: 4 }} />
          技术分析
        </a>
      )
    }
  ], [onRowClick, onAnalysisClick]); // 依赖项：回调函数变化时重新创建列定义

  return (
    <Table
      columns={columns}
      dataSource={data}
      loading={loading}
      scroll={{ x: 1400, y: 600 }}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条记录`,
        pageSizeOptions: ['10', '20', '50', '100']
      }}
      size="middle"
      bordered
    />
  );
};

// 使用 React.memo 优化组件性能，避免不必要的重新渲染
export const StockTable = React.memo(StockTableComponent);

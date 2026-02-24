/**
 * 股票列表表格组件
 * 显示股票数据的表格，支持排序和点击查看详情
 * 性能优化：使用 React.memo 和 useMemo
 */

import React, { useMemo } from 'react';
import { Button, Table, Tag, Typography, Tooltip } from 'antd';
import { LineChartOutlined, BarChartOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { StockItem } from '../../services/stockService';
import { A_SHARE_COLORS } from '../../utils/constants';

const { Text } = Typography;

interface StockTableProps {
  data: StockItem[];
  loading: boolean;
  onRowClick: (record: StockItem) => void;
  onAnalysisClick: (record: StockItem) => void;
  onFundamentalClick: (record: StockItem) => void;
  watchlistMode?: boolean;
  watchlistCodes?: Set<string>;
  watchlistPendingCodes?: Set<string>;
  onToggleWatchlist?: (record: StockItem, action: 'add' | 'remove') => void;
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
  onAnalysisClick,
  onFundamentalClick,
  watchlistMode,
  watchlistCodes,
  watchlistPendingCodes,
  onToggleWatchlist
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
        const color = val > 0 ? A_SHARE_COLORS.RISE : val < 0 ? A_SHARE_COLORS.FALL : '#666';
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
          ? A_SHARE_COLORS.RISE
          : change.startsWith('-')
          ? A_SHARE_COLORS.FALL
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
      width: 180,
      fixed: 'right' as const,
      render: (_: any, record) => (
        <div style={{ display: 'flex', gap: '12px' }}>
          <a
            onClick={(e) => {
              e.stopPropagation();
              onAnalysisClick(record);
            }}
            style={{ color: 'var(--sq-primary)' }}
          >
            <LineChartOutlined style={{ marginRight: 4 }} />
            技术分析
          </a>
          <a
            onClick={(e) => {
              e.stopPropagation();
              onFundamentalClick(record);
            }}
            style={{ color: 'var(--sq-fall)' }}
          >
            <BarChartOutlined style={{ marginRight: 4 }} />
            基本面分析
          </a>
          <Tooltip
            title={
              watchlistPendingCodes?.has(record.code)
                ? (watchlistMode ? '正在移除...' : '正在加入...')
                : (!watchlistMode && watchlistCodes?.has(record.code))
                  ? '已在自选'
                  : undefined
            }
          >
            <Button
              type="link"
              size="small"
              loading={!!watchlistPendingCodes?.has(record.code)}
              disabled={
                !onToggleWatchlist ||
                !!watchlistPendingCodes?.has(record.code) ||
                (!watchlistMode && !!watchlistCodes?.has(record.code))
              }
              icon={watchlistMode || watchlistCodes?.has(record.code) ? <StarFilled /> : <StarOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                const inWatchlist = !!watchlistCodes?.has(record.code);
                if (!onToggleWatchlist) return;
                if (watchlistPendingCodes?.has(record.code)) return;
                if (watchlistMode) {
                  onToggleWatchlist(record, 'remove');
                  return;
                }
                if (!inWatchlist) {
                  onToggleWatchlist(record, 'add');
                }
              }}
              style={{ padding: 0, height: 20, color: 'var(--sq-text-secondary)' }}
            >
              {watchlistMode ? '移除自选' : watchlistCodes?.has(record.code) ? '已自选' : '加入自选'}
            </Button>
          </Tooltip>
        </div>
      )
    }
  ], [onRowClick, onAnalysisClick, onFundamentalClick, onToggleWatchlist, watchlistCodes, watchlistPendingCodes, watchlistMode]); // 依赖项：回调函数变化时重新创建列定义

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
      size="small"
      bordered
    />
  );
};

// 使用 React.memo 优化组件性能，避免不必要的重新渲染
export const StockTable = React.memo(StockTableComponent);

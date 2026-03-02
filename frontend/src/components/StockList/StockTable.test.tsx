/**
 * StockTable 组件测试
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { StockTable } from './StockTable';
import type { StockItem } from '../../services/stockService';

const renderWithConfig = (ui: React.ReactElement) => {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
};

describe('StockTable', () => {
  const mockOnRowClick = vi.fn();
  const mockOnAnalysisClick = vi.fn();
  const mockOnFundamentalClick = vi.fn();
  const mockOnPageChange = vi.fn();

  const mockData: StockItem[] = [
    {
      key: '0',
      code: '000001',
      name: '平安银行',
      preClose: 12.0,
      price: 12.5,
      changeAmount: 0.5,
      change: '+4.17%',
      open: 12.0,
      high: 12.6,
      low: 11.9,
      volume: '1.20亿',
      amount: '15.00亿',
      quoteTime: '2025-10-22 15:00:00',
      status: '正常交易',
      signal: '持有'
    },
    {
      key: '1',
      code: '600000',
      name: '浦发银行',
      preClose: 8.5,
      price: 8.3,
      changeAmount: -0.2,
      change: '-2.35%',
      open: 8.5,
      high: 8.6,
      low: 8.2,
      volume: '0.80亿',
      amount: '6.60亿',
      quoteTime: '2025-10-22 15:00:00',
      status: '正常交易',
      signal: '持有'
    }
  ];

  const defaultProps = {
    data: [] as StockItem[],
    total: 0,
    currentPage: 1,
    pageSize: 20,
    loading: false,
    onPageChange: mockOnPageChange,
    onRowClick: mockOnRowClick,
    onAnalysisClick: mockOnAnalysisClick,
    onFundamentalClick: mockOnFundamentalClick
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders table columns', () => {
    renderWithConfig(<StockTable {...defaultProps} />);

    expect(screen.getAllByText('股票代码').length).toBeGreaterThan(0);
    expect(screen.getAllByText('股票名称').length).toBeGreaterThan(0);
    expect(screen.getAllByText('最新价').length).toBeGreaterThan(0);
    expect(screen.getAllByText('涨跌幅').length).toBeGreaterThan(0);
  });

  it('renders stock rows', () => {
    renderWithConfig(<StockTable {...defaultProps} data={mockData} total={2} />);

    expect(screen.getByText('000001')).toBeInTheDocument();
    expect(screen.getByText('平安银行')).toBeInTheDocument();
    expect(screen.getByText('¥12.50')).toBeInTheDocument();
    expect(screen.getByText('+4.17%')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    const { container } = renderWithConfig(<StockTable {...defaultProps} />);

    expect(container.querySelector('.ant-empty')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    const { container } = renderWithConfig(
      <StockTable {...defaultProps} loading={true} />
    );

    expect(container.querySelector('.ant-spin')).toBeInTheDocument();
  });

  it('shows pagination total text', () => {
    renderWithConfig(<StockTable {...defaultProps} data={mockData} total={42} />);

    expect(screen.getByText('共 42 条记录')).toBeInTheDocument();
  });

  it('triggers onPageChange when page changes', () => {
    renderWithConfig(<StockTable {...defaultProps} data={mockData} total={42} />);

    fireEvent.click(screen.getByTitle('2'));
    expect(mockOnPageChange).toHaveBeenCalled();
  });
});

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { FundFlowCard } from './FundFlowCard';
import * as useFundFlowModule from '../../hooks/useFundFlow';

vi.mock('../../hooks/useFundFlow');

const mockUseFundFlow = useFundFlowModule.useFundFlow as ReturnType<typeof vi.fn>;

function renderWithConfig(ui: React.ReactElement) {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
}

describe('FundFlowCard', () => {
  const mockFetchData = vi.fn();
  const mockData = [
    { type: '主力资金', amount: '+5.0亿', percent: 50, color: '#f50' },
    { type: '机构资金', amount: '-2.0亿', percent: 20, color: '#2db7f5' },
    { type: '散户资金', amount: '+3.0亿', percent: 30, color: '#87d068' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and refresh button', () => {
    mockUseFundFlow.mockReturnValue({
      data: [],
      loading: false,
      fetchData: mockFetchData,
      params: { days: 30 },
      updateParams: vi.fn(),
      resetParams: vi.fn(),
    });

    renderWithConfig(<FundFlowCard />);

    expect(screen.getByText('资金流向分析')).toBeInTheDocument();
    expect(screen.getByText('刷新')).toBeInTheDocument();
    expect(mockUseFundFlow).toHaveBeenCalledWith({ days: 30 });
  });

  it('renders fund flow items', () => {
    mockUseFundFlow.mockReturnValue({
      data: mockData,
      loading: false,
      fetchData: mockFetchData,
      params: { days: 30 },
      updateParams: vi.fn(),
      resetParams: vi.fn(),
    });

    renderWithConfig(<FundFlowCard />);

    expect(screen.getByText('主力资金')).toBeInTheDocument();
    expect(screen.getByText('+5.0亿')).toBeInTheDocument();
    expect(screen.getByText('机构资金')).toBeInTheDocument();
    expect(screen.getByText('-2.0亿')).toBeInTheDocument();
    expect(screen.getByText('散户资金')).toBeInTheDocument();
    expect(screen.getByText('+3.0亿')).toBeInTheDocument();
  });

  it('renders empty state when there is no data', () => {
    mockUseFundFlow.mockReturnValue({
      data: [],
      loading: false,
      fetchData: mockFetchData,
      params: { days: 30 },
      updateParams: vi.fn(),
      resetParams: vi.fn(),
    });

    renderWithConfig(<FundFlowCard />);

    expect(screen.getByText('暂无资金流向数据')).toBeInTheDocument();
  });

  it('shows loading state on refresh button', () => {
    mockUseFundFlow.mockReturnValue({
      data: [],
      loading: true,
      fetchData: mockFetchData,
      params: { days: 30 },
      updateParams: vi.fn(),
      resetParams: vi.fn(),
    });

    renderWithConfig(<FundFlowCard />);

    const button = screen.getByText('刷新').closest('button');
    expect(button?.className).toContain('ant-btn-loading');
  });

  it('renders one progress bar for each item', () => {
    mockUseFundFlow.mockReturnValue({
      data: mockData,
      loading: false,
      fetchData: mockFetchData,
      params: { days: 30 },
      updateParams: vi.fn(),
      resetParams: vi.fn(),
    });

    const { container } = renderWithConfig(<FundFlowCard />);

    expect(container.querySelectorAll('.ant-progress')).toHaveLength(3);
  });
});

/**
 * FundFlowCard 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { FundFlowCard } from './FundFlowCard';
import * as useFundFlowModule from '../../hooks/useFundFlow';

// Mock useFundFlow hook
vi.mock('../../hooks/useFundFlow');

const mockUseFundFlow = useFundFlowModule.useFundFlow as ReturnType<typeof vi.fn>;

const renderWithConfig = (ui: React.ReactElement) => {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
};

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

  describe('渲染测试', () => {
    it('应该渲染卡片标题', () => {
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
    });

    it('应该渲染刷新按钮', () => {
      mockUseFundFlow.mockReturnValue({
        data: [],
        loading: false,
        fetchData: mockFetchData,
        params: { days: 30 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<FundFlowCard />);

      expect(screen.getByText('刷新')).toBeInTheDocument();
    });

    it('应该调用 useFundFlow 并传递 days: 30', () => {
      mockUseFundFlow.mockReturnValue({
        data: [],
        loading: false,
        fetchData: mockFetchData,
        params: { days: 30 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<FundFlowCard />);

      expect(mockUseFundFlow).toHaveBeenCalledWith({ days: 30 });
    });
  });

  describe('数据显示', () => {
    it('应该显示资金流向列表', () => {
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

    it('空数据时应该正常渲染', () => {
      mockUseFundFlow.mockReturnValue({
        data: [],
        loading: false,
        fetchData: mockFetchData,
        params: { days: 30 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<FundFlowCard />);

      // 卡片应该存在
      expect(screen.getByText('资金流向分析')).toBeInTheDocument();
    });
  });

  describe('加载状态', () => {
    it('loading 为 true 时应该显示加载状态', () => {
      mockUseFundFlow.mockReturnValue({
        data: [],
        loading: true,
        fetchData: mockFetchData,
        params: { days: 30 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<FundFlowCard />);

      // 刷新按钮应该有 loading 状态
      const button = screen.getByText('刷新').closest('button');
      expect(button?.className).toContain('ant-btn-loading');
    });

    it('loading 为 false 时不应该显示加载状态', () => {
      mockUseFundFlow.mockReturnValue({
        data: mockData,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 30 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<FundFlowCard />);

      const button = screen.getByText('刷新').closest('button');
      expect(button?.className).not.toContain('ant-btn-loading');
    });
  });

  describe('Progress 组件', () => {
    it('应该为每个资金类型渲染 Progress 组件', () => {
      mockUseFundFlow.mockReturnValue({
        data: mockData,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 30 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      const { container } = renderWithConfig(<FundFlowCard />);

      const progressBars = container.querySelectorAll('.ant-progress');
      expect(progressBars).toHaveLength(3);
    });
  });
});

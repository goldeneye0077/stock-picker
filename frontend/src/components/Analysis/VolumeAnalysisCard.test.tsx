/**
 * VolumeAnalysisCard 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { VolumeAnalysisCard } from './VolumeAnalysisCard';
import * as useVolumeAnalysisModule from '../../hooks/useVolumeAnalysis';

// Mock useVolumeAnalysis hook
vi.mock('../../hooks/useVolumeAnalysis');

const mockUseVolumeAnalysis = useVolumeAnalysisModule.useVolumeAnalysis as ReturnType<typeof vi.fn>;

const renderWithConfig = (ui: React.ReactElement) => {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
};

describe('VolumeAnalysisCard', () => {
  const mockFetchData = vi.fn();
  const mockUpdateParams = vi.fn();
  const mockResetParams = vi.fn();

  const mockData = [
    {
      stock: '000001',
      name: '平安银行',
      volumeRatio: 2.5,
      changePercent: 5.5,
      price: 12.50,
      date: '2025-10-22',
    },
    {
      stock: '600000',
      name: '浦发银行',
      volumeRatio: 1.8,
      changePercent: -2.3,
      price: 8.30,
      date: '2025-10-22',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染测试', () => {
    it('应该渲染卡片标题', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: [],
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      renderWithConfig(<VolumeAnalysisCard />);

      expect(screen.getByText('成交量异动分析')).toBeInTheDocument();
    });

    it('应该渲染 FilterBar 组件', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: [],
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      const { container } = renderWithConfig(<VolumeAnalysisCard />);

      // FilterBar 的表单项应该存在
      const formItems = container.querySelectorAll('.ant-form-item');
      expect(formItems.length).toBeGreaterThan(0);
    });

    it('应该渲染刷新按钮', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: [],
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      renderWithConfig(<VolumeAnalysisCard />);

      // 应该有刷新按钮
      expect(screen.getByText('刷新')).toBeInTheDocument();
    });
  });

  describe('数据显示', () => {
    it('应该显示成交量异动列表', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: mockData,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      renderWithConfig(<VolumeAnalysisCard />);

      expect(screen.getByText('000001')).toBeInTheDocument();
      expect(screen.getByText('平安银行')).toBeInTheDocument();
      expect(screen.getByText(/量比.*2\.50/)).toBeInTheDocument();
      expect(screen.getByText(/涨幅.*\+5\.50%/)).toBeInTheDocument();

      expect(screen.getByText('600000')).toBeInTheDocument();
      expect(screen.getByText('浦发银行')).toBeInTheDocument();
      expect(screen.getByText(/量比.*1\.80/)).toBeInTheDocument();
      expect(screen.getByText(/涨幅.*-2\.30%/)).toBeInTheDocument();
    });

    it('应该正确显示价格信息', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: mockData,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      renderWithConfig(<VolumeAnalysisCard />);

      expect(screen.getByText(/价格.*¥12\.50/)).toBeInTheDocument();
      expect(screen.getByText(/价格.*¥8\.30/)).toBeInTheDocument();
    });

    it('应该显示日期信息', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: mockData,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      renderWithConfig(<VolumeAnalysisCard />);

      const dates = screen.getAllByText('2025-10-22');
      expect(dates.length).toBe(2);
    });

    it('空数据时应该显示空状态文本', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: [],
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      renderWithConfig(<VolumeAnalysisCard />);

      expect(screen.getByText('暂无成交量异动数据')).toBeInTheDocument();
    });
  });

  describe('加载状态', () => {
    it('loading 为 true 时应该显示加载状态', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: [],
        loading: true,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      const { container } = renderWithConfig(<VolumeAnalysisCard />);

      // Ant Design 列表加载状态会有 ant-spin 元素
      expect(container.querySelector('.ant-spin')).toBeInTheDocument();
    });

    it('loading 为 false 时不应该显示加载状态', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: mockData,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      const { container } = renderWithConfig(<VolumeAnalysisCard />);

      // 不应该有 loading 状态
      const spinners = container.querySelectorAll('.ant-spin-spinning');
      expect(spinners.length).toBe(0);
    });
  });

  describe('FilterBar 交互', () => {
    it('FilterBar 应该正常渲染', () => {
      const params = { days: 30, board: '创业板' };
      mockUseVolumeAnalysis.mockReturnValue({
        data: mockData,
        loading: false,
        fetchData: mockFetchData,
        params: params,
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      const { container } = renderWithConfig(<VolumeAnalysisCard />);

      // 检查 FilterBar 是否渲染
      const formItems = container.querySelectorAll('.ant-form-item');
      expect(formItems.length).toBeGreaterThan(0);
    });
  });

  describe('分页功能', () => {
    it('数据超过 10 条时应该显示分页', () => {
      const largeData = Array.from({ length: 15 }, (_, i) => ({
        stock: `00000${i}`,
        name: `股票${i}`,
        volumeRatio: 2.0,
        changePercent: 5.0,
        price: 10.0,
        date: '2025-10-22',
      }));

      mockUseVolumeAnalysis.mockReturnValue({
        data: largeData,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      const { container } = renderWithConfig(<VolumeAnalysisCard />);

      // 应该有分页组件
      expect(container.querySelector('.ant-pagination')).toBeInTheDocument();
    });

    it('数据少于等于 10 条时不应该显示分页', () => {
      mockUseVolumeAnalysis.mockReturnValue({
        data: mockData, // 只有 2 条数据
        loading: false,
        fetchData: mockFetchData,
        params: { days: 10 },
        updateParams: mockUpdateParams,
        resetParams: mockResetParams,
      });

      const { container } = renderWithConfig(<VolumeAnalysisCard />);

      // 不应该有分页组件
      expect(container.querySelector('.ant-pagination')).not.toBeInTheDocument();
    });
  });
});

/**
 * MainForceCard 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { MainForceCard } from './MainForceCard';
import * as useMainForceModule from '../../hooks/useMainForce';

// Mock useMainForce hook
vi.mock('../../hooks/useMainForce');

const mockUseMainForce = useMainForceModule.useMainForce as ReturnType<typeof vi.fn>;

const renderWithConfig = (ui: React.ReactElement) => {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
};

describe('MainForceCard', () => {
  const mockFetchData = vi.fn();
  const mockData = [
    { stock: '000001', name: '平安银行', behavior: '强势介入', strength: 5.5, trend: '上升', date: '2025-10-22' },
    { stock: '600000', name: '浦发银行', behavior: '稳步建仓', strength: 3.2, trend: '下降', date: '2025-10-22' },
  ];
  const mockSummary = {
    strongCount: 10,
    moderateCount: 15,
    weakCount: 5,
    avgStrength: 4.5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染测试', () => {
    it('应该渲染卡片标题', () => {
      mockUseMainForce.mockReturnValue({
        data: [],
        summary: null,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 7, limit: 20 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<MainForceCard />);

      expect(screen.getByText('主力行为分析')).toBeInTheDocument();
    });

    it('应该渲染刷新按钮', () => {
      mockUseMainForce.mockReturnValue({
        data: [],
        summary: null,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 7, limit: 20 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<MainForceCard />);

      expect(screen.getByText('刷新')).toBeInTheDocument();
    });
  });

  describe('摘要统计显示', () => {
    it('有 summary 数据时应该显示统计信息', () => {
      mockUseMainForce.mockReturnValue({
        data: mockData,
        summary: mockSummary,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 7, limit: 20 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      const { container } = renderWithConfig(<MainForceCard />);

      // 检查摘要统计是否渲染
      const statistics = container.querySelectorAll('.ant-statistic');
      expect(statistics.length).toBeGreaterThanOrEqual(4); // 应该有4个统计项

      // 检查统计标题
      expect(screen.getAllByText('强势介入').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('稳步建仓').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('小幅流入').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('平均强度')).toBeInTheDocument();
    });

    it('summary 为 null 时不应该显示统计信息', () => {
      mockUseMainForce.mockReturnValue({
        data: mockData,
        summary: null,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 7, limit: 20 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<MainForceCard />);

      // 应该不包含摘要统计的文本（但表格中的"强势介入"标签会存在）
      const statLabels = screen.queryAllByText('强势介入');
      // 如果 summary 为 null，只会有表格中的标签，不会有统计标题
      expect(statLabels.length).toBeLessThanOrEqual(1);
    });
  });

  describe('表格数据显示', () => {
    it('应该显示主力行为数据表格', () => {
      mockUseMainForce.mockReturnValue({
        data: mockData,
        summary: mockSummary,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 7, limit: 20 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<MainForceCard />);

      // 检查数据
      expect(screen.getByText('000001')).toBeInTheDocument();
      expect(screen.getByText('平安银行')).toBeInTheDocument();

      expect(screen.getByText('600000')).toBeInTheDocument();
      expect(screen.getByText('浦发银行')).toBeInTheDocument();
    });

    it('空数据时应该显示空状态文本', () => {
      mockUseMainForce.mockReturnValue({
        data: [],
        summary: null,
        loading: false,
        fetchData: mockFetchData,
        params: { days: 7, limit: 20 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      renderWithConfig(<MainForceCard />);

      expect(screen.getByText('暂无主力行为数据')).toBeInTheDocument();
    });
  });

  describe('加载状态', () => {
    it('loading 为 true 时应该显示加载状态', () => {
      mockUseMainForce.mockReturnValue({
        data: [],
        summary: null,
        loading: true,
        fetchData: mockFetchData,
        params: { days: 7, limit: 20 },
        updateParams: vi.fn(),
        resetParams: vi.fn(),
      });

      const { container } = renderWithConfig(<MainForceCard />);

      // 表格或按钮应该有加载状态
      expect(container.querySelector('.ant-spin') || container.querySelector('.ant-btn-loading')).toBeInTheDocument();
    });
  });
});

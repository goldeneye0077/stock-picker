/**
 * StockSearchBar 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { StockSearchBar } from './StockSearchBar';

const renderWithConfig = (ui: React.ReactElement) => {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
};

describe('StockSearchBar', () => {
  const mockOnSearch = vi.fn();
  const mockOnSearchChange = vi.fn();
  const mockOnDateChange = vi.fn();
  const mockOnReset = vi.fn();
  const mockOnRefresh = vi.fn();

  const defaultProps = {
    searchQuery: '',
    searchOptions: [],
    selectedDate: null,
    loading: false,
    onSearch: mockOnSearch,
    onSearchChange: mockOnSearchChange,
    onDateChange: mockOnDateChange,
    onReset: mockOnReset,
    onRefresh: mockOnRefresh,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染测试', () => {
    it('应该渲染搜索栏组件', () => {
      renderWithConfig(<StockSearchBar {...defaultProps} />);

      // 检查容器是否渲染
      expect(document.querySelector('.ant-space')).toBeInTheDocument();
    });

    it('应该渲染搜索输入框', () => {
      renderWithConfig(<StockSearchBar {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('搜索股票代码或名称');
      expect(searchInput).toBeInTheDocument();
    });

    it('应该渲染日期选择器', () => {
      renderWithConfig(<StockSearchBar {...defaultProps} />);

      const datePicker = screen.getByPlaceholderText('选择日期');
      expect(datePicker).toBeInTheDocument();
    });

    it('应该渲染刷新按钮', () => {
      renderWithConfig(<StockSearchBar {...defaultProps} />);

      expect(screen.getByText('刷新数据')).toBeInTheDocument();
    });

    it('选中日期后应该显示重置按钮', () => {
      renderWithConfig(<StockSearchBar {...defaultProps} selectedDate="2025-10-22" />);

      expect(screen.getByText('重置日期')).toBeInTheDocument();
    });

    it('未选中日期时不应该显示重置按钮', () => {
      renderWithConfig(<StockSearchBar {...defaultProps} />);

      expect(screen.queryByText('重置日期')).not.toBeInTheDocument();
    });
  });

  describe('搜索功能', () => {
    it('应该显示搜索选项', () => {
      const searchOptions = [
        { value: '000001', label: '000001 - 平安银行' },
        { value: '600000', label: '600000 - 浦发银行' },
      ];

      renderWithConfig(
        <StockSearchBar {...defaultProps} searchOptions={searchOptions} />
      );

      // AutoComplete 组件应该渲染
      const searchInput = screen.getByPlaceholderText('搜索股票代码或名称');
      expect(searchInput).toBeInTheDocument();
    });

    it('应该显示当前搜索查询', () => {
      renderWithConfig(<StockSearchBar {...defaultProps} searchQuery="平安银行" />);

      const searchInput = screen.getByPlaceholderText('搜索股票代码或名称');
      expect(searchInput).toHaveValue('平安银行');
    });
  });

  describe('加载状态', () => {
    it('loading 为 true 时刷新按钮应该显示加载状态', () => {
      renderWithConfig(
        <StockSearchBar {...defaultProps} loading={true} />
      );

      const refreshButton = screen.getByText('刷新数据').closest('button');
      expect(refreshButton?.className).toContain('ant-btn-loading');
    });

    it('loading 为 false 时刷新按钮不应该显示加载状态', () => {
      renderWithConfig(
        <StockSearchBar {...defaultProps} loading={false} />
      );

      const refreshButton = screen.getByText('刷新数据').closest('button');
      expect(refreshButton?.className).not.toContain('ant-btn-loading');
    });
  });

  describe('组件结构', () => {
    it('应该包含所有必要的子组件', () => {
      renderWithConfig(
        <StockSearchBar {...defaultProps} selectedDate="2025-10-22" />
      );

      // 搜索输入框
      expect(screen.getByPlaceholderText('搜索股票代码或名称')).toBeInTheDocument();

      // 日期选择器
      expect(screen.getByPlaceholderText('选择日期')).toBeInTheDocument();

      // 重置按钮
      expect(screen.getByText('重置日期')).toBeInTheDocument();

      // 刷新按钮
      expect(screen.getByText('刷新数据')).toBeInTheDocument();
    });
  });

  describe('Props 验证', () => {
    it('应该接受所有必要的 props', () => {
      expect(() => {
        renderWithConfig(<StockSearchBar {...defaultProps} />);
      }).not.toThrow();
    });

    it('应该接受自定义 searchQuery', () => {
      renderWithConfig(<StockSearchBar {...defaultProps} searchQuery="测试查询" />);

      const searchInput = screen.getByPlaceholderText('搜索股票代码或名称');
      expect(searchInput).toHaveValue('测试查询');
    });

    it('应该接受 searchOptions 数组', () => {
      const searchOptions = [{ value: '000001', label: '平安银行' }];

      expect(() => {
        renderWithConfig(
          <StockSearchBar {...defaultProps} searchOptions={searchOptions} />
        );
      }).not.toThrow();
    });
  });
});

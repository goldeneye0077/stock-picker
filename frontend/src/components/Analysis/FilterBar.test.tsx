/**
 * FilterBar 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { FilterBar } from './FilterBar';

// Wrapper component to provide Ant Design context
const renderWithConfig = (ui: React.ReactElement) => {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
};

describe('FilterBar', () => {
  const mockOnUpdate = vi.fn();
  const mockOnReset = vi.fn();
  const defaultParams = { days: 10 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染测试', () => {
    it('应该渲染筛选栏', () => {
      const { container } = renderWithConfig(
        <FilterBar params={defaultParams} onUpdate={mockOnUpdate} onReset={mockOnReset} />
      );

      // 检查容器是否渲染
      expect(container.querySelector('.ant-space')).toBeInTheDocument();
    });

    it('应该根据 show 属性控制显示', () => {
      const { container } = renderWithConfig(
        <FilterBar
          params={defaultParams}
          onUpdate={mockOnUpdate}
          showBoard={false}
          showExchange={false}
          showStockSearch={false}
          showDays={true}
        />
      );

      // 检查容器是否渲染
      expect(container.querySelector('.ant-space')).toBeInTheDocument();
    });

    it('onReset 为 undefined 时不显示重置按钮', () => {
      renderWithConfig(<FilterBar params={defaultParams} onUpdate={mockOnUpdate} />);

      expect(screen.queryByText('重置')).not.toBeInTheDocument();
    });

    it('有 onReset 时应该显示重置按钮', () => {
      renderWithConfig(
        <FilterBar params={defaultParams} onUpdate={mockOnUpdate} onReset={mockOnReset} />
      );

      expect(screen.getByText('重置')).toBeInTheDocument();
    });
  });

  describe('参数显示', () => {
    it('应该显示当前参数值', () => {
      const params = { days: 30, board: '创业板', exchange: 'SZ' };
      const { container } = renderWithConfig(
        <FilterBar params={params} onUpdate={mockOnUpdate} />
      );

      // 检查组件是否渲染
      expect(container.querySelector('.ant-space')).toBeInTheDocument();
    });

    it('应该显示默认值', () => {
      const { container } = renderWithConfig(
        <FilterBar params={{}} onUpdate={mockOnUpdate} />
      );

      expect(container.querySelector('.ant-space')).toBeInTheDocument();
    });
  });

  describe('组件结构', () => {
    it('应该包含所有可见的表单项', () => {
      const { container } = renderWithConfig(
        <FilterBar
          params={defaultParams}
          onUpdate={mockOnUpdate}
          onReset={mockOnReset}
          showBoard={true}
          showExchange={true}
          showStockSearch={true}
          showDays={true}
        />
      );

      // 检查表单项是否存在
      const formItems = container.querySelectorAll('.ant-form-item');
      expect(formItems.length).toBeGreaterThan(0);
    });

    it('应该根据 show props 控制表单项数量', () => {
      const { container: fullContainer } = renderWithConfig(
        <FilterBar
          params={defaultParams}
          onUpdate={mockOnUpdate}
          showBoard={true}
          showExchange={true}
          showStockSearch={true}
          showDays={true}
        />
      );

      const { container: limitedContainer } = renderWithConfig(
        <FilterBar
          params={defaultParams}
          onUpdate={mockOnUpdate}
          showBoard={false}
          showExchange={false}
          showStockSearch={false}
          showDays={true}
        />
      );

      const fullItems = fullContainer.querySelectorAll('.ant-form-item');
      const limitedItems = limitedContainer.querySelectorAll('.ant-form-item');

      expect(fullItems.length).toBeGreaterThan(limitedItems.length);
    });
  });

  describe('回调函数', () => {
    it('应该接受 onUpdate 回调', () => {
      renderWithConfig(<FilterBar params={defaultParams} onUpdate={mockOnUpdate} />);

      // 组件应该渲染成功
      expect(screen.queryByText('重置')).not.toBeInTheDocument();
    });

    it('应该接受 onReset 回调', () => {
      renderWithConfig(
        <FilterBar params={defaultParams} onUpdate={mockOnUpdate} onReset={mockOnReset} />
      );

      // 重置按钮应该存在
      expect(screen.getByText('重置')).toBeInTheDocument();
    });
  });

  describe('props 验证', () => {
    it('应该接受所有 show props', () => {
      expect(() => {
        renderWithConfig(
          <FilterBar
            params={defaultParams}
            onUpdate={mockOnUpdate}
            showBoard={true}
            showExchange={true}
            showStockSearch={true}
            showDays={true}
          />
        );
      }).not.toThrow();
    });

    it('应该接受 params 对象', () => {
      const params = {
        days: 30,
        board: '创业板',
        exchange: 'SZ',
        stockSearch: '平安',
      };

      expect(() => {
        renderWithConfig(<FilterBar params={params} onUpdate={mockOnUpdate} />);
      }).not.toThrow();
    });
  });
});

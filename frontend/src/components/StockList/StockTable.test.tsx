/**
 * StockTable 组件测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { StockTable } from './StockTable';
import type { StockItem } from '../../services/stockService';

const renderWithConfig = (ui: React.ReactElement) => {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
};

describe('StockTable', () => {
  const mockOnRowClick = vi.fn();
  const mockOnAnalysisClick = vi.fn();

  const mockData: StockItem[] = [
    {
      code: '000001',
      name: '平安银行',
      price: 12.50,
      changeAmount: 0.50,
      change: '+4.17%',
      open: 12.00,
      high: 12.60,
      low: 11.90,
      volume: '1.2亿',
      amount: '15.0亿',
      quoteTime: '2025-10-22 15:00:00',
      status: '正常交易'
    },
    {
      code: '600000',
      name: '浦发银行',
      price: 8.30,
      changeAmount: -0.20,
      change: '-2.35%',
      open: 8.50,
      high: 8.60,
      low: 8.20,
      volume: '0.8亿',
      amount: '6.6亿',
      quoteTime: '2025-10-22 15:00:00',
      status: '正常交易'
    }
  ];

  const defaultProps = {
    data: [],
    loading: false,
    onRowClick: mockOnRowClick,
    onAnalysisClick: mockOnAnalysisClick,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('渲染测试', () => {
    it('应该渲染表格组件', () => {
      const { container } = renderWithConfig(<StockTable {...defaultProps} />);

      expect(container.querySelector('.ant-table')).toBeInTheDocument();
    });

    it('应该渲染表格列标题', () => {
      renderWithConfig(<StockTable {...defaultProps} />);

      // 检查主要列标题 (使用 getAllByText 因为列标题可能渲染多次)
      expect(screen.getAllByText('股票代码').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('股票名称').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('最新价').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('涨跌额').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('涨跌幅').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('成交量').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('成交额').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('操作').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('数据显示', () => {
    it('应该显示股票数据', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      // 检查股票代码
      expect(screen.getByText('000001')).toBeInTheDocument();
      expect(screen.getByText('600000')).toBeInTheDocument();

      // 检查股票名称
      expect(screen.getByText('平安银行')).toBeInTheDocument();
      expect(screen.getByText('浦发银行')).toBeInTheDocument();
    });

    it('应该显示价格信息', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      // 检查价格格式
      expect(screen.getByText('¥12.50')).toBeInTheDocument();
      expect(screen.getByText('¥8.30')).toBeInTheDocument();
    });

    it('应该显示涨跌幅信息', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      expect(screen.getByText('+4.17%')).toBeInTheDocument();
      expect(screen.getByText('-2.35%')).toBeInTheDocument();
    });

    it('应该显示成交量和成交额', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      expect(screen.getByText('1.2亿')).toBeInTheDocument();
      expect(screen.getByText('15.0亿')).toBeInTheDocument();
    });

    it('应该显示状态标签', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      const statusTags = screen.getAllByText('正常交易');
      expect(statusTags.length).toBe(2);
    });

    it('应该显示技术分析链接', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      const analysisLinks = screen.getAllByText('技术分析');
      expect(analysisLinks.length).toBe(2);
    });

    it('空数据时应该正常渲染', () => {
      const { container } = renderWithConfig(<StockTable {...defaultProps} />);

      expect(container.querySelector('.ant-table')).toBeInTheDocument();
      expect(container.querySelector('.ant-empty')).toBeInTheDocument();
    });
  });

  describe('加载状态', () => {
    it('loading 为 true 时应该显示加载状态', () => {
      const { container } = renderWithConfig(
        <StockTable {...defaultProps} loading={true} />
      );

      expect(container.querySelector('.ant-spin')).toBeInTheDocument();
    });

    it('loading 为 false 时不应该显示加载状态', () => {
      const { container } = renderWithConfig(
        <StockTable {...defaultProps} loading={false} data={mockData} />
      );

      const spinners = container.querySelectorAll('.ant-spin-spinning');
      expect(spinners.length).toBe(0);
    });
  });

  describe('分页功能', () => {
    it('应该显示分页组件', () => {
      const { container } = renderWithConfig(
        <StockTable {...defaultProps} data={mockData} />
      );

      expect(container.querySelector('.ant-pagination')).toBeInTheDocument();
    });

    it('应该显示总记录数', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      expect(screen.getByText('共 2 条记录')).toBeInTheDocument();
    });
  });

  describe('表格特性', () => {
    it('应该支持滚动', () => {
      const { container } = renderWithConfig(
        <StockTable {...defaultProps} data={mockData} />
      );

      const scrollContainer = container.querySelector('.ant-table-body');
      expect(scrollContainer).toBeInTheDocument();
    });

    it('应该显示边框', () => {
      const { container } = renderWithConfig(
        <StockTable {...defaultProps} data={mockData} />
      );

      const table = container.querySelector('.ant-table-bordered');
      expect(table).toBeInTheDocument();
    });
  });

  describe('Props 验证', () => {
    it('应该接受所有必要的 props', () => {
      expect(() => {
        renderWithConfig(<StockTable {...defaultProps} />);
      }).not.toThrow();
    });

    it('应该接受数据数组', () => {
      expect(() => {
        renderWithConfig(<StockTable {...defaultProps} data={mockData} />);
      }).not.toThrow();
    });

    it('应该接受 loading 状态', () => {
      expect(() => {
        renderWithConfig(<StockTable {...defaultProps} loading={true} />);
      }).not.toThrow();
    });

    it('应该接受回调函数', () => {
      expect(() => {
        renderWithConfig(
          <StockTable
            {...defaultProps}
            onRowClick={mockOnRowClick}
            onAnalysisClick={mockOnAnalysisClick}
          />
        );
      }).not.toThrow();
    });
  });

  describe('数据格式化', () => {
    it('应该正确格式化价格', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      // 价格应该有货币符号和两位小数
      expect(screen.getByText('¥12.50')).toBeInTheDocument();
    });

    it('应该正确格式化涨跌额', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      // 正值应该有加号
      expect(screen.getByText('+0.50')).toBeInTheDocument();
      // 负值不需要额外加负号
      expect(screen.getByText('-0.20')).toBeInTheDocument();
    });

    it('缺失数据应该显示破折号', () => {
      const dataWithMissing: StockItem[] = [
        {
          code: '000001',
          name: '测试股票',
          price: 0,
          changeAmount: 0,
          change: '0%',
          open: 0,
          high: 0,
          low: 0,
          volume: '',
          amount: '',
          quoteTime: '',
          status: '停牌'
        }
      ];

      renderWithConfig(<StockTable {...defaultProps} data={dataWithMissing} />);

      // 应该有破折号显示
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThan(0);
    });
  });

  describe('表格列配置', () => {
    it('应该包含所有必要的列', () => {
      renderWithConfig(<StockTable {...defaultProps} data={mockData} />);

      // 验证所有列标题都存在 (使用 getAllByText 因为列标题可能渲染多次)
      const columnTitles = [
        '股票代码',
        '股票名称',
        '最新价',
        '涨跌额',
        '涨跌幅',
        '开盘价',
        '最高价',
        '最低价',
        '成交量',
        '成交额',
        '更新时间',
        '状态',
        '操作'
      ];

      columnTitles.forEach(title => {
        expect(screen.getAllByText(title).length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});

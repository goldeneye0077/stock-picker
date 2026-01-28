import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import SuperMainForce from './SuperMainForce';
import * as analysisService from '../services/analysisService';
import * as stockService from '../services/stockService';

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    message: {
      loading: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('../components/KLineChart', () => ({
  default: ({ data }: any) => <div>kline:{Array.isArray(data) ? data.length : 0}</div>,
}));

vi.mock('../services/analysisService', () => ({
  fetchAuctionSuperMainForce: vi.fn(),
  collectAuctionSnapshot: vi.fn(),
}));

vi.mock('../services/stockService', async () => {
  const actual = await vi.importActual<typeof import('../services/stockService')>('../services/stockService');
  return {
    ...actual,
    fetchStockDetail: vi.fn(),
    fetchStockAnalysis: vi.fn(),
    fetchStockHistoryForRealtime: vi.fn(),
    fetchRealtimeQuote: vi.fn(),
    fetchRealtimeQuotesBatch: vi.fn(),
  };
});

const renderWithConfig = (ui: React.ReactElement) => {
  return render(<ConfigProvider>{ui}</ConfigProvider>);
};

describe('SuperMainForce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('点击股票代码打开技术分析弹窗并加载数据', async () => {
    const user = userEvent.setup();
    vi.mocked(analysisService.fetchAuctionSuperMainForce).mockResolvedValue({
      tradeDate: '2026-01-02',
      dataSource: 'quote_history',
      items: [
        {
          rank: 1,
          stock: '000001',
          tsCode: '000001.SZ',
          name: '平安银行',
          industry: '银行',
          price: 10.12,
          preClose: 9.98,
          gapPercent: 1.2,
          vol: 1000,
          amount: 100000000,
          turnoverRate: 1.23,
          volumeRatio: 2.34,
          floatShare: 1000000,
          heatScore: 80,
          likelyLimitUp: false,
        },
      ],
      summary: {
        count: 1,
        avgHeat: 80,
        totalAmount: 100000000,
        limitUpCandidates: 0,
      },
    } as any);

    vi.mocked(stockService.fetchStockDetail).mockResolvedValue({
      code: '000001',
      name: '平安银行',
      current_price: 10.12,
      change_percent: 1.2,
    } as any);

    vi.mocked(stockService.fetchStockAnalysis).mockResolvedValue({
      indicators: { ma5: 1, ma10: 2, ma20: 3 },
    } as any);

    vi.mocked(stockService.fetchStockHistoryForRealtime).mockResolvedValue({
      klines: [{ date: '2026-01-01', open: 1, close: 2, low: 0.5, high: 2.5, volume: 10 }],
    } as any);

    vi.mocked(stockService.fetchRealtimeQuote).mockResolvedValue({
      stock_code: '000001',
      ts_code: '000001.SZ',
      close: 10.12,
      pre_close: 9.98,
      updated_at: '2026-01-02 09:31:00',
    } as any);

    vi.mocked(stockService.fetchRealtimeQuotesBatch).mockResolvedValue([] as any);

    renderWithConfig(<SuperMainForce />);

    const stockLink = await screen.findByRole('link', { name: '000001' });
    await user.click(stockLink);

    await waitFor(() => {
      expect(stockService.fetchStockAnalysis).toHaveBeenCalledWith(
        '000001',
        expect.objectContaining({ date: expect.any(String) })
      );
      expect(stockService.fetchStockHistoryForRealtime).toHaveBeenCalledWith('000001');
      expect(screen.getByText('kline:1')).toBeInTheDocument();
      expect(screen.getByText('MA5')).toBeInTheDocument();
      expect(screen.getByText('1.00')).toBeInTheDocument();
    });
  }, 15000);
});

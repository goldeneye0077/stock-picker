import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from 'antd';
import SuperMainForce from './SuperMainForce';
import * as analysisService from '../services/analysisService';
import * as stockService from '../services/stockService';
import { AuthProvider } from '../context/AuthContext';

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
  };
});

const renderWithConfig = (ui: React.ReactElement) => {
  return render(
    <ConfigProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ConfigProvider>
  );
};

describe('SuperMainForce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens technical modal when clicking stock code', async () => {
    const user = userEvent.setup();
    vi.mocked(analysisService.fetchAuctionSuperMainForce).mockResolvedValue({
      tradeDate: '2026-01-02',
      dataSource: 'quote_history',
      items: [
        {
          rank: 1,
          stock: '000001',
          tsCode: '000001.SZ',
          name: 'PingAn',
          industry: 'Bank',
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
      name: 'PingAn',
      current_price: 10.12,
      change_percent: 1.2,
    } as any);

    vi.mocked(stockService.fetchStockAnalysis).mockResolvedValue({
      indicators: { ma5: 1, ma10: 2, ma20: 3 },
    } as any);

    vi.mocked(stockService.fetchStockHistoryForRealtime).mockResolvedValue({
      klines: [{ date: '2026-01-01', open: 1, close: 2, low: 0.5, high: 2.5, volume: 10 }],
    } as any);

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
      expect(screen.getAllByText('1.00').length).toBeGreaterThan(0);
    });
  }, 15000);

  it('applies PE filter and low-gap filter on page', async () => {
    const user = userEvent.setup();

    vi.mocked(analysisService.fetchAuctionSuperMainForce).mockResolvedValue({
      tradeDate: '2026-03-02',
      dataSource: 'quote_history',
      items: [
        {
          rank: 1,
          stock: '600001',
          tsCode: '600001.SH',
          name: 'HighGap',
          industry: 'Test',
          price: 10.6,
          preClose: 10.0,
          gapPercent: 6.0,
          vol: 1000,
          amount: 10000000,
          turnoverRate: 1.2,
          volumeRatio: 1.5,
          floatShare: 1000000,
          pe: 20,
          peTtm: 25,
          heatScore: 90,
          likelyLimitUp: true,
        },
        {
          rank: 2,
          stock: '600002',
          tsCode: '600002.SH',
          name: 'MissingPe',
          industry: 'Test',
          price: 10.2,
          preClose: 10.0,
          gapPercent: 2.0,
          vol: 1000,
          amount: 10000000,
          turnoverRate: 1.2,
          volumeRatio: 1.5,
          floatShare: 1000000,
          pe: null,
          peTtm: null,
          heatScore: 80,
          likelyLimitUp: false,
        },
        {
          rank: 3,
          stock: '600003',
          tsCode: '600003.SH',
          name: 'OutOfRangePe',
          industry: 'Test',
          price: 10.1,
          preClose: 10.0,
          gapPercent: 1.0,
          vol: 1000,
          amount: 10000000,
          turnoverRate: 1.2,
          volumeRatio: 1.5,
          floatShare: 1000000,
          pe: 500,
          peTtm: 80,
          heatScore: 70,
          likelyLimitUp: false,
        },
        {
          rank: 4,
          stock: '600004',
          tsCode: '600004.SH',
          name: 'LowGap',
          industry: 'Test',
          price: 10.1,
          preClose: 10.0,
          gapPercent: 1.0,
          vol: 1000,
          amount: 10000000,
          turnoverRate: 1.2,
          volumeRatio: 1.5,
          floatShare: 1000000,
          pe: 30,
          peTtm: 35,
          heatScore: 60,
          likelyLimitUp: false,
        },
      ],
      summary: {
        count: 4,
        avgHeat: 75,
        totalAmount: 40000000,
        limitUpCandidates: 1,
      },
    } as any);

    renderWithConfig(<SuperMainForce />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '600001' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '600002' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '600003' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '600004' })).toBeInTheDocument();
    });

    const switches = await screen.findAllByRole('switch');
    await user.click(switches[1]);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '600001' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '600004' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '600002' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '600003' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /<5%/ }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '600004' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '600001' })).not.toBeInTheDocument();
    });
  }, 15000);
});

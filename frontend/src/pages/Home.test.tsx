import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Home from './Home';

vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option?: { series?: Array<{ name?: string }> } }) => (
    <div data-testid="echarts-mock">{option?.series?.map((series) => series.name).join(',')}</div>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Home', () => {
  it('渲染首页关键模块并能通过 CTA 导航', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/home/dashboard')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              platform: { totalStocks: 5484, dataAccuracy: 98.5, responseTime: '86ms' },
              market: {
                totalStocks: 5484,
                upCount: 3201,
                downCount: 1888,
                flatCount: 395,
                sentiment: '偏强',
                sentimentScore: 68,
                totalTurnover: 1.25,
                turnoverChange: 4.8,
              },
              today: {
                selectedStocks: 12,
                selectedChange: 2,
                selectedChangePercent: 20,
                winRate: 66.7,
                volumeSurges: 18,
              },
              hotSectors: [
                {
                  sector: '半导体',
                  changePct: '+2.3%',
                  netInflow: '+8.6亿',
                  leaderName: '佰维存储',
                  leaderCode: '688525',
                },
              ],
              strategy: {
                totalReturn: 0.126,
                todayReturn: 0.018,
                annualReturn: 0.21,
                maxDrawdown: -0.07,
                sharpeRatio: 1.42,
                winRate: 0.61,
              },
              yieldCurve: {
                dates: ['2026-03-01', '2026-03-02', '2026-03-03'],
                values: [1.0, 1.012, 1.018],
                benchmarkValues: [1.0, 1.006, 1.009],
                benchmarkLabel: '沪深300',
              },
              insights: {
                tradeDate: '2026-03-03',
                generatedAt: '2026-03-03T15:10:00+08:00',
                source: 'test',
                featured: null,
                cards: [],
              },
              meta: { timestamp: '2026-03-03T15:10:00+08:00', dataSource: 'test' },
            },
          }),
        } as Response;
      }

      if (url.endsWith('/api/analysis/super-main-force/monthly')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: {
              tradeDate: '2026-03-03',
              period: { start: '2026-02-01', end: '2026-03-03', days: 20 },
              statistics: {
                selectedCount: 18,
                limitUpCount: 6,
                limitUpRate: 33.3,
                marketLimitUpRate: 9.5,
                comparison: { superMainForce: 33.3, market: 9.5, difference: 23.8 },
              },
              medals: { gold: null, silver: null, bronze: null },
              weeklyComparison: [],
            },
          }),
        } as Response;
      }

      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/super-main-force" element={<div>super-main-force</div>} />
          <Route path="*" element={<div>not-found</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/home/dashboard');
    });

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('今日入选')).toBeInTheDocument();
    expect(screen.getByText('昨日策略胜率')).toBeInTheDocument();
    expect(screen.getByText('超强主力 · 近月战绩')).toBeInTheDocument();
    expect(screen.getAllByText('涨停命中率').length).toBeGreaterThan(0);
    expect(screen.getByRole('table')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看详情' }));
    expect(screen.getByText('super-main-force')).toBeInTheDocument();
  });
});

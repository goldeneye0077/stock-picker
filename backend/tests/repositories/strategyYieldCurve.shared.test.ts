import { getStrategyYieldCurveShared } from '../../src/repositories/shared/strategyYieldCurve';

type QueryCall = {
  sql: string;
  params?: any[];
};

function createMockQuery(calls: QueryCall[]) {
  return async <T = any>(sql: string, params?: any[]): Promise<T[]> => {
    calls.push({ sql, params });

    if (sql.includes('SELECT DISTINCT k.trade_date AS trade_date') && !sql.includes('strategy_daily')) {
      return [
        { trade_date: '2026-03-03' },
        { trade_date: '2026-03-04' },
        { trade_date: '2026-03-05' },
      ] as T[];
    }

    if (sql.includes('FROM signal_events s')) {
      return [
        { trade_date: '2026-03-03', strategy_daily_return: 0, selected_count: 0 },
        { trade_date: '2026-03-04', strategy_daily_return: 0, selected_count: 0 },
        { trade_date: '2026-03-05', strategy_daily_return: 0, selected_count: 0 },
      ] as T[];
    }

    if (sql.includes('FROM super_mainforce_signals s')) {
      return [
        { trade_date: '2026-03-03', strategy_daily_return: 0, selected_count: 0 },
        { trade_date: '2026-03-04', strategy_daily_return: 0.00042, selected_count: 12 },
        { trade_date: '2026-03-05', strategy_daily_return: -0.00021, selected_count: 9 },
      ] as T[];
    }

    if (sql.includes('hs300_candidates')) {
      return [
        { trade_date: '2026-03-03', close_value: 3500 },
        { trade_date: '2026-03-04', close_value: 3510 },
        { trade_date: '2026-03-05', close_value: 3520 },
      ] as T[];
    }

    throw new Error(`Unexpected SQL:\n${sql}`);
  };
}

describe('strategyYieldCurve shared', () => {
  it('should fallback to super_mainforce_signals and keep high precision nav', async () => {
    const calls: QueryCall[] = [];
    const query = createMockQuery(calls);

    const result = await getStrategyYieldCurveShared({
      days: 30,
      query,
      config: {
        klineTable: 'kline_timeseries',
        klineDateColumn: 'trade_date',
        klineStockCodeColumn: 'stock_code',
        signalTable: 'signal_events',
        signalCreatedAtColumn: 'created_at',
        signalStockCodeColumn: 'stock_code',
        signalDateIsTimestampTz: true,
        fallbackSignalTable: 'super_mainforce_signals',
        fallbackSignalDateColumn: 'signal_date',
        fallbackSignalStockCodeColumn: 'stock_code',
        fallbackSignalDateIsTimestampTz: false,
        stockTable: 'stock_dim',
        stockCodeColumn: 'stock_code',
        stockNameColumn: 'name',
      },
    });

    expect(result.dates).toEqual(['2026-03-03', '2026-03-04', '2026-03-05']);
    expect(result.values).toEqual([1, 1.00042, 1.00021]);
    expect(result.benchmarkValues.length).toBe(3);
    expect(result.values[1]).not.toBe(1);
    expect(calls.some((call) => call.sql.includes('FROM super_mainforce_signals s'))).toBe(true);
  });
});

import { checkTimescaleAvailability, queryTimescale } from '../config/timescale';
import { MarketOverview } from './types';

type YieldCurveResponse = {
  dates: string[];
  values: number[];
  benchmarkValues: number[];
  benchmarkLabel: string;
};

type HotSectorRow = {
  sector_name: string;
  sector_pct_change: number | null;
  sector_money_flow: number | null;
};

type SignalQuality = {
  totalSignals: number;
  highConfidenceSignals: number;
};

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toInteger(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
}

function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  if (raw.length >= 10) {
    return raw.slice(0, 10);
  }
  return raw;
}

export class TimescaleAnalyticsRepository {
  async isAvailable(): Promise<boolean> {
    return checkTimescaleAvailability();
  }

  async getMarketOverview(): Promise<MarketOverview> {
    const rows = await queryTimescale<{
      total_stocks: unknown;
      up_count: unknown;
      down_count: unknown;
      flat_count: unknown;
      volume_surge_count: unknown;
      buy_signals_today: unknown;
    }>(`
      WITH latest_day AS (
        SELECT MAX(trade_date) AS trade_date
        FROM kline_timeseries
      ),
      latest_klines AS (
        SELECT
          k.stock_code,
          k.trade_date,
          k.open,
          k.close,
          k.volume,
          AVG(k.volume) OVER (
            PARTITION BY k.stock_code
            ORDER BY k.trade_date
            ROWS BETWEEN 19 PRECEDING AND CURRENT ROW
          ) AS avg_volume_20
        FROM kline_timeseries k
        WHERE k.trade_date <= (SELECT trade_date FROM latest_day)
      ),
      latest_day_klines AS (
        SELECT *
        FROM latest_klines
        WHERE trade_date = (SELECT trade_date FROM latest_day)
      )
      SELECT
        COALESCE((SELECT COUNT(*) FROM stock_dim), 0) AS total_stocks,
        COALESCE(SUM(CASE WHEN l.close > l.open THEN 1 ELSE 0 END), 0) AS up_count,
        COALESCE(SUM(CASE WHEN l.close < l.open THEN 1 ELSE 0 END), 0) AS down_count,
        COALESCE(SUM(CASE WHEN l.close = l.open THEN 1 ELSE 0 END), 0) AS flat_count,
        COALESCE(SUM(CASE
          WHEN l.avg_volume_20 > 0 AND l.volume / l.avg_volume_20 > 2 THEN 1
          ELSE 0
        END), 0) AS volume_surge_count,
        COALESCE((
          SELECT COUNT(*)
          FROM signal_events
          WHERE DATE(created_at) = (SELECT trade_date FROM latest_day)
        ), 0) AS buy_signals_today
      FROM latest_day_klines l
    `);

    const row = rows[0];
    return {
      totalStocks: toInteger(row?.total_stocks),
      upCount: toInteger(row?.up_count),
      downCount: toInteger(row?.down_count),
      flatCount: toInteger(row?.flat_count),
      volumeSurgeCount: toInteger(row?.volume_surge_count),
      buySignalsToday: toInteger(row?.buy_signals_today),
    };
  }

  async getYesterdaySignalCount(): Promise<number> {
    const rows = await queryTimescale<{ count: unknown }>(`
      WITH latest_day AS (
        SELECT MAX(trade_date) AS trade_date
        FROM kline_timeseries
      )
      SELECT COUNT(*) AS count
      FROM signal_events
      WHERE DATE(created_at) = ((SELECT trade_date FROM latest_day) - INTERVAL '1 day')::date
    `);

    return toInteger(rows[0]?.count);
  }

  async getSignalQuality(days: number = 7): Promise<SignalQuality> {
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    const rows = await queryTimescale<{
      total_count: unknown;
      high_confidence_count: unknown;
    }>(`
      WITH latest_day AS (
        SELECT MAX(trade_date) AS trade_date
        FROM kline_timeseries
      ),
      bounds AS (
        SELECT
          (SELECT trade_date FROM latest_day) AS end_date,
          ((SELECT trade_date FROM latest_day) - (($1::int - 1) * INTERVAL '1 day'))::date AS start_date
      )
      SELECT
        COALESCE(COUNT(*), 0) AS total_count,
        COALESCE(SUM(CASE WHEN confidence >= 0.7 THEN 1 ELSE 0 END), 0) AS high_confidence_count
      FROM signal_events
      WHERE DATE(created_at) BETWEEN (SELECT start_date FROM bounds) AND (SELECT end_date FROM bounds)
    `, [days]);

    return {
      totalSignals: toInteger(rows[0]?.total_count),
      highConfidenceSignals: toInteger(rows[0]?.high_confidence_count),
    };
  }

  async getHotSectors(limit: number = 10): Promise<HotSectorRow[]> {
    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid limit parameter. Must be a number between 1 and 100.');
    }

    const rows = await queryTimescale<{
      sector_name: unknown;
      sector_pct_change: unknown;
      sector_money_flow: unknown;
    }>(`
      WITH latest_day AS (
        SELECT MAX(trade_date) AS trade_date
        FROM sector_moneyflow_timeseries
      )
      SELECT
        name AS sector_name,
        pct_change AS sector_pct_change,
        net_amount AS sector_money_flow
      FROM sector_moneyflow_timeseries
      WHERE trade_date = (SELECT trade_date FROM latest_day)
      ORDER BY ABS(COALESCE(net_amount, 0)) DESC, name ASC
      LIMIT $1
    `, [limit]);

    return rows.map((row) => ({
      sector_name: String(row.sector_name || ''),
      sector_pct_change: toFiniteNumber(row.sector_pct_change),
      sector_money_flow: toFiniteNumber(row.sector_money_flow),
    }));
  }

  async getTurnoverSummary(): Promise<{ todayTurnover: number | null; previousTurnover: number | null }> {
    const rows = await queryTimescale<{ today_turnover: unknown; previous_turnover: unknown }>(`
      WITH latest_dates AS (
        SELECT
          trade_date,
          ROW_NUMBER() OVER (ORDER BY trade_date DESC) AS rn
        FROM (
          SELECT DISTINCT trade_date
          FROM kline_timeseries
          WHERE amount IS NOT NULL
          ORDER BY trade_date DESC
          LIMIT 2
        ) d
      )
      SELECT
        SUM(CASE WHEN k.trade_date = (SELECT trade_date FROM latest_dates WHERE rn = 1) THEN k.amount END) AS today_turnover,
        SUM(CASE WHEN k.trade_date = (SELECT trade_date FROM latest_dates WHERE rn = 2) THEN k.amount END) AS previous_turnover
      FROM kline_timeseries k
      WHERE k.trade_date IN (SELECT trade_date FROM latest_dates)
    `);

    const summary = rows[0];
    return {
      todayTurnover: toFiniteNumber(summary?.today_turnover),
      previousTurnover: toFiniteNumber(summary?.previous_turnover),
    };
  }

  async getStrategyYieldCurve(days: number = 30): Promise<YieldCurveResponse> {
    if (!Number.isFinite(days) || days < 5 || days > 365) {
      throw new Error('Invalid days parameter. Must be a number between 5 and 365.');
    }

    const rows = await queryTimescale<{
      trade_date: unknown;
      market_return: unknown;
      signal_count: unknown;
      high_confidence_count: unknown;
      avg_confidence: unknown;
    }>(`
      WITH latest_dates AS (
        SELECT trade_date
        FROM (
          SELECT DISTINCT trade_date
          FROM kline_timeseries
          ORDER BY trade_date DESC
          LIMIT $1
        ) d
      ),
      market_daily AS (
        SELECT
          k.trade_date,
          AVG(CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open) ELSE 0 END) AS market_return
        FROM kline_timeseries k
        INNER JOIN latest_dates ld ON ld.trade_date = k.trade_date
        GROUP BY k.trade_date
      ),
      signal_daily AS (
        SELECT
          DATE(created_at) AS trade_date,
          COUNT(*) AS signal_count,
          SUM(CASE WHEN confidence >= 0.7 THEN 1 ELSE 0 END) AS high_confidence_count,
          AVG(COALESCE(confidence, 0)) AS avg_confidence
        FROM signal_events
        WHERE DATE(created_at) IN (SELECT trade_date FROM latest_dates)
        GROUP BY DATE(created_at)
      )
      SELECT
        ld.trade_date,
        COALESCE(md.market_return, 0) AS market_return,
        COALESCE(sd.signal_count, 0) AS signal_count,
        COALESCE(sd.high_confidence_count, 0) AS high_confidence_count,
        COALESCE(sd.avg_confidence, 0) AS avg_confidence
      FROM latest_dates ld
      LEFT JOIN market_daily md ON md.trade_date = ld.trade_date
      LEFT JOIN signal_daily sd ON sd.trade_date = ld.trade_date
      ORDER BY ld.trade_date ASC
    `, [days]);

    if (rows.length === 0) {
      return { dates: [], values: [], benchmarkValues: [], benchmarkLabel: '沪深300' };
    }

    const hs300Rows = await queryTimescale<{
      trade_date: unknown;
      close_value: unknown;
    }>(`
      WITH latest_dates AS (
        SELECT trade_date
        FROM (
          SELECT DISTINCT trade_date
          FROM kline_timeseries
          ORDER BY trade_date DESC
          LIMIT $1
        ) d
      )
      SELECT
        trade_date,
        AVG(close) AS close_value
      FROM kline_timeseries
      WHERE trade_date IN (SELECT trade_date FROM latest_dates)
        AND stock_code IN ('000300', '399300')
      GROUP BY trade_date
      ORDER BY trade_date ASC
    `, [days]);

    const hs300CloseByDate = new Map<string, number>();
    hs300Rows.forEach((row) => {
      const tradeDate = normalizeDate(row.trade_date);
      const closeValue = toFiniteNumber(row.close_value);
      if (tradeDate && closeValue !== null && closeValue > 0) {
        hs300CloseByDate.set(tradeDate, closeValue);
      }
    });

    const hasRealHs300 = hs300CloseByDate.size >= 2;

    const dates: string[] = [];
    const values: number[] = [];
    const benchmarkValues: number[] = [];
    let strategyNav = 1;
    let benchmarkNav = 1;
    let prevHs300Close: number | null = null;

    rows.forEach((row, index) => {
      const tradeDate = normalizeDate(row.trade_date);
      dates.push(tradeDate);

      const marketReturn = toFiniteNumber(row.market_return) ?? 0;

      if (index === 0) {
        values.push(1);
        benchmarkValues.push(1);
        const firstHs300Close = hs300CloseByDate.get(tradeDate);
        if (firstHs300Close !== undefined && firstHs300Close > 0) {
          prevHs300Close = firstHs300Close;
        }
        return;
      }

      const signalCount = toFiniteNumber(row.signal_count) ?? 0;
      const highConfidenceCount = toFiniteNumber(row.high_confidence_count) ?? 0;
      const avgConfidence = toFiniteNumber(row.avg_confidence) ?? 0.5;

      const confidenceRatio = signalCount > 0 ? (highConfidenceCount / signalCount) : 0.5;
      const signalEdge = (confidenceRatio - 0.5) * 0.012 + (avgConfidence - 0.5) * 0.006;
      const strategyDailyReturn = Math.max(-0.06, Math.min(0.06, marketReturn * 0.35 + signalEdge + 0.0008));

      strategyNav = Math.max(strategyNav * (1 + strategyDailyReturn), 0.2);
      values.push(Math.round(strategyNav * 1000) / 1000);

      let benchmarkDailyReturn = marketReturn;
      if (hasRealHs300) {
        benchmarkDailyReturn = 0;
        const hs300Close = hs300CloseByDate.get(tradeDate);
        if (hs300Close !== undefined && hs300Close > 0) {
          if (prevHs300Close !== null && prevHs300Close > 0) {
            benchmarkDailyReturn = (hs300Close - prevHs300Close) / prevHs300Close;
          }
          prevHs300Close = hs300Close;
        }
      }

      benchmarkDailyReturn = Math.max(-0.12, Math.min(0.12, benchmarkDailyReturn));
      benchmarkNav = Math.max(benchmarkNav * (1 + benchmarkDailyReturn), 0.2);
      benchmarkValues.push(Math.round(benchmarkNav * 1000) / 1000);
    });

    return {
      dates,
      values,
      benchmarkValues,
      benchmarkLabel: hasRealHs300 ? '沪深300' : '沪深300(近似)',
    };
  }
}

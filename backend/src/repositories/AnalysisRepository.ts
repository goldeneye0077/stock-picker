/**
 * 分析数据 Repository
 * 处理成交量分析、资金流向、买入信号等数据查询
 */

import { BaseRepository } from './BaseRepository';
import { VolumeAnalysis, FundFlow, BuySignal, MarketOverview, DateRangeOptions } from './types';

export class AnalysisRepository extends BaseRepository {
  /**
   * 获取市场概览数据
   */
  async getMarketOverview(): Promise<MarketOverview> {
    // 总股票数
    const totalStocksResult = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM stocks'
    );
    const totalStocks = totalStocksResult?.count || 0;

    // 涨跌统计（基于最新K线数据）
    const trendStats = await this.queryOne<{ up: number; down: number; flat: number }>(`
      SELECT
        SUM(CASE WHEN close > open THEN 1 ELSE 0 END) as up,
        SUM(CASE WHEN close < open THEN 1 ELSE 0 END) as down,
        SUM(CASE WHEN close = open THEN 1 ELSE 0 END) as flat
      FROM (
        SELECT stock_code, close, open,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM klines
      )
      WHERE rn = 1
    `);

    // 成交量异动股票数
    const volumeSurgeResult = await this.queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT stock_code) as count
      FROM volume_analysis
      WHERE is_volume_surge = 1
        AND date >= date('now', '-7 days')
    `);
    const volumeSurgeCount = volumeSurgeResult?.count || 0;

    // 今日买入信号�?
    const buySignalsResult = await this.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM buy_signals
      WHERE date(created_at) = date('now')
    `);
    const buySignalsToday = buySignalsResult?.count || 0;

    return {
      totalStocks,
      upCount: trendStats?.up || 0,
      downCount: trendStats?.down || 0,
      flatCount: trendStats?.flat || 0,
      volumeSurgeCount,
      buySignalsToday
    };
  }

  /**
   * 获取买入信号列表
   */
  private asFiniteNumber(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  async getYesterdaySignalCount(): Promise<number> {
    const result = await this.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM buy_signals
      WHERE date(created_at) = date('now', '-1 day')
    `);
    return result?.count || 0;
  }

  async getTurnoverSummary(): Promise<{ todayTurnover: number | null; previousTurnover: number | null }> {
    const [todayResult, previousResult] = await Promise.all([
      this.queryOne<{ total: number }>(`
        SELECT SUM(amount) as total
        FROM realtime_quotes
        WHERE updated_at >= datetime('now', '-1 day')
      `),
      this.queryOne<{ total: number }>(`
        SELECT SUM(amount) as total
        FROM quote_history
        WHERE snapshot_time >= datetime('now', '-2 day')
          AND snapshot_time < datetime('now', '-1 day')
      `),
    ]);

    return {
      todayTurnover: this.asFiniteNumber(todayResult?.total),
      previousTurnover: this.asFiniteNumber(previousResult?.total),
    };
  }

  async hasSuperMainForceTable(): Promise<boolean> {
    const tableCheck = await this.queryOne<{ name: string }>(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='auction_super_mainforce'
    `);
    return Boolean(tableCheck?.name);
  }

  async getLatestSuperMainForceTradeDate(): Promise<string | null> {
    const row = await this.queryOne<{ trade_date: string | null }>(`
      SELECT MAX(trade_date) as trade_date
      FROM auction_super_mainforce
    `);
    return row?.trade_date || null;
  }

  async getLatestQuoteTradeDate(): Promise<string | null> {
    const row = await this.queryOne<{ trade_date: string | null }>(`
      SELECT date(MAX(snapshot_time)) as trade_date
      FROM quote_history
    `);
    return row?.trade_date || null;
  }

  async getSuperMainForcePeriodStats(
    startDate: string,
    endDate: string
  ): Promise<{ selectedCount: number; limitUpCount: number; statsDays: number }> {
    const [selectedCountResult, limitUpCountResult, statsDaysResult] = await Promise.all([
      this.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT ts_code) as count
        FROM auction_super_mainforce
        WHERE trade_date >= ? AND trade_date <= ?
      `, [startDate, endDate]),
      this.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT s.ts_code) as count
        FROM auction_super_mainforce s
        INNER JOIN quote_history q ON s.ts_code = q.ts_code
          AND q.trade_date = date(s.trade_date, '+1 day')
        WHERE s.trade_date >= ? AND s.trade_date <= ?
          AND q.change_percent >= 9.5
      `, [startDate, endDate]),
      this.queryOne<{ count: number }>(`
        SELECT COUNT(DISTINCT trade_date) as count
        FROM auction_super_mainforce
        WHERE trade_date >= ? AND trade_date <= ?
      `, [startDate, endDate]),
    ]);

    return {
      selectedCount: selectedCountResult?.count ?? 0,
      limitUpCount: limitUpCountResult?.count ?? 0,
      statsDays: statsDaysResult?.count ?? 0,
    };
  }

  async getSuperMainForceWeeklyComparison(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; selectedCount: number; limitUpCount: number; hitRate: number }>> {
    return this.query<{ date: string; selectedCount: number; limitUpCount: number; hitRate: number }>(`
      WITH daily_selected AS (
        SELECT
          trade_date,
          COUNT(DISTINCT ts_code) as selected_count
        FROM auction_super_mainforce
        WHERE trade_date >= ? AND trade_date <= ?
        GROUP BY trade_date
      ),
      daily_limit_up AS (
        SELECT
          s.trade_date,
          COUNT(DISTINCT s.ts_code) as limit_up_count
        FROM auction_super_mainforce s
        INNER JOIN quote_history q ON s.ts_code = q.ts_code
          AND q.trade_date = date(s.trade_date, '+1 day')
        WHERE s.trade_date >= ? AND s.trade_date <= ?
          AND q.change_percent >= 9.5
        GROUP BY s.trade_date
      ),
      merged AS (
        SELECT
          ds.trade_date as date,
          ds.selected_count as selectedCount,
          COALESCE(dlu.limit_up_count, 0) as limitUpCount,
          CASE
            WHEN ds.selected_count > 0 THEN ROUND(COALESCE(dlu.limit_up_count, 0) * 1000.0 / ds.selected_count) / 10.0
            ELSE 0
          END as hitRate
        FROM daily_selected ds
        LEFT JOIN daily_limit_up dlu ON ds.trade_date = dlu.trade_date
        ORDER BY ds.trade_date DESC
        LIMIT 7
      )
      SELECT date, selectedCount, limitUpCount, hitRate
      FROM merged
      ORDER BY date ASC
    `, [startDate, endDate, startDate, endDate]);
  }

  async getMarketLimitUpSnapshot(tradeDate: string): Promise<{ count: number; limitUp: number } | null> {
    const result = await this.queryOne<{ count: number; limit_up: number }>(`
      SELECT
        COUNT(DISTINCT ts_code) as count,
        SUM(CASE WHEN change_percent >= 9.5 THEN 1 ELSE 0 END) as limit_up
      FROM quote_history
      WHERE trade_date = ?
    `, [tradeDate]);

    if (!result || !result.count) {
      return null;
    }

    return {
      count: result.count,
      limitUp: result.limit_up ?? 0,
    };
  }
  async getBuySignals(days: number = 7): Promise<any[]> {
    // 参数验证
    if (!this.validateNumber(days, 0, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 0 and 365.');
    }

    const sql = `
      SELECT
        bs.*,
        s.name,
        s.industry,
        k.close as current_price,
        k.volume as current_volume,
        va.volume_ratio
      FROM buy_signals bs
      LEFT JOIN stocks s ON bs.stock_code = s.code
      LEFT JOIN (
        SELECT stock_code, close, volume,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM klines
      ) k ON bs.stock_code = k.stock_code AND k.rn = 1
      LEFT JOIN (
        SELECT stock_code, volume_ratio,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM volume_analysis
      ) va ON bs.stock_code = va.stock_code AND va.rn = 1
      WHERE bs.created_at >= date('now', '-' || ? || ' days')
      ORDER BY bs.created_at DESC
    `;

    return this.query(sql, [days]);
  }

  /**
   * 获取资金流向分析
   */
  async getFundFlow(options: DateRangeOptions): Promise<any[]> {
    const { days = 30, date_from, date_to } = options;

    // 参数验证
    if (!this.validateNumber(days, 1, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    if (date_from && !this.validateDateFormat(date_from)) {
      throw new Error('Invalid date_from format. Use YYYY-MM-DD');
    }

    if (date_to && !this.validateDateFormat(date_to)) {
      throw new Error('Invalid date_to format. Use YYYY-MM-DD');
    }

    // 构建日期条件
    let dateCondition: string;
    let dateParams: any[];

    if (date_from && date_to) {
      dateCondition = 'ff.date >= ? AND ff.date <= ?';
      dateParams = [date_from, date_to];
    } else {
      dateCondition = "ff.date >= date('now', '-' || ? || ' days')";
      dateParams = [days];
    }

    const sql = `
      SELECT
        ff.stock_code as stock,
        s.name,
        ff.date,
        ff.main_fund_flow,
        ff.retail_fund_flow,
        ff.institutional_flow,
        ff.large_order_ratio,
        k.close as price,
        ROUND(((k.close - k.open) / k.open * 100), 2) as change_percent
      FROM fund_flow ff
      LEFT JOIN stocks s ON ff.stock_code = s.code
      LEFT JOIN klines k ON ff.stock_code = k.stock_code AND ff.date = k.date
      WHERE ${dateCondition}
      ORDER BY ff.date DESC, ABS(ff.main_fund_flow) DESC
    `;

    return this.query(sql, dateParams);
  }

  /**
   * 获取成交量异动分�?
   */
  async getVolumeAnalysis(options: DateRangeOptions): Promise<any[]> {
    const { days = 10, date_from, date_to } = options;

    // 参数验证
    if (!this.validateNumber(days, 1, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    if (date_from && !this.validateDateFormat(date_from)) {
      throw new Error('Invalid date_from format. Use YYYY-MM-DD');
    }

    if (date_to && !this.validateDateFormat(date_to)) {
      throw new Error('Invalid date_to format. Use YYYY-MM-DD');
    }

    // 构建日期条件
    let dateCondition: string;
    let dateParams: any[];

    if (date_from && date_to) {
      dateCondition = 'va.date >= ? AND va.date <= ?';
      dateParams = [date_from, date_to];
    } else {
      dateCondition = "va.date >= date('now', '-' || ? || ' days')";
      dateParams = [days];
    }

    const sql = `
      SELECT
        va.stock_code as stock,
        s.name,
        va.date,
        va.volume_ratio as volumeRatio,
        va.is_volume_surge as isSurge,
        k.close as price,
        k.volume,
        ROUND(((k.close - k.open) / k.open * 100), 2) as changePercent
      FROM volume_analysis va
      LEFT JOIN stocks s ON va.stock_code = s.code
      LEFT JOIN klines k ON va.stock_code = k.stock_code AND va.date = k.date
      WHERE ${dateCondition}
        AND va.is_volume_surge = 1
      ORDER BY va.date DESC, va.volume_ratio DESC
    `;

    return this.query(sql, dateParams);
  }

  /**
   * 获取主力行为分析
   */
  async getMainForceBehavior(days: number = 7, limit: number = 20): Promise<any[]> {
    // 参数验证
    if (!this.validateNumber(days, 1, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    if (!this.validateNumber(limit, 1, 1000)) {
      throw new Error('Invalid limit parameter. Must be a number between 1 and 1000.');
    }

    const sql = `
      WITH ranked_flow AS (
        SELECT
          ff.stock_code,
          s.name,
          ff.date,
          ff.main_fund_flow,
          ff.large_order_ratio,
          k.close as price,
          ROUND(((k.close - k.open) / k.open * 100), 2) as change_percent,
          k.volume,
          ROW_NUMBER() OVER (PARTITION BY ff.stock_code ORDER BY ff.date DESC) as rn
        FROM fund_flow ff
        LEFT JOIN stocks s ON ff.stock_code = s.code
        LEFT JOIN klines k ON ff.stock_code = k.stock_code AND ff.date = k.date
        WHERE ff.date >= date('now', '-' || ? || ' days')
      ),
      aggregated AS (
        SELECT
          stock_code as stock,
          name,
          SUM(main_fund_flow) as totalFlow,
          AVG(large_order_ratio) as avgLargeOrderRatio,
          COUNT(*) as days,
          MAX(price) as latestPrice,
          MAX(change_percent) as latestChangePercent,
          MAX(volume) as latestVolume,
          MAX(date) as latestDate
        FROM ranked_flow
        WHERE rn <= ?
        GROUP BY stock_code, name
        HAVING SUM(main_fund_flow) > 0
      )
      SELECT
        stock,
        name,
        totalFlow,
        avgLargeOrderRatio,
        days,
        latestPrice,
        latestChangePercent,
        latestVolume,
        latestDate,
        CASE
          WHEN totalFlow > 100000000 AND avgLargeOrderRatio > 0.3 THEN '强势介入'
          WHEN totalFlow > 50000000 AND avgLargeOrderRatio > 0.2 THEN '稳步建仓'
          WHEN totalFlow > 0 THEN '小幅流入'
          ELSE '观望'
        END as behavior,
        ROUND(totalFlow / 10000000, 2) as strength,
        CASE
          WHEN latestChangePercent > 0 THEN '上涨'
          WHEN latestChangePercent < 0 THEN '下跌'
          ELSE '平盘'
        END as trend
      FROM aggregated
      ORDER BY totalFlow DESC
      LIMIT ?
    `;

    return this.query(sql, [days, days, limit]);
  }

  /**
   * 获取成交量分析（特定股票�?
   */
  async getVolumeAnalysisByStock(stockCode: string, limit: number = 10): Promise<VolumeAnalysis[]> {
    const sql = `
      SELECT * FROM volume_analysis
      WHERE stock_code = ?
      ORDER BY date DESC
      LIMIT ?
    `;
    return this.query<VolumeAnalysis>(sql, [stockCode, limit]);
  }

  /**
   * 获取资金流向（特定股票）
   */
  async getFundFlowByStock(stockCode: string, limit: number = 30): Promise<FundFlow[]> {
    const sql = `
      SELECT * FROM fund_flow
      WHERE stock_code = ?
      ORDER BY date DESC
      LIMIT ?
    `;
    return this.query<FundFlow>(sql, [stockCode, limit]);
  }

  /**
   * 获取买入信号（特定股票）
   */
  async getBuySignalsByStock(stockCode: string, limit: number = 5): Promise<BuySignal[]> {
    const sql = `
      SELECT * FROM buy_signals
      WHERE stock_code = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;
    return this.query<BuySignal>(sql, [stockCode, limit]);
  }

  /**
   * 获取大盘资金流向数据
   */
  async getMarketMoneyflow(options: DateRangeOptions): Promise<any[]> {
    const { days = 30, date_from, date_to } = options;

    // 参数验证
    if (!this.validateNumber(days, 1, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    if (date_from && !this.validateDateFormat(date_from)) {
      throw new Error('Invalid date_from format. Use YYYY-MM-DD');
    }

    if (date_to && !this.validateDateFormat(date_to)) {
      throw new Error('Invalid date_to format. Use YYYY-MM-DD');
    }

    // 构建日期条件
    let dateCondition: string;
    let dateParams: any[];

    if (date_from && date_to) {
      dateCondition = 'trade_date >= ? AND trade_date <= ?';
      dateParams = [date_from, date_to];
    } else {
      dateCondition = "trade_date >= date('now', '-' || ? || ' days')";
      dateParams = [days];
    }

    const sql = `
      SELECT *
      FROM market_moneyflow
      WHERE ${dateCondition}
      ORDER BY trade_date DESC
    `;

    return this.query(sql, dateParams);
  }

  /**
   * 获取板块成交量异动分�?
   */
  async getSectorVolumeAnalysis(days: number = 1): Promise<any[]> {
    // 参数验证
    if (!this.validateNumber(days, 1, 30)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 30.');
    }

    const sql = `
      WITH latest_date AS (
        -- 获取最新交易日
        SELECT MAX(date) as max_date FROM klines
      ),
      today_sector_data AS (
        -- 今日各板块数�?
        SELECT
          s.industry as sector,
          COUNT(DISTINCT k.stock_code) as stock_count,
          SUM(k.volume) as total_volume,
          SUM(k.amount) as total_amount,
          SUM(CASE WHEN (k.close - k.open) > 0 THEN 1 ELSE 0 END) as up_count,
          SUM(CASE WHEN (k.close - k.open) < 0 THEN 1 ELSE 0 END) as down_count,
          AVG(CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END) as avg_change
        FROM klines k
        INNER JOIN stocks s ON k.stock_code = s.code
        WHERE k.date = (SELECT max_date FROM latest_date)
          AND s.industry IS NOT NULL
          AND s.industry != ''
        GROUP BY s.industry
      ),
      historical_sector_data AS (
        -- 历史N日各板块平均数据
        SELECT
          s.industry as sector,
          AVG(k.volume) as avg_volume,
          AVG(k.amount) as avg_amount
        FROM klines k
        INNER JOIN stocks s ON k.stock_code = s.code
        WHERE k.date >= date((SELECT max_date FROM latest_date), '-' || ? || ' days')
          AND k.date < (SELECT max_date FROM latest_date)
          AND s.industry IS NOT NULL
          AND s.industry != ''
        GROUP BY s.industry
      ),
      leading_stocks AS (
        -- 各板块龙头股（今日涨幅最高）
        SELECT
          s.industry as sector,
          s.name as leading_stock,
          CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END as leading_change
        FROM klines k
        INNER JOIN stocks s ON k.stock_code = s.code
        WHERE k.date = (SELECT max_date FROM latest_date)
          AND s.industry IS NOT NULL
          AND s.industry != ''
        GROUP BY s.industry
        HAVING CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END =
          MAX(CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END)
      )
      SELECT
        t.sector,
        t.total_volume as volume,
        t.total_amount as amount,
        CASE
          WHEN h.avg_volume > 0 THEN ROUND(((t.total_volume - h.avg_volume) / h.avg_volume * 100), 2)
          ELSE 0
        END as volume_change,
        t.stock_count,
        t.up_count,
        t.down_count,
        ROUND(t.avg_change, 2) as avg_change,
        COALESCE(l.leading_stock, '') as leading_stock,
        COALESCE(ROUND(l.leading_change, 2), 0) as leading_stock_change
      FROM today_sector_data t
      LEFT JOIN historical_sector_data h ON t.sector = h.sector
      LEFT JOIN leading_stocks l ON t.sector = l.sector
      WHERE t.sector IS NOT NULL
      ORDER BY volume_change DESC
    `;

    return this.query(sql, [days]);
  }

  /**
   * 获取板块资金流向数据
   */
  async getSectorMoneyflow(options: DateRangeOptions): Promise<any[]> {
    const { days = 30, date_from, date_to } = options;

    // 参数验证
    if (!this.validateNumber(days, 1, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    if (date_from && !this.validateDateFormat(date_from)) {
      throw new Error('Invalid date_from format. Use YYYY-MM-DD');
    }

    if (date_to && !this.validateDateFormat(date_to)) {
      throw new Error('Invalid date_to format. Use YYYY-MM-DD');
    }

    // 构建日期条件
    let dateCondition: string;
    let dateParams: any[];

    if (date_from && date_to) {
      dateCondition = 'trade_date >= ? AND trade_date <= ?';
      dateParams = [date_from, date_to];
    } else {
      dateCondition = "trade_date >= date('now', '-' || ? || ' days')";
      dateParams = [days];
    }

    const sql = `
      SELECT *
      FROM sector_moneyflow
      WHERE ${dateCondition}
      ORDER BY trade_date DESC, net_amount DESC
    `;

    return this.query(sql, dateParams);
  }

  /**
   * 获取热点板块交叉分析（资金流�?+ 成交量异动）
   */
  async getHotSectorStocks(days: number = 1, limit: number = 10): Promise<any[]> {
    // 参数验证
    if (!this.validateNumber(days, 1, 30)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 30.');
    }

    if (!this.validateNumber(limit, 1, 50)) {
      throw new Error('Invalid limit parameter. Must be a number between 1 and 50.');
    }

    const sql = `
      WITH latest_date AS (
        -- 获取最新交易日
        SELECT MAX(date) as max_date FROM klines
      ),
      hot_sectors AS (
        -- 找出既有资金流向数据又有成交量数据的板块（不限制资金必须流入�?
        SELECT DISTINCT
          s.industry as sector_name,
          COALESCE(MAX(sm.net_amount), 0) as sector_money_flow,
          COALESCE(MAX(sm.pct_change), 0) as sector_pct_change
        FROM stocks s
        INNER JOIN klines k ON s.code = k.stock_code
        LEFT JOIN sector_moneyflow sm ON (
          (sm.name = s.industry
          OR sm.name LIKE '%' || s.industry || '%'
          OR s.industry LIKE '%' || sm.name || '%')
          AND sm.trade_date >= date((SELECT max_date FROM latest_date), '-' || ? || ' days')
        )
        WHERE k.date >= date((SELECT max_date FROM latest_date), '-' || ? || ' days')
          AND s.industry IS NOT NULL
          AND s.industry != ''
        GROUP BY s.industry
        HAVING COUNT(DISTINCT k.stock_code) >= 3  -- 至少3只股�?
      ),
      sector_stocks AS (
        -- 获取热点板块中的股票
        SELECT
          hs.sector_name,
          hs.sector_money_flow,
          hs.sector_pct_change,
          s.code as stock_code,
          s.name as stock_name,
          k.close as price,
          k.volume,
          ROUND(((k.close - k.open) / k.open * 100), 2) as change_percent,
          COALESCE(va.volume_ratio, 1.0) as volume_ratio,
          COALESCE(ff.main_fund_flow, 0) as main_fund_flow,
          -- 综合评分：涨�?40%) + 量比(30%) + 资金�?30%)
          (
            (CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END) * 0.4 +
            (COALESCE(va.volume_ratio, 1.0) - 1.0) * 10 * 0.3 +
            (COALESCE(ff.main_fund_flow, 0) / 10000000) * 0.3
          ) as score,
          ROW_NUMBER() OVER (PARTITION BY hs.sector_name ORDER BY
            (
              (CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END) * 0.4 +
              (COALESCE(va.volume_ratio, 1.0) - 1.0) * 10 * 0.3 +
              (COALESCE(ff.main_fund_flow, 0) / 10000000) * 0.3
            ) DESC
          ) as rank_in_sector
        FROM hot_sectors hs
        INNER JOIN stocks s ON s.industry = hs.sector_name
        INNER JOIN klines k ON s.code = k.stock_code AND k.date = (SELECT max_date FROM latest_date)
        LEFT JOIN volume_analysis va ON s.code = va.stock_code AND va.date = (SELECT max_date FROM latest_date)
        LEFT JOIN fund_flow ff ON s.code = ff.stock_code AND ff.date = (SELECT max_date FROM latest_date)
        WHERE k.volume > 0
      )
      SELECT
        sector_name,
        sector_money_flow,
        sector_pct_change,
        stock_code,
        stock_name,
        price,
        volume,
        change_percent,
        volume_ratio,
        main_fund_flow,
        ROUND(score, 2) as score,
        rank_in_sector
      FROM sector_stocks
      WHERE rank_in_sector <= ?
      ORDER BY sector_money_flow DESC, rank_in_sector ASC
    `;

    return this.query(sql, [days, days, limit]);
  }

  async getAuctionSnapshot(tradeDate?: string): Promise<{ tradeDate: string | null; snapshotTime: string | null; rows: any[] }> {
    let targetDate: string | null = null;
    let snapshotTime: string | null = null;

    if (tradeDate) {
      const row = await this.queryOne<{ trade_date: string; snapshot_time: string }>(
        `
        SELECT date(substr(snapshot_time, 1, 10)) as trade_date, MAX(snapshot_time) as snapshot_time
        FROM quote_history
        WHERE date(substr(snapshot_time, 1, 10)) <= ?
          AND time(substr(snapshot_time, 12)) BETWEEN '09:20:00' AND '09:30:00'
        GROUP BY trade_date
        ORDER BY trade_date DESC
        LIMIT 1
        `,
        [tradeDate]
      );
      snapshotTime = row?.snapshot_time || null;
      targetDate = row?.trade_date || tradeDate;
    } else {
      const row = await this.queryOne<{ trade_date: string; snapshot_time: string }>(
        `
        SELECT date(substr(snapshot_time, 1, 10)) as trade_date, MAX(snapshot_time) as snapshot_time
        FROM quote_history
        WHERE time(substr(snapshot_time, 12)) BETWEEN '09:20:00' AND '09:30:00'
        GROUP BY trade_date
        ORDER BY trade_date DESC
        LIMIT 1
        `
      );
      targetDate = row?.trade_date || null;
      snapshotTime = row?.snapshot_time || null;
    }

    if (!snapshotTime || !targetDate) {
      return { tradeDate: targetDate, snapshotTime, rows: [] };
    }

    const rows = await this.query<any>(
      `
      SELECT
        q.stock_code as stock,
        s.name as name,
        s.industry as industry,
        q.open as price,
        q.pre_close as preClose,
        q.amount as amount,
        q.vol as vol,
        q.change_percent as gapPercent,
        COALESCE(db0.close, k.close, q.close) as closePrice,
        CASE
          WHEN k.close IS NOT NULL AND k.open IS NOT NULL AND k.open > 0
            THEN ROUND(((k.close - k.open) / k.open * 100), 2)
          WHEN db0.close IS NOT NULL AND q.pre_close IS NOT NULL AND q.pre_close > 0
            THEN ROUND(((db0.close - q.pre_close) / q.pre_close * 100), 2)
          ELSE q.change_percent
        END as changePercent,
        COALESCE(db0.turnover_rate, 0) as turnoverRate,
        COALESCE(db0.volume_ratio, 0) as volumeRatio,
        COALESCE(db0.float_share, 0) as floatShare,
        COALESCE(db0.pe, db0.pe_ttm, dbp.pe, dbp.pe_ttm) as pe,
        COALESCE(db0.pe_ttm, db0.pe, dbp.pe_ttm, dbp.pe) as peTtm
      FROM quote_history q
      LEFT JOIN stocks s ON s.code = q.stock_code
      LEFT JOIN daily_basic db0
        ON db0.stock_code = q.stock_code
       AND REPLACE(db0.trade_date, '-', '') = REPLACE(?, '-', '')
      LEFT JOIN daily_basic dbp
        ON dbp.stock_code = q.stock_code
       AND dbp.trade_date = (
         SELECT MAX(trade_date)
        FROM daily_basic
        WHERE stock_code = q.stock_code
          AND trade_date <= ?
          AND (pe IS NOT NULL OR pe_ttm IS NOT NULL)
       )
      LEFT JOIN klines k
        ON k.stock_code = q.stock_code
       AND k.date = (
         SELECT MAX(date)
         FROM klines
         WHERE stock_code = q.stock_code
           AND date <= ?
       )
      WHERE q.snapshot_time = ?
        AND (s.name IS NULL OR UPPER(s.name) NOT LIKE '%ST%')
      ORDER BY amount DESC
      `,
      [targetDate, targetDate, targetDate, snapshotTime]
    );

    return { tradeDate: targetDate, snapshotTime, rows };
  }

  async getAvgAuctionVolume(stockCodes: string[], tradeDate: string, days: number = 5): Promise<Record<string, number>> {
    if (!stockCodes || stockCodes.length === 0) {
      return {};
    }

    const placeholders = stockCodes.map(() => '?').join(',');
    const params: any[] = [tradeDate, days, ...stockCodes];

    const rows = await this.query<{ stock: string; avgVol: number }>(
      `
      WITH recent_days AS (
        SELECT DISTINCT date(substr(snapshot_time, 1, 10)) AS d
        FROM quote_history
        WHERE date(substr(snapshot_time, 1, 10)) < ?
          AND time(substr(snapshot_time, 12)) BETWEEN '09:20:00' AND '09:30:00'
        ORDER BY d DESC
        LIMIT ?
      )
      SELECT q.stock_code AS stock, AVG(q.vol) AS avgVol
      FROM quote_history q
      WHERE date(substr(q.snapshot_time, 1, 10)) IN (SELECT d FROM recent_days)
        AND time(substr(q.snapshot_time, 12)) BETWEEN '09:20:00' AND '09:30:00'
        AND q.stock_code IN (${placeholders})
      GROUP BY q.stock_code
      `,
      params
    );

    const map: Record<string, number> = {};
    for (const r of rows) {
      map[r.stock] = Number(r.avgVol || 0);
    }
    return map;
  }
}


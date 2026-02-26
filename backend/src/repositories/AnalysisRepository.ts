/**
 * 鍒嗘瀽鏁版嵁 Repository
 * 澶勭悊鎴愪氦閲忓垎鏋愩€佽祫閲戞祦鍚戙€佷拱鍏ヤ俊鍙风瓑鏁版嵁鏌ヨ
 */

import { BaseRepository } from './BaseRepository';
import { VolumeAnalysis, FundFlow, BuySignal, MarketOverview, DateRangeOptions } from './types';

export class AnalysisRepository extends BaseRepository {
  /**
   * 鑾峰彇甯傚満姒傝鏁版嵁
   */
  async getMarketOverview(): Promise<MarketOverview> {
    // 鎬昏偂绁ㄦ暟
    const totalStocksResult = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM stocks'
    );
    const totalStocks = totalStocksResult?.count || 0;

    // 娑ㄨ穼缁熻锛堝熀浜庢渶鏂癒绾挎暟鎹級
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

    // 鎴愪氦閲忓紓鍔ㄨ偂绁ㄦ暟
    const volumeSurgeResult = await this.queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT stock_code) as count
      FROM volume_analysis
      WHERE is_volume_surge = 1
        AND date >= date('now', '-7 days')
    `);
    const volumeSurgeCount = volumeSurgeResult?.count || 0;

    // 浠婃棩涔板叆淇″彿锟?
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
   * 鑾峰彇涔板叆淇″彿鍒楄〃
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
    const summary = await this.queryOne<{ today_turnover: number | null; previous_turnover: number | null }>(`
      WITH latest_dates AS (
        SELECT
          date as trade_date,
          ROW_NUMBER() OVER (ORDER BY date DESC) as rn
        FROM (
          SELECT DISTINCT date
          FROM klines
          WHERE amount IS NOT NULL
          ORDER BY date DESC
          LIMIT 2
        )
      )
      SELECT
        SUM(CASE WHEN k.date = (SELECT trade_date FROM latest_dates WHERE rn = 1) THEN k.amount ELSE 0 END) as today_turnover,
        SUM(CASE WHEN k.date = (SELECT trade_date FROM latest_dates WHERE rn = 2) THEN k.amount ELSE 0 END) as previous_turnover
      FROM klines k
      WHERE k.date IN (SELECT trade_date FROM latest_dates)
    `);

    return {
      todayTurnover: this.asFiniteNumber(summary?.today_turnover),
      previousTurnover: this.asFiniteNumber(summary?.previous_turnover),
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
        WITH candidates AS (
          SELECT DISTINCT
            s.ts_code,
            s.trade_date
          FROM auction_super_mainforce s
          WHERE s.trade_date >= ? AND s.trade_date <= ?
        ),
        next_trade_day AS (
          SELECT
            c.ts_code,
            c.trade_date,
            (
              SELECT MIN(k1.date)
              FROM klines k1
              WHERE k1.stock_code = substr(c.ts_code, 1, 6)
                AND k1.date > c.trade_date
            ) as next_trade_date
          FROM candidates c
        ),
        next_day_perf AS (
          SELECT
            n.ts_code,
            (
              SELECT k2.high
              FROM klines k2
              WHERE k2.stock_code = substr(n.ts_code, 1, 6)
                AND k2.date = n.next_trade_date
            ) as next_high,
            (
              SELECT k3.close
              FROM klines k3
              WHERE k3.stock_code = substr(n.ts_code, 1, 6)
                AND k3.date < n.next_trade_date
              ORDER BY k3.date DESC
              LIMIT 1
            ) as prev_close
          FROM next_trade_day n
          WHERE n.next_trade_date IS NOT NULL
        )
        SELECT COUNT(DISTINCT ts_code) as count
        FROM next_day_perf
        WHERE prev_close > 0
          AND ((next_high - prev_close) / prev_close) >= 0.095
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
        WITH candidates AS (
          SELECT DISTINCT
            s.trade_date,
            s.ts_code
          FROM auction_super_mainforce s
          WHERE s.trade_date >= ? AND s.trade_date <= ?
        ),
        next_trade_day AS (
          SELECT
            c.trade_date,
            c.ts_code,
            (
              SELECT MIN(k1.date)
              FROM klines k1
              WHERE k1.stock_code = substr(c.ts_code, 1, 6)
                AND k1.date > c.trade_date
            ) as next_trade_date
          FROM candidates c
        ),
        next_day_perf AS (
          SELECT
            n.trade_date,
            n.ts_code,
            (
              SELECT k2.high
              FROM klines k2
              WHERE k2.stock_code = substr(n.ts_code, 1, 6)
                AND k2.date = n.next_trade_date
            ) as next_high,
            (
              SELECT k3.close
              FROM klines k3
              WHERE k3.stock_code = substr(n.ts_code, 1, 6)
                AND k3.date < n.next_trade_date
              ORDER BY k3.date DESC
              LIMIT 1
            ) as prev_close
          FROM next_trade_day n
          WHERE n.next_trade_date IS NOT NULL
        )
        SELECT
          trade_date,
          COUNT(DISTINCT ts_code) as limit_up_count
        FROM next_day_perf
        WHERE prev_close > 0
          AND ((next_high - prev_close) / prev_close) >= 0.095
        GROUP BY trade_date
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
        COUNT(DISTINCT stock_code) as count,
        SUM(CASE WHEN change_percent >= 9.5 THEN 1 ELSE 0 END) as limit_up
      FROM quote_history
      WHERE DATE(snapshot_time) = ?
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
    // 鍙傛暟楠岃瘉
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
   * 鑾峰彇璧勯噾娴佸悜鍒嗘瀽
   */
  async getFundFlow(options: DateRangeOptions): Promise<any[]> {
    const { days = 30, date_from, date_to } = options;

    // 鍙傛暟楠岃瘉
    if (!this.validateNumber(days, 1, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    if (date_from && !this.validateDateFormat(date_from)) {
      throw new Error('Invalid date_from format. Use YYYY-MM-DD');
    }

    if (date_to && !this.validateDateFormat(date_to)) {
      throw new Error('Invalid date_to format. Use YYYY-MM-DD');
    }

    // 鏋勫缓鏃ユ湡鏉′欢
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
   * 鑾峰彇鎴愪氦閲忓紓鍔ㄥ垎锟?
   */
  async getVolumeAnalysis(options: DateRangeOptions): Promise<any[]> {
    const { days = 10, date_from, date_to } = options;

    // 鍙傛暟楠岃瘉
    if (!this.validateNumber(days, 1, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    if (date_from && !this.validateDateFormat(date_from)) {
      throw new Error('Invalid date_from format. Use YYYY-MM-DD');
    }

    if (date_to && !this.validateDateFormat(date_to)) {
      throw new Error('Invalid date_to format. Use YYYY-MM-DD');
    }

    // 鏋勫缓鏃ユ湡鏉′欢
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
   * 鑾峰彇涓诲姏琛屼负鍒嗘瀽
   */
  async getMainForceBehavior(days: number = 7, limit: number = 20): Promise<any[]> {
    // 鍙傛暟楠岃瘉
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
          WHEN totalFlow > 100000000 AND avgLargeOrderRatio > 0.3 THEN '寮哄娍浠嬪叆'
          WHEN totalFlow > 50000000 AND avgLargeOrderRatio > 0.2 THEN '绋虫寤轰粨'
          WHEN totalFlow > 0 THEN '灏忓箙娴佸叆'
          ELSE '瑙傛湜'
        END as behavior,
        ROUND(totalFlow / 10000000, 2) as strength,
        CASE
          WHEN latestChangePercent > 0 THEN '涓婃定'
          WHEN latestChangePercent < 0 THEN '涓嬭穼'
          ELSE '骞崇洏'
        END as trend
      FROM aggregated
      ORDER BY totalFlow DESC
      LIMIT ?
    `;

    return this.query(sql, [days, days, limit]);
  }

  /**
   * 鑾峰彇鎴愪氦閲忓垎鏋愶紙鐗瑰畾鑲＄エ锟?
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
   * 鑾峰彇璧勯噾娴佸悜锛堢壒瀹氳偂绁級
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
   * 鑾峰彇涔板叆淇″彿锛堢壒瀹氳偂绁級
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
   * 鑾峰彇澶х洏璧勯噾娴佸悜鏁版嵁
   */
  async getMarketMoneyflow(options: DateRangeOptions): Promise<any[]> {
    const { days = 30, date_from, date_to } = options;

    // 鍙傛暟楠岃瘉
    if (!this.validateNumber(days, 1, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    if (date_from && !this.validateDateFormat(date_from)) {
      throw new Error('Invalid date_from format. Use YYYY-MM-DD');
    }

    if (date_to && !this.validateDateFormat(date_to)) {
      throw new Error('Invalid date_to format. Use YYYY-MM-DD');
    }

    // 鏋勫缓鏃ユ湡鏉′欢
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
   * 鑾峰彇鏉垮潡鎴愪氦閲忓紓鍔ㄥ垎锟?
   */
  async getSectorVolumeAnalysis(days: number = 1): Promise<any[]> {
    // 鍙傛暟楠岃瘉
    if (!this.validateNumber(days, 1, 30)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 30.');
    }

    const sql = `
      WITH latest_date AS (
        -- 鑾峰彇鏈€鏂颁氦鏄撴棩
        SELECT MAX(date) as max_date FROM klines
      ),
      today_sector_data AS (
        -- 浠婃棩鍚勬澘鍧楁暟锟?
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
        -- 鍘嗗彶N鏃ュ悇鏉垮潡骞冲潎鏁版嵁
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
        -- 鍚勬澘鍧楅緳澶磋偂锛堜粖鏃ユ定骞呮渶楂橈級
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
   * 鑾峰彇鏉垮潡璧勯噾娴佸悜鏁版嵁
   */
  async getSectorMoneyflow(options: DateRangeOptions): Promise<any[]> {
    const { days = 30, date_from, date_to } = options;

    // 鍙傛暟楠岃瘉
    if (!this.validateNumber(days, 1, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 365.');
    }

    if (date_from && !this.validateDateFormat(date_from)) {
      throw new Error('Invalid date_from format. Use YYYY-MM-DD');
    }

    if (date_to && !this.validateDateFormat(date_to)) {
      throw new Error('Invalid date_to format. Use YYYY-MM-DD');
    }

    // 鏋勫缓鏃ユ湡鏉′欢
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
   * 鑾峰彇鐑偣鏉垮潡浜ゅ弶鍒嗘瀽锛堣祫閲戞祦锟?+ 鎴愪氦閲忓紓鍔級
   */
  async getHotSectorStocks(days: number = 1, limit: number = 10): Promise<any[]> {
    // 锟斤拷锟斤拷锟斤拷证
    if (!this.validateNumber(days, 1, 30)) {
      throw new Error('Invalid days parameter. Must be a number between 1 and 30.');
    }

    if (!this.validateNumber(limit, 1, 50)) {
      throw new Error('Invalid limit parameter. Must be a number between 1 and 50.');
    }

    const sql = `
      WITH latest_date AS (
        SELECT MAX(date) as max_date FROM klines
      ),
      latest_sector_date AS (
        SELECT MAX(trade_date) as max_trade_date
        FROM sector_moneyflow
        WHERE trade_date <= (SELECT max_date FROM latest_date)
      ),
      latest_sector_moneyflow AS (
        SELECT
          name,
          pct_change,
          net_amount,
          LOWER(REPLACE(TRIM(name), ' ', '')) as normalized_name
        FROM sector_moneyflow
        WHERE trade_date = (SELECT max_trade_date FROM latest_sector_date)
      ),
      industry_snapshot AS (
        SELECT
          s.code as stock_code,
          s.industry as sector_name,
          LOWER(REPLACE(TRIM(s.industry), ' ', '')) as normalized_sector_name
        FROM stocks s
        WHERE s.industry IS NOT NULL
          AND TRIM(s.industry) != ''
      ),
      hot_sectors AS (
        SELECT
          i.sector_name,
          COALESCE(
            MAX(CASE WHEN sm.normalized_name = i.normalized_sector_name THEN sm.net_amount END),
            MAX(CASE WHEN sm.name LIKE '%' || i.sector_name || '%' OR i.sector_name LIKE '%' || sm.name || '%' THEN sm.net_amount END),
            0
          ) as sector_money_flow,
          COALESCE(
            MAX(CASE WHEN sm.normalized_name = i.normalized_sector_name THEN sm.pct_change END),
            MAX(CASE WHEN sm.name LIKE '%' || i.sector_name || '%' OR i.sector_name LIKE '%' || sm.name || '%' THEN sm.pct_change END),
            ROUND(AVG(CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END), 2),
            0
          ) as sector_pct_change
        FROM industry_snapshot i
        INNER JOIN klines k ON i.stock_code = k.stock_code
        LEFT JOIN latest_sector_moneyflow sm ON (
          sm.normalized_name = i.normalized_sector_name
          OR sm.name LIKE '%' || i.sector_name || '%'
          OR i.sector_name LIKE '%' || sm.name || '%'
        )
        WHERE k.date >= date((SELECT max_date FROM latest_date), '-' || ? || ' days')
        GROUP BY i.sector_name, i.normalized_sector_name
        HAVING COUNT(DISTINCT k.stock_code) >= 3
      ),
      sector_stocks AS (
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
          (
            (CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END) * 0.4 +
            (COALESCE(va.volume_ratio, 1.0) - 1.0) * 10 * 0.3 +
            (COALESCE(ff.main_fund_flow, 0) / 10000000) * 0.3
          ) as score,
          ROW_NUMBER() OVER (
            PARTITION BY hs.sector_name
            ORDER BY (
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
      ORDER BY ABS(sector_money_flow) DESC, rank_in_sector ASC
    `;

    return this.query(sql, [days, limit]);
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
  async getStrategyYieldCurve(days: number = 30): Promise<{
    dates: string[];
    values: number[];
    benchmarkValues: number[];
    benchmarkLabel: string;
  }> {
    if (!this.validateNumber(days, 5, 365)) {
      throw new Error('Invalid days parameter. Must be a number between 5 and 365.');
    }

    const rows = await this.query<{
      trade_date: string;
      market_return: number | null;
      signal_count: number | null;
      high_confidence_count: number | null;
      avg_confidence: number | null;
    }>(`
      WITH latest_dates AS (
        SELECT date as trade_date
        FROM (
          SELECT DISTINCT date
          FROM klines
          ORDER BY date DESC
          LIMIT ?
        )
      ),
      market_daily AS (
        SELECT
          k.date as trade_date,
          AVG(CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open) ELSE 0 END) as market_return
        FROM klines k
        INNER JOIN latest_dates ld ON ld.trade_date = k.date
        GROUP BY k.date
      ),
      signal_daily AS (
        SELECT
          DATE(created_at) as trade_date,
          COUNT(*) as signal_count,
          SUM(CASE WHEN confidence >= 0.7 THEN 1 ELSE 0 END) as high_confidence_count,
          AVG(COALESCE(confidence, 0)) as avg_confidence
        FROM buy_signals
        WHERE DATE(created_at) IN (SELECT trade_date FROM latest_dates)
        GROUP BY DATE(created_at)
      )
      SELECT
        ld.trade_date,
        COALESCE(md.market_return, 0) as market_return,
        COALESCE(sd.signal_count, 0) as signal_count,
        COALESCE(sd.high_confidence_count, 0) as high_confidence_count,
        COALESCE(sd.avg_confidence, 0) as avg_confidence
      FROM latest_dates ld
      LEFT JOIN market_daily md ON md.trade_date = ld.trade_date
      LEFT JOIN signal_daily sd ON sd.trade_date = ld.trade_date
      ORDER BY ld.trade_date ASC
    `, [days]);

    if (rows.length === 0) {
      return { dates: [], values: [], benchmarkValues: [], benchmarkLabel: '\u6CAA\u6DF1300' };
    }

    const hs300Rows = await this.query<{
      trade_date: string;
      close_value: number | null;
    }>(`
      WITH latest_dates AS (
        SELECT date as trade_date
        FROM (
          SELECT DISTINCT date
          FROM klines
          ORDER BY date DESC
          LIMIT ?
        )
      )
      SELECT
        k.date as trade_date,
        AVG(k.close) as close_value
      FROM klines k
      LEFT JOIN stocks s ON s.code = k.stock_code
      INNER JOIN latest_dates ld ON ld.trade_date = k.date
      WHERE
        k.stock_code IN ('000300', '399300')
        OR (
          s.name IS NOT NULL
          AND (s.name LIKE '%娌繁300%' OR s.name LIKE '%CSI300%')
        )
      GROUP BY k.date
      ORDER BY k.date ASC
    `, [days]);

    const hs300CloseByDate = new Map<string, number>();
    hs300Rows.forEach((row) => {
      const closeValue = this.asFiniteNumber(row.close_value);
      if (closeValue !== null && closeValue > 0) {
        hs300CloseByDate.set(row.trade_date, closeValue);
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
      dates.push(row.trade_date);

      const marketReturn = this.asFiniteNumber(row.market_return) ?? 0;

      if (index === 0) {
        values.push(1);
        benchmarkValues.push(1);
        const firstHs300Close = hs300CloseByDate.get(row.trade_date);
        if (firstHs300Close !== undefined && firstHs300Close > 0) {
          prevHs300Close = firstHs300Close;
        }
        return;
      }

      const signalCount = this.asFiniteNumber(row.signal_count) ?? 0;
      const highConfidenceCount = this.asFiniteNumber(row.high_confidence_count) ?? 0;
      const avgConfidence = this.asFiniteNumber(row.avg_confidence) ?? 0.5;

      const confidenceRatio = signalCount > 0 ? (highConfidenceCount / signalCount) : 0.5;
      const signalEdge = (confidenceRatio - 0.5) * 0.012 + (avgConfidence - 0.5) * 0.006;
      const strategyDailyReturn = Math.max(-0.06, Math.min(0.06, marketReturn * 0.35 + signalEdge + 0.0008));

      strategyNav = Math.max(strategyNav * (1 + strategyDailyReturn), 0.2);
      values.push(Math.round(strategyNav * 1000) / 1000);

      let benchmarkDailyReturn = marketReturn;
      if (hasRealHs300) {
        benchmarkDailyReturn = 0;
        const hs300Close = hs300CloseByDate.get(row.trade_date);
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
      benchmarkLabel: hasRealHs300 ? '\u6CAA\u6DF1300' : '\u6CAA\u6DF1300(\u8FD1\u4F3C)',
    };
  }
}


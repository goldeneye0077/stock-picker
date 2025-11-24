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

    // 今日买入信号数
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
   * 获取成交量异动分析
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
   * 获取成交量分析（特定股票）
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
   * 获取板块成交量异动分析
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
        -- 今日各板块数据
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
   * 获取热点板块交叉分析（资金流向 + 成交量异动）
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
        -- 找出既有资金流向数据又有成交量数据的板块（不限制资金必须流入）
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
        HAVING COUNT(DISTINCT k.stock_code) >= 3  -- 至少3只股票
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
          -- 综合评分：涨幅(40%) + 量比(30%) + 资金流(30%)
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
}


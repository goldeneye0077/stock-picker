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
        WHERE ff.date >= (SELECT MAX(date) FROM fund_flow WHERE date <= date('now', '-' || ? || ' days'))
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
}


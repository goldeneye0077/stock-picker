/**
 * 股票数据 Repository
 * 处理股票基本信息、行情数据的查询
 */

import { BaseRepository } from './BaseRepository';
import { Stock, StockDetails, KLine, VolumeAnalysis, BuySignal, RealtimeQuote } from './types';

export class StockRepository extends BaseRepository {
  /**
   * 获取所有股票列表（包含最新行情）
   */
  async findAll(): Promise<Stock[]> {
    const sql = `
      SELECT s.*,
             COALESCE(rq.close, k.close) as current_price,
             rq.pre_close as pre_close,
             COALESCE(rq.open, k.open) as open,
             COALESCE(rq.high, k.high) as high,
             COALESCE(rq.low, k.low) as low,
             COALESCE(rq.vol, k.volume) as volume,
             COALESCE(rq.amount, k.amount) as amount,
             COALESCE(rq.change_percent, ((k.close - k.open) / k.open * 100)) as change_percent,
             COALESCE(rq.change_amount, (k.close - k.open)) as change_amount,
             rq.updated_at as quote_time,
             va.volume_ratio,
             va.is_volume_surge,
             bs.signal_type as latest_signal
      FROM stocks s
      LEFT JOIN realtime_quotes rq ON s.code = rq.stock_code
      LEFT JOIN (
        SELECT stock_code, close, volume, open, high, low, amount,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM klines
      ) k ON s.code = k.stock_code AND k.rn = 1
      LEFT JOIN (
        SELECT stock_code, volume_ratio, is_volume_surge,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM volume_analysis
      ) va ON s.code = va.stock_code AND va.rn = 1
      LEFT JOIN (
        SELECT stock_code, signal_type,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY created_at DESC) as rn
        FROM buy_signals
      ) bs ON s.code = bs.stock_code AND bs.rn = 1
      ORDER BY s.code
    `;

    return this.query<Stock>(sql);
  }

  /**
   * 根据代码查询股票基本信息
   */
  async findByCode(code: string): Promise<Stock | undefined> {
    const sql = 'SELECT * FROM stocks WHERE code = ?';
    return this.queryOne<Stock>(sql, [code]);
  }

  /**
   * 获取股票详细信息
   */
  async findDetailsByCode(code: string): Promise<StockDetails | null> {
    const stock = await this.findByCode(code);
    if (!stock) {
      return null;
    }

    // 获取实时行情
    const realtimeQuote = await this.queryOne<RealtimeQuote>(
      'SELECT * FROM realtime_quotes WHERE stock_code = ?',
      [code]
    );

    // 获取最近 30 天 K 线数据
    const klines = await this.query<KLine>(
      'SELECT * FROM klines WHERE stock_code = ? ORDER BY date DESC LIMIT 30',
      [code]
    );

    // 获取成交量分析
    const volumeAnalysis = await this.query<VolumeAnalysis>(
      'SELECT * FROM volume_analysis WHERE stock_code = ? ORDER BY date DESC LIMIT 10',
      [code]
    );

    // 获取最近的买入信号
    const buySignals = await this.query<BuySignal>(
      'SELECT * FROM buy_signals WHERE stock_code = ? ORDER BY created_at DESC LIMIT 5',
      [code]
    );

    // 获取当日分时数据
    const today = new Date().toISOString().split('T')[0];
    const intradayQuotes = await this.query(
      'SELECT * FROM quote_history WHERE stock_code = ? AND DATE(snapshot_time) = ? ORDER BY snapshot_time ASC',
      [code, today]
    );

    return {
      stock,
      realtimeQuote,
      klines,
      volumeAnalysis,
      buySignals,
      intradayQuotes
    };
  }

  /**
   * 搜索股票（支持代码和名称）
   */
  async search(query: string, limit: number = 20): Promise<Stock[]> {
    const sql = `
      SELECT s.*,
             COALESCE(rq.close, k.close) as current_price,
             rq.pre_close as pre_close,
             COALESCE(rq.open, k.open) as open,
             COALESCE(rq.high, k.high) as high,
             COALESCE(rq.low, k.low) as low,
             COALESCE(rq.vol, k.volume) as volume,
             COALESCE(rq.amount, k.amount) as amount,
             COALESCE(rq.change_percent, ((k.close - k.open) / k.open * 100)) as change_percent,
             COALESCE(rq.change_amount, (k.close - k.open)) as change_amount,
             rq.updated_at as quote_time,
             va.volume_ratio,
             va.is_volume_surge,
             bs.signal_type as latest_signal
      FROM stocks s
      LEFT JOIN realtime_quotes rq ON s.code = rq.stock_code
      LEFT JOIN (
        SELECT stock_code, close, volume, open, high, low, amount,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM klines
      ) k ON s.code = k.stock_code AND k.rn = 1
      LEFT JOIN (
        SELECT stock_code, volume_ratio, is_volume_surge,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM volume_analysis
      ) va ON s.code = va.stock_code AND va.rn = 1
      LEFT JOIN (
        SELECT stock_code, signal_type,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY created_at DESC) as rn
        FROM buy_signals
      ) bs ON s.code = bs.stock_code AND bs.rn = 1
      WHERE s.code LIKE ? OR s.name LIKE ?
      LIMIT ?
    `;

    const searchPattern = `%${query}%`;
    return this.query<Stock>(sql, [searchPattern, searchPattern, limit]);
  }

  /**
   * 获取指定日期的股票行情
   */
  async findByDate(date: string): Promise<Stock[]> {
    if (!this.validateDateFormat(date)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    const sql = `
      SELECT s.*,
             k.close as current_price,
             k.open as open,
             k.high as high,
             k.low as low,
             k.volume as volume,
             k.amount as amount,
             k.date as quote_date,
             ((k.close - k.open) / k.open * 100) as change_percent,
             (k.close - k.open) as change_amount,
             va.volume_ratio,
             va.is_volume_surge,
             bs.signal_type as latest_signal
      FROM stocks s
      LEFT JOIN klines k ON s.code = k.stock_code AND k.date = ?
      LEFT JOIN volume_analysis va ON s.code = va.stock_code AND va.date = ?
      LEFT JOIN (
        SELECT stock_code, signal_type,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY created_at DESC) as rn
        FROM buy_signals
        WHERE date(created_at) = ?
      ) bs ON s.code = bs.stock_code AND bs.rn = 1
      WHERE k.close IS NOT NULL
      ORDER BY s.code
    `;

    return this.query<Stock>(sql, [date, date, date]);
  }

  /**
   * 获取K线数据
   */
  async findKLinesByCode(code: string, limit: number = 30): Promise<KLine[]> {
    const sql = `
      SELECT * FROM klines
      WHERE stock_code = ?
      ORDER BY date DESC
      LIMIT ?
    `;
    return this.query<KLine>(sql, [code, limit]);
  }

  /**
   * 获取K线数据（按日期范围）
   */
  async findKLinesByDateRange(code: string, dateFrom: string, dateTo: string): Promise<KLine[]> {
    if (!this.validateDateFormat(dateFrom) || !this.validateDateFormat(dateTo)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    const sql = `
      SELECT * FROM klines
      WHERE stock_code = ?
        AND date >= ?
        AND date <= ?
      ORDER BY date DESC
    `;
    return this.query<KLine>(sql, [code, dateFrom, dateTo]);
  }

  /**
   * 获取所有股票的基本信息（用于拼音匹配等场景）
   */
  async findAllBasic(limit?: number): Promise<Stock[]> {
    const sql = `
      SELECT s.*,
             COALESCE(rq.close, k.close) as current_price,
             rq.pre_close as pre_close,
             COALESCE(rq.open, k.open) as open,
             COALESCE(rq.high, k.high) as high,
             COALESCE(rq.low, k.low) as low,
             COALESCE(rq.vol, k.volume) as volume,
             COALESCE(rq.amount, k.amount) as amount,
             COALESCE(rq.change_percent, ((k.close - k.open) / k.open * 100)) as change_percent,
             COALESCE(rq.change_amount, (k.close - k.open)) as change_amount,
             rq.updated_at as quote_time,
             va.volume_ratio,
             va.is_volume_surge,
             bs.signal_type as latest_signal
      FROM stocks s
      LEFT JOIN realtime_quotes rq ON s.code = rq.stock_code
      LEFT JOIN (
        SELECT stock_code, close, volume, open, high, low, amount,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM klines
      ) k ON s.code = k.stock_code AND k.rn = 1
      LEFT JOIN (
        SELECT stock_code, volume_ratio, is_volume_surge,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM volume_analysis
      ) va ON s.code = va.stock_code AND va.rn = 1
      LEFT JOIN (
        SELECT stock_code, signal_type,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY created_at DESC) as rn
        FROM buy_signals
      ) bs ON s.code = bs.stock_code AND bs.rn = 1
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    return this.query<Stock>(sql);
  }

  /**
   * 获取最新的 daily_basic 数据（每日技术指标）
   */
  async getLatestDailyBasic(code: string): Promise<any | null> {
    const sql = `
      SELECT
        turnover_rate,
        turnover_rate_f,
        volume_ratio,
        pe,
        pe_ttm,
        pb,
        ps,
        ps_ttm,
        dv_ratio,
        dv_ttm,
        total_share,
        float_share,
        free_share,
        total_mv,
        circ_mv,
        trade_date
      FROM daily_basic
      WHERE stock_code = ?
      ORDER BY trade_date DESC
      LIMIT 1
    `;
    return this.queryOne(sql, [code]);
  }

  /**
   * 获取计算的技术指标（MA, MACD, RSI, KDJ）
   */
  async getCalculatedIndicators(code: string): Promise<any | null> {
    // 获取最近 60 天的 K 线数据用于计算技术指标
    const klines = await this.findKLinesByCode(code, 60);

    if (klines.length === 0) {
      return null;
    }

    // 按日期升序排列（计算指标需要）
    klines.reverse();

    // 提取收盘价数组
    const closes = klines.map(k => k.close);

    // 计算均线
    const ma5 = this.calculateMA(closes, 5);
    const ma10 = this.calculateMA(closes, 10);
    const ma20 = this.calculateMA(closes, 20);
    const ma60 = this.calculateMA(closes, 60);

    // 计算 MACD (简化版本)
    const macd = this.calculateMACD(closes);

    // 计算 RSI
    const rsi = this.calculateRSI(closes, 14);

    // 计算 KDJ
    const kdj = this.calculateKDJ(klines, 9);

    return {
      ma5: ma5[ma5.length - 1],
      ma10: ma10[ma10.length - 1],
      ma20: ma20[ma20.length - 1],
      ma60: ma60[ma60.length - 1],
      macd: macd.macd[macd.macd.length - 1],
      macd_signal: macd.signal[macd.signal.length - 1],
      macd_hist: macd.hist[macd.hist.length - 1],
      rsi: rsi[rsi.length - 1],
      kdj_k: kdj.k[kdj.k.length - 1],
      kdj_d: kdj.d[kdj.d.length - 1],
      kdj_j: kdj.j[kdj.j.length - 1]
    };
  }

  /**
   * 计算简单移动平均线（SMA）
   */
  private calculateMA(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  }

  /**
   * 计算 MACD（简化版本）
   */
  private calculateMACD(data: number[]): { macd: number[], signal: number[], hist: number[] } {
    // EMA 计算
    const ema12 = this.calculateEMA(data, 12);
    const ema26 = this.calculateEMA(data, 26);

    // DIF (MACD线)
    const macd = ema12.map((val, i) => val - ema26[i]);

    // DEA (信号线) - MACD的9日EMA
    const signal = this.calculateEMA(macd, 9);

    // MACD柱 (histogram)
    const hist = macd.map((val, i) => val - signal[i]);

    return { macd, signal, hist };
  }

  /**
   * 计算指数移动平均线（EMA）
   */
  private calculateEMA(data: number[], period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);

    // 第一个值使用简单平均
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(ema);

    // 后续值使用EMA公式
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
      result.push(ema);
    }

    // 前面填充NaN
    for (let i = 0; i < period - 1; i++) {
      result.unshift(NaN);
    }

    return result;
  }

  /**
   * 计算 RSI（相对强弱指标）
   */
  private calculateRSI(data: number[], period: number = 14): number[] {
    const result: number[] = [];
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
    }

    for (let i = 0; i < gains.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
      } else {
        const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;

        if (avgLoss === 0) {
          result.push(100);
        } else {
          const rs = avgGain / avgLoss;
          const rsi = 100 - (100 / (1 + rs));
          result.push(rsi);
        }
      }
    }

    result.unshift(NaN); // 补充第一个数据
    return result;
  }

  /**
   * 计算 KDJ 指标
   */
  private calculateKDJ(klines: KLine[], period: number = 9): { k: number[], d: number[], j: number[] } {
    const k: number[] = [];
    const d: number[] = [];
    const j: number[] = [];

    let prevK = 50; // K初始值
    let prevD = 50; // D初始值

    for (let i = 0; i < klines.length; i++) {
      if (i < period - 1) {
        k.push(NaN);
        d.push(NaN);
        j.push(NaN);
      } else {
        const slice = klines.slice(i - period + 1, i + 1);
        const high = Math.max(...slice.map(kl => kl.high));
        const low = Math.min(...slice.map(kl => kl.low));
        const close = klines[i].close;

        const rsv = high === low ? 50 : ((close - low) / (high - low)) * 100;

        const currentK = (2 / 3) * prevK + (1 / 3) * rsv;
        const currentD = (2 / 3) * prevD + (1 / 3) * currentK;
        const currentJ = 3 * currentK - 2 * currentD;

        k.push(currentK);
        d.push(currentD);
        j.push(currentJ);

        prevK = currentK;
        prevD = currentD;
      }
    }

    return { k, d, j };
  }
}

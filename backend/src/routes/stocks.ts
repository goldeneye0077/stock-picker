import express from 'express';
import { getDatabase } from '../config/database';
import { pinyin } from 'pinyin-pro';

const router = express.Router();

// Get all stocks
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const stocks = await db.all(`
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
    `);

    res.json({
      success: true,
      data: stocks,
      total: stocks.length
    });
  } catch (error) {
    console.error('Error fetching stocks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stocks'
    });
  }
});

// Get stock by code
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const db = getDatabase();

    const stock = await db.get('SELECT * FROM stocks WHERE code = ?', [code]);

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: 'Stock not found'
      });
    }

    // Get realtime quote
    const realtimeQuote = await db.get(`
      SELECT * FROM realtime_quotes
      WHERE stock_code = ?
    `, [code]);

    // Get recent K-line data
    const klines = await db.all(`
      SELECT * FROM klines
      WHERE stock_code = ?
      ORDER BY date DESC
      LIMIT 30
    `, [code]);

    // Get volume analysis
    const volumeAnalysis = await db.all(`
      SELECT * FROM volume_analysis
      WHERE stock_code = ?
      ORDER BY date DESC
      LIMIT 10
    `, [code]);

    // Get recent buy signals
    const buySignals = await db.all(`
      SELECT * FROM buy_signals
      WHERE stock_code = ?
      ORDER BY created_at DESC
      LIMIT 5
    `, [code]);

    // Get intraday quote history (today)
    const today = new Date().toISOString().split('T')[0];
    const intradayQuotes = await db.all(`
      SELECT * FROM quote_history
      WHERE stock_code = ?
      AND DATE(snapshot_time) = ?
      ORDER BY snapshot_time ASC
    `, [code, today]);

    res.json({
      success: true,
      data: {
        stock,
        realtimeQuote,
        klines,
        volumeAnalysis,
        buySignals,
        intradayQuotes
      }
    });
  } catch (error) {
    console.error('Error fetching stock details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch stock details'
    });
  }
});

// Search stocks
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const db = getDatabase();

    // 先获取所有股票进行拼音匹配
    const allStocks = await db.all(`
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
    `, [`%${query}%`, `%${query}%`]);

    // 如果查询看起来像拼音首字母（纯字母且长度>=1），进行拼音匹配
    const isPinyinQuery = /^[a-zA-Z]+$/.test(query);
    let stocks = allStocks;

    if (isPinyinQuery && allStocks.length < 20) {
      // 获取更多股票用于拼音匹配
      const moreStocks = await db.all(`
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
        LIMIT 500
      `);

      // 拼音匹配
      const queryUpper = query.toUpperCase();
      const pinyinMatched = moreStocks.filter(stock => {
        if (!stock.name) return false;
        // 获取拼音首字母
        const pinyinInitials = pinyin(stock.name, { pattern: 'first', toneType: 'none' }).toUpperCase();
        return pinyinInitials.includes(queryUpper);
      });

      // 合并结果，去重
      const codeSet = new Set(allStocks.map(s => s.code));
      const uniquePinyinMatched = pinyinMatched.filter(s => !codeSet.has(s.code));
      stocks = [...allStocks, ...uniquePinyinMatched];
    }

    res.json({
      success: true,
      data: stocks.slice(0, 20)
    });
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search stocks'
    });
  }
});

// Get stocks by date (历史行情查询)
router.get('/history/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const db = getDatabase();

    // 验证日期格式 YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    // 查询指定日期的K线数据
    const stocks = await db.all(`
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
    `, [date, date, date]);

    res.json({
      success: true,
      data: stocks,
      total: stocks.length,
      date: date
    });
  } catch (error) {
    console.error('Error fetching stocks by date:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch historical stocks'
    });
  }
});

export default router;
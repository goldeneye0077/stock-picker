import express from 'express';
import { getDatabase } from '../config/database';

const router = express.Router();

// Get all stocks
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const stocks = await db.all(`
      SELECT s.*,
             k.close as current_price,
             k.volume,
             ((k.close - k.open) / k.open * 100) as change_percent,
             va.volume_ratio,
             va.is_volume_surge,
             bs.signal_type as latest_signal
      FROM stocks s
      LEFT JOIN (
        SELECT stock_code, close, volume, open,
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

    res.json({
      success: true,
      data: {
        stock,
        klines,
        volumeAnalysis,
        buySignals
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

    const stocks = await db.all(`
      SELECT * FROM stocks
      WHERE code LIKE ? OR name LIKE ?
      LIMIT 20
    `, [`%${query}%`, `%${query}%`]);

    res.json({
      success: true,
      data: stocks
    });
  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search stocks'
    });
  }
});

export default router;
import express from 'express';
import { getDatabase } from '../config/database';

const router = express.Router();

// Get fund flow analysis
router.get('/fund-flow', async (req, res) => {
  try {
    const { stock_code, days = 30 } = req.query;
    const db = getDatabase();

    let sql = `
      SELECT
        stock_code,
        date,
        main_fund_flow,
        retail_fund_flow,
        institutional_flow,
        large_order_ratio
      FROM fund_flow
    `;

    let params: any[] = [];

    if (stock_code) {
      sql += ' WHERE stock_code = ?';
      params.push(stock_code);
    }

    sql += ' ORDER BY date DESC LIMIT ?';
    params.push(Number(days));

    const fundFlowData = await db.all(sql, params);

    // Calculate summary statistics
    const summary = {
      totalMainFlow: 0,
      totalRetailFlow: 0,
      totalInstitutionalFlow: 0,
      avgLargeOrderRatio: 0
    };

    if (fundFlowData.length > 0) {
      summary.totalMainFlow = fundFlowData.reduce((sum, item) => sum + item.main_fund_flow, 0);
      summary.totalRetailFlow = fundFlowData.reduce((sum, item) => sum + item.retail_fund_flow, 0);
      summary.totalInstitutionalFlow = fundFlowData.reduce((sum, item) => sum + item.institutional_flow, 0);
      summary.avgLargeOrderRatio = fundFlowData.reduce((sum, item) => sum + (item.large_order_ratio || 0), 0) / fundFlowData.length;
    }

    res.json({
      success: true,
      data: {
        fundFlow: fundFlowData,
        summary
      }
    });
  } catch (error) {
    console.error('Error fetching fund flow analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fund flow analysis'
    });
  }
});

// Get volume analysis
router.get('/volume', async (req, res) => {
  try {
    const { stock_code, days = 30 } = req.query;
    const db = getDatabase();

    let sql = `
      SELECT
        va.*,
        k.volume as actual_volume,
        k.close as price
      FROM volume_analysis va
      LEFT JOIN klines k ON va.stock_code = k.stock_code AND va.date = k.date
    `;

    let params: any[] = [];

    if (stock_code) {
      sql += ' WHERE va.stock_code = ?';
      params.push(stock_code);
    }

    sql += ' ORDER BY va.date DESC LIMIT ?';
    params.push(Number(days));

    const volumeData = await db.all(sql, params);

    // Find volume surges
    const volumeSurges = volumeData.filter(item => item.is_volume_surge);

    res.json({
      success: true,
      data: {
        volumeAnalysis: volumeData,
        volumeSurges: volumeSurges.slice(0, 10) // Latest 10 surges
      }
    });
  } catch (error) {
    console.error('Error fetching volume analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch volume analysis'
    });
  }
});

// Get buy signals
router.get('/signals', async (req, res) => {
  try {
    const { stock_code, signal_type, days = 7 } = req.query;
    const db = getDatabase();

    let sql = `
      SELECT
        bs.*,
        s.name as stock_name
      FROM buy_signals bs
      LEFT JOIN stocks s ON bs.stock_code = s.code
      WHERE bs.created_at >= date('now', '-${days} days')
    `;

    let params: any[] = [];

    if (stock_code) {
      sql += ' AND bs.stock_code = ?';
      params.push(stock_code);
    }

    if (signal_type) {
      sql += ' AND bs.signal_type = ?';
      params.push(signal_type);
    }

    sql += ' ORDER BY bs.created_at DESC LIMIT 50';

    const signals = await db.all(sql, params);

    // Group by signal type for summary
    const signalSummary = signals.reduce((acc: any, signal) => {
      if (!acc[signal.signal_type]) {
        acc[signal.signal_type] = {
          count: 0,
          avgConfidence: 0,
          totalConfidence: 0
        };
      }
      acc[signal.signal_type].count++;
      acc[signal.signal_type].totalConfidence += signal.confidence;
      acc[signal.signal_type].avgConfidence = acc[signal.signal_type].totalConfidence / acc[signal.signal_type].count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        signals,
        summary: signalSummary
      }
    });
  } catch (error) {
    console.error('Error fetching buy signals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch buy signals'
    });
  }
});

// Get market overview
router.get('/market-overview', async (req, res) => {
  try {
    const db = getDatabase();

    // Get total stocks count
    const totalStocks = await db.get('SELECT COUNT(*) as count FROM stocks');

    // Get today's signals count
    const todaySignals = await db.get(`
      SELECT COUNT(*) as count FROM buy_signals
      WHERE date(created_at) = date('now')
    `);

    // Get volume surge count (last 3 days)
    const volumeSurges = await db.get(`
      SELECT COUNT(*) as count FROM volume_analysis
      WHERE is_volume_surge = 1 AND date >= date('now', '-3 days')
    `);

    // Get top volume surge stocks
    const topVolumeSurge = await db.all(`
      SELECT
        va.stock_code,
        s.name,
        va.volume_ratio,
        va.date
      FROM volume_analysis va
      LEFT JOIN stocks s ON va.stock_code = s.code
      WHERE va.is_volume_surge = 1 AND va.date >= date('now', '-7 days')
      ORDER BY va.volume_ratio DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        totalStocks: totalStocks.count,
        todaySignals: todaySignals.count,
        volumeSurges: volumeSurges.count,
        topVolumeSurge
      }
    });
  } catch (error) {
    console.error('Error fetching market overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch market overview'
    });
  }
});

export default router;
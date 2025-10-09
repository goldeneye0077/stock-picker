import express from 'express';
import { getDatabase } from '../config/database';

const router = express.Router();

// Get fund flow analysis
router.get('/fund-flow', async (req, res) => {
  try {
    const { stock_code, days = 30, date_from, date_to } = req.query;
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
    let whereConditions: string[] = [];

    if (stock_code) {
      whereConditions.push('stock_code = ?');
      params.push(stock_code);
    }

    // 添加日期筛选支持
    if (date_from && date_to) {
      whereConditions.push('date >= ?');
      whereConditions.push('date <= ?');
      params.push(date_from);
      params.push(date_to);
    }

    if (whereConditions.length > 0) {
      sql += ' WHERE ' + whereConditions.join(' AND ');
    }

    // 如果没有提供日期范围，使用days限制
    if (!date_from || !date_to) {
      sql += ' ORDER BY date DESC LIMIT ?';
      params.push(Number(days));
    } else {
      sql += ' ORDER BY date DESC';
    }

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
    const { stock_code, days = 30, exchange, board, stock_search, date_from, date_to } = req.query;
    const db = getDatabase();

    let sql = `
      SELECT
        va.*,
        s.name as stock_name,
        s.exchange,
        k.volume as actual_volume,
        k.close as price
      FROM volume_analysis va
      LEFT JOIN stocks s ON va.stock_code = s.code
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

    // Find volume surges - query separately with filters
    let surgeSql = `
      SELECT
        va.*,
        s.name as stock_name,
        s.exchange,
        k.volume as actual_volume,
        k.close as price
      FROM volume_analysis va
      LEFT JOIN stocks s ON va.stock_code = s.code
      LEFT JOIN klines k ON va.stock_code = k.stock_code AND va.date = k.date
      WHERE va.is_volume_surge = 1
    `;

    let surgeParams: any[] = [];

    // Filter by stock code (exact match or fuzzy search)
    if (stock_code) {
      surgeSql += ' AND va.stock_code = ?';
      surgeParams.push(stock_code);
    } else if (stock_search) {
      surgeSql += ' AND (va.stock_code LIKE ? OR s.name LIKE ?)';
      surgeParams.push(`%${stock_search}%`);
      surgeParams.push(`%${stock_search}%`);
    }

    // Filter by exchange
    if (exchange) {
      surgeSql += ' AND s.exchange = ?';
      surgeParams.push(exchange);
    }

    // Filter by board (based on stock code prefix)
    if (board) {
      switch (board) {
        case 'main': // 主板 (上证主板 600/601/603, 深证主板 000/001)
          surgeSql += " AND (va.stock_code LIKE '60%' OR va.stock_code LIKE '000%' OR va.stock_code LIKE '001%')";
          break;
        case 'gem': // 创业板 (300)
          surgeSql += " AND va.stock_code LIKE '300%'";
          break;
        case 'star': // 科创板 (688)
          surgeSql += " AND va.stock_code LIKE '688%'";
          break;
        case 'bse': // 北交所 (8/4)
          surgeSql += " AND (va.stock_code LIKE '8%' OR va.stock_code LIKE '4%')";
          break;
      }
    }

    // Filter by date range
    if (date_from) {
      surgeSql += ' AND va.date >= ?';
      surgeParams.push(date_from);
    }
    if (date_to) {
      surgeSql += ' AND va.date <= ?';
      surgeParams.push(date_to);
    }

    surgeSql += ' ORDER BY va.volume_ratio DESC, va.date DESC LIMIT 50';

    const volumeSurges = await db.all(surgeSql, surgeParams);

    res.json({
      success: true,
      data: {
        volumeAnalysis: volumeData,
        volumeSurges,
        total: volumeSurges.length
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

// Get main force behavior analysis
router.get('/main-force', async (req, res) => {
  try {
    const { days = 7, limit = 20, date_from, date_to } = req.query;
    const db = getDatabase();

    // 构建日期筛选条件
    let dateCondition = '';
    if (date_from && date_to) {
      // 如果提供了日期范围,使用日期范围
      dateCondition = `ff.date >= '${date_from}' AND ff.date <= '${date_to}'`;
    } else {
      // 否则使用天数
      dateCondition = `ff.date >= date(ld.max_date, '-${days} days')`;
    }

    // 分析主力资金行为的 SQL 查询
    // 策略：分析指定时间段的主力资金流入流出趋势
    const sql = `
      WITH latest_date AS (
        SELECT MAX(date) as max_date FROM fund_flow
      ),
      recent_flow AS (
        SELECT
          ff.stock_code,
          s.name as stock_name,
          ff.date,
          ff.main_fund_flow,
          ff.retail_fund_flow,
          ff.institutional_flow,
          ff.large_order_ratio,
          k.volume,
          k.close as price,
          ROW_NUMBER() OVER (PARTITION BY ff.stock_code ORDER BY ff.date DESC) as rn
        FROM fund_flow ff
        CROSS JOIN latest_date ld
        LEFT JOIN stocks s ON ff.stock_code = s.code
        LEFT JOIN klines k ON ff.stock_code = k.stock_code AND ff.date = k.date
        WHERE ${dateCondition}
      ),
      stock_analysis AS (
        SELECT
          stock_code,
          stock_name,
          SUM(main_fund_flow) as total_main_flow,
          AVG(main_fund_flow) as avg_main_flow,
          SUM(CASE WHEN main_fund_flow > 0 THEN 1 ELSE 0 END) as inflow_days,
          COUNT(*) as total_days,
          AVG(large_order_ratio) as avg_large_order_ratio,
          SUM(volume) as total_volume,
          MAX(price) as latest_price
        FROM recent_flow
        WHERE rn <= ${days}
        GROUP BY stock_code, stock_name
        HAVING total_main_flow IS NOT NULL
      )
      SELECT
        stock_code,
        stock_name,
        total_main_flow,
        avg_main_flow,
        inflow_days,
        total_days,
        avg_large_order_ratio,
        total_volume,
        latest_price,
        CASE
          WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.7 THEN 'strong_accumulation'
          WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.5 THEN 'accumulation'
          WHEN total_main_flow < 0 AND inflow_days <= total_days * 0.3 THEN 'distribution'
          WHEN ABS(total_main_flow) < 10000000 THEN 'neutral'
          ELSE 'volatile'
        END as behavior_type,
        CASE
          WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.7 THEN
            CAST(MIN(100, 50 + (inflow_days * 100.0 / total_days) + (avg_large_order_ratio * 30)) AS INTEGER)
          WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.5 THEN
            CAST(MIN(100, 40 + (inflow_days * 80.0 / total_days) + (avg_large_order_ratio * 20)) AS INTEGER)
          WHEN total_main_flow < 0 THEN
            CAST(MAX(20, 60 - ((total_days - inflow_days) * 80.0 / total_days)) AS INTEGER)
          ELSE
            CAST(50 + (avg_large_order_ratio * 20) AS INTEGER)
        END as strength
      FROM stock_analysis
      WHERE ABS(total_main_flow) > 5000000
      ORDER BY
        CASE
          WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.7 THEN 1
          WHEN total_main_flow > 0 AND inflow_days >= total_days * 0.5 THEN 2
          ELSE 3
        END,
        ABS(total_main_flow) DESC
      LIMIT ?
    `;

    const mainForceData = await db.all(sql, [Number(limit)]);

    // 处理数据，添加行为描述和趋势
    const processedData = mainForceData.map((item: any) => {
      let behaviorText = '';
      let trend = 'moderate';

      switch (item.behavior_type) {
        case 'strong_accumulation':
          behaviorText = '大幅建仓';
          trend = 'strong';
          break;
        case 'accumulation':
          behaviorText = '持续建仓';
          trend = 'strong';
          break;
        case 'distribution':
          behaviorText = '缓慢减仓';
          trend = 'weak';
          break;
        case 'volatile':
          behaviorText = '震荡洗盘';
          trend = 'moderate';
          break;
        case 'neutral':
          behaviorText = '稳定持有';
          trend = 'moderate';
          break;
        default:
          behaviorText = '观望';
          trend = 'moderate';
      }

      return {
        stock: item.stock_code,
        name: item.stock_name || '未知股票',
        behavior: behaviorText,
        strength: item.strength,
        volume: (item.total_volume / 100000000).toFixed(1) + '亿',
        trend: trend,
        days: item.inflow_days,
        totalMainFlow: item.total_main_flow,
        avgLargeOrderRatio: item.avg_large_order_ratio
      };
    });

    // 计算统计摘要
    const summary = {
      strongCount: processedData.filter((item: any) => item.trend === 'strong').length,
      moderateCount: processedData.filter((item: any) => item.trend === 'moderate').length,
      weakCount: processedData.filter((item: any) => item.trend === 'weak').length,
      avgStrength: processedData.length > 0
        ? Math.round(processedData.reduce((sum: number, item: any) => sum + item.strength, 0) / processedData.length)
        : 0,
      totalVolume: processedData.reduce((sum: number, item: any) => {
        const vol = parseFloat(item.volume);
        return sum + (isNaN(vol) ? 0 : vol);
      }, 0).toFixed(1)
    };

    res.json({
      success: true,
      data: {
        mainForce: processedData,
        summary
      }
    });
  } catch (error) {
    console.error('Error fetching main force analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch main force analysis'
    });
  }
});

export default router;
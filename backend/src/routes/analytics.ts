import express from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responseHelper';
import { getDatabase } from '../config/database';

const router = express.Router();

// 获取统计概览
router.get('/summary', asyncHandler(async (req, res) => {
  const db = getDatabase();

  // 使用东八区时间计算
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // 今日 UV/PV
  const todayStats = await db.get(`
    SELECT 
      COUNT(DISTINCT COALESCE(user_id, ip_address)) as uv,
      COUNT(*) as pv
    FROM page_views
    WHERE date(created_at, '+8 hours') = ?
  `, [today]) || { uv: 0, pv: 0 };

  // 今日 API 调用
  const todayApi = await db.get(`
    SELECT COUNT(*) as cnt, AVG(response_time_ms) as avg_time
    FROM api_logs
    WHERE date(created_at, '+8 hours') = ?
  `, [today]) || { cnt: 0, avg_time: 0 };

  // 本周 UV/PV
  const weekStats = await db.get(`
    SELECT 
      COUNT(DISTINCT COALESCE(user_id, ip_address)) as uv,
      COUNT(*) as pv
    FROM page_views
    WHERE date(created_at, '+8 hours') >= ?
  `, [weekAgo]) || { uv: 0, pv: 0 };

  // 本月 UV/PV
  const monthStats = await db.get(`
    SELECT 
      COUNT(DISTINCT COALESCE(user_id, ip_address)) as uv,
      COUNT(*) as pv
    FROM page_views
    WHERE date(created_at, '+8 hours') >= ?
  `, [monthAgo]) || { uv: 0, pv: 0 };

  sendSuccess(res, {
    today_uv: todayStats.uv || 0,
    today_pv: todayStats.pv || 0,
    today_api_calls: todayApi.cnt || 0,
    avg_response_time_ms: Math.round(todayApi.avg_time || 0),
    week_uv: weekStats.uv || 0,
    week_pv: weekStats.pv || 0,
    month_uv: monthStats.uv || 0,
    month_pv: monthStats.pv || 0,
  });
}));

// 访问趋势
router.get('/trend', asyncHandler(async (req, res) => {
  const db = getDatabase();
  const days = Number(req.query.days) || 7;

  const now = new Date(Date.now() + 8 * 3600 * 1000); // Define 'now' here
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const rows = await db.all(`
    SELECT 
      date(created_at, '+8 hours') as date,
      COUNT(*) as pv,
      COUNT(DISTINCT COALESCE(user_id, ip_address)) as uv
    FROM page_views
    WHERE date(created_at, '+8 hours') >= ?
    GROUP BY date
    ORDER BY date
  `, [startDate]);

  // 填充缺失的日期
  const result: { date: string; pv: number; uv: number }[] = [];
  const dataMap = new Map(rows.map((r: any) => [r.date, r]));

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    const entry = dataMap.get(dateStr);
    result.push({
      date: dateStr,
      pv: entry?.pv || 0,
      uv: entry?.uv || 0,
    });
  }

  res.json(result);
}));

// 页面热度排行
router.get('/page-ranking', asyncHandler(async (req, res) => {
  const db = getDatabase();
  const days = Number(req.query.days) || 7;
  const limit = Number(req.query.limit) || 10;

  const now = new Date(Date.now() + 8 * 3600 * 1000); // Define 'now' for UTC+8
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const rows = await db.all(`
    SELECT 
      page_path,
      COUNT(*) as view_count,
      COUNT(DISTINCT COALESCE(user_id, ip_address)) as unique_visitors
    FROM page_views
    WHERE date(created_at, '+8 hours') >= ?
    GROUP BY page_path
    ORDER BY view_count DESC
    LIMIT ?
  `, [startDate, limit]);

  res.json(rows);
}));

// API 调用统计
router.get('/api-stats', asyncHandler(async (req, res) => {
  const db = getDatabase();
  const days = Number(req.query.days) || 7;
  const limit = Number(req.query.limit) || 10;

  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const rows = await db.all(`
    SELECT 
      endpoint,
      COUNT(*) as call_count,
      AVG(response_time_ms) as avg_response_time_ms,
      (SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as error_rate
    FROM api_logs
    WHERE date(created_at, '+8 hours') >= ?
    GROUP BY endpoint
    ORDER BY call_count DESC
    LIMIT ?
  `, [startDate, limit]);

  res.json(rows.map((r: any) => ({
    endpoint: r.endpoint,
    call_count: r.call_count,
    avg_response_time_ms: Math.round(r.avg_response_time_ms || 0),
    error_rate: parseFloat((r.error_rate || 0).toFixed(1)),
  })));
}));

// 24小时访问分布
router.get('/time-distribution', asyncHandler(async (req, res) => {
  const db = getDatabase();
  const days = Number(req.query.days) || 7;

  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const rows = await db.all(`
    SELECT 
      CAST(strftime('%H', created_at, '+8 hours') AS INTEGER) as hour,
      COUNT(*) as count
    FROM page_views
    WHERE date(created_at, '+8 hours') >= ?
    GROUP BY hour
    ORDER BY hour
  `, [startDate]);

  // 填充所有24小时
  const hourMap = new Map(rows.map((r: any) => [r.hour, r.count]));
  const result = [];
  for (let h = 0; h < 24; h++) {
    result.push({
      hour: h,
      count: hourMap.get(h) || 0,
    });
  }

  res.json(result);
}));

// 用户活跃排行
router.get('/user-activity', asyncHandler(async (req, res) => {
  const db = getDatabase();
  const days = Number(req.query.days) || 7;
  const limit = Number(req.query.limit) || 10;

  const now = new Date(Date.now() + 8 * 3600 * 1000); // Define 'now' for UTC+8
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const rows = await db.all(`
    SELECT 
      pv.user_id,
      u.username,
      COUNT(DISTINCT pv.id) as page_views,
      (SELECT COUNT(*) FROM api_logs al WHERE al.user_id = pv.user_id AND date(al.created_at, '+8 hours') >= ?) as api_calls,
      MAX(pv.created_at) as last_active
    FROM page_views pv
    LEFT JOIN users u ON pv.user_id = u.id
    WHERE pv.user_id IS NOT NULL AND date(pv.created_at, '+8 hours') >= ?
    GROUP BY pv.user_id
    ORDER BY page_views DESC
    LIMIT ?
  `, [startDate, startDate, limit]);

  res.json(rows.map((r: any) => ({
    user_id: r.user_id,
    username: r.username || `用户${r.user_id}`,
    page_views: r.page_views,
    api_calls: r.api_calls || 0,
    last_active: r.last_active,
  })));
}));

// 实时访问流
router.get('/realtime', asyncHandler(async (req, res) => {
  const db = getDatabase();
  const limit = Number(req.query.limit) || 30;

  const rows = await db.all(`
    SELECT 
      pv.id,
      pv.page_path,
      pv.user_id,
      u.username,
      pv.ip_address,
      pv.created_at
    FROM page_views pv
    LEFT JOIN users u ON pv.user_id = u.id
    ORDER BY pv.created_at DESC
    LIMIT ?
  `, [limit]);

  res.json(rows);
}));

// 记录页面访问（前端调用）
router.post('/page-view', asyncHandler(async (req, res) => {
  const db = getDatabase();
  const { page_path } = req.body;

  if (!page_path) {
    res.status(400).json({ error: 'page_path is required' });
    return;
  }

  // 从请求中提取信息
  let userId: number | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      userId = payload.userId || payload.user_id || null;
    } catch {
      // ignore decode errors
    }
  }

  // 获取客户端 IP
  const forwarded = req.headers['x-forwarded-for'];
  let ipAddress: string | null = null;
  if (typeof forwarded === 'string') {
    ipAddress = forwarded.split(',')[0].trim();
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    ipAddress = forwarded[0].split(',')[0].trim();
  } else {
    ipAddress = req.socket?.remoteAddress || null;
  }

  const userAgent = req.headers['user-agent'] || null;

  await db.run(`
    INSERT INTO page_views (page_path, user_id, ip_address, user_agent)
    VALUES (?, ?, ?, ?)
  `, [page_path, userId, ipAddress, userAgent]);

  sendSuccess(res, { success: true });
}));

export default router;


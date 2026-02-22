import express from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responseHelper';
import { getDatabase } from '../config/database';
import { AppError, ErrorCode } from '../utils/errors';
import { UserRepository } from '../repositories';
import { requireAdmin } from './auth';

const router = express.Router();
const authRepo = new UserRepository();

function parseBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  fieldName: string
): number {
  if (value === undefined || value === null || value === '') return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(
      `${fieldName} must be an integer between ${min} and ${max}`,
      400,
      ErrorCode.INVALID_PARAMETER
    );
  }

  return parsed;
}

async function requireAnalyticsAdmin(req: express.Request): Promise<void> {
  await requireAdmin(req);
}

function extractClientIp(req: express.Request): string | null {
  const rawIp = req.ip || req.socket?.remoteAddress || null;
  if (!rawIp) return null;
  if (rawIp === '::1') return '127.0.0.1';
  if (rawIp.startsWith('::ffff:')) return rawIp.slice(7);
  return rawIp;
}

function parsePagePath(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError('page_path is required', 400, ErrorCode.INVALID_PARAMETER);
  }

  const pagePath = value.trim();
  if (!pagePath || pagePath.length > 255 || !pagePath.startsWith('/')) {
    throw new AppError('page_path is invalid', 400, ErrorCode.INVALID_PARAMETER);
  }

  return pagePath;
}

// Summary
router.get('/summary', asyncHandler(async (req, res) => {
  await requireAnalyticsAdmin(req);

  const db = getDatabase();

  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const todayStats = await db.get(`
    SELECT
      COUNT(DISTINCT COALESCE(user_id, ip_address)) as uv,
      COUNT(*) as pv
    FROM page_views
    WHERE date(created_at, '+8 hours') = ?
  `, [today]) || { uv: 0, pv: 0 };

  const todayApi = await db.get(`
    SELECT COUNT(*) as cnt, AVG(response_time_ms) as avg_time
    FROM api_logs
    WHERE date(created_at, '+8 hours') = ?
  `, [today]) || { cnt: 0, avg_time: 0 };

  const weekStats = await db.get(`
    SELECT
      COUNT(DISTINCT COALESCE(user_id, ip_address)) as uv,
      COUNT(*) as pv
    FROM page_views
    WHERE date(created_at, '+8 hours') >= ?
  `, [weekAgo]) || { uv: 0, pv: 0 };

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

// Visit trend
router.get('/trend', asyncHandler(async (req, res) => {
  await requireAnalyticsAdmin(req);

  const db = getDatabase();
  const days = parseBoundedInt(req.query.days, 7, 1, 90, 'days');

  const now = new Date(Date.now() + 8 * 3600 * 1000);
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

// Page ranking
router.get('/page-ranking', asyncHandler(async (req, res) => {
  await requireAnalyticsAdmin(req);

  const db = getDatabase();
  const days = parseBoundedInt(req.query.days, 7, 1, 90, 'days');
  const limit = parseBoundedInt(req.query.limit, 10, 1, 100, 'limit');

  const now = new Date(Date.now() + 8 * 3600 * 1000);
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

// API stats
router.get('/api-stats', asyncHandler(async (req, res) => {
  await requireAnalyticsAdmin(req);

  const db = getDatabase();
  const days = parseBoundedInt(req.query.days, 7, 1, 90, 'days');
  const limit = parseBoundedInt(req.query.limit, 10, 1, 100, 'limit');

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

// Time distribution
router.get('/time-distribution', asyncHandler(async (req, res) => {
  await requireAnalyticsAdmin(req);

  const db = getDatabase();
  const days = parseBoundedInt(req.query.days, 7, 1, 90, 'days');

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

// User activity ranking
router.get('/user-activity', asyncHandler(async (req, res) => {
  await requireAnalyticsAdmin(req);

  const db = getDatabase();
  const days = parseBoundedInt(req.query.days, 7, 1, 90, 'days');
  const limit = parseBoundedInt(req.query.limit, 10, 1, 100, 'limit');

  const now = new Date(Date.now() + 8 * 3600 * 1000);
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
    username: r.username || `user_${r.user_id}`,
    page_views: r.page_views,
    api_calls: r.api_calls || 0,
    last_active: r.last_active,
  })));
}));

// Realtime visits (without raw IP exposure)
router.get('/realtime', asyncHandler(async (req, res) => {
  await requireAnalyticsAdmin(req);

  const db = getDatabase();
  const limit = parseBoundedInt(req.query.limit, 30, 1, 100, 'limit');

  const rows = await db.all(`
    SELECT
      pv.id,
      pv.page_path,
      pv.user_id,
      u.username,
      pv.created_at
    FROM page_views pv
    LEFT JOIN users u ON pv.user_id = u.id
    ORDER BY pv.created_at DESC
    LIMIT ?
  `, [limit]);

  res.json(rows);
}));

// Record page view from frontend
router.post('/page-view', asyncHandler(async (req, res) => {
  const db = getDatabase();
  const pagePath = parsePagePath(req.body?.page_path);

  let userId: number | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const session = await authRepo.getSession(token);
      if (session) {
        userId = session.userId;
      }
    }
  }

  const ipAddress = extractClientIp(req);
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

  await db.run(`
    INSERT INTO page_views (page_path, user_id, ip_address, user_agent)
    VALUES (?, ?, ?, ?)
  `, [pagePath, userId, ipAddress, userAgent]);

  sendSuccess(res, { success: true });
}));

export default router;

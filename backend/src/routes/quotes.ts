import express from 'express';
import dotenv from 'dotenv';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/responseHelper';

dotenv.config();

const router = express.Router();

function getDataServiceUrl(): string {
  const url = process.env.DATA_SERVICE_URL || 'http://127.0.0.1:8001';
  return url.replace(/\/+$/, '');
}

function toQueryArray(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [String(value)].filter(Boolean);
}

router.post('/update-auction', asyncHandler(async (req, res) => {
  const base = getDataServiceUrl();
  const params = new URLSearchParams();
  const { trade_date, sync, force } = req.query as any;
  const ts_codes = req.query.ts_codes;

  if (trade_date) params.set('trade_date', String(trade_date));
  if (sync !== undefined) params.set('sync', String(sync));
  if (force !== undefined) params.set('force', String(force));

  if (Array.isArray(ts_codes)) {
    for (const c of ts_codes) params.append('ts_codes', String(c));
  } else if (ts_codes !== undefined) {
    params.append('ts_codes', String(ts_codes));
  }

  const url = `${base}/api/quotes/update-auction?${params.toString()}`;
  const resp = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' } });
  const data = await resp.json();
  res.status(resp.status).json(data);
}));

router.get('/realtime', asyncHandler(async (req, res) => {
  const base = getDataServiceUrl();
  const tsCode = toQueryArray((req.query as any).ts_code)[0] || '';
  if (!tsCode) {
    return res.status(400).json({ success: false, message: 'ts_code is required' });
  }

  const url = `${base}/api/quotes/realtime?ts_code=${encodeURIComponent(tsCode)}`;
  const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const payload: any = await resp.json().catch(() => null);

  if (!resp.ok) {
    return res.status(resp.status).json(payload ?? { success: false, message: 'Failed to fetch realtime quote' });
  }

  const data = (payload && (payload.data ?? payload?.data?.quote)) ?? payload;
  return sendSuccess(res, data);
}));

router.get('/realtime-batch', asyncHandler(async (req, res) => {
  const base = getDataServiceUrl();
  const tsCodes = toQueryArray((req.query as any).ts_codes);
  if (tsCodes.length === 0) {
    return res.status(400).json({ success: false, message: 'ts_codes is required' });
  }

  const params = new URLSearchParams();
  for (const c of tsCodes) params.append('ts_codes', c);
  const maxAgeSeconds = toQueryArray((req.query as any).max_age_seconds)[0];
  const force = toQueryArray((req.query as any).force)[0];
  if (maxAgeSeconds) params.set('max_age_seconds', maxAgeSeconds);
  if (force) params.set('force', force);

  const url = `${base}/api/quotes/realtime-batch?${params.toString()}`;
  const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const payload: any = await resp.json().catch(() => null);

  if (!resp.ok) {
    return res.status(resp.status).json(payload ?? { success: false, message: 'Failed to fetch realtime quotes' });
  }

  const data = (payload && payload.data) ?? payload;
  return sendSuccess(res, data);
}));

export default router;

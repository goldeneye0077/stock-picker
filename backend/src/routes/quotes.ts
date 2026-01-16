import express from 'express';
import dotenv from 'dotenv';
import { asyncHandler } from '../middleware/errorHandler';

dotenv.config();

const router = express.Router();

function getDataServiceUrl(): string {
  const url = process.env.DATA_SERVICE_URL || 'http://127.0.0.1:8001';
  return url.replace(/\/+$/, '');
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

export default router;

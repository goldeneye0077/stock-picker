import express from 'express';
import dotenv from 'dotenv';
import { asyncHandler } from '../middleware/errorHandler';

dotenv.config();

const router = express.Router();

function getDataServiceUrl(): string {
  const url = process.env.DATA_SERVICE_URL || 'http://127.0.0.1:8001';
  return url.replace(/\/+$/, '');
}

router.get('/strategies', asyncHandler(async (req, res) => {
  const base = getDataServiceUrl();
  const url = `${base}/api/smart-selection/strategies`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await resp.json();
  res.status(resp.status).json(data);
}));

export default router;
